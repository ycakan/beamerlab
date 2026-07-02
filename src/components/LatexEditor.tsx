import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { tags } from "@lezer/highlight";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";

const latexHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#c678dd" },
  { tag: tags.string, color: "#98c379" },
  { tag: tags.comment, color: "#5c6370", fontStyle: "italic" },
  { tag: tags.bracket, color: "#e06c75" },
  { tag: tags.meta, color: "#61afef" },
  { tag: tags.name, color: "#e5c07b" },
]);

const setPreviewEditHighlight = StateEffect.define<{ from: number; to: number } | null>();
const setAiChangeHighlights = StateEffect.define<EditorTextRange[]>();

export interface EditorTextRange {
  from: number;
  to: number;
}

interface PreviewEditHighlightState {
  decorations: DecorationSet;
  range: { from: number; to: number } | null;
}

const emptyPreviewEditHighlight: PreviewEditHighlightState = {
  decorations: Decoration.none,
  range: null,
};

function previewEditHighlightState(range: { from: number; to: number }): PreviewEditHighlightState {
  return {
    decorations: Decoration.set([
      Decoration.mark({ class: "cm-preview-edit-highlight" }).range(range.from, range.to),
    ]),
    range,
  };
}

function selectionOverlapsRange(
  selection: { from: number; to: number },
  range: { from: number; to: number },
): boolean {
  return selection.to > range.from && selection.from < range.to;
}

function clearPreviewHighlightOnEditorPointerDown() {
  return EditorView.domEventHandlers({
    pointerdown(event, view) {
      const highlight = view.state.field(previewEditHighlightField, false);
      const range = highlight?.range;
      if (!range) return false;

      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (position === null || position < range.from || position >= range.to) {
        view.dispatch({ effects: setPreviewEditHighlight.of(null) });
      }

      return false;
    },
  });
}

const previewEditHighlightField = StateField.define<PreviewEditHighlightState>({
  create() {
    return emptyPreviewEditHighlight;
  },
  update(highlight, transaction) {
    const mappedRange = highlight.range
      ? {
          from: transaction.changes.mapPos(highlight.range.from),
          to: transaction.changes.mapPos(highlight.range.to),
        }
      : null;
    let nextHighlight =
      mappedRange && mappedRange.to > mappedRange.from
        ? previewEditHighlightState(mappedRange)
        : emptyPreviewEditHighlight;

    for (const effect of transaction.effects) {
      if (!effect.is(setPreviewEditHighlight)) continue;

      const range = effect.value;
      if (!range || range.to <= range.from) return emptyPreviewEditHighlight;

      return previewEditHighlightState(range);
    }

    if (
      nextHighlight.range &&
      transaction.selectionSet &&
      !selectionOverlapsRange(transaction.state.selection.main, nextHighlight.range)
    ) {
      nextHighlight = emptyPreviewEditHighlight;
    }

    return nextHighlight;
  },
  provide: (field) => EditorView.decorations.from(field, (highlight) => highlight.decorations),
});

function createAiChangeDecorations(ranges: EditorTextRange[]): DecorationSet {
  const decorations = ranges
    .filter((range) => range.to > range.from)
    .map((range) =>
      Decoration.mark({ class: "cm-ai-change-highlight" }).range(range.from, range.to),
    );

  return Decoration.set(decorations, true);
}

const aiChangeHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(highlights, transaction) {
    let nextHighlights = highlights.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setAiChangeHighlights)) continue;
      nextHighlights = createAiChangeDecorations(effect.value);
    }

    return nextHighlights;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const latexCompletions = [
  "\\begin{frame}{",
  "\\end{frame}",
  "\\frametitle{",
  "\\framesubtitle{",
  "\\begin{itemize}",
  "\\end{itemize}",
  "\\begin{enumerate}",
  "\\end{enumerate}",
  "\\begin{block}{",
  "\\end{block}",
  "\\begin{alertblock}{",
  "\\end{alertblock}",
  "\\begin{exampleblock}{",
  "\\end{exampleblock}",
  "\\begin{columns}",
  "\\end{columns}",
  "\\begin{column}{0.5\\textwidth}",
  "\\end{column}",
  "\\begin{equation}",
  "\\end{equation}",
  "\\begin{align}",
  "\\end{align}",
  "\\begin{verbatim}",
  "\\end{verbatim}",
  "\\item",
  "\\textbf{",
  "\\textit{",
  "\\emph{",
  "\\texttt{",
  "\\underline{",
  "\\includegraphics{",
  "\\href{",
  "\\url{",
  "\\textcolor{",
  "\\frac{",
  "\\sqrt{",
  "\\sum",
  "\\prod",
  "\\int",
  "\\lim",
  "\\alpha",
  "\\beta",
  "\\gamma",
  "\\delta",
  "\\epsilon",
  "\\theta",
  "\\lambda",
  "\\sigma",
  "\\omega",
  "\\mathbb{",
  "\\mathcal{",
  "\\mathbf{",
  "\\mathrm{",
  "\\vspace{",
  "\\hspace{",
  "\\centering",
  "\\newline",
];

function latexAutocompletion() {
  return autocompletion({
    override: [
      (context) => {
        const word = context.matchBefore(/\\[a-zA-Z]*/);
        if (!word || (word.from === word.to && !context.explicit)) return null;
        return {
          from: word.from,
          options: latexCompletions
            .filter((c) => c.startsWith(word.text))
            .map((label) => ({ label, type: "keyword" })),
        };
      },
    ],
  });
}

interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorPositionChange?: (position: number) => void;
  aiChangeRanges?: EditorTextRange[];
}

export interface LatexEditorHandle {
  clearAiChangeHighlights: () => void;
  clearPreviewHighlight: () => void;
  focusRange: (
    start: number,
    end?: number,
    options?: { focus?: boolean; previewHighlight?: boolean },
  ) => void;
  replaceRange: (
    start: number,
    end: number,
    insert: string,
    options?: { focus?: boolean; expectedText?: string; previewHighlight?: boolean },
  ) => boolean;
}

const LatexEditor = forwardRef<LatexEditorHandle, LatexEditorProps>(function LatexEditor(
  { value, onChange, onCursorPositionChange, aiChangeRanges }: LatexEditorProps,
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onChange, onCursorPositionChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        search(),
        previewEditHighlightField,
        aiChangeHighlightField,
        clearPreviewHighlightOnEditorPointerDown(),
        StreamLanguage.define(stex),
        syntaxHighlighting(latexHighlight),
        oneDark,
        latexAutocompletion(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet || update.focusChanged) {
            onCursorPositionChangeRef.current?.(update.state.selection.main.head);
          }
        }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    onCursorPositionChangeRef.current?.(view.state.selection.main.head);

    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update editor content when value changes externally (e.g. template switch)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: setAiChangeHighlights.of(aiChangeRanges || []),
    });
  }, [aiChangeRanges]);

  useImperativeHandle(
    ref,
    () => ({
      clearAiChangeHighlights() {
        const view = viewRef.current;
        if (!view) return;

        view.dispatch({
          effects: setAiChangeHighlights.of([]),
        });
      },
      clearPreviewHighlight() {
        const view = viewRef.current;
        if (!view) return;

        view.dispatch({
          effects: setPreviewEditHighlight.of(null),
        });
      },
      focusRange(
        start: number,
        end?: number,
        options: { focus?: boolean; previewHighlight?: boolean } = {},
      ) {
        const view = viewRef.current;
        if (!view) return;

        const limit = view.state.doc.length;
        const from = Math.max(0, Math.min(start, limit));
        const to = Math.max(from, Math.min(end ?? start, limit));

        view.dispatch({
          selection: { anchor: from, head: to },
          effects: [
            EditorView.scrollIntoView(from, { y: "center" }),
            setPreviewEditHighlight.of(options.previewHighlight === false ? null : { from, to }),
          ],
        });
        if (options.focus !== false) {
          view.focus();
        }
      },
      replaceRange(
        start: number,
        end: number,
        insert: string,
        options: { focus?: boolean; expectedText?: string; previewHighlight?: boolean } = {},
      ) {
        const view = viewRef.current;
        if (!view) return false;

        const limit = view.state.doc.length;
        const from = Math.max(0, Math.min(start, limit));
        const to = Math.max(from, Math.min(end, limit));

        if (
          options.expectedText !== undefined &&
          view.state.doc.sliceString(from, to) !== options.expectedText
        ) {
          return false;
        }

        const nextEnd = from + insert.length;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from, head: nextEnd },
          effects: [
            EditorView.scrollIntoView(from, { y: "center" }),
            setPreviewEditHighlight.of(
              options.previewHighlight === false ? null : { from, to: nextEnd },
            ),
          ],
        });

        if (options.focus !== false) {
          view.focus();
        }

        return true;
      },
    }),
    [],
  );

  return <div ref={editorRef} className="h-full w-full" />;
});

export default LatexEditor;
