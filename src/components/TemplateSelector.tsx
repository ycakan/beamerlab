import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Eye, FilePlus, Palette, RotateCcw, Save, X } from 'lucide-react';
import { parseLatex } from '@/lib/latex-parser';
import {
  createCustomTemplate,
  createDefaultCustomStyle,
  CUSTOM_TEMPLATE_NAME,
  getSavedCustomTemplate,
  getTemplateCommands,
  saveCustomTemplate,
  templates,
  type CustomTemplateStyle,
  type Template,
} from '@/lib/templates';
import { SlideRenderer } from '@/components/SlidePreview';

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  onClose: () => void;
}

const categories = ['All', 'Research', 'Teaching', 'Academic', 'Industry'];
type CustomColorKey = keyof Omit<CustomTemplateStyle, 'baseTemplateName' | 'baseTheme'>;

const customColorFields: Array<{ key: CustomColorKey; label: string }> = [
  { key: 'accentColor', label: 'Theme block / accent' },
  { key: 'alertColor', label: 'Alert block' },
  { key: 'exampleColor', label: 'Example block' },
  { key: 'bodyBg', label: 'Slide background' },
  { key: 'bodyFg', label: 'Slide text' },
  { key: 'mutedFg', label: 'Muted footer text' },
  { key: 'titleBgStart', label: 'Title background start' },
  { key: 'titleBgEnd', label: 'Title background end' },
  { key: 'titleFg', label: 'Title text' },
  { key: 'sectionBgStart', label: 'Section background start' },
  { key: 'sectionBgEnd', label: 'Section background end' },
  { key: 'sectionFg', label: 'Section text' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHexColor(value: string): string {
  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split('')
      .map(char => `${char}${char}`)
      .join('')}`;
  }

  return '#0284c7';
}

function normalizeCustomStyle(style: CustomTemplateStyle): CustomTemplateStyle {
  const normalized = { ...style };

  for (const field of customColorFields) {
    normalized[field.key] = normalizeHexColor(style[field.key]);
  }

  return normalized;
}

function hexToHsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const normalized = normalizeHexColor(hex).slice(1);
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return {
      hue: 0,
      saturation: 0,
      lightness: Math.round(lightness * 100),
    };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;

  if (max === red) hue = ((green - blue) / delta) % 6;
  if (max === green) hue = (blue - red) / delta + 2;
  if (max === blue) hue = (red - green) / delta + 4;

  return {
    hue: Math.round((hue * 60 + 360) % 360),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  };
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (h < 60) [red, green, blue] = [c, x, 0];
  else if (h < 120) [red, green, blue] = [x, c, 0];
  else if (h < 180) [red, green, blue] = [0, c, x];
  else if (h < 240) [red, green, blue] = [0, x, c];
  else if (h < 300) [red, green, blue] = [x, 0, c];
  else [red, green, blue] = [c, 0, x];

  return `#${[red, green, blue]
    .map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function getEditableHslColor(hsl: { hue: number; saturation: number; lightness: number }) {
  return {
    hue: hsl.hue,
    saturation: hsl.saturation === 0 ? 70 : hsl.saturation,
    lightness: hsl.lightness >= 95 ? 55 : hsl.lightness <= 5 ? 45 : hsl.lightness,
  };
}

function shouldSkipPreviewKeyboardNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .cm-editor'));
}

export default function TemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const savedCustomTemplate = useMemo(() => getSavedCustomTemplate(), []);
  const customPreviewContainerRef = useRef<HTMLDivElement>(null);

  const [customDraft, setCustomDraft] = useState<CustomTemplateStyle>(
    () => savedCustomTemplate?.customTheme || createDefaultCustomStyle(templates[0]),
  );

  const [activeCategory, setActiveCategory] = useState('All');
  const [previewTemplate, setPreviewTemplate] = useState<Template>(templates[0]);
  const [samplePreviewTemplate, setSamplePreviewTemplate] = useState<Template | null>(null);
  const [samplePreviewSlide, setSamplePreviewSlide] = useState(0);
  const [showCustomCreator, setShowCustomCreator] = useState(false);
  const [activeCustomColor, setActiveCustomColor] = useState<CustomColorKey>('accentColor');
  const [customPreviewSlide, setCustomPreviewSlide] = useState(0);
  const [customPreviewWidth, setCustomPreviewWidth] = useState(520);

  const customBaseTemplate = useMemo(
    () => templates.find(template => template.name === customDraft.baseTemplateName) || templates[0],
    [customDraft.baseTemplateName],
  );

  const customTemplate = useMemo(
    () => createCustomTemplate(customBaseTemplate, normalizeCustomStyle({ ...customDraft, baseTheme: customBaseTemplate.theme })),
    [customBaseTemplate, customDraft],
  );

  const allTemplates = useMemo(() => [customTemplate, ...templates], [customTemplate]);

  const filtered =
    activeCategory === 'All'
      ? allTemplates
      : templates.filter(template => template.category === activeCategory);

  const previewDoc = useMemo(() => parseLatex(previewTemplate.latex), [previewTemplate]);
  const customPreviewDoc = useMemo(() => parseLatex(customTemplate.latex), [customTemplate]);

  const samplePreviewDoc = useMemo(
    () => (samplePreviewTemplate ? parseLatex(samplePreviewTemplate.latex) : null),
    [samplePreviewTemplate],
  );

  const commands = useMemo(() => getTemplateCommands(previewTemplate), [previewTemplate]);

  const activeSampleSlide = samplePreviewDoc?.slides[samplePreviewSlide] || samplePreviewDoc?.slides[0];
  const activeCustomPreviewSlide = customPreviewDoc.slides[customPreviewSlide] || customPreviewDoc.slides[0];

  const activeCustomField =
    customColorFields.find(field => field.key === activeCustomColor) || customColorFields[0];

  const activeHexColor = normalizeHexColor(customDraft[activeCustomColor]);
  const activeHslColor = useMemo(() => hexToHsl(activeHexColor), [activeHexColor]);

  const colorWheelMarkerStyle = useMemo(
    () => ({
      left: `${50 + Math.cos((activeHslColor.hue * Math.PI) / 180) * activeHslColor.saturation * 0.5}%`,
      top: `${50 + Math.sin((activeHslColor.hue * Math.PI) / 180) * activeHslColor.saturation * 0.5}%`,
    }),
    [activeHslColor.hue, activeHslColor.saturation],
  );

  const openSamplePreview = (template: Template) => {
    setPreviewTemplate(template);
    setSamplePreviewTemplate(template);
    setSamplePreviewSlide(0);
  };

  const selectTemplate = (template: Template) => {
    if (template.name === CUSTOM_TEMPLATE_NAME) {
      saveCustomTemplate(template);
    }

    onSelect(template);
  };

  const updateCustomBase = (templateName: string) => {
    const nextBase = templates.find(template => template.name === templateName) || templates[0];

    setCustomDraft(createDefaultCustomStyle(nextBase));
    setCustomPreviewSlide(0);
  };

  const updateCustomColor = (
    key: keyof Omit<CustomTemplateStyle, 'baseTemplateName' | 'baseTheme'>,
    value: string,
  ) => {
    setCustomDraft(prev => ({ ...prev, [key]: value }));
  };

  const updateActiveColorFromHsl = (hue: number, saturation: number, lightness: number) => {
    updateCustomColor(activeCustomColor, hslToHex(hue, saturation, lightness));
  };

  const handleColorWheelPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), radius);

    const hue = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);
    const saturation = radius === 0 ? 0 : Math.round((distance / radius) * 100);

    const editable = getEditableHslColor(activeHslColor);

    updateActiveColorFromHsl(hue, saturation, editable.lightness);
  };

  const saveCustomDraft = () => {
    saveCustomTemplate(customTemplate);
    setPreviewTemplate(customTemplate);
    setShowCustomCreator(false);
  };

  useEffect(() => {
    if (previewTemplate.name === CUSTOM_TEMPLATE_NAME) {
      setPreviewTemplate(customTemplate);
    }
  }, [customTemplate, previewTemplate.name]);

  useEffect(() => {
    if (customPreviewDoc.slides.length === 0) {
      setCustomPreviewSlide(0);
      return;
    }

    setCustomPreviewSlide(index => Math.min(index, customPreviewDoc.slides.length - 1));
  }, [customPreviewDoc.slides.length]);

  useEffect(() => {
    if (!showCustomCreator) return;

    const element = customPreviewContainerRef.current;
    if (!element) return;

    const updatePreviewWidth = (width: number) => {
      if (width <= 0) return;
      setCustomPreviewWidth(Math.min(520, Math.floor(width)));
    };

    updatePreviewWidth(element.getBoundingClientRect().width);

    const resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) updatePreviewWidth(width);
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [showCustomCreator]);

  useEffect(() => {
    if (!samplePreviewDoc || samplePreviewDoc.slides.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || shouldSkipPreviewKeyboardNavigation(event.target)) return;

      if (event.key === 'ArrowLeft' || event.key === '<') {
        event.preventDefault();
        setSamplePreviewSlide(index => Math.max(0, index - 1));
      }

      if (event.key === 'ArrowRight' || event.key === '>') {
        event.preventDefault();
        setSamplePreviewSlide(index => Math.min(samplePreviewDoc.slides.length - 1, index + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [samplePreviewDoc]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      data-beamerlab-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border shadow-2xl max-w-6xl w-full max-h-[88vh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">New presentation</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Preview the sample deck, then start with a clean template and theme-specific commands.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              aria-label="Close template selector"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeCategory === category
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-max content-start">
            {filtered.map(template => (
              <div
                key={template.name}
                className={`self-start rounded-lg border bg-secondary/20 transition-all overflow-hidden ${
                  previewTemplate.name === template.name
                    ? 'border-primary/60'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <button onClick={() => setPreviewTemplate(template)} className="w-full text-left group">
                  <div className="h-20 relative overflow-hidden" style={{ background: template.accentPreview }}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-24 h-1 bg-white/30 rounded mx-auto mb-2" />
                        <div className="w-32 h-0.5 bg-white/15 rounded mx-auto mb-1" />
                        <div className="w-20 h-0.5 bg-white/10 rounded mx-auto" />
                      </div>
                    </div>

                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-medium bg-black/20 text-white/80 backdrop-blur-sm">
                      {template.category}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                      {template.name}
                    </h3>

                    <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
                      {template.description}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: template.accentPreview }} />
                      <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                        {template.theme}
                      </span>
                    </div>
                  </div>
                </button>

                <div className="px-4 pb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => openSamplePreview(template)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-secondary text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview sample
                  </button>

                  {template.name === CUSTOM_TEMPLATE_NAME && (
                    <button
                      onClick={() => {
                        setPreviewTemplate(customTemplate);
                        setShowCustomCreator(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-secondary text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
                    >
                      <Palette className="h-3.5 w-3.5" />
                      Customize
                    </button>
                  )}

                  <button
                    onClick={() => selectTemplate(template)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-primary text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                    Use template
                  </button>
                </div>
              </div>
            ))}
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-border bg-background/50 p-5">
            <div className="h-28 rounded-lg overflow-hidden mb-4" style={{ background: previewTemplate.accentPreview }} />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{previewTemplate.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Sample: {previewDoc.slides.length} slides with {previewTemplate.theme} styling
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {previewTemplate.name === CUSTOM_TEMPLATE_NAME && (
                  <button
                    onClick={() => setShowCustomCreator(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-secondary text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Palette className="h-3.5 w-3.5" />
                    Customize
                  </button>
                )}

                <button
                  onClick={() => openSamplePreview(previewTemplate)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-secondary text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>

                <button
                  onClick={() => selectTemplate(previewTemplate)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-primary text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                  Start
                </button>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Commands included
              </p>

              <div className="space-y-2">
                {commands.map(command => (
                  <div key={command.label} className="rounded-md border border-border bg-secondary/20 px-3 py-2">
                    <div className="text-xs font-medium text-foreground">{command.label}</div>
                    <code className="mt-1 block text-[10px] text-muted-foreground truncate">
                      {command.insert.split('\n')[0]}
                    </code>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Sample deck preview
              </p>

              <div className="rounded-md border border-border bg-editor-bg p-3 max-h-52 overflow-y-auto">
                <pre className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
                  {previewTemplate.latex.slice(0, 1200)}
                  {previewTemplate.latex.length > 1200 ? '\n...' : ''}
                </pre>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showCustomCreator && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          data-beamerlab-modal="true"
          onClick={event => {
            event.stopPropagation();
            setShowCustomCreator(false);
          }}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-border flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Custom Template</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Inherit an existing template, then choose slide and command colors.
                </p>
              </div>

              <button
                onClick={() => setShowCustomCreator(false)}
                className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                aria-label="Close custom template creator"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] gap-0">
              <div className="p-6 border-b lg:border-b-0 lg:border-r border-border">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Inherit from
                  <select
                    value={customDraft.baseTemplateName}
                    onChange={event => updateCustomBase(event.target.value)}
                    className="mt-2 w-full rounded bg-editor-bg border border-border px-3 py-2 text-sm normal-case tracking-normal text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {templates.map(template => (
                      <option key={template.name} value={template.name}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Color targets
                  </p>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {customColorFields.map(field => (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => setActiveCustomColor(field.key)}
                        aria-pressed={activeCustomColor === field.key}
                        className={`flex items-center gap-3 rounded border p-3 text-left transition-colors ${
                          activeCustomColor === field.key
                            ? 'bg-secondary/60 text-foreground'
                            : 'border-border bg-secondary/20 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                        style={
                          activeCustomColor === field.key
                            ? {
                                borderColor: normalizeHexColor(customDraft[field.key]),
                                boxShadow: `0 0 0 1px ${normalizeHexColor(customDraft[field.key])}`,
                              }
                            : undefined
                        }
                      >
                        <span
                          className="h-9 w-11 flex-shrink-0 rounded border border-white/20 shadow-inner"
                          style={{ background: normalizeHexColor(customDraft[field.key]) }}
                          aria-hidden="true"
                        />

                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{field.label}</span>
                          <span className="mt-0.5 block font-mono text-[10px] uppercase text-muted-foreground">
                            {normalizeHexColor(customDraft[field.key])}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-background/40">
                <div ref={customPreviewContainerRef} className="mx-auto w-full max-w-[520px]">
                  <div
                    className="rounded-lg overflow-hidden shadow-2xl mx-auto"
                    style={{
                      width: customPreviewWidth,
                      height: (customPreviewWidth / 16) * 9,
                      maxWidth: '100%',
                    }}
                  >
                    {activeCustomPreviewSlide ? (
                      <SlideRenderer
                        slide={activeCustomPreviewSlide}
                        doc={customPreviewDoc}
                        width={customPreviewWidth}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        No preview available.
                      </div>
                    )}
                  </div>
                </div>

                {customPreviewDoc.slides.length > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-1.5 overflow-x-auto pb-1">
                    {customPreviewDoc.slides.map((slide, index) => (
                      <button
                        key={`${slide.title}-${index}`}
                        type="button"
                        onClick={() => setCustomPreviewSlide(index)}
                        className={`h-7 min-w-7 rounded border px-2 text-[10px] font-mono transition-colors ${
                          index === customPreviewSlide
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                        aria-label={`Show custom template slide ${index + 1}`}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-5 rounded-lg border border-border bg-card/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Color wheel
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">{activeCustomField.label}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="h-8 w-10 rounded border border-white/20 shadow-inner"
                        style={{ background: activeHexColor }}
                        aria-hidden="true"
                      />
                      <span className="font-mono text-xs uppercase text-muted-foreground">{activeHexColor}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] items-center gap-5">
                    <div
                      className="relative mx-auto h-44 w-44 cursor-crosshair rounded-full border border-border shadow-inner"
                      style={{
                        background:
                          'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 66%), conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                      }}
                      onPointerDown={event => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        handleColorWheelPointer(event);
                      }}
                      onPointerMove={event => {
                        if (event.buttons === 1) handleColorWheelPointer(event);
                      }}
                      aria-label={`Choose ${activeCustomField.label} color`}
                      role="presentation"
                    >
                      <span
                        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.85)]"
                        style={{ ...colorWheelMarkerStyle, background: activeHexColor }}
                        aria-hidden="true"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Hue
                        <input
                          type="range"
                          min={0}
                          max={359}
                          value={activeHslColor.hue}
                          onChange={event => {
                            const editable = getEditableHslColor(activeHslColor);

                            updateActiveColorFromHsl(
                              Number(event.target.value),
                              editable.saturation,
                              editable.lightness,
                            );
                          }}
                          className="mt-1 w-full accent-primary"
                        />
                      </label>

                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Saturation
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={activeHslColor.saturation}
                          onChange={event => {
                            const editable = getEditableHslColor(activeHslColor);

                            updateActiveColorFromHsl(
                              editable.hue,
                              Number(event.target.value),
                              editable.lightness,
                            );
                          }}
                          className="mt-1 w-full accent-primary"
                        />
                      </label>

                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Brightness
                        <input
                          type="range"
                          min={5}
                          max={95}
                          value={Math.min(95, Math.max(5, activeHslColor.lightness))}
                          onChange={event => {
                            const editable = getEditableHslColor(activeHslColor);

                            updateActiveColorFromHsl(
                              editable.hue,
                              editable.saturation,
                              Number(event.target.value),
                            );
                          }}
                          className="mt-1 w-full accent-primary"
                        />
                      </label>

                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Hex
                        <input
                          value={customDraft[activeCustomColor]}
                          onChange={event => updateCustomColor(activeCustomColor, event.target.value)}
                          onBlur={event => updateCustomColor(activeCustomColor, normalizeHexColor(event.target.value))}
                          className="mt-1 w-full rounded bg-editor-bg border border-border px-2 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => setCustomDraft(createDefaultCustomStyle(customBaseTemplate))}
                    className="inline-flex items-center gap-1.5 rounded bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset colors
                  </button>

                  <button
                    onClick={saveCustomDraft}
                    className="inline-flex items-center gap-1.5 rounded bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save custom template
                  </button>

                  <button
                    onClick={() => {
                      saveCustomTemplate(customTemplate);
                      selectTemplate(customTemplate);
                    }}
                    className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                    Use template
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {samplePreviewTemplate && samplePreviewDoc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          data-beamerlab-modal="true"
          onClick={event => {
            event.stopPropagation();
            setSamplePreviewTemplate(null);
          }}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
            onClick={event => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Sample deck preview</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {samplePreviewTemplate.name} compiled with {samplePreviewDoc.slides.length} sample slides.
                </p>
              </div>

              <button
                onClick={() => setSamplePreviewTemplate(null)}
                className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                aria-label="Close sample preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px]">
              <div className="min-h-0 bg-editor-bg p-4 flex items-center justify-center overflow-auto">
                {activeSampleSlide ? (
                  <div className="rounded-lg overflow-hidden shadow-2xl" style={{ width: 760, height: 427.5 }}>
                    <SlideRenderer slide={activeSampleSlide} doc={samplePreviewDoc} width={760} />
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No slides found in this sample.</div>
                )}
              </div>

              <div className="border-t lg:border-t-0 lg:border-l border-border bg-background/60 p-3 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  Slides
                </p>

                <div className="space-y-2">
                  {samplePreviewDoc.slides.map((slide, index) => (
                    <button
                      key={`${slide.title}-${index}`}
                      onClick={() => setSamplePreviewSlide(index)}
                      className={`block mx-auto rounded-md overflow-hidden transition-all ${
                        index === samplePreviewSlide ? 'ring-2 ring-primary' : 'opacity-60 hover:opacity-90'
                      }`}
                      style={{ width: 144, height: 81 }}
                      aria-label={`Preview slide ${index + 1}`}
                    >
                      <SlideRenderer slide={slide} doc={samplePreviewDoc} width={144} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center gap-2">
              <button
                onClick={() => setSamplePreviewSlide(index => Math.max(0, index - 1))}
                disabled={samplePreviewSlide === 0}
                className="w-8 h-8 rounded-lg bg-secondary text-secondary-foreground disabled:opacity-30 hover:bg-secondary/80 transition-colors inline-flex items-center justify-center"
                aria-label="Previous sample slide"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-xs text-muted-foreground font-mono text-center" style={{ minWidth: 64 }}>
                {Math.min(samplePreviewSlide + 1, samplePreviewDoc.slides.length)} / {samplePreviewDoc.slides.length}
              </span>

              <button
                onClick={() => setSamplePreviewSlide(index => Math.min(samplePreviewDoc.slides.length - 1, index + 1))}
                disabled={samplePreviewSlide >= samplePreviewDoc.slides.length - 1}
                className="w-8 h-8 rounded-lg bg-secondary text-secondary-foreground disabled:opacity-30 hover:bg-secondary/80 transition-colors inline-flex items-center justify-center"
                aria-label="Next sample slide"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="flex-1" />

              <button
                onClick={() => {
                  if (samplePreviewTemplate) selectTemplate(samplePreviewTemplate);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-primary text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <FilePlus className="h-3.5 w-3.5" />
                Use this template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
