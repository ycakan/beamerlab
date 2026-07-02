import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const openRouterEndpoint = "https://openrouter.ai/api/v1/chat/completions";

const improvePresentationInputSchema = z.object({
  apiKey: z.string().min(1, "OpenRouter API key is required."),
  model: z.string().min(1, "OpenRouter model is required."),
  prompt: z.string().min(3, "Please enter a longer prompt."),
  latex: z.string().min(1, "Presentation source is empty."),
  templateName: z.string().optional(),
  theme: z.string().optional(),
  imageNames: z.array(z.string()).default([]),
});

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json|latex)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = stripCodeFence(value);

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("The model response did not contain valid JSON.");
    }

    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  }
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function readPayloadErrorMessage(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;

  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof payload.message === "string") return payload.message;

  return null;
}

function readFirstChoiceContent(payload: Record<string, unknown>): unknown {
  const choices = payload.choices;
  if (!Array.isArray(choices)) return undefined;

  const firstChoice = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return undefined;

  return firstChoice.message.content;
}

function readPayloadModel(payload: Record<string, unknown>): string {
  return typeof payload.model === "string" ? payload.model : "";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 5);
}

function normalizeLatexOutput(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("The model response did not include a LaTeX document.");
  }

  return stripCodeFence(value);
}

export const improvePresentationWithCopilot = createServerFn({ method: "POST" })
  .inputValidator(improvePresentationInputSchema)
  .handler(async ({ data }) => {
    const responseBody: Record<string, unknown> = {
      model: data.model,
      temperature: 0.25,
      max_completion_tokens: 3200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are BeamerLab Copilot, a senior presentation designer who edits LaTeX Beamer source.",
            "Return valid JSON only with three keys: summary, steps, and latex.",
            "summary must be one concise sentence.",
            "steps must be an array of 2 to 5 concise user-visible progress notes or design decisions, not hidden chain-of-thought.",
            "latex must be a complete Beamer document, not a fragment.",
            "Preserve the existing document structure unless the user explicitly asks for a major rewrite.",
            "Improve styling, hierarchy, wording, readability, spacing, sections, blocks, columns, and slide titles when useful.",
            "Do not invent external assets, download links, or file names.",
            "If images are already referenced, keep those file names exactly unchanged.",
            "Stay within standard Beamer plus the already-present amsmath/amssymb usage.",
            "Do not include markdown fences.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: data.prompt,
            templateName: data.templateName || "Unknown template",
            theme: data.theme || "Unknown theme",
            availableImageNames: data.imageNames,
            currentLatex: data.latex,
          }),
        },
      ],
    };

    const response = await fetch(openRouterEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://127.0.0.1:3000/",
        "X-Title": "BeamerLab Copilot",
      },
      body: JSON.stringify(responseBody),
    });

    const rawText = await response.text();
    const payload = rawText.trim() ? safeParseJson(rawText) : null;

    if (!response.ok) {
      const message =
        readPayloadErrorMessage(payload) ||
        `OpenRouter request failed with status ${response.status}.`;
      throw new Error(message);
    }

    if (!payload) {
      throw new Error("OpenRouter returned a response, but it was not valid JSON.");
    }

    const content = extractMessageText(readFirstChoiceContent(payload));
    const parsed = parseJsonObject(content);
    const latex = normalizeLatexOutput(parsed.latex);
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "Applied AI styling improvements to the presentation source.";
    const steps = normalizeStringList(parsed.steps);

    if (!latex.includes("\\begin{document}") || !latex.includes("\\end{document}")) {
      throw new Error("The model returned LaTeX, but it was not a full presentation document.");
    }

    return {
      summary,
      steps,
      latex,
      model: readPayloadModel(payload),
    };
  });
