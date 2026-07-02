import { Link, createFileRoute } from "@tanstack/react-router";
import {
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  BookOpen,
  Check,
  Download,
  FilePlus,
  FileText,
  Image as ImageIcon,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { parseLatex, type EditableTextTarget } from "@/lib/latex-parser";
import {
  createTemplateDocument,
  createTemplateStarter,
  getSavedCustomTemplate,
  getTemplateCommands,
  templates,
} from "@/lib/templates";
import type { Template, TemplateCommand } from "@/lib/templates";
import BeamerBudIcon from "@/components/BeamerBudIcon";
import CopilotPanel from "@/components/CopilotPanel";
import LatexEditor, {
  type EditorTextRange,
  type LatexEditorHandle,
} from "@/components/LatexEditor";
import SlidePreview, { SlideRenderer } from "@/components/SlidePreview";

const TemplateSelector = lazy(() => import("@/components/TemplateSelector"));
const ImageUploader = lazy(() => import("@/components/ImageUploader"));

const PROJECT_CACHE_KEY = "beamerlab.projects.v1";
const PROJECT_RECOVERY_CACHE_KEY = "beamerlab.lastDeletedProject.v1";
const MAX_DEVICE_PROJECTS = 5;
const BEAMERBUD_FLIGHT_MS = 260;
const HEADER_BUTTON_CLASS =
  "inline-flex h-8 flex-shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const HEADER_SECONDARY_BUTTON_CLASS = `${HEADER_BUTTON_CLASS} bg-secondary text-secondary-foreground hover:bg-secondary/80`;
const HEADER_PRIMARY_BUTTON_CLASS = `${HEADER_BUTTON_CLASS} bg-primary text-primary-foreground hover:bg-primary/90`;
const HEADER_SELECT_CLASS =
  "h-8 w-28 flex-shrink-0 rounded border border-border bg-editor-bg px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const HEADER_INPUT_CLASS =
  "h-8 w-32 flex-shrink-0 rounded border border-border bg-editor-bg px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

type BeamerBudFlight = "to-dock" | "to-bubble";

type BeamerBudFlightStyle = CSSProperties & {
  "--beamerbud-flight-x"?: string;
  "--beamerbud-flight-y"?: string;
  "--beamerbud-flight-scale"?: string;
};

interface FlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function createBeamerBudFlightStyle(start: FlightRect, end: FlightRect): BeamerBudFlightStyle {
  const startCenterX = start.left + start.width / 2;
  const startCenterY = start.top + start.height / 2;
  const endCenterX = end.left + end.width / 2;
  const endCenterY = end.top + end.height / 2;
  const scale = Math.max(0.7, Math.min(1.2, end.width / Math.max(start.width, 1)));

  return {
    left: `${start.left}px`,
    top: `${start.top}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
    "--beamerbud-flight-x": `${endCenterX - startCenterX}px`,
    "--beamerbud-flight-y": `${endCenterY - startCenterY}px`,
    "--beamerbud-flight-scale": `${scale}`,
  };
}

function getBeamerBudBubbleIconTarget(): FlightRect {
  const launcherLeft = 16;
  const launcherBottom = 16;
  const launcherHeight = 58;

  return {
    left: launcherLeft + 12,
    top: window.innerHeight - launcherBottom - launcherHeight + 7,
    width: 40,
    height: 44,
  };
}

function normalizeAppPath(pathname: string): string {
  return pathname.replace(/\/+$/g, "") || "/";
}

let introHasOpenedInDocument = false;

const SLIDE_FONT_OPTIONS = [
  { label: "Theme default", value: "" },
  {
    label: "Computer Modern",
    value: "'Computer Modern', 'Latin Modern', 'CMU Serif', Georgia, serif",
  },
  {
    label: "Latin Modern Sans",
    value:
      "'Computer Modern Sans', 'Latin Modern Sans', 'CMU Sans Serif', 'Helvetica Neue', sans-serif",
  },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "SF Mono", value: "'SF Mono', monospace" },
  { label: "Monospace", value: "monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Sans", value: "system-ui, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
];

const SLIDE_FONT_SIZES = [12, 14, 16, 18, 20, 22, 24];

interface LineSegment {
  text: string;
  start: number;
  end: number;
}

function splitLineSegments(value: string): LineSegment[] {
  const segments: LineSegment[] = [];
  let start = 0;

  while (start < value.length) {
    const nextNewline = value.indexOf("\n", start);
    const end = nextNewline === -1 ? value.length : nextNewline + 1;
    segments.push({ text: value.slice(start, end), start, end });
    start = end;
  }

  return segments;
}

function mergeAdjacentRanges(ranges: EditorTextRange[]): EditorTextRange[] {
  return ranges.reduce<EditorTextRange[]>((merged, range) => {
    if (range.to <= range.from) return merged;

    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
      return merged;
    }

    merged.push({ ...range });
    return merged;
  }, []);
}

function computeFallbackChangeRange(previousLatex: string, nextLatex: string): EditorTextRange[] {
  if (previousLatex === nextLatex || nextLatex.length === 0) return [];

  let firstDiff = 0;
  while (
    firstDiff < previousLatex.length &&
    firstDiff < nextLatex.length &&
    previousLatex[firstDiff] === nextLatex[firstDiff]
  ) {
    firstDiff += 1;
  }

  const lineStart = nextLatex.lastIndexOf("\n", Math.max(0, firstDiff - 1)) + 1;
  const nextLineBreak = nextLatex.indexOf("\n", firstDiff);
  const lineEnd = nextLineBreak === -1 ? nextLatex.length : nextLineBreak + 1;

  return lineEnd > lineStart ? [{ from: lineStart, to: lineEnd }] : [];
}

function computeAiChangeRanges(previousLatex: string, nextLatex: string): EditorTextRange[] {
  if (previousLatex === nextLatex) return [];

  const previousLines = splitLineSegments(previousLatex);
  const nextLines = splitLineSegments(nextLatex);
  if (nextLines.length === 0) return [];

  if (previousLines.length * nextLines.length > 60000) {
    return computeFallbackChangeRange(previousLatex, nextLatex);
  }

  const lcs = Array.from({ length: previousLines.length + 1 }, () =>
    Array(nextLines.length + 1).fill(0),
  );

  for (let i = previousLines.length - 1; i >= 0; i -= 1) {
    for (let j = nextLines.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        previousLines[i].text === nextLines[j].text
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const changedRanges: EditorTextRange[] = [];
  let previousIndex = 0;
  let nextIndex = 0;

  while (previousIndex < previousLines.length && nextIndex < nextLines.length) {
    if (previousLines[previousIndex].text === nextLines[nextIndex].text) {
      previousIndex += 1;
      nextIndex += 1;
    } else if (lcs[previousIndex + 1][nextIndex] >= lcs[previousIndex][nextIndex + 1]) {
      previousIndex += 1;
    } else {
      const changedLine = nextLines[nextIndex];
      changedRanges.push({ from: changedLine.start, to: changedLine.end });
      nextIndex += 1;
    }
  }

  while (nextIndex < nextLines.length) {
    const changedLine = nextLines[nextIndex];
    changedRanges.push({ from: changedLine.start, to: changedLine.end });
    nextIndex += 1;
  }

  const mergedRanges = mergeAdjacentRanges(changedRanges);
  return mergedRanges.length > 0
    ? mergedRanges
    : computeFallbackChangeRange(previousLatex, nextLatex);
}

interface CachedProject {
  id: string;
  name: string;
  templateName: string;
  latex: string;
  images: Record<string, string>;
  currentSlide: number;
  updatedAt: number;
}

interface PendingAiSnapshot {
  projectId: string | null;
  templateName: string;
  latex: string;
  images: Record<string, string>;
  currentSlide: number;
}

interface CachedProjectState {
  activeProjectId: string | null;
  projects: CachedProject[];
}

interface InitialEditorState extends CachedProjectState {
  activeProject: CachedProject | null;
  selectedTemplate: Template;
}

function insertIntoDocument(source: string, snippet: string): string {
  const insertion = `\n\n${snippet}\n`;
  const endDocument = "\\end{document}";
  const endIndex = source.lastIndexOf(endDocument);

  if (endIndex === -1) return `${source}${insertion}`;

  return `${source.slice(0, endIndex).trimEnd()}${insertion}\n${source.slice(endIndex)}`;
}

function insertIntoLastFrame(source: string, snippet: string): string {
  const insertion = `\n\n${snippet}\n`;
  const endFrame = "\\end{frame}";
  const endDocument = "\\end{document}";
  const endDocumentIndex = source.lastIndexOf(endDocument);
  const searchEnd = endDocumentIndex === -1 ? source.length : endDocumentIndex;
  const endFrameIndex = source.lastIndexOf(endFrame, searchEnd);

  if (endFrameIndex === -1) {
    return insertIntoDocument(source, `\\begin{frame}{Slide Title}${insertion}\\end{frame}`);
  }

  return `${source.slice(0, endFrameIndex).trimEnd()}${insertion}\n${source.slice(endFrameIndex)}`;
}

function sanitizeFileBaseName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .replace(/_?beamerlab$/i, "");

  return `${cleaned || "presentation"}_beamerlab`;
}

function wasEditorDocumentLoad(): boolean {
  if (typeof window === "undefined") return true;

  const navigationEntry = window.performance?.getEntriesByType("navigation")[0];
  const documentUrl = navigationEntry?.name || window.location.href;
  let documentPath = normalizeAppPath(window.location.pathname);

  try {
    documentPath = normalizeAppPath(new URL(documentUrl, window.location.href).pathname);
  } catch {
    documentPath = normalizeAppPath(window.location.pathname);
  }

  return documentPath === "/";
}

function wrapBareFrameDocument(source: string, template: Template): string {
  const trimmed = source.trim();

  if (!trimmed) return source;
  if (trimmed === "\\begin{frame}") return createTemplateStarter(template);
  if (source.includes("\\documentclass") || source.includes("\\begin{document}")) return source;
  if (!trimmed.startsWith("\\begin{frame}")) return source;

  return createTemplateDocument(template, trimmed);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeSourceRange(source: string, start: number, end: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = source.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex + 1;
  const removeStart = source.slice(lineStart, start).trim() === "" ? lineStart : start;
  const removeEnd = source.slice(end, lineEnd).trim() === "" ? lineEnd : end;
  const before = source.slice(0, removeStart).trimEnd();
  const after = source.slice(removeEnd).trimStart();

  if (!before) return after;
  if (!after) return before;

  return `${before}\n${after}`.replace(/\n{3,}/g, "\n\n");
}

function replaceSourceRange(source: string, start: number, end: number, nextValue: string): string {
  return `${source.slice(0, start)}${nextValue}${source.slice(end)}`;
}

function escapeLatexText(value: string): string {
  return value.replace(/([&%$#_{}])/g, "\\$1");
}

function removeEmptyImageAlignmentBlocks(source: string): string {
  return source
    .replace(/\n*\\begin\{(center|flushleft|flushright)\}\s*\\end\{\1\}\n*/g, "\n")
    .replace(/(\\begin\{columns\}(?:\[[^\]]*\])?)\s*\\hfill\s*/g, "$1\n")
    .replace(/\s*\\hfill\s*(?=\\end\{columns\})/g, "\n")
    .replace(/\n*\\begin\{columns\}(?:\[[^\]]*\])?\s*\\end\{columns\}\n*/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function removeLatestImageSnippet(source: string, name: string): string {
  const graphic = new RegExp(
    `\\\\includegraphics(?:\\s*\\[[^\\]]*\\])?\\s*\\{${escapeRegExp(name)}\\}`,
    "g",
  );
  const wrappers = ["center", "flushleft", "flushright"] as const;
  let latest: { start: number; end: number } | null = null;
  let match: RegExpExecArray | null;

  while ((match = graphic.exec(source)) !== null) {
    latest = { start: match.index, end: match.index + match[0].length };
  }

  if (!latest) return removeEmptyImageAlignmentBlocks(source);

  const latestGraphic = latest;
  let enclosingWrapper: { start: number; end: number } | null = null;

  wrappers.forEach((wrapper) => {
    const blockPattern = new RegExp(
      `\\\\begin\\{${wrapper}\\}[\\s\\S]*?\\\\end\\{${wrapper}\\}`,
      "g",
    );
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockPattern.exec(source)) !== null) {
      const start = blockMatch.index;
      const end = start + blockMatch[0].length;
      const containsLatestGraphic = start <= latestGraphic.start && latestGraphic.end <= end;

      if (
        containsLatestGraphic &&
        (!enclosingWrapper ||
          start > enclosingWrapper.start ||
          end - start < enclosingWrapper.end - enclosingWrapper.start)
      ) {
        enclosingWrapper = { start, end };
      }
    }
  });

  const columnPattern = /\\begin\{column\}(?:\[[^\]]*\])?\{[^}]*\}[\s\S]*?\\end\{column\}/g;
  let columnMatch: RegExpExecArray | null;

  while ((columnMatch = columnPattern.exec(source)) !== null) {
    const start = columnMatch.index;
    const end = start + columnMatch[0].length;
    const containsLatestGraphic = start <= latestGraphic.start && latestGraphic.end <= end;

    if (
      containsLatestGraphic &&
      (!enclosingWrapper ||
        start > enclosingWrapper.start ||
        end - start < enclosingWrapper.end - enclosingWrapper.start)
    ) {
      enclosingWrapper = { start, end };
    }
  }

  const removal = enclosingWrapper || latest;
  return removeEmptyImageAlignmentBlocks(removeSourceRange(source, removal.start, removal.end));
}

type InsertedImageAlignment = "left" | "center" | "right";

interface InsertedImageSnippet {
  name: string;
  align: Exclude<InsertedImageAlignment, "center">;
  size: string;
  start: number;
  end: number;
}

function parseSnippetSize(option = ""): string {
  const width = option.match(
    /width\s*=\s*([0-9]*\.?[0-9]+)\s*\\(?:textwidth|linewidth|columnwidth|paperwidth)/,
  );
  return width?.[1] || "0.6";
}

function formatLatexWidth(value: number): string {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function scaleImageRowWidths(leftSize: string, rightSize: string): { left: string; right: string } {
  const left = Number(leftSize);
  const right = Number(rightSize);
  const safeLeft = Number.isFinite(left) ? Math.max(0.1, Math.min(1, left)) : 0.6;
  const safeRight = Number.isFinite(right) ? Math.max(0.1, Math.min(1, right)) : 0.6;
  const total = safeLeft + safeRight;
  const scale = total > 0.96 ? 0.96 / total : 1;

  return {
    left: formatLatexWidth(safeLeft * scale),
    right: formatLatexWidth(safeRight * scale),
  };
}

function createImageRowSnippet(
  left: Pick<InsertedImageSnippet, "name" | "size">,
  right: Pick<InsertedImageSnippet, "name" | "size">,
): string {
  const widths = scaleImageRowWidths(left.size, right.size);

  return `\\begin{columns}[T,onlytextwidth]
\\begin{column}{${widths.left}\\textwidth}
\\raggedright
\\includegraphics[width=\\linewidth]{${left.name}}
\\end{column}
\\hfill
\\begin{column}{${widths.right}\\textwidth}
\\raggedleft
\\includegraphics[width=\\linewidth]{${right.name}}
\\end{column}
\\end{columns}`;
}

function createAlignedImageSnippet(next: {
  name: string;
  align: InsertedImageAlignment;
  size: string;
}): string {
  const graphic = `\\includegraphics[width=${next.size}\\linewidth]{${next.name}}`;

  if (next.align === "left") {
    return `\\begin{flushleft}\n${graphic}\n\\end{flushleft}`;
  }

  if (next.align === "right") {
    return `\\begin{flushright}\n${graphic}\n\\end{flushright}`;
  }

  return `\\begin{center}\n${graphic}\n\\end{center}`;
}

function findLastTrailingImageBlock(source: string): InsertedImageSnippet | null {
  const endFrame = "\\end{frame}";
  const endDocument = "\\end{document}";
  const endDocumentIndex = source.lastIndexOf(endDocument);
  const searchEnd = endDocumentIndex === -1 ? source.length : endDocumentIndex;
  const endFrameIndex = source.lastIndexOf(endFrame, searchEnd);
  if (endFrameIndex === -1) return null;

  const frameStartIndex = source.lastIndexOf("\\begin{frame}", endFrameIndex);
  const searchStart = frameStartIndex === -1 ? 0 : frameStartIndex;
  const blockPattern =
    /\\begin\{(flushleft|flushright)\}\s*\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}\s*\\end\{\1\}/g;
  const frameContent = source.slice(searchStart, endFrameIndex);
  let latest: InsertedImageSnippet | null = null;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(frameContent)) !== null) {
    latest = {
      name: match[3],
      align: match[1] === "flushleft" ? "left" : "right",
      size: parseSnippetSize(match[2]),
      start: searchStart + match.index,
      end: searchStart + match.index + match[0].length,
    };
  }

  if (!latest) return null;
  if (source.slice(latest.end, endFrameIndex).trim() !== "") return null;

  return latest;
}

function insertImageIntoLastFrame(
  source: string,
  next: { name: string; align: InsertedImageAlignment; size: string },
): string {
  const snippet = createAlignedImageSnippet(next);

  if (next.align === "center") return insertIntoLastFrame(source, snippet);

  const previous = findLastTrailingImageBlock(source);
  if (!previous || previous.align === next.align) return insertIntoLastFrame(source, snippet);

  const left = previous.align === "left" ? previous : { name: next.name, size: next.size };
  const right = previous.align === "right" ? previous : { name: next.name, size: next.size };
  const row = createImageRowSnippet(left, right);

  return `${source.slice(0, previous.start).trimEnd()}\n\n${row}\n${source.slice(previous.end).trimStart()}`;
}

function isPositionInsideFrame(source: string, position: number): boolean {
  const safePosition = Math.max(0, Math.min(source.length, position));
  const before = source.slice(0, safePosition);
  const lastFrameStart = before.lastIndexOf("\\begin{frame}");
  const lastFrameEnd = before.lastIndexOf("\\end{frame}");

  if (lastFrameStart === -1 || lastFrameStart < lastFrameEnd) return false;

  return source.indexOf("\\end{frame}", safePosition) !== -1;
}

function indentSnippet(snippet: string, indent: string): string {
  return snippet
    .split("\n")
    .map((line) => (line ? `${indent}${line}` : line))
    .join("\n");
}

function insertSnippetAtSelectedLine(source: string, snippet: string, position: number): string {
  const safePosition = Math.max(0, Math.min(source.length, position));
  const lineStart = source.lastIndexOf("\n", Math.max(0, safePosition - 1)) + 1;
  const lineEndIndex = source.indexOf("\n", safePosition);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  const line = source.slice(lineStart, lineEnd);
  const indent = line.match(/^\s*/)?.[0] || "";
  const insertion = indentSnippet(snippet, indent);

  if (line.trim() === "") {
    return `${source.slice(0, lineStart)}${insertion}${source.slice(lineEnd)}`;
  }

  return `${source.slice(0, lineEnd)}\n${insertion}${source.slice(lineEnd)}`;
}

function insertImageAtCursorLine(
  source: string,
  next: { name: string; align: InsertedImageAlignment; size: string },
  position: number | null,
): string {
  if (position === null || !isPositionInsideFrame(source, position)) {
    return insertImageIntoLastFrame(source, next);
  }

  return insertSnippetAtSelectedLine(source, createAlignedImageSnippet(next), position);
}

function findTemplate(name: string): Template {
  const savedCustomTemplate = getSavedCustomTemplate();
  if (savedCustomTemplate?.name === name) return savedCustomTemplate;

  return templates.find((template) => template.name === name) || templates[0];
}

function createCachedProject(
  template: Template = templates[0],
  name = "presentation",
): CachedProject {
  return {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    templateName: template.name,
    latex: createTemplateStarter(template),
    images: {},
    currentSlide: 0,
    updatedAt: Date.now(),
  };
}

function isCachedProject(value: unknown): value is CachedProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<CachedProject>;

  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.templateName === "string" &&
    typeof project.latex === "string" &&
    typeof project.images === "object" &&
    project.images !== null &&
    typeof project.currentSlide === "number" &&
    typeof project.updatedAt === "number"
  );
}

function persistCachedProjectState(state: CachedProjectState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PROJECT_CACHE_KEY,
      JSON.stringify({
        activeProjectId: state.activeProjectId,
        projects: state.projects.slice(0, MAX_DEVICE_PROJECTS),
      }),
    );
  } catch {
    // Browser storage can be unavailable or full; editing should continue without persistence.
  }
}

function persistLastDeletedProject(project: CachedProject | null): void {
  if (typeof window === "undefined") return;
  try {
    if (project) {
      window.localStorage.setItem(PROJECT_RECOVERY_CACHE_KEY, JSON.stringify(project));
    } else {
      window.localStorage.removeItem(PROJECT_RECOVERY_CACHE_KEY);
    }
  } catch {
    // Browser storage can be unavailable or full; editing should continue without persistence.
  }
}

function getLastDeletedProject(): CachedProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_RECOVERY_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isCachedProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getInitialEditorState(): InitialEditorState {
  if (typeof window === "undefined") {
    return {
      activeProjectId: null,
      projects: [],
      activeProject: null,
      selectedTemplate: templates[0],
    };
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CachedProjectState>) : null;
    const projects = Array.isArray(parsed?.projects)
      ? parsed.projects.filter(isCachedProject).slice(0, MAX_DEVICE_PROJECTS)
      : [];
    const activeProject =
      projects.find((project) => project.id === parsed?.activeProjectId) || projects[0] || null;

    return {
      activeProjectId: activeProject?.id || null,
      projects,
      activeProject,
      selectedTemplate: activeProject ? findTemplate(activeProject.templateName) : templates[0],
    };
  } catch {
    return {
      activeProjectId: null,
      projects: [],
      activeProject: null,
      selectedTemplate: templates[0],
    };
  }
}

export const Route = createFileRoute("/")({
  component: EditorPage,
  head: () => ({
    meta: [
      { title: "BeamerLab - LaTeX Slide Editor" },
      {
        name: "description",
        content:
          "Create beautiful technical presentations with LaTeX and Beamer, live rendering, and professional templates.",
      },
    ],
  }),
});

function EditorPage() {
  const editorRef = useRef<LatexEditorHandle | null>(null);
  const beamerBudLauncherIconRef = useRef<HTMLSpanElement | null>(null);
  const beamerBudDockRef = useRef<HTMLButtonElement | null>(null);
  const beamerBudFlightTimeoutRef = useRef<number | null>(null);
  const [initialEditorState] = useState(() => getInitialEditorState());
  const [projects, setProjects] = useState<CachedProject[]>(initialEditorState.projects);
  const [activeProjectId, setActiveProjectId] = useState(initialEditorState.activeProjectId);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const beamerBudOverlayRef = useRef<HTMLDivElement | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(
    initialEditorState.selectedTemplate,
  );
  const [latex, setLatex] = useState(initialEditorState.activeProject?.latex || "");
  const [currentSlide, setCurrentSlide] = useState(
    initialEditorState.activeProject?.currentSlide || 0,
  );
  const [presentationName, setPresentationName] = useState(
    initialEditorState.activeProject?.name || "",
  );
  const [draftPresentationName, setDraftPresentationName] = useState(
    initialEditorState.activeProject?.name || "",
  );
  const [showIntro, setShowIntro] = useState(
    () => wasEditorDocumentLoad() && !introHasOpenedInDocument,
  );
  const [introProjectId, setIntroProjectId] = useState(initialEditorState.activeProject?.id || "");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [showUsageExamples, setShowUsageExamples] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const [beamerBudDocked, setBeamerBudDocked] = useState(false);
  const [beamerBudFlight, setBeamerBudFlight] = useState<BeamerBudFlight | null>(null);
  const [beamerBudFlightStyle, setBeamerBudFlightStyle] = useState<BeamerBudFlightStyle>({});
  const [images, setImages] = useState<Record<string, string>>(
    initialEditorState.activeProject?.images || {},
  );
  const [lastDeletedProject, setLastDeletedProject] = useState<CachedProject | null>(() =>
    getLastDeletedProject(),
  );
  const [editorCursorPosition, setEditorCursorPosition] = useState<number | null>(null);
  const [slideFontFamily, setSlideFontFamily] = useState(SLIDE_FONT_OPTIONS[0].value);
  const [slideFontSize, setSlideFontSize] = useState(16);
  const [aiChangeRanges, setAiChangeRanges] = useState<EditorTextRange[]>([]);
  const [pendingAiSnapshot, setPendingAiSnapshot] = useState<PendingAiSnapshot | null>(null);
  const [panelWidth, setPanelWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [showMobileNotice, setShowMobileNotice] = useState(true);

  const hasProjects = projects.length > 0;
  const hasActiveProject =
    activeProjectId !== null && projects.some((project) => project.id === activeProjectId);
  const canRestoreProject = lastDeletedProject !== null && projects.length < MAX_DEVICE_PROJECTS;
  const shouldShowBeamerBud = hasActiveProject && !showTemplates && !showIntro;
  const hasPendingAiChanges = aiChangeRanges.length > 0;
  const canRestoreAiChanges = hasPendingAiChanges && pendingAiSnapshot !== null;
  const doc = useMemo(() => parseLatex(latex, images), [latex, images]);
  const templateCommands = useMemo(() => getTemplateCommands(selectedTemplate), [selectedTemplate]);
  const exportBaseName = useMemo(() => sanitizeFileBaseName(presentationName), [presentationName]);
  const editorFileName = useMemo(
    () => `${exportBaseName.replace(/_beamerlab$/, "")}.tex`,
    [exportBaseName],
  );

  const clearBeamerBudFlightTimer = useCallback(() => {
    if (beamerBudFlightTimeoutRef.current === null) return;

    window.clearTimeout(beamerBudFlightTimeoutRef.current);
    beamerBudFlightTimeoutRef.current = null;
  }, []);

  const dockBeamerBud = useCallback(() => {
    if (beamerBudDocked || beamerBudFlight) return;

    const start = beamerBudLauncherIconRef.current?.getBoundingClientRect();
    const end = beamerBudDockRef.current?.getBoundingClientRect();

    setShowCopilot(false);

    if (!start || !end) {
      setBeamerBudDocked(true);
      return;
    }

    clearBeamerBudFlightTimer();
    setBeamerBudFlightStyle(createBeamerBudFlightStyle(start, end));
    setBeamerBudFlight("to-dock");
    beamerBudFlightTimeoutRef.current = window.setTimeout(() => {
      setBeamerBudDocked(true);
      setBeamerBudFlight(null);
      beamerBudFlightTimeoutRef.current = null;
    }, BEAMERBUD_FLIGHT_MS);
  }, [beamerBudDocked, beamerBudFlight, clearBeamerBudFlightTimer]);

  const undockBeamerBud = useCallback(() => {
    if (!beamerBudDocked || beamerBudFlight) return;

    const start = beamerBudDockRef.current?.getBoundingClientRect();
    const end = getBeamerBudBubbleIconTarget();

    if (!start) {
      setBeamerBudDocked(false);
      return;
    }

    clearBeamerBudFlightTimer();
    setBeamerBudFlightStyle(createBeamerBudFlightStyle(start, end));
    setBeamerBudFlight("to-bubble");
    beamerBudFlightTimeoutRef.current = window.setTimeout(() => {
      setBeamerBudDocked(false);
      setBeamerBudFlight(null);
      beamerBudFlightTimeoutRef.current = null;
    }, BEAMERBUD_FLIGHT_MS);
  }, [beamerBudDocked, beamerBudFlight, clearBeamerBudFlightTimer]);

  useEffect(() => {
    if (showIntro) {
      introHasOpenedInDocument = true;
    }
  }, [showIntro]);

  useEffect(() => {
    return () => clearBeamerBudFlightTimer();
  }, [clearBeamerBudFlightTimer]);

  useEffect(() => {
    setAiChangeRanges([]);
    setPendingAiSnapshot(null);
    editorRef.current?.clearAiChangeHighlights();
  }, [activeProjectId]);

  useEffect(() => {
    if (shouldShowBeamerBud) return;

    clearBeamerBudFlightTimer();
    setShowCopilot(false);
    setBeamerBudFlight(null);
    if (!hasActiveProject) {
      setBeamerBudDocked(false);
    }
  }, [clearBeamerBudFlightTimer, hasActiveProject, shouldShowBeamerBud]);

  useEffect(() => {
    if (!activeProjectId) return;

    const updatedProject: CachedProject = {
      id: activeProjectId,
      name: presentationName || "presentation",
      templateName: selectedTemplate.name,
      latex,
      images,
      currentSlide,
      updatedAt: Date.now(),
    };

    setProjects((prev) => {
      const projectIndex = prev.findIndex((project) => project.id === activeProjectId);
      const next =
        projectIndex === -1
          ? [updatedProject, ...prev].slice(0, MAX_DEVICE_PROJECTS)
          : prev
              .map((project) => (project.id === activeProjectId ? updatedProject : project))
              .slice(0, MAX_DEVICE_PROJECTS);

      persistCachedProjectState({ activeProjectId, projects: next });
      return next;
    });
  }, [activeProjectId, currentSlide, images, latex, presentationName, selectedTemplate.name]);

  useEffect(() => {
    if (doc.slides.length === 0) {
      setCurrentSlide(0);
      return;
    }

    setCurrentSlide((prev) => Math.min(prev, doc.slides.length - 1));
  }, [doc.slides.length]);

  useEffect(() => {
    if (projects.length === 0) {
      setIntroProjectId("");
      return;
    }

    if (!projects.some((project) => project.id === introProjectId)) {
      setIntroProjectId(activeProjectId || projects[0].id);
    }
  }, [activeProjectId, introProjectId, projects]);
  
  useEffect(() => {
  if (!showCopilot) return;

  function handleDocumentMouseDown(event: MouseEvent) {
    const target = event.target as Node | null;
    if (!target) return;

    const clickedEditorPane = editorPaneRef.current?.contains(target) ?? false;
    const clickedBeamerBudOverlay = beamerBudOverlayRef.current?.contains(target) ?? false;

    if (clickedEditorPane && !clickedBeamerBudOverlay) {
      setShowCopilot(false);
    }
  }

  document.addEventListener("mousedown", handleDocumentMouseDown);

  return () => {
    document.removeEventListener("mousedown", handleDocumentMouseDown);
  };
}, [showCopilot]);

  const handleTemplateSelect = useCallback((t: Template) => {
    setSelectedTemplate(t);
    setLatex(createTemplateStarter(t));
    setCurrentSlide(0);
    setEditorCursorPosition(null);
    setShowTemplates(false);
  }, []);

  const commitPresentationName = useCallback(() => {
    setPresentationName(draftPresentationName.trim() || "presentation");
    setDraftPresentationName(draftPresentationName.trim() || "presentation");
  }, [draftPresentationName]);

  const handleProjectSwitch = useCallback(
    (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;

      setActiveProjectId(project.id);
      setSelectedTemplate(findTemplate(project.templateName));
      setLatex(project.latex);
      setCurrentSlide(project.currentSlide);
      setPresentationName(project.name);
      setDraftPresentationName(project.name);
      setImages(project.images || {});
      setEditorCursorPosition(null);
      setShowImages(false);
    },
    [projects],
  );

  const handleCloseProject = useCallback(() => {
    if (!activeProjectId || projects.length === 0) return;

    const deletedProject = projects.find((project) => project.id === activeProjectId);
    if (deletedProject) {
      setLastDeletedProject(deletedProject);
      persistLastDeletedProject(deletedProject);
    }

    const next = projects.filter((project) => project.id !== activeProjectId);
    const nextProject = next[0];

    setProjects(next);
    setEditorCursorPosition(null);
    setShowImages(false);
    setShowUsageExamples(false);

    if (!nextProject) {
      persistCachedProjectState({ activeProjectId: null, projects: [] });
      setActiveProjectId(null);
      setSelectedTemplate(templates[0]);
      setLatex("");
      setCurrentSlide(0);
      setPresentationName("");
      setDraftPresentationName("");
      setImages({});
      setShowTemplates(false);
      setShowIntro(false);
      return;
    }

    persistCachedProjectState({ activeProjectId: nextProject.id, projects: next });
    setActiveProjectId(nextProject.id);
    setSelectedTemplate(findTemplate(nextProject.templateName));
    setLatex(nextProject.latex);
    setCurrentSlide(nextProject.currentSlide);
    setPresentationName(nextProject.name);
    setDraftPresentationName(nextProject.name);
    setImages(nextProject.images || {});
  }, [activeProjectId, projects]);

  const handleRestoreProject = useCallback(() => {
    if (!lastDeletedProject || projects.length >= MAX_DEVICE_PROJECTS) return;

    const restoredProject = projects.some((project) => project.id === lastDeletedProject.id)
      ? {
          ...lastDeletedProject,
          id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }
      : lastDeletedProject;
    const next = [...projects, restoredProject].slice(0, MAX_DEVICE_PROJECTS);

    setProjects(next);
    persistCachedProjectState({ activeProjectId: restoredProject.id, projects: next });
    setActiveProjectId(restoredProject.id);
    setSelectedTemplate(findTemplate(restoredProject.templateName));
    setLatex(restoredProject.latex);
    setCurrentSlide(restoredProject.currentSlide);
    setPresentationName(restoredProject.name);
    setDraftPresentationName(restoredProject.name);
    setImages(restoredProject.images || {});
    setEditorCursorPosition(null);
    setIntroProjectId(restoredProject.id);
    setShowImages(false);
    setShowUsageExamples(false);
    setShowTemplates(false);
    setShowIntro(false);
    setLastDeletedProject(null);
    persistLastDeletedProject(null);
  }, [lastDeletedProject, projects]);

  const handleCreateProject = useCallback(
    (openTemplateSelector = false) => {
      if (projects.length >= MAX_DEVICE_PROJECTS) return;

      const project = createCachedProject(templates[0], `Presentation ${projects.length + 1}`);
      const next = [...projects, project].slice(0, MAX_DEVICE_PROJECTS);

      setProjects(next);
      persistCachedProjectState({ activeProjectId: project.id, projects: next });
      setActiveProjectId(project.id);
      setSelectedTemplate(templates[0]);
      setLatex(project.latex);
      setCurrentSlide(0);
      setPresentationName(project.name);
      setDraftPresentationName(project.name);
      setImages({});
      setEditorCursorPosition(null);
      setIntroProjectId(project.id);
      setShowImages(false);
      if (openTemplateSelector) {
        setShowIntro(false);
        setShowTemplates(true);
      }
    },
    [projects],
  );

  const handleIntroExistingProject = useCallback(() => {
    if (!introProjectId) return;

    handleProjectSwitch(introProjectId);
    setShowIntro(false);
  }, [handleProjectSwitch, introProjectId]);

  const handleLatexChange = useCallback(
    (nextLatex: string) => {
      setLatex(wrapBareFrameDocument(nextLatex, selectedTemplate));
    },
    [selectedTemplate],
  );

  const insertSnippet = useCallback(
    (snippet: string, placement: TemplateCommand["placement"] = "document") => {
      setLatex((prev) => {
        const next =
          placement === "frame"
            ? insertIntoLastFrame(prev, snippet)
            : insertIntoDocument(prev, snippet);

        return wrapBareFrameDocument(next, selectedTemplate);
      });
    },
    [selectedTemplate],
  );

  const handleImageUpload = useCallback((name: string, dataUrl: string) => {
    setImages((prev) => ({ ...prev, [name]: dataUrl }));
  }, []);

  const handleImageRemove = useCallback((name: string) => {
    setImages((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleImageRemoveInserted = useCallback((name: string) => {
    setLatex((prev) => removeLatestImageSnippet(prev, name));
  }, []);

  const handleImageInsert = useCallback(
    (name: string, align: "left" | "center" | "right" = "center", size = "0.6") => {
      setLatex((prev) =>
        wrapBareFrameDocument(
          insertImageAtCursorLine(prev, { name, align, size }, editorCursorPosition),
          selectedTemplate,
        ),
      );
    },
    [editorCursorPosition, selectedTemplate],
  );

  const handleExportLatex = useCallback(() => {
    const blob = new Blob([latex], { type: "text/x-latex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportBaseName}.tex`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportBaseName, latex]);

  const handleExportPreviewPdf = useCallback(() => {
    const previousTitle = document.title;
    document.title = exportBaseName;

    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    window.addEventListener("afterprint", restoreTitle);
    requestAnimationFrame(() => window.print());
    window.setTimeout(restoreTitle, 1500);
  }, [exportBaseName]);

  const handlePreviewTextTargetSelect = useCallback(
    (target: EditableTextTarget, options?: { editing?: boolean }) => {
      setCurrentSlide(target.slideIndex);
      editorRef.current?.focusRange(target.start, target.end, {
        focus: !options?.editing,
        previewHighlight: true,
      });
    },
    [],
  );

  const handlePreviewTextTargetClear = useCallback(() => {
    editorRef.current?.clearPreviewHighlight();
  }, []);

  const handlePreviewTextTargetUpdate = useCallback(
    (target: EditableTextTarget, nextText: string) => {
      const escapedText = escapeLatexText(nextText);
      const nextTarget = {
        ...target,
        text: nextText,
        source: escapedText,
        end: target.start + escapedText.length,
      };

      const replacedInEditor =
        editorRef.current?.replaceRange(target.start, target.end, escapedText, {
          expectedText: target.source,
          focus: false,
          previewHighlight: true,
        }) || false;

      if (!replacedInEditor) {
        if (latex.slice(target.start, target.end) !== target.source) return target;

        setLatex(
          wrapBareFrameDocument(
            replaceSourceRange(latex, target.start, target.end, escapedText),
            selectedTemplate,
          ),
        );
      }

      setCurrentSlide(target.slideIndex);
      editorRef.current?.focusRange(target.start, target.start + escapedText.length, {
        focus: false,
        previewHighlight: true,
      });
      return nextTarget;
    },
    [latex, selectedTemplate],
  );

  const handleBeforeCopilotRequest = useCallback(
    (previousLatex: string) => {
      setAiChangeRanges([]);
      editorRef.current?.clearAiChangeHighlights();
      setPendingAiSnapshot({
        projectId: activeProjectId,
        templateName: selectedTemplate.name,
        latex: previousLatex,
        images,
        currentSlide,
      });
    },
    [activeProjectId, currentSlide, images, selectedTemplate.name],
  );

  const handleCopilotApply = useCallback(
    (nextLatex: string, previousLatex: string) => {
      const nextDocument = wrapBareFrameDocument(nextLatex, selectedTemplate);
      setAiChangeRanges(computeAiChangeRanges(previousLatex, nextDocument));
      setLatex(nextDocument);
    },
    [selectedTemplate],
  );

  const handleCopilotRestore = useCallback(() => {
    if (!pendingAiSnapshot) return;

    if (
      pendingAiSnapshot.projectId &&
      activeProjectId &&
      pendingAiSnapshot.projectId !== activeProjectId
    ) {
      setPendingAiSnapshot(null);
      setAiChangeRanges([]);
      editorRef.current?.clearAiChangeHighlights();
      return;
    }

    const snapshotTemplate = findTemplate(pendingAiSnapshot.templateName);
    setAiChangeRanges([]);
    setPendingAiSnapshot(null);
    editorRef.current?.clearAiChangeHighlights();
    setSelectedTemplate(snapshotTemplate);
    setLatex(wrapBareFrameDocument(pendingAiSnapshot.latex, snapshotTemplate));
    setImages(pendingAiSnapshot.images);
    setCurrentSlide(pendingAiSnapshot.currentSlide);
  }, [activeProjectId, pendingAiSnapshot]);

  const handleAcceptAiChanges = useCallback(() => {
    setAiChangeRanges([]);
    setPendingAiSnapshot(null);
    editorRef.current?.clearAiChangeHighlights();
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      setPanelWidth(Math.max(25, Math.min(75, pct)));
    },
    [isDragging],
  );

  return (
    <div>
      {showMobileNotice && (
        <div
          className="md:hidden fixed top-0 left-0 right-0 z-[100] bg-amber-50 text-amber-900 border-b border-amber-200 px-4 py-3 text-sm flex items-center justify-between gap-3"
          data-print-hidden="true"
        >
          <span>
            BeamerLab is currently optimized for desktop use. For the best editing and PDF export
            experience, please use a laptop or desktop screen.
          </span>
          <button
            onClick={() => setShowMobileNotice(false)}
            className="font-semibold text-lg leading-none"
            aria-label="Dismiss mobile notice"
          >
            ×
          </button>
        </div>
      )}

      <div
        className={`app-shell h-screen flex flex-col bg-background select-none ${
          showMobileNotice ? "pt-20 md:pt-0" : ""
        }`}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
      >
        <header className="h-12 bg-toolbar-bg border-b border-toolbar-border flex items-center px-3 gap-1.5 flex-shrink-0 overflow-hidden whitespace-nowrap">
          <div className="flex flex-shrink-0 items-center gap-1.5 mr-2">
            <span className="text-primary font-bold text-lg tracking-tight">&lt;B&gt;</span>
            <span className="font-semibold text-foreground text-sm">BeamerLab</span>
          </div>
          <Link to="/about" className={`${HEADER_SECONDARY_BUTTON_CLASS} w-20`}>
            About us
          </Link>

          <div className="h-5 w-px flex-shrink-0 bg-border mx-0.5" />

          <select
            value={activeProjectId || ""}
            onChange={(event) => handleProjectSwitch(event.target.value)}
            disabled={!hasProjects}
            className={HEADER_SELECT_CLASS}
            aria-label="Cached project"
          >
            {!hasProjects && <option value="">No projects</option>}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name || "presentation"}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleCreateProject(!hasActiveProject)}
            disabled={projects.length >= MAX_DEVICE_PROJECTS}
            className={`${HEADER_SECONDARY_BUTTON_CLASS} w-20`}
            title={
              projects.length >= MAX_DEVICE_PROJECTS
                ? "Five cached projects are already open on this device"
                : "Create cached project"
            }
          >
            + Project
          </button>
          <button
            onClick={handleCloseProject}
            disabled={!hasActiveProject}
            className={`${HEADER_SECONDARY_BUTTON_CLASS} w-20`}
            title={hasActiveProject ? "Close cached project" : "No project is open"}
            aria-label="Close cached project"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Close
          </button>
          <button
            onClick={handleRestoreProject}
            disabled={!canRestoreProject}
            className={`${HEADER_SECONDARY_BUTTON_CLASS} w-20`}
            title={
              lastDeletedProject
                ? projects.length >= MAX_DEVICE_PROJECTS
                  ? "Close a project before restoring the last deleted project"
                  : `Restore ${lastDeletedProject.name || "last deleted project"}`
                : "No deleted project to restore"
            }
            aria-label="Restore last deleted project"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </button>

          <button
            onClick={() => (hasActiveProject ? setShowTemplates(true) : handleCreateProject(true))}
            className={`${HEADER_PRIMARY_BUTTON_CLASS} w-28`}
          >
            <FilePlus className="h-3.5 w-3.5" />
            New
          </button>
          <button
            onClick={() => setShowImages(!showImages)}
            disabled={!hasActiveProject}
            className={`${HEADER_SECONDARY_BUTTON_CLASS} w-24`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Images {Object.keys(images).length > 0 && `(${Object.keys(images).length})`}
          </button>
          <button
            onClick={handleExportLatex}
            disabled={!hasActiveProject}
            className={`${HEADER_SECONDARY_BUTTON_CLASS} w-24`}
          >
            <Download className="h-3.5 w-3.5" />
            .tex
          </button>
          <button
            onClick={handleExportPreviewPdf}
            disabled={!hasActiveProject}
            className={`${HEADER_SECONDARY_BUTTON_CLASS} w-24`}
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>

          {hasActiveProject && (
            <input
              value={draftPresentationName}
              onChange={(e) => setDraftPresentationName(e.target.value)}
              onBlur={commitPresentationName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitPresentationName();
                  event.currentTarget.blur();
                }
              }}
              className={HEADER_INPUT_CLASS}
              placeholder="presentation name"
              aria-label="Presentation file name"
            />
          )}

          <div className="flex-1" />

          {shouldShowBeamerBud && (
            <button
              ref={beamerBudDockRef}
              type="button"
              onClick={undockBeamerBud}
              className={`mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-primary/20 bg-secondary/80 text-primary transition-all hover:border-primary/45 hover:bg-primary/10 ${
                beamerBudDocked && beamerBudFlight !== "to-bubble"
                  ? "scale-100 opacity-100"
                  : "pointer-events-none scale-90 opacity-0"
              }`}
              title="Open BeamerBud"
              aria-label="Open BeamerBud"
            >
              <BeamerBudIcon className="h-6 w-6" />
            </button>
          )}

          {hasActiveProject && (
            <div className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">
                {doc.theme}
              </span>
              <span>{selectedTemplate.name}</span>
              <span>{doc.slides.length} slides</span>
            </div>
          )}
        </header>

        {hasActiveProject ? (
          <div className="flex-1 flex overflow-hidden relative">
            <div
                ref={editorPaneRef}
                style={{ width: `${panelWidth}%` }}
                className="h-full min-w-0 flex flex-col"
              >
              <div className="h-10 flex-shrink-0 bg-editor-bg border-b border-border flex items-center px-3 gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap">
                <span
                  className="w-32 flex-shrink-0 truncate text-xs text-muted-foreground font-mono"
                  title={editorFileName}
                >
                  {editorFileName}
                </span>

                <div className="h-4 w-px flex-shrink-0 bg-border" />

                <label className="flex h-7 flex-shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Slide font
                  <select
                    value={slideFontFamily}
                    onChange={(event) => setSlideFontFamily(event.target.value)}
                    className="h-7 w-32 flex-shrink-0 rounded border border-border bg-toolbar-bg px-2 text-xs normal-case tracking-normal text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Slide font"
                  >
                    {SLIDE_FONT_OPTIONS.map((font) => (
                      <option key={font.label} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex h-7 flex-shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Slide size
                  <select
                    value={slideFontSize}
                    onChange={(event) => setSlideFontSize(Number(event.target.value))}
                    className="h-7 w-16 flex-shrink-0 rounded border border-border bg-toolbar-bg px-2 text-xs normal-case tracking-normal text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Slide font size"
                  >
                    {SLIDE_FONT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  onClick={() => setShowUsageExamples(!showUsageExamples)}
                  className={`inline-flex h-7 flex-shrink-0 items-center gap-1.5 rounded px-2.5 text-xs transition-colors whitespace-nowrap ${
                    showUsageExamples
                      ? "bg-primary/20 text-primary"
                      : "bg-secondary/70 text-secondary-foreground hover:bg-secondary"
                  }`}
                >
                  <BookOpen className="h-3 w-3 flex-shrink-0" strokeWidth={2.5} />
                  Usage examples
                </button>

                <div className="w-2 flex-shrink-0" />

                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {latex.split("\n").length} lines
                </span>
              </div>

              <div className="flex-shrink-0 border-b border-border bg-toolbar-bg px-3 py-2 flex items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex-shrink-0">
                  {selectedTemplate.theme} commands
                </span>
                {templateCommands.map((command) => (
                  <button
                    key={command.label}
                    onClick={() => insertSnippet(command.insert, command.placement)}
                    className="inline-flex h-7 flex-shrink-0 items-center gap-1.5 rounded bg-secondary/70 px-2.5 text-xs text-secondary-foreground hover:bg-secondary transition-colors whitespace-nowrap"
                  >
                    <Play className="h-3 w-3" />
                    {command.label}
                  </button>
                ))}
              </div>

              {showImages && (
                <div className="border-b border-border bg-sidebar-bg max-h-48 overflow-y-auto">
                  <Suspense fallback={null}>
                    <ImageUploader
                      images={images}
                      onUpload={handleImageUpload}
                      onRemove={handleImageRemove}
                      onRemoveInserted={handleImageRemoveInserted}
                      onInsert={handleImageInsert}
                    />
                  </Suspense>
                </div>
              )}

              {showUsageExamples && (
                <div className="border-b border-border bg-sidebar-bg p-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      ["Frame", "\\begin{frame}{Title}\nSlide content.\n\\end{frame}"],
                      ["Block", "\\begin{block}{Key point}\nImportant content.\n\\end{block}"],
                      [
                        "Columns",
                        "\\begin{columns}\n\\begin{column}{0.5\\textwidth}\nLeft\n\\end{column}\n\\begin{column}{0.5\\textwidth}\nRight\n\\end{column}\n\\end{columns}",
                      ],
                      ["Math", "$\\tilde{a} = \\frac{1}{n}\\sum_i x_i$"],
                      [
                        "Center Image",
                        "\\begin{center}\n\\includegraphics[width=0.6\\linewidth]{image.png}\n\\end{center}",
                      ],
                      [
                        "Image Row",
                        "\\begin{columns}[T,onlytextwidth]\n\\begin{column}{0.48\\textwidth}\n\\raggedright\n\\includegraphics[width=\\linewidth]{left.png}\n\\end{column}\n\\hfill\n\\begin{column}{0.48\\textwidth}\n\\raggedleft\n\\includegraphics[width=\\linewidth]{right.png}\n\\end{column}\n\\end{columns}",
                      ],
                      [
                        "Text + Image",
                        "\\begin{columns}[T,onlytextwidth]\n\\begin{column}{0.58\\textwidth}\nText that should sit next to the figure.\n\\end{column}\n\\begin{column}{0.36\\textwidth}\n\\includegraphics[width=\\linewidth]{image.png}\n\\end{column}\n\\end{columns}",
                      ],
                    ].map(([label, example]) => (
                      <div key={label} className="rounded border border-border bg-editor-bg p-3">
                        <div className="mb-1 font-semibold text-foreground">{label}</div>
                        <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-muted-foreground font-mono">
                          {example}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative flex-1 overflow-hidden">
                {hasPendingAiChanges && !showCopilot && (
                  <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-xl backdrop-blur">
                    <button
                      type="button"
                      onClick={handleAcceptAiChanges}
                      className="flex h-8 w-8 items-center justify-center rounded bg-emerald-500/15 text-emerald-300 transition-colors hover:bg-emerald-500/25 hover:text-emerald-100"
                      title="Accept BeamerBud changes"
                      aria-label="Accept BeamerBud changes"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCopilotRestore}
                      disabled={!canRestoreAiChanges}
                      className="flex h-8 w-8 items-center justify-center rounded bg-red-500/15 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Decline BeamerBud changes"
                      aria-label="Decline BeamerBud changes"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <LatexEditor
                  ref={editorRef}
                  value={latex}
                  onChange={handleLatexChange}
                  onCursorPositionChange={setEditorCursorPosition}
                  aiChangeRanges={aiChangeRanges}
                />
              </div>
            </div>

            <div
              className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0 relative z-10"
              onMouseDown={() => setIsDragging(true)}
            />

            <div style={{ width: `${100 - panelWidth}%` }} className="h-full bg-muted/30">
              <SlidePreview
                document={doc}
                currentSlide={currentSlide}
                onSlideChange={setCurrentSlide}
                onTextTargetSelect={handlePreviewTextTargetSelect}
                onTextTargetClear={handlePreviewTextTargetClear}
                onTextTargetUpdate={handlePreviewTextTargetUpdate}
                slideFontFamily={slideFontFamily}
                slideFontSize={slideFontSize}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background px-6">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-xl">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded bg-primary/10 text-primary">
                <FilePlus className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">Create a new project</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                There are no cached projects on this browser. Create a project to select a template
                and start editing.
              </p>
              <button
                onClick={() => handleCreateProject(true)}
                disabled={projects.length >= MAX_DEVICE_PROJECTS}
                className="mt-6 w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create new project
              </button>
              {lastDeletedProject && (
                <button
                  onClick={handleRestoreProject}
                  disabled={!canRestoreProject}
                  className="mt-3 w-full rounded bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Restore {lastDeletedProject.name || "last deleted project"}
                </button>
              )}
            </div>
          </div>
        )}

        {shouldShowBeamerBud && !beamerBudDocked && beamerBudFlight !== "to-dock" && (
            <div
              ref={beamerBudOverlayRef}
              className="fixed bottom-4 left-4 z-[55] flex w-[min(560px,calc(100vw-2rem))] flex-col items-start gap-3"
            >
            {showCopilot && (
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => setShowCopilot(false)}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded bg-secondary/80 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title="Close BeamerBud"
                  aria-label="Close BeamerBud"
                >
                  <X className="h-4 w-4" />
                </button>
                <CopilotPanel
                  latex={latex}
                  templateName={selectedTemplate.name}
                  theme={doc.theme}
                  imageNames={Object.keys(images)}
                  hasPendingAiChanges={hasPendingAiChanges}
                  canRestoreChanges={canRestoreAiChanges}
                  onAcceptChanges={handleAcceptAiChanges}
                  onBeforeApplyRequest={handleBeforeCopilotRequest}
                  onApplyLatex={handleCopilotApply}
                  onRestoreLatex={handleCopilotRestore}
                />
              </div>
            )}

            <div className="group relative">
              <button
                type="button"
                onClick={() => setShowCopilot((open) => !open)}
                className={`beamerbud-launcher flex h-[58px] w-[168px] items-center gap-3 rounded-full border px-3 text-xs font-semibold shadow-2xl backdrop-blur transition-all ${
                  showCopilot
                    ? "border-primary/45 bg-primary/20 text-primary"
                    : "border-primary/25 bg-background/90 text-foreground hover:border-primary/45 hover:bg-primary/10"
                }`}
                aria-expanded={showCopilot}
                aria-label="Toggle BeamerBud"
              >
                <span
                  ref={beamerBudLauncherIconRef}
                  className="flex h-11 w-10 flex-shrink-0 items-center justify-center"
                >
                  <BeamerBudIcon className="beamerbud-icon h-9 w-9 drop-shadow-sm" />
                </span>
                <span className="flex min-w-0 flex-col items-start justify-center leading-tight">
                  <span className="text-[13px] font-semibold">BeamerBud</span>
                  <span className="text-[12px] font-medium text-muted-foreground">
                    Beam me up 🚀
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={dockBeamerBud}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground opacity-0 shadow-lg transition-all hover:border-primary/50 hover:text-foreground group-hover:opacity-100"
                title="Dock BeamerBud"
                aria-label="Dock BeamerBud"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {shouldShowBeamerBud && beamerBudFlight && (
          <div
            className={`beamerbud-flight ${
              beamerBudFlight === "to-dock"
                ? "beamerbud-flight-to-dock"
                : "beamerbud-flight-to-bubble"
            }`}
            style={beamerBudFlightStyle}
            aria-hidden="true"
          >
            <BeamerBudIcon className="beamerbud-icon h-full w-full drop-shadow" />
          </div>
        )}

        {showTemplates && (
          <Suspense fallback={null}>
            <TemplateSelector
              onSelect={handleTemplateSelect}
              onClose={() => setShowTemplates(false)}
            />
          </Suspense>
        )}

        {showIntro && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/75 backdrop-blur-md p-4"
            data-beamerlab-modal="true"
          >
            <div className="w-full max-w-3xl max-h-[calc(100vh-2rem)] rounded-xl border border-border bg-card shadow-2xl overflow-y-auto">
              <div className="px-7 py-6 border-b border-border bg-editor-bg">
                <div className="beamerlab-typewriter font-mono text-xl font-bold text-primary">
                  {"\\begin{BeamerLab}"}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Start from a clean BeamerLab template or continue one of the projects cached on
                  this device.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                <section className="rounded-lg border border-border bg-secondary/20 p-5">
                  <h2 className="text-base font-semibold text-foreground">Create a new project</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Choose a template and begin with a fresh presentation.
                  </p>
                  <button
                    onClick={() => handleCreateProject(true)}
                    disabled={projects.length >= MAX_DEVICE_PROJECTS}
                    className="mt-5 w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    New project
                  </button>
                  {projects.length >= MAX_DEVICE_PROJECTS && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Close a cached project first to create another one.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-border bg-secondary/20 p-5">
                  <h2 className="text-base font-semibold text-foreground">
                    Work on existing project
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Reopen one of the local projects saved for this browser.
                  </p>
                  <select
                    value={introProjectId}
                    onChange={(event) => setIntroProjectId(event.target.value)}
                    disabled={!hasProjects}
                    className="mt-5 w-full rounded bg-editor-bg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Existing cached project"
                  >
                    {!hasProjects && <option value="">No cached projects</option>}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name || "presentation"}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleIntroExistingProject}
                    disabled={!introProjectId}
                    className="mt-3 w-full rounded bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Open project
                  </button>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="print-deck" aria-hidden="true">
        {doc.slides.map((slide, index) => (
          <section className="print-slide-page" key={index}>
            <SlideRenderer
              slide={slide}
              doc={doc}
              width={960}
              slideFontFamily={slideFontFamily}
              slideFontSize={slideFontSize}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
