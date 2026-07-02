import katex from "katex";
import { CUSTOM_TEMPLATE_COMMENT_PREFIX, type CustomTemplateStyle } from "@/lib/templates";

export interface EditableTextTarget {
  id: string;
  kind:
    | "document-title"
    | "document-subtitle"
    | "slide-title"
    | "slide-subtitle"
    | "section-title"
    | "body-text";
  text: string;
  source: string;
  start: number;
  end: number;
  slideIndex: number;
}

export interface ParsedSlide {
  title: string;
  subtitle?: string;
  content: string;
  layout: "title" | "section" | "normal" | "two-column" | "code" | "image";
  theme: string;
  images: string[];
  slideNumber?: number;
  titleTarget?: EditableTextTarget;
  subtitleTarget?: EditableTextTarget;
  editableTextTargets: EditableTextTarget[];
}

export interface ParsedDocument {
  documentTitle: string;
  author: string;
  date: string;
  institute: string;
  theme: string;
  colorTheme: string;
  slides: ParsedSlide[];
  themeStyle?: ThemeStyle;
  titleTarget?: EditableTextTarget;
  subtitleTarget?: EditableTextTarget;
}

const latexTextSymbols: Record<string, string> = {
  "&": "&",
  "%": "%",
  $: "$",
  "#": "#",
  _: "_",
  "{": "{",
  "}": "}",
};

function decodeEscapedTextSymbols(tex: string): string {
  return tex.replace(/\\([&%$#_{}])/g, (_, symbol: string) => latexTextSymbols[symbol] || symbol);
}

function extractCommand(tex: string, cmd: string): string {
  const regex = new RegExp(`\\\\${cmd}\\{([^}]*)\\}`, "s");
  const m = tex.match(regex);
  return m ? decodeEscapedTextSymbols(m[1].trim()) : "";
}

function extractCommandWithBrackets(tex: string, cmd: string): { value: string; option?: string } {
  const regex = new RegExp(`\\\\${cmd}(?:\\[([^\\]]*)\\])?\\{([^}]*)\\}`, "s");
  const m = tex.match(regex);
  return m ? { option: m[1]?.trim(), value: decodeEscapedTextSymbols(m[2].trim()) } : { value: "" };
}

interface CommandRange {
  fullStart: number;
  fullEnd: number;
  valueStart: number;
  valueEnd: number;
  value: string;
  source: string;
}

function normalizeEditableText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function createEditableTextTarget(
  kind: EditableTextTarget["kind"],
  text: string,
  source: string,
  start: number,
  end: number,
  slideIndex: number,
): EditableTextTarget | null {
  const normalizedText = normalizeEditableText(text);
  if (!normalizedText || end <= start) return null;

  return {
    id: `${kind}-${slideIndex}-${start}`,
    kind,
    text: normalizedText,
    source,
    start,
    end,
    slideIndex,
  };
}

function findCommandRange(
  tex: string,
  cmd: string,
  searchStart = 0,
  searchEnd = tex.length,
): CommandRange | null {
  const regex = new RegExp(`\\\\${cmd}(?:\\[[^\\]]*\\])?\\{([^}]*)\\}`, "g");
  regex.lastIndex = searchStart;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(tex)) !== null) {
    if (match.index >= searchEnd) break;

    const rawValue = match[1] ?? "";
    const fullMatch = match[0];
    const marker = `{${rawValue}}`;
    const markerIndex = fullMatch.lastIndexOf(marker);
    const valueOffset =
      markerIndex === -1 ? fullMatch.length - rawValue.length - 1 : markerIndex + 1;

    return {
      fullStart: match.index,
      fullEnd: match.index + fullMatch.length,
      valueStart: match.index + valueOffset,
      valueEnd: match.index + valueOffset + rawValue.length,
      value: decodeEscapedTextSymbols(rawValue),
      source: rawValue,
    };
  }

  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function toEditableVisibleText(source: string): string {
  return normalizeEditableText(stripHtml(renderContent(source, {})));
}

function collectBlockTitleTargets(
  content: string,
  globalOffset: number,
  slideIndex: number,
): EditableTextTarget[] {
  const targets: EditableTextTarget[] = [];
  const blockPattern = /\\begin\{(?:block|alertblock|exampleblock)\}\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(content)) !== null) {
    const rawValue = match[1] ?? "";
    const titleStart = globalOffset + match.index + match[0].lastIndexOf(`{${rawValue}}`) + 1;
    const target = createEditableTextTarget(
      "body-text",
      decodeEscapedTextSymbols(rawValue),
      rawValue,
      titleStart,
      titleStart + rawValue.length,
      slideIndex,
    );
    if (target) targets.push(target);
  }

  return targets;
}

function collectLineTextTargets(
  content: string,
  globalOffset: number,
  slideIndex: number,
): EditableTextTarget[] {
  const targets: EditableTextTarget[] = [];
  const lines = content.split("\n");
  let localOffset = 0;
  let skippedEnvironmentDepth = 0;

  for (const line of lines) {
    const lineStart = globalOffset + localOffset;
    localOffset += line.length + 1;

    const trimmed = line.trim();
    if (/^\\begin\{(?:(?:equation|align)\*?|tikzpicture|axis)\}/.test(trimmed)) {
      skippedEnvironmentDepth += 1;
      continue;
    }
    if (/^\\end\{(?:(?:equation|align)\*?|tikzpicture|axis)\}/.test(trimmed)) {
      skippedEnvironmentDepth = Math.max(0, skippedEnvironmentDepth - 1);
      continue;
    }

    if (!trimmed || trimmed.startsWith("%")) continue;
    if (skippedEnvironmentDepth > 0) continue;
    if (trimmed.includes("\\includegraphics")) continue;
    if (trimmed.includes("$") || trimmed.includes("\\[") || trimmed.includes("\\]")) continue;
    if (/\\begin\{(?:equation|align)\*?\}|\\end\{(?:equation|align)\*?\}/.test(trimmed)) continue;
    if (/^\\(?:frametitle|framesubtitle)\{/.test(trimmed)) continue;
    if (/^\\begin\{(?:block|alertblock|exampleblock)\}\{/.test(trimmed)) continue;
    if (/^\\column(?:\[[^\]]*\])?\{/.test(trimmed)) continue;
    if (/^\\(?:addplot|pgfplotsset)\b/.test(trimmed)) continue;
    if (/^\\(?:begin|end)\{/.test(trimmed)) continue;
    if (/^\\(?:titlepage|maketitle|sectionpage)\b/.test(trimmed)) continue;
    if (/^\\(?:centering|raggedleft|raggedright)\b/.test(trimmed)) continue;
    if (/^\\[vh]space\{/.test(trimmed)) continue;

    let sourceOffset = line.match(/^\s*/)?.[0].length || 0;
    const itemMatch = line.match(/^\s*\\item(?:\[[^\]]*\])?\s*/);
    if (itemMatch) {
      sourceOffset = itemMatch[0].length;
    }

    const candidate = line.slice(sourceOffset).trim();
    if (!candidate) continue;

    const visibleText = toEditableVisibleText(candidate);
    const trimmedCandidateStart = line.slice(sourceOffset).indexOf(candidate);
    const targetStart = lineStart + sourceOffset + Math.max(0, trimmedCandidateStart);
    const target = createEditableTextTarget(
      "body-text",
      visibleText,
      candidate,
      targetStart,
      targetStart + candidate.length,
      slideIndex,
    );

    if (target) {
      targets.push(target);
    }
  }

  return targets;
}

function markEditableTargetsInContent(
  content: string,
  globalOffset: number,
  targets: EditableTextTarget[],
): string {
  const contentStart = globalOffset;
  const contentEnd = globalOffset + content.length;
  const containedTargets = targets
    .filter(
      (target) =>
        target.start >= contentStart &&
        target.end <= contentEnd &&
        target.end > target.start &&
        target.source === content.slice(target.start - globalOffset, target.end - globalOffset),
    )
    .sort((a, b) => b.start - a.start);

  return containedTargets.reduce((markedContent, target) => {
    const localStart = target.start - globalOffset;
    const localEnd = target.end - globalOffset;
    const openTag = `<span class="beamerlab-editable-text" data-target-id="${escapeHtmlAttribute(
      target.id,
    )}" contenteditable="true" spellcheck="false">`;

    return `${markedContent.slice(0, localStart)}${openTag}${markedContent.slice(
      localStart,
      localEnd,
    )}</span>${markedContent.slice(localEnd)}`;
  }, content);
}

function renderMathSource(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math.trim(), { throwOnError: false, displayMode });
  } catch {
    const tag = displayMode ? "div" : "span";
    return `<${tag} class="text-red-400">${math}</${tag}>`;
  }
}

function renderMathEnvironment(environment: string, math: string): string {
  const cleanMath = math.replace(/\\(?:notag|nonumber)\b/g, "").trim();

  if (environment.startsWith("align")) {
    return renderMathSource(`\\begin{aligned}\n${cleanMath}\n\\end{aligned}`, true);
  }

  return renderMathSource(cleanMath, true);
}

function protectMathRegions(tex: string): { html: string; restore: (html: string) => string } {
  const rendered: string[] = [];
  const stash = (math: string, displayMode: boolean, environment?: string) => {
    const token = `@@BEAMERLAB_MATH_${rendered.length}@@`;
    rendered.push(
      environment ? renderMathEnvironment(environment, math) : renderMathSource(math, displayMode),
    );
    return token;
  };

  let html = tex;

  html = html.replace(
    /\\begin\{((?:equation|align)\*?)\}([\s\S]*?)\\end\{\1\}/g,
    (_, environment, math) => stash(math, true, environment),
  );
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => stash(math, true));
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => stash(math, true));
  html = html.replace(/(?<!\\)\$((?:\\.|[^$\\])+)(?<!\\)\$/g, (_, math) => stash(math, false));

  return {
    html,
    restore: (value: string) =>
      value.replace(/@@BEAMERLAB_MATH_(\d+)@@/g, (_, index) => rendered[Number(index)] || ""),
  };
}

function renderMath(tex: string): string {
  const math = protectMathRegions(tex);
  return math.restore(math.html);
}

function renderEscapedTextSymbols(tex: string): string {
  return tex.replace(/\\([&%$#_{}])/g, (_, symbol: string) =>
    symbol === "&" ? "&amp;" : latexTextSymbols[symbol] || symbol,
  );
}

function normalizeImagePath(path: string): string {
  return path.trim().replace(/^\.?\//, "");
}

function resolveImageSource(path: string, images: Record<string, string>): string {
  const normalizedPath = normalizeImagePath(path);
  const direct = images[path] || images[normalizedPath];
  if (direct) return direct;

  const matchedName = Object.keys(images).find(
    (name) => normalizeImagePath(name) === normalizedPath,
  );
  return matchedName ? images[matchedName] : path;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseImageWidth(option = ""): number {
  const width = option.match(
    /width\s*=\s*([0-9]*\.?[0-9]+)\s*\\(?:textwidth|linewidth|columnwidth|paperwidth)/,
  );
  if (!width) return 0.6;

  const parsed = Number(width[1]);
  if (!Number.isFinite(parsed)) return 0.6;

  return Math.max(0.1, Math.min(1, parsed));
}

function parseRelativeLatexWidth(value: string, fallback = 0.5): number {
  const width = value.match(/([0-9]*\.?[0-9]+)\s*\\(?:textwidth|linewidth|columnwidth|paperwidth)/);
  if (!width) return fallback;

  const parsed = Number(width[1]);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(0.1, Math.min(1, parsed));
}

function splitLatexOptions(value: string): string[] {
  const options: string[] = [];
  let current = "";
  let braceDepth = 0;
  let bracketDepth = 0;

  for (const char of value) {
    if (char === "{" && bracketDepth >= 0) braceDepth += 1;
    if (char === "}" && braceDepth > 0) braceDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]" && bracketDepth > 0) bracketDepth -= 1;

    if (char === "," && braceDepth === 0 && bracketDepth === 0) {
      if (current.trim()) options.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) options.push(current.trim());
  return options;
}

function stripOuterBraces(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

type PgfplotsKind = "ybar" | "xbar" | "line" | "area" | "scatter" | "comb" | "const";

interface PgfplotsSeries {
  points: Array<{ category: string; value: number }>;
  kind: PgfplotsKind;
}

interface PgfplotsAxisConfig {
  kind: PgfplotsKind;
  valueLabel?: string;
  valueMin: number;
  valueMax: number;
  symbolicCoords: string[];
  nodesNearCoords: boolean;
  stacked: boolean;
}

function determinePgfplotsKind(parsedOptions: string[]): PgfplotsKind {
  if (parsedOptions.some((option) => /^xbar(?:\s|$)/.test(option))) return "xbar";
  if (parsedOptions.some((option) => /^ybar(?:\s|$)/.test(option))) return "ybar";

  return "line";
}

function determinePgfplotsSeriesKind(
  plotOptions: string[],
  axisOptions: string[],
  axisKind: PgfplotsKind,
  closedCycle: boolean,
): PgfplotsKind {
  if (axisKind === "xbar" || axisKind === "ybar") return axisKind;

  const normalizedPlotOptions = plotOptions.map((option) => option.replace(/\s+/g, " ").trim());
  const normalizedAxisOptions = axisOptions.map((option) => option.replace(/\s+/g, " ").trim());
  const allOptions = [...normalizedPlotOptions, ...normalizedAxisOptions];

  if (allOptions.some((option) => /^scatter(?:\s|$)/.test(option) || option === "only marks")) {
    return "scatter";
  }

  if (allOptions.some((option) => /^ycomb(?:\s|$)|^xcomb(?:\s|$)/.test(option))) {
    return "comb";
  }

  if (allOptions.some((option) => /^const plot(?:\s|$)/.test(option))) {
    return "const";
  }

  if (
    closedCycle ||
    allOptions.some(
      (option) =>
        option === "area style" ||
        /^fill(?:\s|=|$)/.test(option) ||
        /^fill opacity\s*=/.test(option),
    )
  ) {
    return "area";
  }

  return "line";
}

function parsePgfplotsSeries(
  axisBody: string,
  axisKind: PgfplotsKind,
  axisOptions: string[],
): PgfplotsSeries[] {
  const series: PgfplotsSeries[] = [];
  const addPlotPattern =
    /\\addplot(?:\+)?(?:\s*\[([\s\S]*?)\])?\s*coordinates\s*\{([\s\S]*?)\}\s*(\\closedcycle)?\s*;/g;
  let match: RegExpExecArray | null;

  while ((match = addPlotPattern.exec(axisBody)) !== null) {
    const points: PgfplotsSeries["points"] = [];
    const plotOptions = splitLatexOptions(match[1] || "");
    const coordinates = match[2] ?? "";
    const kind = determinePgfplotsSeriesKind(plotOptions, axisOptions, axisKind, Boolean(match[3]));
    const pointPattern = /\(([^,()]+),([^()]+)\)/g;
    let pointMatch: RegExpExecArray | null;

    while ((pointMatch = pointPattern.exec(coordinates)) !== null) {
      const first = stripOuterBraces(pointMatch[1] ?? "").trim();
      const second = stripOuterBraces(pointMatch[2] ?? "").trim();
      const category =
        kind === "xbar" ? decodeEscapedTextSymbols(second) : decodeEscapedTextSymbols(first);
      const value = Number(kind === "xbar" ? first : second);

      if (!category || !Number.isFinite(value)) continue;
      points.push({ category, value });
    }

    if (points.length > 0) {
      series.push({ points, kind });
    }
  }

  return series;
}

function getPgfplotsValueExtents(
  series: PgfplotsSeries[],
  stacked: boolean,
): {
  minValue: number;
  maxValue: number;
} {
  if (stacked) {
    const totals = new Map<string, number>();

    for (const entry of series) {
      for (const point of entry.points) {
        totals.set(point.category, (totals.get(point.category) || 0) + point.value);
      }
    }

    const stackedValues = Array.from(totals.values());
    return {
      minValue: stackedValues.length > 0 ? Math.min(...stackedValues, 0) : 0,
      maxValue: stackedValues.length > 0 ? Math.max(...stackedValues, 0) : 0,
    };
  }

  const numericValues = series.flatMap((entry) => entry.points.map((point) => point.value));
  return {
    minValue: numericValues.length > 0 ? Math.min(...numericValues, 0) : 0,
    maxValue: numericValues.length > 0 ? Math.max(...numericValues, 0) : 0,
  };
}

function parsePgfplotsAxisConfig(
  options: string,
  series: PgfplotsSeries[],
  kind: PgfplotsKind,
): PgfplotsAxisConfig {
  const parsedOptions = splitLatexOptions(options);
  const stacked = parsedOptions.some((option) => /^xbar stacked$|^ybar stacked$/.test(option));
  const config: PgfplotsAxisConfig = {
    kind,
    valueMin: 0,
    valueMax: 0,
    symbolicCoords: [],
    nodesNearCoords: parsedOptions.some((option) => option === "nodes near coords"),
    stacked,
  };

  for (const option of parsedOptions) {
    const [rawKey, ...rawValueParts] = option.split("=");
    const key = rawKey.trim();
    const rawValue = rawValueParts.join("=").trim();
    if (!rawValue) continue;

    if ((kind === "xbar" && key === "xlabel") || (kind !== "xbar" && key === "ylabel")) {
      config.valueLabel = decodeEscapedTextSymbols(stripOuterBraces(rawValue));
    }

    if (key === "symbolic x coords" || (kind === "xbar" && key === "symbolic y coords")) {
      config.symbolicCoords = stripOuterBraces(rawValue)
        .split(",")
        .map((value) => decodeEscapedTextSymbols(value.trim()))
        .filter(Boolean);
    }

    if ((kind === "xbar" && key === "xmin") || (kind !== "xbar" && key === "ymin")) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) config.valueMin = parsed;
    }

    if ((kind === "xbar" && key === "xmax") || (kind !== "xbar" && key === "ymax")) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) config.valueMax = parsed;
    }
  }

  const { minValue, maxValue } = getPgfplotsValueExtents(series, config.stacked);

  if (!(config.valueMax > config.valueMin)) {
    config.valueMin = Math.min(config.valueMin, minValue, 0);
    config.valueMax = Math.max(config.valueMax, maxValue);
    if (config.valueMax === config.valueMin) {
      config.valueMax = config.valueMin + 1;
    }
  }

  if (config.symbolicCoords.length === 0 && series[0]) {
    config.symbolicCoords = series[0].points.map((point) => point.category);
  }

  return config;
}

function formatChartValue(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

function getChartColors(theme: ThemeStyle): string[] {
  return [
    theme.accentColor,
    theme.exampleColor || "#16a34a",
    theme.alertColor || "#dc2626",
    "#0f766e",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
  ];
}

function getPgfplotsCategories(series: PgfplotsSeries[], config: PgfplotsAxisConfig): string[] {
  return config.symbolicCoords.length > 0
    ? config.symbolicCoords
    : Array.from(new Set(series.flatMap((entry) => entry.points.map((point) => point.category))));
}

function renderPgfplotsHorizontalChart(
  config: PgfplotsAxisConfig,
  series: PgfplotsSeries[],
  categories: string[],
  theme: ThemeStyle,
): string {
  const width = 640;
  const height = 310;
  const longestLabel = categories.reduce((longest, label) => Math.max(longest, label.length), 0);
  const margin = {
    top: 28,
    right: 34,
    bottom: 58,
    left: Math.min(190, Math.max(104, longestLabel * 7 + 42)),
  };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const valueSpan = config.valueMax - config.valueMin || 1;
  const tickCount = 4;
  const slotHeight = chartHeight / categories.length;
  const groupHeight = Math.max(10, Math.min(slotHeight * 0.7, slotHeight - 8));
  const visibleSeriesCount = config.stacked ? 1 : series.length;
  const barHeight = Math.max(
    10,
    Math.min(32, groupHeight / Math.max(visibleSeriesCount, 1) - (visibleSeriesCount > 1 ? 4 : 0)),
  );
  const totalBarsHeight = visibleSeriesCount * barHeight + Math.max(visibleSeriesCount - 1, 0) * 4;
  const chartColors = getChartColors(theme);
  const xForValue = (value: number) =>
    margin.left + ((value - config.valueMin) / valueSpan) * chartWidth;
  const zeroX = xForValue(Math.max(config.valueMin, Math.min(0, config.valueMax)));

  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = config.valueMin + (valueSpan * index) / tickCount;
    return { value, position: xForValue(value) };
  });

  const axisLines = ticks
    .map(
      (tick) => `
        <line x1="${tick.position}" y1="${margin.top}" x2="${tick.position}" y2="${margin.top + chartHeight}" stroke="${theme.accentColor}" stroke-opacity="0.14" stroke-width="1" />
        <text x="${tick.position}" y="${margin.top + chartHeight + 22}" text-anchor="middle" fill="${theme.mutedFg}" font-size="12">${formatChartValue(tick.value)}</text>
      `,
    )
    .join("");

  const labels = categories
    .map((label, index) => {
      const y = margin.top + slotHeight * index + slotHeight / 2 + 4;
      return `<text x="${margin.left - 10}" y="${y}" text-anchor="end" fill="${theme.mutedFg}" font-size="12">${escapeHtmlText(label)}</text>`;
    })
    .join("");

  const stackedOffsets = new Map<string, number>();
  const plots = series
    .map((entry, seriesIndex) => {
      const color = chartColors[seriesIndex % chartColors.length];

      return entry.points
        .map((point) => {
          const categoryIndex = categories.indexOf(point.category);
          if (categoryIndex === -1) return "";

          const baseValue = config.stacked ? stackedOffsets.get(point.category) || 0 : 0;
          const endValue = config.stacked ? baseValue + point.value : point.value;
          if (config.stacked) stackedOffsets.set(point.category, endValue);

          const startX = config.stacked ? xForValue(baseValue) : zeroX;
          const endX = xForValue(endValue);
          const x = Math.min(startX, endX);
          const barWidth = Math.max(0, Math.abs(endX - startX));
          const y =
            margin.top +
            slotHeight * categoryIndex +
            slotHeight / 2 -
            totalBarsHeight / 2 +
            (config.stacked ? 0 : seriesIndex * (barHeight + 4));
          const nodeLabel = config.nodesNearCoords
            ? `<text x="${Math.min(width - 12, x + barWidth + 7)}" y="${y + barHeight / 2 + 4}" text-anchor="start" fill="${theme.bodyFg}" font-size="12" font-weight="600">${formatChartValue(point.value)}</text>`
            : "";

          return `
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color}" fill-opacity="0.88" />
            ${nodeLabel}
          `;
        })
        .join("");
    })
    .join("");

  const valueLabel = config.valueLabel
    ? `<text x="${margin.left + chartWidth / 2}" y="${height - 12}" text-anchor="middle" fill="${theme.mutedFg}" font-size="13" font-weight="600">${escapeHtmlText(config.valueLabel)}</text>`
    : "";

  return `
    <div style="margin:8px 0;padding:12px 14px 10px;border-radius:14px;border:1px solid ${colorWithAlpha(theme.accentColor, 18)};background:${colorWithAlpha(theme.accentColor, 4)};overflow:hidden">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" role="img" aria-label="${escapeHtmlAttribute(config.valueLabel || "Horizontal bar chart preview")}">
        ${axisLines}
        <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}" stroke="${theme.mutedFg}" stroke-opacity="0.45" stroke-width="1.2" />
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="${theme.mutedFg}" stroke-opacity="0.45" stroke-width="1.2" />
        ${plots}
        ${labels}
        ${valueLabel}
      </svg>
    </div>
  `;
}

function renderPgfplotsVerticalChart(
  config: PgfplotsAxisConfig,
  series: PgfplotsSeries[],
  categories: string[],
  theme: ThemeStyle,
): string {
  const width = 640;
  const height = 310;
  const margin = { top: 34, right: 24, bottom: 74, left: 72 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const valueSpan = config.valueMax - config.valueMin || 1;
  const tickCount = 4;
  const slotWidth = chartWidth / categories.length;
  const groupWidth = Math.min(slotWidth * 0.72, slotWidth - 12);
  const visibleSeriesCount = config.kind === "ybar" && config.stacked ? 1 : series.length;
  const barWidth = Math.max(16, Math.min(42, groupWidth / Math.max(visibleSeriesCount, 1) - 6));
  const totalBarsWidth = visibleSeriesCount * barWidth + Math.max(visibleSeriesCount - 1, 0) * 6;
  const chartColors = getChartColors(theme);
  const yForValue = (value: number) =>
    margin.top + chartHeight - ((value - config.valueMin) / valueSpan) * chartHeight;
  const zeroY = yForValue(Math.max(config.valueMin, Math.min(0, config.valueMax)));

  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = config.valueMin + (valueSpan * index) / tickCount;
    return { value, position: yForValue(value) };
  });

  const axisLines = ticks
    .map(
      (tick) => `
        <line x1="${margin.left}" y1="${tick.position}" x2="${width - margin.right}" y2="${tick.position}" stroke="${theme.accentColor}" stroke-opacity="0.14" stroke-width="1" />
        <text x="${margin.left - 10}" y="${tick.position + 4}" text-anchor="end" fill="${theme.mutedFg}" font-size="12">${formatChartValue(tick.value)}</text>
      `,
    )
    .join("");

  const labels = categories
    .map((label, index) => {
      const x = margin.left + slotWidth * index + slotWidth / 2;
      return `<text x="${x}" y="${height - 22}" text-anchor="middle" fill="${theme.mutedFg}" font-size="12">${escapeHtmlText(label)}</text>`;
    })
    .join("");

  const plots =
    config.kind === "ybar"
      ? (() => {
          const stackedOffsets = new Map<string, number>();

          return series
            .map((entry, seriesIndex) => {
              const color = chartColors[seriesIndex % chartColors.length];

              return entry.points
                .map((point) => {
                  const categoryIndex = categories.indexOf(point.category);
                  if (categoryIndex === -1) return "";

                  const baseValue = config.stacked ? stackedOffsets.get(point.category) || 0 : 0;
                  const endValue = config.stacked ? baseValue + point.value : point.value;
                  if (config.stacked) stackedOffsets.set(point.category, endValue);

                  const startY = config.stacked ? yForValue(baseValue) : zeroY;
                  const endY = yForValue(endValue);
                  const x =
                    margin.left +
                    slotWidth * categoryIndex +
                    slotWidth / 2 -
                    totalBarsWidth / 2 +
                    (config.stacked ? 0 : seriesIndex * (barWidth + 6));
                  const y = Math.min(startY, endY);
                  const valueHeight = Math.max(0, Math.abs(endY - startY));
                  const nodeLabel = config.nodesNearCoords
                    ? `<text x="${x + barWidth / 2}" y="${Math.max(14, y - 8)}" text-anchor="middle" fill="${theme.bodyFg}" font-size="12" font-weight="600">${formatChartValue(point.value)}</text>`
                    : "";

                  return `
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${valueHeight}" rx="6" fill="${color}" fill-opacity="0.88" />
                    ${nodeLabel}
                  `;
                })
                .join("");
            })
            .join("");
        })()
      : series
          .map((entry, seriesIndex) => {
            const color = chartColors[seriesIndex % chartColors.length];
            const points = entry.points
              .map((point) => {
                const categoryIndex = categories.indexOf(point.category);
                if (categoryIndex === -1) return null;
                const x = margin.left + slotWidth * categoryIndex + slotWidth / 2;
                const y = yForValue(point.value);
                return { x, y, value: point.value };
              })
              .filter((point): point is { x: number; y: number; value: number } => point !== null);

            if (points.length === 0) return "";

            const line = points.map((point) => `${point.x},${point.y}`).join(" ");
            const stepLine = points
              .reduce<string[]>((segments, point, index) => {
                if (index === 0) return [`${point.x},${point.y}`];

                const previous = points[index - 1];
                if (!previous) return segments;

                segments.push(`${point.x},${previous.y}`, `${point.x},${point.y}`);
                return segments;
              }, [])
              .join(" ");
            const firstPoint = points[0];
            const lastPoint = points[points.length - 1];
            const areaPath =
              firstPoint && lastPoint && points.length > 1
                ? [
                    `M ${firstPoint.x} ${zeroY}`,
                    ...points.map((point) => `L ${point.x} ${point.y}`),
                    `L ${lastPoint.x} ${zeroY}`,
                    "Z",
                  ].join(" ")
                : "";
            const dots = points
              .map((point) => {
                const nodeLabel = config.nodesNearCoords
                  ? `<text x="${point.x}" y="${Math.max(14, point.y - 10)}" text-anchor="middle" fill="${theme.bodyFg}" font-size="12" font-weight="600">${formatChartValue(point.value)}</text>`
                  : "";
                const stem =
                  entry.kind === "comb"
                    ? `<line x1="${point.x}" y1="${zeroY}" x2="${point.x}" y2="${point.y}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.75" />`
                    : "";
                return `
                  ${stem}
                  <circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${color}" />
                  ${nodeLabel}
                `;
              })
              .join("");

            if (entry.kind === "scatter" || entry.kind === "comb") {
              return dots;
            }

            if (entry.kind === "area") {
              return `
                <path d="${areaPath}" fill="${color}" fill-opacity="0.2" stroke="none" />
                <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${line}" />
                ${dots}
              `;
            }

            if (entry.kind === "const") {
              return `
                <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${stepLine}" />
                ${dots}
              `;
            }

            return `
              <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${line}" />
              ${dots}
            `;
          })
          .join("");

  const valueLabel = config.valueLabel
    ? `<text x="${margin.left}" y="18" fill="${theme.mutedFg}" font-size="13" font-weight="600">${escapeHtmlText(config.valueLabel)}</text>`
    : "";

  return `
    <div style="margin:8px 0;padding:12px 14px 10px;border-radius:14px;border:1px solid ${colorWithAlpha(theme.accentColor, 18)};background:${colorWithAlpha(theme.accentColor, 4)};overflow:hidden">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" role="img" aria-label="${escapeHtmlAttribute(config.valueLabel || "Chart preview")}">
        ${valueLabel}
        ${axisLines}
        <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}" stroke="${theme.mutedFg}" stroke-opacity="0.45" stroke-width="1.2" />
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="${theme.mutedFg}" stroke-opacity="0.45" stroke-width="1.2" />
        ${plots}
        ${labels}
      </svg>
    </div>
  `;
}

function renderPgfplotsChart(
  axisOptions: string,
  axisBody: string,
  theme: ThemeStyle,
): string | null {
  const parsedOptions = splitLatexOptions(axisOptions);
  const kind = determinePgfplotsKind(parsedOptions);
  const series = parsePgfplotsSeries(axisBody, kind, parsedOptions);
  if (series.length === 0) return null;

  const config = parsePgfplotsAxisConfig(axisOptions, series, kind);
  const categories = getPgfplotsCategories(series, config);
  if (categories.length === 0) return null;

  return config.kind === "xbar"
    ? renderPgfplotsHorizontalChart(config, series, categories, theme)
    : renderPgfplotsVerticalChart(config, series, categories, theme);
}

interface TikzPieSlice {
  label: string;
  value: number;
}

function parseTikzPieChart(content: string): { legend: boolean; slices: TikzPieSlice[] } | null {
  const pieMatch = content.match(/\\pie(?:\[([^\]]*)\])?\s*\{([\s\S]*?)\}/);
  if (!pieMatch) return null;

  const options = splitLatexOptions(pieMatch[1] || "");
  const legend = options.some((option) => option.replace(/\s+/g, "") === "text=legend");
  const slices = splitLatexOptions(pieMatch[2] || "")
    .map((entry) => {
      const slashIndex = entry.indexOf("/");
      if (slashIndex === -1) return null;

      const value = Number(stripOuterBraces(entry.slice(0, slashIndex)).trim());
      const label = decodeEscapedTextSymbols(stripOuterBraces(entry.slice(slashIndex + 1)).trim());
      if (!label || !Number.isFinite(value) || value <= 0) return null;

      return { label, value };
    })
    .filter((slice): slice is TikzPieSlice => slice !== null);

  return slices.length > 0 ? { legend, slices } : null;
}

function renderTikzPieChart(content: string, theme: ThemeStyle): string | null {
  const parsed = parseTikzPieChart(content);
  if (!parsed) return null;

  const width = 640;
  const height = 310;
  const center = { x: parsed.legend ? 190 : 320, y: 155 };
  const radius = 102;
  const total = parsed.slices.reduce((sum, slice) => sum + slice.value, 0);
  const chartColors = getChartColors(theme);
  const polarPoint = (angle: number, distance = radius) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: center.x + distance * Math.cos(radians),
      y: center.y + distance * Math.sin(radians),
    };
  };

  let startAngle = 0;
  const paths = parsed.slices
    .map((slice, index) => {
      const angle = (slice.value / total) * 360;
      const endAngle = startAngle + angle;
      const color = chartColors[index % chartColors.length];

      if (parsed.slices.length === 1) {
        startAngle = endAngle;
        return `<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="${color}" fill-opacity="0.9" />`;
      }

      const start = polarPoint(startAngle);
      const end = polarPoint(endAngle);
      const labelPosition = polarPoint(startAngle + angle / 2, radius * 0.62);
      const largeArc = angle > 180 ? 1 : 0;
      const inlineLabel =
        !parsed.legend && angle > 20
          ? `<text x="${labelPosition.x}" y="${labelPosition.y + 4}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700">${escapeHtmlText(slice.label)}</text>`
          : "";
      startAngle = endAngle;

      return `
        <path d="M ${center.x} ${center.y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z" fill="${color}" fill-opacity="0.9" stroke="${theme.bodyBg}" stroke-width="2" />
        ${inlineLabel}
      `;
    })
    .join("");

  const legend = parsed.legend
    ? parsed.slices
        .map((slice, index) => {
          const y = 82 + index * 34;
          const percent = formatChartValue((slice.value / total) * 100);
          const color = chartColors[index % chartColors.length];
          return `
            <g>
              <rect x="344" y="${y - 11}" width="14" height="14" rx="3" fill="${color}" fill-opacity="0.9" />
              <text x="368" y="${y}" fill="${theme.bodyFg}" font-size="13" font-weight="600">${escapeHtmlText(slice.label)}</text>
              <text x="566" y="${y}" text-anchor="end" fill="${theme.mutedFg}" font-size="12">${percent}%</text>
            </g>
          `;
        })
        .join("")
    : "";

  return `
    <div style="margin:8px 0;padding:12px 14px 10px;border-radius:14px;border:1px solid ${colorWithAlpha(theme.accentColor, 18)};background:${colorWithAlpha(theme.accentColor, 4)};overflow:hidden">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" role="img" aria-label="Pie chart preview">
        ${paths}
        ${legend}
      </svg>
    </div>
  `;
}

function renderTikzPicture(content: string, theme: ThemeStyle): string {
  const axisMatch = content.match(/\\begin\{axis\}(?:\[([\s\S]*?)\])?([\s\S]*?)\\end\{axis\}/);
  if (!axisMatch) {
    return (
      renderTikzPieChart(content, theme) ||
      `
        <div style="margin:8px 0;padding:14px 16px;border-radius:14px;border:1px dashed ${colorWithAlpha(theme.accentColor, 28)};background:${colorWithAlpha(theme.accentColor, 5)};color:${theme.mutedFg};font-size:0.9em">
          Chart preview unavailable for this TikZ block.
        </div>
      `
    );
  }

  return (
    renderPgfplotsChart(axisMatch[1] || "", axisMatch[2] || "", theme) ||
    `
      <div style="margin:8px 0;padding:14px 16px;border-radius:14px;border:1px dashed ${colorWithAlpha(theme.accentColor, 28)};background:${colorWithAlpha(theme.accentColor, 5)};color:${theme.mutedFg};font-size:0.9em">
        Chart preview unavailable for this PGFPlots block.
      </div>
    `
  );
}

function renderColumnsContent(
  cols: string,
  images: Record<string, string>,
  theme: ThemeStyle,
): string[] {
  const blockColumns: Array<{ width: number; content: string }> = [];
  const blockPattern = /\\begin\{column\}(?:\[[^\]]*\])?\{([^}]*)\}([\s\S]*?)\\end\{column\}/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockPattern.exec(cols)) !== null) {
    const content = blockMatch[2].trim();
    if (!content) continue;

    blockColumns.push({
      width: parseRelativeLatexWidth(blockMatch[1], 0.5) * 100,
      content,
    });
  }

  if (blockColumns.length > 0) {
    return blockColumns.map(
      (column) =>
        `<div style="flex:0 1 ${column.width}%;max-width:${column.width}%;min-width:0;padding:0 8px">${renderMath(renderContent(column.content, images, theme))}</div>`,
    );
  }

  const shorthandColumns: Array<{ width: number; content: string }> = [];
  const shorthandPattern = /\\column(?:\[[^\]]*\])?\{([^}]*)\}/g;
  const shorthandMatches = Array.from(cols.matchAll(shorthandPattern));

  if (shorthandMatches.length > 0) {
    shorthandMatches.forEach((match, index) => {
      const contentStart = (match.index ?? 0) + match[0].length;
      const contentEnd = shorthandMatches[index + 1]?.index ?? cols.length;
      const content = cols.slice(contentStart, contentEnd).trim();
      if (!content) return;

      shorthandColumns.push({
        width: parseRelativeLatexWidth(match[1], 0.5) * 100,
        content,
      });
    });
  }

  if (shorthandColumns.length > 0) {
    return shorthandColumns.map(
      (column) =>
        `<div style="flex:0 1 ${column.width}%;max-width:${column.width}%;min-width:0;padding:0 8px">${renderMath(renderContent(column.content, images, theme))}</div>`,
    );
  }

  return cols
    .split(/\\begin\{column\}(?:\[[^\]]*\])?\{[^}]*\}/)
    .filter((segment: string) => segment.trim())
    .map((segment: string) => {
      const content = segment.replace(/\\end\{column\}/g, "").trim();
      return content
        ? `<div style="flex:1;min-width:0;padding:0 12px">${renderMath(renderContent(content, images, theme))}</div>`
        : "";
    })
    .filter(Boolean);
}

function renderImage(
  path: string,
  images: Record<string, string>,
  align: "left" | "center" | "right" = "center",
  option = "",
): string {
  const img = resolveImageSource(path, images);
  const widthPercent = parseImageWidth(option) * 100;
  return `<img class="beamerlab-image beamerlab-image-${align}" src="${escapeHtmlAttribute(img)}" alt="${escapeHtmlAttribute(path)}" style="width:${widthPercent}%;height:auto;display:block;border-radius:8px" />`;
}

function colorWithAlpha(color: string, alphaPercent: number): string {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const value =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : hex[1];
    const alpha = Math.round((Math.max(0, Math.min(100, alphaPercent)) / 100) * 255)
      .toString(16)
      .padStart(2, "0");

    return `#${value}${alpha}`;
  }

  return `color-mix(in srgb, ${color} ${alphaPercent}%, transparent)`;
}

function groupAdjacentAlignedImages(html: string): string {
  const alignedImage = String.raw`<img class="beamerlab-image beamerlab-image-(?:left|right)"[^>]*\/>`;
  const imageRow = new RegExp(`(?:\\s*${alignedImage}){2,}`, "g");

  return html.replace(
    imageRow,
    (match) => `<div class="beamerlab-image-row">${match.trim()}</div>`,
  );
}

const latexTextSizeStyles: Record<string, string> = {
  tiny: "0.55em",
  scriptsize: "0.7em",
  footnotesize: "0.82em",
  small: "0.9em",
  normalsize: "1em",
  large: "1.15em",
  Large: "1.35em",
  LARGE: "1.55em",
  huge: "1.85em",
  Huge: "2.15em",
};

const latexTextSizeCommandPattern = Object.keys(latexTextSizeStyles).join("|");

function renderLatexTextSizeSpan(command: string, body: string): string {
  const fontSize = latexTextSizeStyles[command] || "1em";
  const trimmedBody = body.trim();

  if (!trimmedBody) return "";

  return `<span style="font-size:${fontSize};line-height:1.25">${trimmedBody}</span>`;
}

function renderLatexTextDeclarations(value: string): string {
  const groupedPattern = new RegExp(`\\{\\\\(${latexTextSizeCommandPattern})\\s+([^{}]*)\\}`, "g");
  const lineStartPattern = new RegExp(`^(\\s*)\\\\(${latexTextSizeCommandPattern})\\b\\s*(.*)$`);
  const barePattern = new RegExp(`\\\\(?:${latexTextSizeCommandPattern})\\b\\s*`, "g");

  return value
    .replace(groupedPattern, (_, command: string, body: string) =>
      renderLatexTextSizeSpan(command, body),
    )
    .split("\n")
    .map((line) => {
      const match = line.match(lineStartPattern);
      if (!match) return line.replace(barePattern, "");

      return `${match[1] || ""}${renderLatexTextSizeSpan(match[2] || "normalsize", match[3] || "")}`;
    })
    .join("\n");
}

function renderAlignedLatexBlock(
  align: "left" | "center" | "right",
  body: string,
  margin = "10px 0",
): string {
  const renderedBody = renderLatexTextDeclarations(body.trim());
  if (!renderedBody) return "";

  return `<div style="text-align:${align};margin:${margin}">${renderedBody}</div>`;
}

function renderLatexAlignmentMarkup(value: string): string {
  let html = value;

  html = html.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, (_, body: string) =>
    renderAlignedLatexBlock("center", body),
  );
  html = html.replace(/\\begin\{flushleft\}([\s\S]*?)\\end\{flushleft\}/g, (_, body: string) =>
    renderAlignedLatexBlock("left", body),
  );
  html = html.replace(/\\begin\{flushright\}([\s\S]*?)\\end\{flushright\}/g, (_, body: string) =>
    renderAlignedLatexBlock("right", body),
  );
  html = html.replace(/\\center\b([\s\S]*?)\\endcenter\b/g, (_, body: string) =>
    renderAlignedLatexBlock("center", body),
  );

  html = html.replace(/\\centering\s+([^\n]+)/g, (_, body: string) =>
    renderAlignedLatexBlock("center", body, "8px 0"),
  );
  html = html.replace(/\\raggedright\s+([^\n]+)/g, (_, body: string) =>
    renderAlignedLatexBlock("left", body, "8px 0"),
  );
  html = html.replace(/\\raggedleft\s+([^\n]+)/g, (_, body: string) =>
    renderAlignedLatexBlock("right", body, "8px 0"),
  );

  return renderLatexTextDeclarations(html);
}

function readBalancedGroup(value: string, start: number): { body: string; end: number } | null {
  if (value[start] !== "{") return null;

  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];

    if (char === "{" && previous !== "\\") {
      depth += 1;
    } else if (char === "}" && previous !== "\\") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: value.slice(start + 1, index),
          end: index + 1,
        };
      }
    }
  }

  return null;
}

function skipLatexWhitespace(value: string, start: number): number {
  let index = start;
  while (index < value.length && /\s/.test(value[index] || "")) index += 1;
  return index;
}

function skipOptionalLatexArgument(value: string, start: number): number {
  let index = skipLatexWhitespace(value, start);
  if (value[index] !== "[") return index;

  let depth = 0;
  for (; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];

    if (char === "[" && previous !== "\\") {
      depth += 1;
    } else if (char === "]" && previous !== "\\") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  return start;
}

function splitLatexTableRows(body: string): string[] {
  const rows: string[] = [];
  let current = "";
  let braceDepth = 0;
  let mathMode = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];
    const previous = body[index - 1];

    if (char === "$" && previous !== "\\") {
      mathMode = !mathMode;
    }

    if (!mathMode && char === "{" && previous !== "\\") {
      braceDepth += 1;
    } else if (!mathMode && char === "}" && previous !== "\\" && braceDepth > 0) {
      braceDepth -= 1;
    }

    if (!mathMode && braceDepth === 0 && char === "\\" && next === "\\") {
      rows.push(current);
      current = "";
      index += 1;
      continue;
    }

    current += char;
  }

  if (current.trim()) rows.push(current);
  return rows;
}

function splitLatexTableCells(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let braceDepth = 0;
  let mathMode = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const previous = row[index - 1];

    if (char === "$" && previous !== "\\") {
      mathMode = !mathMode;
    }

    if (!mathMode && char === "{" && previous !== "\\") {
      braceDepth += 1;
    } else if (!mathMode && char === "}" && previous !== "\\" && braceDepth > 0) {
      braceDepth -= 1;
    }

    if (!mathMode && braceDepth === 0 && char === "&" && previous !== "\\") {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function splitLatexTableRules(
  row: string,
): Array<{ type: "row"; value: string } | { type: "rule"; value: string }> {
  const tokens: Array<{ type: "row"; value: string } | { type: "rule"; value: string }> = [];
  const rulePattern =
    /\\(toprule|midrule|bottomrule|hline|cline\{[^}]*\}|cmidrule(?:\([^)]*\))?\{[^}]*\})\b/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(row)) !== null) {
    const before = row.slice(cursor, match.index);
    if (before.trim()) tokens.push({ type: "row", value: before });

    tokens.push({ type: "rule", value: match[1] || "" });
    cursor = match.index + match[0].length;
  }

  const after = row.slice(cursor);
  if (after.trim()) tokens.push({ type: "row", value: after });

  return tokens;
}

function cleanLatexTableCell(value: string): string {
  return value
    .replace(/\\multicolumn\{[0-9]+\}\{[^}]*\}\{([^}]*)\}/g, "$1")
    .replace(/\\(?:arraybackslash|raggedright|raggedleft|centering)\b/g, "")
    .replace(/\\(?:toprule|midrule|bottomrule|hline)\b/g, "")
    .replace(/\\(?:cline|cmidrule)(?:\([^)]*\))?\{[^}]*\}/g, "")
    .replace(/\\&/g, "&")
    .trim();
}

function renderLatexTableCell(value: string): string {
  const cleaned = cleanLatexTableCell(value);
  if (!cleaned) return "";

  return renderMath(renderLatexTextDeclarations(cleaned));
}

function parseLatexTableColumnWidths(columnSpec: string, columnCount: number): string[] {
  const widths: string[] = [];
  const widthPattern = /[pmb]\s*\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = widthPattern.exec(columnSpec)) !== null) {
    const width = parseRelativeLatexWidth(match[1] || "", 0);
    if (width > 0) widths.push(`${Math.max(6, Math.min(100, width * 100))}%`);
  }

  return widths.length === columnCount ? widths : [];
}

function renderLatexTable(body: string, columnSpec: string, theme: ThemeStyle): string {
  const tokens = splitLatexTableRows(body).flatMap(splitLatexTableRules);
  const firstMidruleIndex = tokens.findIndex(
    (token) => token.type === "rule" && token.value.startsWith("midrule"),
  );
  const rawRows = tokens
    .map((token, index) => {
      if (token.type !== "row") return null;

      const cells = splitLatexTableCells(token.value)
        .map(renderLatexTableCell)
        .filter((cell) => cell.length > 0);
      if (cells.length === 0) return null;

      return {
        cells,
        header: firstMidruleIndex !== -1 ? index < firstMidruleIndex : false,
      };
    })
    .filter((row): row is { cells: string[]; header: boolean } => row !== null);

  if (rawRows.length === 0) return "";

  const hasExplicitHeader = rawRows.some((row) => row.header);
  const rows = hasExplicitHeader
    ? rawRows
    : rawRows.map((row, index) => ({ ...row, header: index === 0 && rawRows.length > 1 }));
  const columnCount = Math.max(...rows.map((row) => row.cells.length));
  const columnWidths = parseLatexTableColumnWidths(columnSpec, columnCount);
  const colgroup =
    columnWidths.length > 0
      ? `<colgroup>${columnWidths.map((width) => `<col style="width:${width}" />`).join("")}</colgroup>`
      : "";

  const renderRow = (row: { cells: string[]; header: boolean }) => {
    const tag = row.header ? "th" : "td";
    const cellStyle = row.header
      ? `padding:7px 8px;border-bottom:1px solid ${colorWithAlpha(theme.accentColor, 34)};text-align:left;font-weight:700;color:${theme.bodyFg}`
      : `padding:6px 8px;border-bottom:1px solid ${colorWithAlpha(theme.accentColor, 13)};vertical-align:top`;

    return `<tr>${Array.from({ length: columnCount }, (_, index) => `<${tag} style="${cellStyle}">${row.cells[index] || ""}</${tag}>`).join("")}</tr>`;
  };

  const headerRows = rows
    .filter((row) => row.header)
    .map(renderRow)
    .join("");
  const bodyRows = rows
    .filter((row) => !row.header)
    .map(renderRow)
    .join("");
  const thead = headerRows ? `<thead>${headerRows}</thead>` : "";
  const tbody = bodyRows ? `<tbody>${bodyRows}</tbody>` : "";

  return `
    <div style="margin:10px 0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:0.88em;line-height:1.35;color:${theme.bodyFg}">
        ${colgroup}
        ${thead}
        ${tbody}
      </table>
    </div>
  `;
}

function renderLatexTables(value: string, theme: ThemeStyle): string {
  const beginPattern = /\\begin\{(tabular\*?|tabularx|array)\}/g;
  let rendered = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = beginPattern.exec(value)) !== null) {
    const environment = match[1] || "tabular";
    let index = skipOptionalLatexArgument(value, match.index + match[0].length);

    if (environment === "tabular*" || environment === "tabularx") {
      const widthGroup = readBalancedGroup(value, skipLatexWhitespace(value, index));
      if (!widthGroup) continue;
      index = skipOptionalLatexArgument(value, widthGroup.end);
    }

    const columnGroup = readBalancedGroup(value, skipLatexWhitespace(value, index));
    if (!columnGroup) continue;

    const endPattern = new RegExp(`\\\\end\\{${environment.replace("*", "\\*")}\\}`, "g");
    endPattern.lastIndex = columnGroup.end;
    const endMatch = endPattern.exec(value);
    if (!endMatch) continue;

    const body = value.slice(columnGroup.end, endMatch.index);
    rendered += value.slice(cursor, match.index);
    rendered += renderLatexTable(body, columnGroup.body, theme);
    cursor = endMatch.index + endMatch[0].length;
    beginPattern.lastIndex = cursor;
  }

  rendered += value.slice(cursor);
  return rendered;
}

function renderContent(
  content: string,
  images: Record<string, string>,
  theme: ThemeStyle = getThemeStyle("Meridian"),
): string {
  let html = content;

  // \textbf, \textit, \emph, \underline, \texttt
  html = html.replace(/\\textbf\{([^}]*)\}/g, "<strong>$1</strong>");
  html = html.replace(/\\textit\{([^}]*)\}/g, "<em>$1</em>");
  html = html.replace(/\\emph\{([^}]*)\}/g, "<em>$1</em>");
  html = html.replace(/\\underline\{([^}]*)\}/g, "<u>$1</u>");
  html = html.replace(
    /\\texttt\{([^}]*)\}/g,
    "<code style=\"background:rgba(0,0,0,0.06);padding:1px 6px;border-radius:4px;font-size:0.9em;font-family:'JetBrains Mono',monospace\">$1</code>",
  );

  // \href{url}{text}
  html = html.replace(
    /\\href\{([^}]*)\}\{([^}]*)\}/g,
    '<a href="$1" style="color:inherit;text-decoration:underline;text-underline-offset:2px" target="_blank">$2</a>',
  );
  html = html.replace(
    /\\url\{([^}]*)\}/g,
    '<a href="$1" style="color:inherit;text-decoration:underline;font-size:0.85em;font-family:monospace" target="_blank">$1</a>',
  );

  // \color{name}{text}
  html = html.replace(
    /\\(?:textcolor|color)\{([^}]*)\}\{([^}]*)\}/g,
    '<span style="color:$1">$2</span>',
  );

  html = renderLatexTables(html, theme);

  // Image alignment wrappers
  html = html.replace(
    /\\begin\{flushleft\}\s*\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}\s*\\end\{flushleft\}/g,
    (_, option, path) => renderImage(path, images, "left", option),
  );
  html = html.replace(
    /\\begin\{flushright\}\s*\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}\s*\\end\{flushright\}/g,
    (_, option, path) => renderImage(path, images, "right", option),
  );
  html = html.replace(
    /\\begin\{center\}\s*\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}\s*\\end\{center\}/g,
    (_, option, path) => renderImage(path, images, "center", option),
  );
  html = html.replace(
    /\\raggedright\s*\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}/g,
    (_, option, path) => renderImage(path, images, "left", option),
  );
  html = html.replace(
    /\\raggedleft\s*\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}/g,
    (_, option, path) => renderImage(path, images, "right", option),
  );
  html = html.replace(
    /\\centering\s*\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}/g,
    (_, option, path) => renderImage(path, images, "center", option),
  );

  // \includegraphics
  html = html.replace(/\\includegraphics(?:\[([^\]]*)\])?\{([^}]*)\}/g, (_, option, path) => {
    return renderImage(path, images, "center", option);
  });
  html = groupAdjacentAlignedImages(html);

  // itemize / enumerate
  html = html.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, items) => {
    const lis = items
      .split("\\item")
      .filter((s: string) => s.trim())
      .map(
        (s: string) =>
          `<li style="margin-bottom:6px;padding-left:4px">${renderMath(s.trim())}</li>`,
      )
      .join("");
    return `<ul style="list-style:none;padding-left:0;margin:8px 0">${lis.replace(/<li /g, "<li ")}</ul>`;
  });
  html = html.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, items) => {
    let idx = 0;
    const lis = items
      .split("\\item")
      .filter((s: string) => s.trim())
      .map((s: string) => {
        idx++;
        return `<li style="margin-bottom:6px;padding-left:4px;counter-increment:none"><span style="font-weight:600;margin-right:8px;opacity:0.5">${idx}.</span>${renderMath(s.trim())}</li>`;
      })
      .join("");
    return `<ol style="list-style:none;padding-left:0;margin:8px 0">${lis}</ol>`;
  });

  // description
  html = html.replace(/\\begin\{description\}([\s\S]*?)\\end\{description\}/g, (_, items) => {
    const lis = items
      .replace(
        /\\item\[([^\]]*)\]\s*/g,
        '<dt style="font-weight:700;margin-top:8px">$1</dt><dd style="margin-left:16px">',
      )
      .replace(/<dd style="margin-left:16px">([^<]*)/g, '<dd style="margin-left:16px">$1</dd>');
    return `<dl>${lis}</dl>`;
  });

  // \begin{block}{Title}...\end{block}  — modern card style
  html = html.replace(/\\begin\{block\}\{([^}]*)\}([\s\S]*?)\\end\{block\}/g, (_, title, body) => {
    return `<div style="background:${colorWithAlpha(theme.accentColor, 8)};border-left:3px solid ${theme.accentColor};padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0">
      <div style="font-weight:700;font-size:0.95em;margin-bottom:4px;color:${theme.accentColor}">${renderMath(title)}</div>
      <div style="font-size:0.92em">${renderContent(body.trim(), images, theme)}</div>
    </div>`;
  });

  // \begin{alertblock}
  html = html.replace(
    /\\begin\{alertblock\}\{([^}]*)\}([\s\S]*?)\\end\{alertblock\}/g,
    (_, title, body) => {
      const alertColor = theme.alertColor || "#dc2626";
      return `<div style="background:${colorWithAlpha(alertColor, 8)};border-left:3px solid ${alertColor};padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0">
      <div style="font-weight:700;font-size:0.95em;margin-bottom:4px;color:${alertColor}">${renderMath(title)}</div>
      <div style="font-size:0.92em">${renderContent(body.trim(), images, theme)}</div>
    </div>`;
    },
  );

  // \begin{exampleblock}
  html = html.replace(
    /\\begin\{exampleblock\}\{([^}]*)\}([\s\S]*?)\\end\{exampleblock\}/g,
    (_, title, body) => {
      const exampleColor = theme.exampleColor || "#16a34a";
      return `<div style="background:${colorWithAlpha(exampleColor, 8)};border-left:3px solid ${exampleColor};padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0">
      <div style="font-weight:700;font-size:0.95em;margin-bottom:4px;color:${exampleColor}">${renderMath(title)}</div>
      <div style="font-size:0.92em">${renderContent(body.trim(), images, theme)}</div>
    </div>`;
    },
  );

  // tikzpicture / pgfplots
  html = html.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g, (_, tikz) =>
    renderTikzPicture(tikz, theme),
  );

  // Verbatim / lstlisting
  html = html.replace(
    /\\begin\{(?:verbatim|lstlisting)\}([\s\S]*?)\\end\{(?:verbatim|lstlisting)\}/g,
    (_, code) => {
      return `<pre style="background:#1e1e2e;color:#cdd6f4;padding:16px 20px;border-radius:10px;font-size:0.82em;font-family:'JetBrains Mono',monospace;overflow-x:auto;margin:12px 0;line-height:1.6">${code.trim().replace(/</g, "&lt;")}</pre>`;
    },
  );

  // columns environment
  html = html.replace(/\\begin\{columns\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{columns\}/g, (_, cols) => {
    const rendered = renderColumnsContent(cols, images, theme);
    return `<div style="display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:nowrap">${rendered.join("")}</div>`;
  });
  html = groupAdjacentAlignedImages(html);
  html = renderLatexAlignmentMarkup(html);

  const math = protectMathRegions(html);
  html = math.html;

  // Line breaks
  html = html.replace(/\\\\/g, "<br/>");
  html = html.replace(/\\vspace\{[^}]*\}/g, '<div style="height:16px"></div>');
  html = html.replace(
    /\\hspace\{[^}]*\}/g,
    '<span style="display:inline-block;width:16px"></span>',
  );
  html = html.replace(/\\(?:begin|end)\{(?:center|flushleft|flushright)\}/g, "");
  html = html.replace(
    new RegExp(
      `\\\\(?:centering|raggedleft|raggedright|center|endcenter|${latexTextSizeCommandPattern})\\b`,
      "g",
    ),
    "",
  );
  html = renderEscapedTextSymbols(html);
  // Remove remaining unknown commands (but keep content)
  html = html.replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?\{([^}]*)\}/g, "$1");

  html = math.restore(html);

  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, '</p><p style="margin-bottom:10px">');
  if (!html.startsWith("<") && html.trim()) {
    html = `<p style="margin-bottom:10px">${html}</p>`;
  }

  return html;
}

function extractCustomThemeStyle(tex: string): CustomTemplateStyle | undefined {
  const escapedPrefix = CUSTOM_TEMPLATE_COMMENT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tex.match(new RegExp(`${escapedPrefix}\\s*(\\{.*\\})`));
  if (!match) return undefined;

  try {
    const parsed = JSON.parse(match[1]) as Partial<CustomTemplateStyle>;
    if (typeof parsed.baseTheme !== "string" || typeof parsed.accentColor !== "string")
      return undefined;

    return parsed as CustomTemplateStyle;
  } catch {
    return undefined;
  }
}

export function parseLatex(
  tex: string,
  uploadedImages: Record<string, string> = {},
): ParsedDocument {
  const title = extractCommand(tex, "title");
  const author = extractCommand(tex, "author");
  const date = extractCommand(tex, "date") || "\\today";
  const institute = extractCommand(tex, "institute");
  const theme = extractCommandWithBrackets(tex, "usetheme").value || "Meridian";
  const colorTheme = extractCommandWithBrackets(tex, "usecolortheme").value || "default";
  const themeStyle = getThemeStyle(theme, extractCustomThemeStyle(tex));
  const documentTitleTargetBase = findCommandRange(tex, "title");
  const documentSubtitleTargetBase = findCommandRange(tex, "subtitle");

  const frameRegex = /\\begin\{frame\}(?:\{([^}]*)\}|\[([^\]]*)\])?([\s\S]*?)\\end\{frame\}/g;
  const slides: ParsedSlide[] = [];
  let slideNum = 0;

  // Title slide
  if (tex.includes("\\maketitle") || tex.includes("\\titlepage")) {
    const slideIndex = slides.length;
    const titleTarget = documentTitleTargetBase
      ? createEditableTextTarget(
          "document-title",
          documentTitleTargetBase.value,
          documentTitleTargetBase.source,
          documentTitleTargetBase.valueStart,
          documentTitleTargetBase.valueEnd,
          slideIndex,
        )
      : null;
    const subtitleTarget = documentSubtitleTargetBase
      ? createEditableTextTarget(
          "document-subtitle",
          documentSubtitleTargetBase.value,
          documentSubtitleTargetBase.source,
          documentSubtitleTargetBase.valueStart,
          documentSubtitleTargetBase.valueEnd,
          slideIndex,
        )
      : null;

    slideNum++;
    slides.push({
      title,
      subtitle: extractCommand(tex, "subtitle"),
      content: `<div style="text-align:center">
        <div style="font-size:1.1em;margin-bottom:6px;opacity:0.85">${author}</div>
        ${institute ? `<div style="font-size:0.95em;opacity:0.6;margin-bottom:6px">${institute}</div>` : ""}
        <div style="font-size:0.85em;opacity:0.45">${date === "\\today" ? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : date}</div>
      </div>`,
      layout: "title",
      theme,
      images: [],
      slideNumber: slideNum,
      titleTarget: titleTarget || undefined,
      subtitleTarget: subtitleTarget || undefined,
      editableTextTargets: [titleTarget, subtitleTarget].filter(
        (target): target is EditableTextTarget => Boolean(target),
      ),
    });
  }

  // Section slides
  const sectionRegex = /\\section\{([^}]*)\}/g;
  const sectionPositions: { pos: number; title: string; start: number; end: number }[] = [];
  let sMatch;
  while ((sMatch = sectionRegex.exec(tex)) !== null) {
    const rawTitle = sMatch[1] ?? "";
    const titleStart = sMatch.index + sMatch[0].lastIndexOf(`{${rawTitle}}`) + 1;
    sectionPositions.push({
      pos: sMatch.index,
      title: decodeEscapedTextSymbols(rawTitle),
      start: titleStart,
      end: titleStart + rawTitle.length,
    });
  }

  let match;
  while ((match = frameRegex.exec(tex)) !== null) {
    const slideIndex = slides.length;
    const fullFrame = match[0];
    const frameStart = match.index;
    const frameContent = match[3] || "";
    const frameContentStart = frameStart + fullFrame.indexOf(frameContent);
    const frameTitle = decodeEscapedTextSymbols(match[1] || "");

    if (frameContent.trim() === "\\titlepage" || frameContent.trim() === "\\maketitle") continue;

    // Check if there's a section before this frame
    const framePos = match.index;
    const sectionBefore = sectionPositions.find((s, i) => {
      const nextSection = sectionPositions[i + 1];
      return s.pos < framePos && (!nextSection || nextSection.pos > framePos);
    });

    // Check for \sectionpage
    if (frameContent.trim() === "\\sectionpage" && sectionBefore) {
      const sectionTarget = createEditableTextTarget(
        "section-title",
        sectionBefore.title,
        tex.slice(sectionBefore.start, sectionBefore.end),
        sectionBefore.start,
        sectionBefore.end,
        slideIndex,
      );
      slideNum++;
      slides.push({
        title: sectionBefore.title,
        content: "",
        layout: "section",
        theme,
        images: [],
        slideNumber: slideNum,
        titleTarget: sectionTarget || undefined,
        editableTextTargets: sectionTarget ? [sectionTarget] : [],
      });
      continue;
    }

    const ft = extractCommand(frameContent, "frametitle") || frameTitle;
    const fs = extractCommand(frameContent, "framesubtitle");
    const frameTitleCommand = findCommandRange(frameContent, "frametitle");
    const frameSubtitleCommand = findCommandRange(frameContent, "framesubtitle");

    const titleTarget = frameTitleCommand
      ? createEditableTextTarget(
          "slide-title",
          frameTitleCommand.value,
          frameTitleCommand.source,
          frameContentStart + frameTitleCommand.valueStart,
          frameContentStart + frameTitleCommand.valueEnd,
          slideIndex,
        )
      : match[1]
        ? createEditableTextTarget(
            "slide-title",
            frameTitle,
            match[1],
            frameStart + fullFrame.indexOf(`{${match[1]}}`) + 1,
            frameStart + fullFrame.indexOf(`{${match[1]}}`) + 1 + match[1].length,
            slideIndex,
          )
        : null;
    const subtitleTarget = frameSubtitleCommand
      ? createEditableTextTarget(
          "slide-subtitle",
          frameSubtitleCommand.value,
          frameSubtitleCommand.source,
          frameContentStart + frameSubtitleCommand.valueStart,
          frameContentStart + frameSubtitleCommand.valueEnd,
          slideIndex,
        )
      : null;

    const cleanContent = frameContent
      .replace(/\\frametitle\{[^}]*\}/g, "")
      .replace(/\\framesubtitle\{[^}]*\}/g, "")
      .trim();
    const bodyTextTargets = [
      ...collectBlockTitleTargets(frameContent, frameContentStart, slideIndex),
      ...collectLineTextTargets(frameContent, frameContentStart, slideIndex),
    ];
    const markedContent = markEditableTargetsInContent(
      frameContent,
      frameContentStart,
      bodyTextTargets,
    )
      .replace(/\\frametitle\{[^}]*\}/g, "")
      .replace(/\\framesubtitle\{[^}]*\}/g, "")
      .trim();

    const imageNames = Object.keys(uploadedImages);
    const layout = cleanContent.includes("\\begin{columns}")
      ? "two-column"
      : cleanContent.includes("\\begin{lstlisting}") || cleanContent.includes("\\begin{verbatim}")
        ? "code"
        : cleanContent.includes("\\includegraphics")
          ? "image"
          : "normal";

    const editableTextTargets = [titleTarget, subtitleTarget, ...bodyTextTargets].filter(
      (target): target is EditableTextTarget => Boolean(target),
    );

    slideNum++;
    slides.push({
      title: ft,
      subtitle: fs,
      content: renderContent(markedContent, uploadedImages, themeStyle),
      layout,
      theme,
      images: imageNames.filter((n) => cleanContent.includes(n)),
      slideNumber: slideNum,
      titleTarget: titleTarget || undefined,
      subtitleTarget: subtitleTarget || undefined,
      editableTextTargets,
    });
  }

  const titleTarget =
    documentTitleTargetBase && slides[0]?.layout === "title"
      ? createEditableTextTarget(
          "document-title",
          documentTitleTargetBase.value,
          documentTitleTargetBase.source,
          documentTitleTargetBase.valueStart,
          documentTitleTargetBase.valueEnd,
          0,
        )
      : undefined;
  const subtitleTarget =
    documentSubtitleTargetBase && slides[0]?.layout === "title"
      ? createEditableTextTarget(
          "document-subtitle",
          documentSubtitleTargetBase.value,
          documentSubtitleTargetBase.source,
          documentSubtitleTargetBase.valueStart,
          documentSubtitleTargetBase.valueEnd,
          0,
        )
      : undefined;

  return {
    documentTitle: title,
    author,
    date,
    institute,
    theme,
    colorTheme,
    slides,
    themeStyle,
    titleTarget: titleTarget || undefined,
    subtitleTarget: subtitleTarget || undefined,
  };
}

export interface ThemeStyle {
  // Title slide
  titleBg: string;
  titleFg: string;
  titleAccent: string;
  // Content slides
  headerStyle: "minimal" | "accent-bar" | "gradient-line" | "side-accent" | "floating";
  accentColor: string;
  accentGradient: string;
  bodyBg: string;
  bodyFg: string;
  mutedFg: string;
  alertColor?: string;
  exampleColor?: string;
  // Section slides
  sectionBg: string;
  sectionFg: string;
  // Footer
  footerStyle: "minimal" | "accent" | "hidden";
  // Font
  headingFont: string;
  bodyFont: string;
}

export function getThemeStyle(theme: string, customStyle?: CustomTemplateStyle): ThemeStyle {
  const themes: Record<string, ThemeStyle> = {
    Meridian: {
      titleBg: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0c4a6e 100%)",
      titleFg: "#f8fafc",
      titleAccent: "#38bdf8",
      headerStyle: "accent-bar",
      accentColor: "#0284c7",
      accentGradient: "linear-gradient(90deg, #0284c7, #38bdf8)",
      bodyBg: "#ffffff",
      bodyFg: "#1e293b",
      mutedFg: "#64748b",
      sectionBg: "linear-gradient(135deg, #0c4a6e, #0284c7)",
      sectionFg: "#ffffff",
      footerStyle: "minimal",
      headingFont: "'Inter', 'Helvetica Neue', sans-serif",
      bodyFont: "'Inter', 'Helvetica Neue', sans-serif",
    },
    Ember: {
      titleBg: "linear-gradient(135deg, #1c1917 0%, #292524 50%, #44403c 100%)",
      titleFg: "#fafaf9",
      titleAccent: "#f97316",
      headerStyle: "gradient-line",
      accentColor: "#ea580c",
      accentGradient: "linear-gradient(90deg, #ea580c, #f59e0b)",
      bodyBg: "#fafaf9",
      bodyFg: "#292524",
      mutedFg: "#78716c",
      sectionBg: "linear-gradient(135deg, #292524, #ea580c)",
      sectionFg: "#fafaf9",
      footerStyle: "accent",
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
    },
    Arctic: {
      titleBg: "linear-gradient(160deg, #020617 0%, #0f172a 40%, #1e293b 100%)",
      titleFg: "#e2e8f0",
      titleAccent: "#a78bfa",
      headerStyle: "floating",
      accentColor: "#7c3aed",
      accentGradient: "linear-gradient(90deg, #7c3aed, #a78bfa)",
      bodyBg: "#0f172a",
      bodyFg: "#e2e8f0",
      mutedFg: "#94a3b8",
      sectionBg: "linear-gradient(135deg, #1e1b4b, #7c3aed)",
      sectionFg: "#f8fafc",
      footerStyle: "minimal",
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
    },
    Canopy: {
      titleBg: "linear-gradient(135deg, #022c22 0%, #064e3b 50%, #065f46 100%)",
      titleFg: "#ecfdf5",
      titleAccent: "#34d399",
      headerStyle: "side-accent",
      accentColor: "#059669",
      accentGradient: "linear-gradient(180deg, #059669, #34d399)",
      bodyBg: "#ffffff",
      bodyFg: "#1e293b",
      mutedFg: "#64748b",
      sectionBg: "linear-gradient(135deg, #064e3b, #059669)",
      sectionFg: "#ecfdf5",
      footerStyle: "minimal",
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
    },
    Slate: {
      titleBg: "linear-gradient(145deg, #18181b 0%, #27272a 100%)",
      titleFg: "#fafafa",
      titleAccent: "#fafafa",
      headerStyle: "minimal",
      accentColor: "#a1a1aa",
      accentGradient: "linear-gradient(90deg, #71717a, #a1a1aa)",
      bodyBg: "#ffffff",
      bodyFg: "#18181b",
      mutedFg: "#71717a",
      sectionBg: "#18181b",
      sectionFg: "#fafafa",
      footerStyle: "hidden",
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
    },
    Crimson: {
      titleBg: "linear-gradient(135deg, #1c1917 0%, #450a0a 50%, #7f1d1d 100%)",
      titleFg: "#fef2f2",
      titleAccent: "#f87171",
      headerStyle: "accent-bar",
      accentColor: "#dc2626",
      accentGradient: "linear-gradient(90deg, #dc2626, #f87171)",
      bodyBg: "#fffbfb",
      bodyFg: "#1c1917",
      mutedFg: "#78716c",
      sectionBg: "linear-gradient(135deg, #450a0a, #dc2626)",
      sectionFg: "#fef2f2",
      footerStyle: "accent",
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
    },
  };

  const baseTheme = customStyle?.baseTheme || theme;
  const base = themes[baseTheme] || themes[theme] || themes.Meridian;

  if (!customStyle) return base;

  return {
    ...base,
    titleBg: `linear-gradient(135deg, ${customStyle.titleBgStart} 0%, ${customStyle.titleBgEnd} 100%)`,
    titleFg: customStyle.titleFg,
    titleAccent: customStyle.accentColor,
    accentColor: customStyle.accentColor,
    accentGradient: `linear-gradient(90deg, ${customStyle.accentColor}, ${customStyle.exampleColor})`,
    bodyBg: customStyle.bodyBg,
    bodyFg: customStyle.bodyFg,
    mutedFg: customStyle.mutedFg,
    alertColor: customStyle.alertColor,
    exampleColor: customStyle.exampleColor,
    sectionBg: `linear-gradient(135deg, ${customStyle.sectionBgStart}, ${customStyle.sectionBgEnd})`,
    sectionFg: customStyle.sectionFg,
  };
}
