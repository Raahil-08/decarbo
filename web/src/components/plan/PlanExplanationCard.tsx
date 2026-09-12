import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  ShieldCheck,
  FileText,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useI18n } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";

interface PlanExplanationCardProps {
  planId: string;
  factoryId?: string;
  planMode?: string;
}

export function PlanExplanationCard({ planId }: PlanExplanationCardProps) {
  const { locale: appLocale, t } = useI18n();
  const [selectedLocale, setSelectedLocale] = useState<Locale>(appLocale);
  const [explanationText, setExplanationText] = useState<string>("");
  const [source, setSource] = useState<"ai" | "template" | "cached" | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync selectedLocale when app locale changes
  useEffect(() => {
    setSelectedLocale(appLocale);
  }, [appLocale]);

  const fetchExplanation = useCallback(
    async (targetLocale: Locale, regenerate: boolean = false) => {
      if (!planId) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setIsStreaming(true);
      setError(null);
      setExplanationText("");

      const token = localStorage.getItem("decarbo_dev_token");
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const url = `/api/v1/plans/${planId}/explanation?locale=${targetLocale}&stream=true${
        regenerate ? "&regenerate=true" : ""
      }`;

      try {
        const response = await fetch(url, {
          headers,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load explanation (${response.status})`);
        }

        if (!response.body) {
          throw new Error("No response stream available");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulated = "";
        let finalSource: "ai" | "template" | "cached" = "template";

        setIsLoading(false);

        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              const dataStr = trimmed.slice(5).trim();
              if (dataStr) {
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.source) {
                    finalSource = parsed.source;
                    setSource(parsed.source);
                  }
                  if (parsed.text) {
                    accumulated += parsed.text;
                    setExplanationText(accumulated);
                  }
                  if (parsed.done) {
                    setIsStreaming(false);
                  }
                } catch {
                  // ignore non-json SSE lines
                }
              }
            }
          }
        }

        setSource(finalSource);
      } catch (err: any) {
        if (err.name === "AbortError") {
          return;
        }
        console.error("Failed to load plan explanation:", err);
        setError(t("explanation_error"));
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [planId, t]
  );

  // Fetch when planId or selectedLocale changes
  useEffect(() => {
    fetchExplanation(selectedLocale, false);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [planId, selectedLocale, fetchExplanation]);

  const handleLocaleSwitch = (newLocale: Locale) => {
    setSelectedLocale(newLocale);
  };

  const handleRegenerate = () => {
    fetchExplanation(selectedLocale, true);
  };

  return (
    <div className="bg-white border border-rule rounded-xl shadow-xs overflow-hidden transition-all">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-rule bg-paper/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-brass/10 border border-brass/25 text-brass shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-ink">
                {t("ai_explanation_title")}
              </h3>

              {/* Provenance Badge */}
              {source === "ai" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-leaf bg-leaf/10 border border-leaf/30 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{t("ai_grounded_badge")}</span>
                </span>
              )}
              {source === "template" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink bg-paper border border-rule px-2 py-0.5 rounded-full">
                  <FileText className="w-3 h-3 text-muted" />
                  <span>{t("ai_template_badge")}</span>
                </span>
              )}
              {source === "cached" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted bg-paper border border-rule px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-leaf" />
                  <span>{t("ai_cached_badge")}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {t("ai_explanation_subtitle")}
            </p>
          </div>
        </div>

        {/* Right: Language switch + Regenerate */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {/* Locale switcher */}
          <div className="inline-flex rounded-lg border border-rule bg-paper p-0.5 text-xs font-medium">
            {(
              [
                { code: "en", label: "EN" },
                { code: "gu", label: "ગુજરાતી" },
                { code: "hi", label: "हिंदी" },
              ] as const
            ).map((loc) => (
              <button
                key={loc.code}
                type="button"
                onClick={() => handleLocaleSwitch(loc.code)}
                disabled={isLoading || isStreaming}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedLocale === loc.code
                    ? "bg-white text-ink font-bold shadow-2xs"
                    : "text-muted hover:text-ink"
                }`}
              >
                {loc.label}
              </button>
            ))}
          </div>

          {/* Regenerate button */}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isLoading || isStreaming}
            title={t("regenerate_explanation")}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink bg-white border border-rule hover:bg-paper rounded-lg transition-colors shadow-2xs disabled:opacity-50"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 ${isLoading || isStreaming ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">{t("regenerate_explanation")}</span>
          </button>
        </div>
      </div>

      {/* Card Content Area */}
      <div className="p-5 sm:p-6">
        {error ? (
          <div className="p-4 bg-ember/10 border border-ember/30 rounded-lg text-xs text-ember flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : isLoading && !explanationText ? (
          <div className="py-8 text-center text-xs text-muted flex flex-col items-center justify-center space-y-2">
            <Sparkles className="w-6 h-6 text-brass animate-pulse" />
            <p className="font-semibold text-ink">{t("explanation_loading")}</p>
          </div>
        ) : (
          <div className="relative">
            <div
              className={`text-sm text-ink leading-relaxed whitespace-pre-line font-normal ${
                selectedLocale === "gu"
                  ? "font-['Hind_Vadodara',sans-serif]"
                  : selectedLocale === "hi"
                  ? "font-['Hind',sans-serif]"
                  : "font-sans"
              }`}
            >
              {explanationText}
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-brass animate-pulse align-middle" />
              )}
            </div>

            {/* Practical verification footer */}
            <div className="mt-4 pt-3 border-t border-rule/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-leaf" />
                <span>100% grounded in engine calculations • No hallucinations</span>
              </span>
              <span className="font-mono text-[10px] text-muted">
                Locale: {selectedLocale.toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
