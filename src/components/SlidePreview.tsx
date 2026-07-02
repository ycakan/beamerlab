import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  type EditableTextTarget,
  type ParsedDocument,
  getThemeStyle,
  type ThemeStyle,
} from "@/lib/latex-parser";

interface SlidePreviewProps {
  document: ParsedDocument;
  currentSlide: number;
  onSlideChange: (index: number) => void;
  onTextTargetSelect?: (target: EditableTextTarget, options?: { editing?: boolean }) => void;
  onTextTargetClear?: () => void;
  onTextTargetUpdate?: (
    target: EditableTextTarget,
    nextText: string,
  ) => EditableTextTarget | null | undefined;
  slideFontFamily?: string;
  slideFontSize?: number;
}

interface SlideTypography {
  slideFontFamily?: string;
  slideFontSize?: number;
}

const AUTO_FIT_SAFE_INSET = 10;
const PREVIEW_ZOOM_MIN = 50;
const PREVIEW_ZOOM_MAX = 180;
const PREVIEW_ZOOM_STEP = 10;

function scaledFontSize(typography: SlideTypography, multiplier: number, fallback: number): string {
  return `${(typography.slideFontSize || fallback) * multiplier}px`;
}

function formatPreviewZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

function shouldSkipSlideKeyboardNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .cm-editor, [data-beamerlab-modal="true"]',
    ),
  );
}

function normalizeTargetText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeInlineEditorValue(text: string): string {
  return text.replace(/\r?\n/g, " ");
}

function editableTextProps(target?: EditableTextTarget) {
  return target
    ? {
        "data-target-id": target.id,
        contentEditable: true,
        suppressContentEditableWarning: true,
        spellCheck: false,
      }
    : {};
}

function resolveTextTarget(
  root: HTMLElement,
  origin: HTMLElement,
  targets: EditableTextTarget[],
): { target: EditableTextTarget; element: HTMLElement } | null {
  const directTarget = origin.closest<HTMLElement>("[data-target-id]");
  if (directTarget) {
    const targetId = directTarget.dataset.targetId;
    const target = targets.find((item) => item.id === targetId);
    if (target) return { target, element: directTarget };
  }

  let current: HTMLElement | null = origin;
  while (current && current !== root) {
    const text = normalizeTargetText(current.textContent || "");
    if (text) {
      const matches = targets.filter((target) => normalizeTargetText(target.text) === text);
      if (matches.length > 0) {
        return { target: matches[0], element: current };
      }
    }
    current = current.parentElement;
  }

  return null;
}

function findTargetElement(root: HTMLElement, targetId: string): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-target-id]")).find(
      (element) => element.dataset.targetId === targetId,
    ) || null
  );
}

function getCaretOffsetWithin(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return element.textContent?.length || 0;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return element.textContent?.length || 0;

  const prefixRange = range.cloneRange();
  prefixRange.selectNodeContents(element);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  return prefixRange.toString().length;
}

function setCaretOffsetWithin(element: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const safeOffset = Math.max(0, offset);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = safeOffset;
  let node = walker.nextNode();

  while (node) {
    const textLength = node.textContent?.length || 0;
    if (remaining <= textLength) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    remaining -= textLength;
    node = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function renderTitleSlide(
  slide: ParsedDocument["slides"][0],
  doc: ParsedDocument,
  theme: ThemeStyle,
  typography: SlideTypography,
) {
  const fontFamily = typography.slideFontFamily || theme.headingFont;

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-20 relative overflow-hidden"
      style={{ background: theme.titleBg, color: theme.titleFg, fontFamily }}
    >
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-[0.07]"
        style={{
          background: theme.titleAccent,
          filter: "blur(80px)",
          transform: "translate(30%, -30%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-[0.05]"
        style={{
          background: theme.titleAccent,
          filter: "blur(60px)",
          transform: "translate(-20%, 20%)",
        }}
      />

      <div className="w-16 h-1 rounded-full mb-10" style={{ background: theme.titleAccent }} />

      <h1
        {...editableTextProps(slide.titleTarget)}
        className="font-bold text-center leading-tight tracking-tight mb-4 cursor-text"
        style={{ maxWidth: 700, fontFamily, fontSize: scaledFontSize(typography, 3, 16) }}
      >
        {doc.documentTitle}
      </h1>

      {slide.subtitle && (
        <h2
          {...editableTextProps(slide.subtitleTarget)}
          className="text-center mb-8 opacity-70 font-light tracking-wide cursor-text"
          style={{ fontFamily, fontSize: scaledFontSize(typography, 1.25, 16) }}
        >
          {slide.subtitle}
        </h2>
      )}

      <div
        style={{ fontSize: typography.slideFontSize }}
        dangerouslySetInnerHTML={{ __html: slide.content }}
      />

      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.accentGradient }}
      />
    </div>
  );
}

function renderSectionSlide(
  slide: ParsedDocument["slides"][0],
  theme: ThemeStyle,
  typography: SlideTypography,
) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-20 relative overflow-hidden"
      style={{
        background: theme.sectionBg,
        color: theme.sectionFg,
        fontFamily: typography.slideFontFamily || theme.headingFont,
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "radial-gradient(circle at 50% 50%, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="w-12 h-1 rounded-full mb-8 opacity-60"
        style={{ background: theme.sectionFg }}
      />
      <h1
        {...editableTextProps(slide.titleTarget)}
        className="font-bold text-center tracking-tight cursor-text"
        style={{
          fontFamily: typography.slideFontFamily || theme.headingFont,
          fontSize: scaledFontSize(typography, 2.25, 16),
        }}
      >
        {slide.title}
      </h1>
    </div>
  );
}

function AutoFitContent({ html, fontSize }: { html: string; fontSize: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const recomputeScale = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const availableWidth = Math.max(viewport.clientWidth - AUTO_FIT_SAFE_INSET * 2, 1);
    const availableHeight = Math.max(viewport.clientHeight - AUTO_FIT_SAFE_INSET * 2, 1);
    const naturalWidth = Math.max(content.scrollWidth, content.offsetWidth, 1);
    const naturalHeight = Math.max(content.scrollHeight, content.offsetHeight, 1);
    const nextScale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);

    setScale((current) => (Math.abs(current - nextScale) > 0.01 ? nextScale : current));
  }, []);

  useEffect(() => {
    recomputeScale();

    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const resizeObserver = new ResizeObserver(() => {
      recomputeScale();
    });

    resizeObserver.observe(viewport);
    resizeObserver.observe(content);

    const imageElements = Array.from(content.querySelectorAll("img"));
    const cleanupCallbacks = imageElements.map((image) => {
      const handleLoad = () => recomputeScale();
      image.addEventListener("load", handleLoad);
      return () => image.removeEventListener("load", handleLoad);
    });

    return () => {
      resizeObserver.disconnect();
      cleanupCallbacks.forEach((cleanup) => cleanup());
    };
  }, [fontSize, html, recomputeScale]);

  return (
    <div ref={viewportRef} className="relative h-full w-full overflow-hidden">
      <div
        className="absolute overflow-hidden"
        style={{
          inset: AUTO_FIT_SAFE_INSET,
          border: "1px solid transparent",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            ref={contentRef}
            style={{ fontSize, lineHeight: 1.6, width: "100%" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

function renderContentSlide(
  slide: ParsedDocument["slides"][0],
  doc: ParsedDocument,
  theme: ThemeStyle,
  totalSlides: number,
  typography: SlideTypography,
) {
  const progress = (slide.slideNumber || 1) / totalSlides;
  const bodyFontFamily = typography.slideFontFamily || theme.bodyFont;
  const headingFontFamily = typography.slideFontFamily || theme.headingFont;
  const contentFontSize = typography.slideFontSize ? `${typography.slideFontSize}px` : "16px";

  return (
    <div
      className="w-full h-full flex flex-col relative"
      style={{ background: theme.bodyBg, color: theme.bodyFg, fontFamily: bodyFontFamily }}
    >
      {theme.headerStyle === "accent-bar" && (
        <div className="px-10 pt-8 pb-4">
          <div
            className="w-10 h-1 rounded-full mb-4"
            style={{ background: theme.accentGradient }}
          />
          <h2
            {...editableTextProps(slide.titleTarget)}
            className="font-bold tracking-tight cursor-text"
            style={{
              fontFamily: headingFontFamily,
              fontSize: scaledFontSize(typography, 1.875, 16),
            }}
          >
            {slide.title}
          </h2>
          {slide.subtitle && (
            <div
              {...editableTextProps(slide.subtitleTarget)}
              className="text-sm mt-1 cursor-text"
              style={{ color: theme.mutedFg }}
            >
              {slide.subtitle}
            </div>
          )}
        </div>
      )}

      {theme.headerStyle === "gradient-line" && (
        <div className="px-10 pt-8 pb-4">
          <h2
            {...editableTextProps(slide.titleTarget)}
            className="font-bold tracking-tight mb-2 cursor-text"
            style={{
              fontFamily: headingFontFamily,
              fontSize: scaledFontSize(typography, 1.875, 16),
            }}
          >
            {slide.title}
          </h2>
          {slide.subtitle && (
            <div
              {...editableTextProps(slide.subtitleTarget)}
              className="text-sm mb-2 cursor-text"
              style={{ color: theme.mutedFg }}
            >
              {slide.subtitle}
            </div>
          )}
          <div
            className="h-0.5 rounded-full"
            style={{ background: theme.accentGradient, width: "60px" }}
          />
        </div>
      )}

      {theme.headerStyle === "floating" && (
        <div
          className="mx-10 mt-8 mb-4 px-6 py-4 rounded-xl"
          style={{ background: `${theme.accentColor}15` }}
        >
          <h2
            {...editableTextProps(slide.titleTarget)}
            className="font-bold tracking-tight cursor-text"
            style={{
              fontFamily: headingFontFamily,
              color: theme.accentColor,
              fontSize: scaledFontSize(typography, 1.5, 16),
            }}
          >
            {slide.title}
          </h2>
          {slide.subtitle && (
            <div
              {...editableTextProps(slide.subtitleTarget)}
              className="text-sm mt-1 cursor-text"
              style={{ color: theme.mutedFg }}
            >
              {slide.subtitle}
            </div>
          )}
        </div>
      )}

      {theme.headerStyle === "side-accent" && (
        <div className="px-10 pt-8 pb-4 flex items-start gap-4">
          <div
            className="w-1 h-10 rounded-full flex-shrink-0 mt-1"
            style={{ background: theme.accentGradient }}
          />
          <div>
            <h2
              {...editableTextProps(slide.titleTarget)}
              className="font-bold tracking-tight cursor-text"
              style={{
                fontFamily: headingFontFamily,
                fontSize: scaledFontSize(typography, 1.875, 16),
              }}
            >
              {slide.title}
            </h2>
            {slide.subtitle && (
              <div
                {...editableTextProps(slide.subtitleTarget)}
                className="text-sm mt-1 cursor-text"
                style={{ color: theme.mutedFg }}
              >
                {slide.subtitle}
              </div>
            )}
          </div>
        </div>
      )}

      {theme.headerStyle === "minimal" && (
        <div className="px-10 pt-8 pb-4">
          <h2
            {...editableTextProps(slide.titleTarget)}
            className="font-bold tracking-tight cursor-text"
            style={{
              fontFamily: headingFontFamily,
              fontSize: scaledFontSize(typography, 1.875, 16),
            }}
          >
            {slide.title}
          </h2>
          {slide.subtitle && (
            <div
              {...editableTextProps(slide.subtitleTarget)}
              className="text-sm mt-1 cursor-text"
              style={{ color: theme.mutedFg }}
            >
              {slide.subtitle}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 px-10 py-2 overflow-hidden">
        <AutoFitContent html={slide.content} fontSize={contentFontSize} />
      </div>

      {theme.footerStyle !== "hidden" && (
        <div
          className="px-10 py-3 flex items-center justify-between text-xs"
          style={{ color: theme.mutedFg }}
        >
          <span>
            {doc.author}
            {doc.institute ? ` · ${doc.institute}` : ""}
          </span>
          <div className="flex items-center gap-3">
            <span>
              {slide.slideNumber}/{totalSlides}
            </span>
            {theme.footerStyle === "accent" && (
              <div
                className="w-20 h-1 rounded-full overflow-hidden"
                style={{ background: `${theme.accentColor}20` }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress * 100}%`, background: theme.accentGradient }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {theme.headerStyle === "accent-bar" && (
        <div className="h-0.5" style={{ background: theme.accentGradient }} />
      )}
    </div>
  );
}

export function SlideRenderer({
  slide,
  doc,
  width,
  slideFontFamily,
  slideFontSize,
}: {
  slide: ParsedDocument["slides"][0];
  doc: ParsedDocument;
  width: number;
  slideFontFamily?: string;
  slideFontSize?: number;
}) {
  const scale = width / 960;
  const height = (width / 960) * 540;
  const theme = doc.themeStyle || getThemeStyle(slide.theme || doc.theme);
  const typography = { slideFontFamily, slideFontSize };

  return (
    <div
      className="slide-frame overflow-hidden"
      style={{
        width,
        height,
        position: "relative",
      }}
    >
      <div
        style={{
          width: 960,
          height: 540,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          inset: 0,
        }}
      >
        {slide.layout === "title"
          ? renderTitleSlide(slide, doc, theme, typography)
          : slide.layout === "section"
            ? renderSectionSlide(slide, theme, typography)
            : renderContentSlide(slide, doc, theme, doc.slides.length, typography)}
      </div>
    </div>
  );
}

export default function SlidePreview({
  document: doc,
  currentSlide,
  onSlideChange,
  onTextTargetSelect,
  onTextTargetClear,
  onTextTargetUpdate,
  slideFontFamily,
  slideFontSize,
}: SlidePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainSlideRef = useRef<HTMLDivElement>(null);
  const activeTargetRef = useRef<EditableTextTarget | null>(null);
  const pendingCaretRef = useRef<{ targetId: string; offset: number } | null>(null);

  const isPreviewPanningRef = useRef(false);
  const didPreviewPanRef = useRef(false);
  const previewPanStartRef = useRef({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const [width, setWidth] = useState(960);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });

  const slide = doc.slides[currentSlide] || doc.slides[0] || null;
  const editableTargets = useMemo(
    () => slide?.editableTextTargets || [],
    [slide?.editableTextTargets],
  );

  const zoomPercent = Math.round(previewZoom * 100);
  const displayWidth = Math.max(120, Math.round(width * previewZoom));
  const height = (displayWidth / 960) * 540;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(240, Math.min(w - 32, 960)));
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (doc.slides.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[data-beamerlab-modal="true"]')) return;
      if (event.defaultPrevented || shouldSkipSlideKeyboardNavigation(event.target)) return;

      if (event.key === "ArrowLeft" || event.key === "<") {
        event.preventDefault();
        onSlideChange(Math.max(0, currentSlide - 1));
      }

      if (event.key === "ArrowRight" || event.key === ">") {
        event.preventDefault();
        onSlideChange(Math.min(doc.slides.length - 1, currentSlide + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, doc.slides.length, onSlideChange]);

  useEffect(() => {
    activeTargetRef.current = null;
    pendingCaretRef.current = null;
    setActiveTargetId(null);
  }, [currentSlide]);

  useLayoutEffect(() => {
    const pendingCaret = pendingCaretRef.current;
    const slideRoot = mainSlideRef.current;
    if (!pendingCaret || !slideRoot) return;

    const element = findTargetElement(slideRoot, pendingCaret.targetId);
    if (!element) return;

    element.focus();
    setCaretOffsetWithin(element, pendingCaret.offset);
    pendingCaretRef.current = null;
  }, [doc, currentSlide]);

  useEffect(() => {
    const activeTarget = activeTargetRef.current;
    if (!activeTarget) return;

    const latestTarget = editableTargets.find((target) => target.id === activeTarget.id);
    if (latestTarget) {
      activeTargetRef.current = latestTarget;
    }
  }, [editableTargets]);

  const handleTargetSelect = useCallback(
    (element: HTMLElement, target: EditableTextTarget, startEditing: boolean) => {
      onTextTargetSelect?.(target, { editing: startEditing });
      activeTargetRef.current = target;
      setActiveTargetId(target.id);

      if (startEditing && document.activeElement !== element) {
        element.focus();
      }
    },
    [onTextTargetSelect],
  );

  const handlePreviewBackgroundClick = useCallback(() => {
    if (didPreviewPanRef.current) {
      didPreviewPanRef.current = false;
      return;
    }

    onTextTargetClear?.();
  }, [onTextTargetClear]);

  const handleMainSlideClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();

      if (didPreviewPanRef.current) {
        didPreviewPanRef.current = false;
        return;
      }

      if (!(event.target instanceof HTMLElement)) return;

      const slideRoot = mainSlideRef.current;
      if (!slideRoot) return;

      const resolvedTarget = resolveTextTarget(slideRoot, event.target, editableTargets);
      if (!resolvedTarget) {
        onTextTargetClear?.();
        return;
      }

      handleTargetSelect(resolvedTarget.element, resolvedTarget.target, true);
    },
    [editableTargets, handleTargetSelect, onTextTargetClear],
  );

  const resolveInputTarget = useCallback(
    (origin: HTMLElement): { target: EditableTextTarget; element: HTMLElement } | null => {
      const slideRoot = mainSlideRef.current;
      if (!slideRoot) return null;

      const element = origin.closest<HTMLElement>("[data-target-id]");
      if (!element || !slideRoot.contains(element)) return null;

      const targetId = element.dataset.targetId;
      const target =
        editableTargets.find((item) => item.id === targetId) ||
        (activeTargetRef.current?.id === targetId ? activeTargetRef.current : null);

      return target ? { target, element } : null;
    },
    [editableTargets],
  );

  const handleMainSlideInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      if (!(event.target instanceof HTMLElement)) return;

      const resolvedTarget = resolveInputTarget(event.target);
      if (!resolvedTarget) return;

      const nextValue = normalizeInlineEditorValue(resolvedTarget.element.textContent || "");

      pendingCaretRef.current = {
        targetId: resolvedTarget.target.id,
        offset: Math.min(getCaretOffsetWithin(resolvedTarget.element), nextValue.length),
      };

      const nextTarget =
        onTextTargetUpdate?.(resolvedTarget.target, nextValue) || resolvedTarget.target;

      activeTargetRef.current = nextTarget;
      setActiveTargetId(nextTarget.id);
    },
    [onTextTargetUpdate, resolveInputTarget],
  );

  const handleMainSlideKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.closest("[data-target-id]")) return;

    if (event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.target.blur();
    }
  }, []);

  const handleMainSlidePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.closest("[data-target-id]")) return;

    event.preventDefault();

    document.execCommand(
      "insertText",
      false,
      normalizeInlineEditorValue(event.clipboardData.getData("text/plain")),
    );
  }, []);

  const handlePreviewPanMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (previewZoom <= 1) return;
      if (event.button !== 0) return;
      if (!(event.target instanceof HTMLElement)) return;

      if (event.target.closest("[data-target-id]")) return;

      isPreviewPanningRef.current = true;
      didPreviewPanRef.current = false;

      previewPanStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: previewPan.x,
        panY: previewPan.y,
      };

      event.preventDefault();
    },
    [previewZoom, previewPan.x, previewPan.y],
  );

  const handlePreviewPanMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!isPreviewPanningRef.current) return;

    const start = previewPanStartRef.current;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      didPreviewPanRef.current = true;
    }

    setPreviewPan({
      x: start.panX + deltaX,
      y: start.panY + deltaY,
    });
  }, []);

  const stopPreviewPanning = useCallback(() => {
    isPreviewPanningRef.current = false;
  }, []);

  const decreasePreviewZoom = useCallback(() => {
    setPreviewZoom((current) => {
      const currentPercent = Math.round(current * 100);
      return Math.max(PREVIEW_ZOOM_MIN, currentPercent - PREVIEW_ZOOM_STEP) / 100;
    });
  }, []);

  const increasePreviewZoom = useCallback(() => {
    setPreviewZoom((current) => {
      const currentPercent = Math.round(current * 100);
      return Math.min(PREVIEW_ZOOM_MAX, currentPercent + PREVIEW_ZOOM_STEP) / 100;
    });
  }, []);

  const resetPreviewZoom = useCallback(() => {
    setPreviewZoom(1);
    setPreviewPan({ x: 0, y: 0 });
  }, []);

  if (!slide || doc.slides.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-30">⟨/⟩</div>
          <p className="text-lg font-medium">No slides yet</p>
          <p className="text-sm mt-1 opacity-60">
            Add a{" "}
            <code className="font-mono">
              \begin{"{"}frame{"}"}
            </code>{" "}
            to see your slides
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <div
        className={`relative flex-1 overflow-hidden p-4 ${
          previewZoom > 1 ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        onMouseDown={handlePreviewPanMouseDown}
        onMouseMove={handlePreviewPanMouseMove}
        onMouseUp={stopPreviewPanning}
        onMouseLeave={stopPreviewPanning}
        onClick={handlePreviewBackgroundClick}
      >
        <div
          className="relative h-full w-full"
          style={{
            minWidth: displayWidth,
            minHeight: height,
          }}
        >
          <div
            ref={mainSlideRef}
            className="absolute rounded-xl overflow-hidden"
            style={{
              width: displayWidth,
              height,
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${previewPan.x}px), calc(-50% + ${previewPan.y}px))`,
              transition: isPreviewPanningRef.current ? "none" : "transform 120ms ease-out",
              boxShadow: "0 8px 40px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            <div
              className="h-full w-full"
              onClick={handleMainSlideClick}
              onInput={handleMainSlideInput}
              onKeyDown={handleMainSlideKeyDown}
              onPaste={handleMainSlidePaste}
              data-active-target-id={activeTargetId || undefined}
            >
              <SlideRenderer
                slide={slide}
                doc={doc}
                width={displayWidth}
                slideFontFamily={slideFontFamily}
                slideFontSize={slideFontSize}
              />
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-4 right-4 z-20 flex h-8 items-center gap-1 rounded-lg border border-border bg-toolbar-bg/90 px-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur"
          onMouseDown={(event) => event.stopPropagation()}
          onMouseMove={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={decreasePreviewZoom}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
            disabled={zoomPercent <= PREVIEW_ZOOM_MIN}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>

          <span className="w-11 text-center font-mono text-foreground">
            {formatPreviewZoom(previewZoom)}
          </span>

          <button
            type="button"
            onClick={increasePreviewZoom}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
            disabled={zoomPercent >= PREVIEW_ZOOM_MAX}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={resetPreviewZoom}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
            disabled={previewZoom === 1 && previewPan.x === 0 && previewPan.y === 0}
            title="Reset preview zoom"
            aria-label="Reset preview zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-t border-border bg-toolbar-bg px-4 py-2.5 flex items-center gap-3 overflow-x-auto overflow-y-hidden whitespace-nowrap">
        <button
          onClick={() => onSlideChange(Math.max(0, currentSlide - 1))}
          disabled={currentSlide === 0}
          className="w-8 h-8 flex-shrink-0 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-20 hover:bg-secondary/80 transition-colors flex items-center justify-center"
        >
          ‹
        </button>

        <span className="text-xs text-muted-foreground font-mono min-w-[3rem] flex-shrink-0 text-center">
          {currentSlide + 1} / {doc.slides.length}
        </span>

        <button
          onClick={() => onSlideChange(Math.min(doc.slides.length - 1, currentSlide + 1))}
          disabled={currentSlide === doc.slides.length - 1}
          className="w-8 h-8 flex-shrink-0 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-20 hover:bg-secondary/80 transition-colors flex items-center justify-center"
        >
          ›
        </button>

        <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
          Click text to edit. The LaTeX range stays highlighted.
        </span>

        <div className="flex-1 flex gap-1.5 overflow-x-auto ml-2 py-1">
          {doc.slides.map((s, i) => (
            <button
              key={i}
              onClick={() => onSlideChange(i)}
              className={`flex-shrink-0 rounded-md overflow-hidden transition-all border-2 ${
                i === currentSlide
                  ? "border-primary shadow-lg"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
              style={{ width: 80, height: 45 }}
            >
              <SlideRenderer
                slide={s}
                doc={doc}
                width={80}
                slideFontFamily={slideFontFamily}
                slideFontSize={slideFontSize}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
