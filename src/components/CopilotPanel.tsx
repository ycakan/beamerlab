import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, RotateCcw, Sparkles, Wand2 } from "lucide-react";

import { improvePresentationWithCopilot } from "@/lib/copilot";
import BeamerBudIcon from "@/components/BeamerBudIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const defaultPrompt =
  "Make the deck look more polished and easier to present. Improve titles, hierarchy, spacing, and structure without changing the core meaning.";

const maskedApiKeyPlaceholder = "\u2022".repeat(72);

const openRouterModelGroups = [
  {
    label: "Top models",
    models: [
      { id: "~openai/gpt-latest", label: "OpenAI GPT Latest" },
      { id: "~anthropic/claude-sonnet-latest", label: "Claude Sonnet Latest" },
      { id: "~google/gemini-pro-latest", label: "Gemini Pro Latest" },
      { id: "x-ai/grok-4.3", label: "Grok 4.3" },
    ],
  },
  {
    label: "Fast and cheap",
    models: [
      { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "~google/gemini-flash-latest", label: "Gemini Flash Latest" },
      { id: "~openai/gpt-mini-latest", label: "OpenAI GPT Mini Latest" },
      { id: "~anthropic/claude-haiku-latest", label: "Claude Haiku Latest" },
    ],
  },
];

const defaultOpenRouterModel = "deepseek/deepseek-v4-flash";
const openRouterApiKeySessionKey = "beamerlab.openrouter.api-key";

interface CopilotPanelProps {
  latex: string;
  templateName: string;
  theme: string;
  imageNames: string[];
  hasPendingAiChanges: boolean;
  canRestoreChanges: boolean;
  onAcceptChanges: () => void;
  onBeforeApplyRequest: (previousLatex: string) => void;
  onApplyLatex: (nextLatex: string, previousLatex: string) => void;
  onRestoreLatex: () => void;
}

export default function CopilotPanel({
  latex,
  templateName,
  theme,
  imageNames,
  hasPendingAiChanges,
  canRestoreChanges,
  onAcceptChanges,
  onBeforeApplyRequest,
  onApplyLatex,
  onRestoreLatex,
}: CopilotPanelProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiKeySessionLoaded, setApiKeySessionLoaded] = useState(false);
  const [selectedModel, setSelectedModel] = useState(defaultOpenRouterModel);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [statusNotes, setStatusNotes] = useState<string[]>([
    "Model output and BeamerBud progress notes will appear here.",
  ]);

  useEffect(() => {
    try {
      const cachedApiKey = window.sessionStorage.getItem(openRouterApiKeySessionKey);
      if (cachedApiKey) setApiKey(cachedApiKey);
    } catch {
      // Browser storage can be unavailable; BeamerBud can still run with a freshly entered key.
    } finally {
      setApiKeySessionLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!apiKeySessionLoaded) return;

    try {
      if (apiKey.trim()) {
        window.sessionStorage.setItem(openRouterApiKeySessionKey, apiKey);
      } else {
        window.sessionStorage.removeItem(openRouterApiKeySessionKey);
      }
    } catch {
      // Browser storage can be unavailable; editing and BeamerBud should continue without caching.
    }
  }, [apiKey, apiKeySessionLoaded]);

  const imageSummary = useMemo(() => {
    if (imageNames.length === 0) return "No uploaded images";
    if (imageNames.length === 1) return `1 uploaded image: ${imageNames[0]}`;
    return `${imageNames.length} uploaded images available`;
  }, [imageNames]);

  const outputNotes = useMemo(() => {
    if (error) return [error];
    if (isSubmitting) return statusNotes;

    const notes: string[] = [...statusNotes];
    if (summary && !notes.includes(summary)) notes.push(summary);
    notes.push(...steps);

    return notes.length > 0 ? notes : statusNotes;
  }, [error, isSubmitting, steps, statusNotes, summary]);

  async function handleImprove() {
    if (!apiKey.trim()) {
      setError("Add your OpenRouter API key to run BeamerBud.");
      return;
    }

    const effectivePrompt = prompt.trim() || defaultPrompt;

    setIsSubmitting(true);
    setError("");
    setSummary("");
    setSteps([]);
    setStatusNotes([
      `User asked: ${effectivePrompt}`,
      "Sending the current Beamer source to OpenRouter.",
      "Waiting for a rewritten LaTeX document.",
    ]);

    try {
      const previousLatex = latex;
      onBeforeApplyRequest(previousLatex);
      const result = await improvePresentationWithCopilot({
        data: {
          apiKey: apiKey.trim(),
          prompt: effectivePrompt,
          latex,
          templateName,
          theme,
          imageNames,
          model: selectedModel,
        },
      });

      onApplyLatex(result.latex, previousLatex);
      setSummary(result.summary);
      setSteps(result.steps);
      setStatusNotes([
        `User asked: ${effectivePrompt}`,
        "Applied BeamerBud output to the editor.",
        "AI-made edits are highlighted in yellow until accepted.",
      ]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "BeamerBud could not improve the deck.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRestore() {
    if (!canRestoreChanges) return;

    onRestoreLatex();
    setSummary("Restored the project to the state before the last BeamerBud apply.");
    setSteps([]);
    setStatusNotes(["Restored the previous LaTeX source."]);
  }

  function handleAcceptChanges() {
    onAcceptChanges();
    setStatusNotes(["Accepted AI-made changes and cleared the yellow editor highlights."]);
  }

  return (
    <section className="w-full max-h-[min(720px,calc(100vh-7rem))] overflow-y-auto rounded-lg border border-primary/20 bg-background/95 shadow-2xl backdrop-blur">
      <div className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <BeamerBudIcon className="h-5 w-5" />
              BeamerBud
            </div>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-8 w-[260px] rounded-full border-primary/20 bg-editor-bg/80 px-3 text-xs">
                <SelectValue placeholder="Choose OpenRouter model" />
              </SelectTrigger>
              <SelectContent className="z-[80] w-[280px]">
                {openRouterModelGroups.map((group, groupIndex) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {group.label}
                    </SelectLabel>
                    {group.models.map((model) => (
                      <SelectItem key={model.id} value={model.id} className="text-xs">
                        {model.label}
                      </SelectItem>
                    ))}
                    {groupIndex < openRouterModelGroups.length - 1 && <SelectSeparator />}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="whitespace-nowrap text-xs text-muted-foreground">
            Ask BeamerBud to craft impactful slides, align charts, review code, and more!
          </div>

          <div className="rounded border border-border bg-editor-bg/80 p-3">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              OpenRouter API Key
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={maskedApiKeyPlaceholder}
                className="h-11 bg-background pl-9 font-mono text-xs"
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>
            <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Your API key stays in this browser session only. 
              It is used from your browser to contact OpenRouter and is not stored on our servers or included in BeamerLab's source code.
            </div>
          </div>

          <div className="rounded border border-border bg-editor-bg/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Prompt
              </label>
              <div className="text-[11px] text-muted-foreground">
                {imageSummary} - {templateName} / {theme}
              </div>
            </div>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={defaultPrompt}
              className="min-h-[84px] resize-y bg-background text-sm"
            />
          </div>

          <div className="rounded border border-border bg-editor-bg/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Model Output
              </label>
              {hasPendingAiChanges && (
                <span className="rounded bg-yellow-400/15 px-2 py-0.5 text-[11px] font-medium text-yellow-200">
                  AI changes highlighted
                </span>
              )}
            </div>
            <div
              className={`min-h-[112px] rounded border px-3 py-2 text-sm ${
                error
                  ? "border-red-500/30 bg-red-500/8 text-red-200"
                  : "border-border bg-background text-foreground"
              }`}
            >
              <ul className="space-y-1.5">
                {outputNotes.map((note, index) => (
                  <li key={`${index}-${note}`} className="flex gap-2 text-xs leading-5">
                    <span className="font-mono text-primary">{index + 1}.</span>
                    <span className={error ? "text-red-100" : "text-muted-foreground"}>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              onClick={handleImprove}
              disabled={isSubmitting}
              className="justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Applying changes...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Apply changes
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleAcceptChanges}
              disabled={!hasPendingAiChanges}
              className="justify-center gap-2"
            >
              <Check className="h-4 w-4" />
              Accept changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleRestore}
              disabled={!canRestoreChanges || isSubmitting}
              className="justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Restore
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
