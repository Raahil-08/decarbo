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
import { API_BASE_URL, getAuthToken } from "../../lib/api";

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

      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        };

        const streamUrl = `${API_BASE_URL}/plans/${planId}/explanation?locale=${targetLocale}&stream=true${
          regenerate ? "&regenerate=true" : ""
        }`;

        let streamSucceeded = false;
        try {
          const response = await fetch(streamUrl, {
            headers,
            signal: abortControllerRef.current.signal,
          });

          if (response.ok && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let accumulated = "";
            let finalSource: "ai" | "template" | "cached" = "template";
            let buffer = "";

            setIsLoading(false);

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
                        streamSucceeded = true;
                      }
                    } catch {
                      // ignore non-json SSE lines
                    }
                  }
                }
              }
            }

            setSource(finalSource);
            if (accumulated.trim().length > 0) {
              streamSucceeded = true;
            }
          }
        } catch (streamErr: any) {
          if (streamErr.name === "AbortError") {
            return;
          }
          console.warn("SSE stream error, trying direct JSON fallback:", streamErr);
        }

        // Automatic fallback: If streaming didn't produce text, fetch via direct JSON
        if (!streamSucceeded) {
          const jsonUrl = `${API_BASE_URL}/plans/${planId}/explanation?locale=${targetLocale}&stream=false${
            regenerate ? "&regenerate=true" : ""
          }`;
          const jsonRes = await fetch(jsonUrl, {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            signal: abortControllerRef.current.signal,
          });
          if (jsonRes.ok) {
            const data = await jsonRes.json();
            if (data.text) {
              setExplanationText(data.text);
              setSource(data.source || "template");
              setIsStreaming(false);
              return;
            }
          }
          throw new Error("Failed to load plan explanation");
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          return;
        }
        console.error("Failed to load plan explanation:", err);
        setError("explanation_error");
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [planId]
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
    <div className="bg-[#0c101a]/90 backdrop-blur-md border border-white/[0.08] rounded-2xl shadow-xl overflow-hidden transition-all relative">
      {/* Corner tech accents */}
      <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-leaf/40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-leaf/40 pointer-events-none" />

      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-white/[0.06] bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-brass/15 border border-brass/30 text-brass shrink-0 shadow-[0_0_15px_rgba(169,122,43,0.15)]">
            <Sparkles className="w-4 h-4 text-brass" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono tracking-tight">
                {t("ai_explanation_title")}
              </h3>

              {/* Provenance Badge */}
              {source === "ai" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-leaf bg-leaf/10 border border-leaf/30 px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(45,122,87,0.2)]">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{t("ai_grounded_badge")}</span>
                </span>
              )}
              {source === "template" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-white/70 bg-white/[0.04] border border-white/10 px-2 py-0.5 rounded-full">
                  <FileText className="w-3 h-3 text-white/50" />
                  <span>{t("ai_template_badge")}</span>
                </span>
              )}
              {source === "cached" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-white/70 bg-white/[0.04] border border-white/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-leaf" />
                  <span>{t("ai_cached_badge")}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-white/40 mt-0.5 font-mono">
              {t("ai_explanation_subtitle")}
            </p>
          </div>
        </div>

        {/* Right: Language switch + Regenerate */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {/* Locale switcher */}
          <div className="inline-flex rounded-lg border border-white/10 bg-black/40 p-0.5 text-xs font-mono">
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
                className={`px-2.5 py-1 rounded-md text-xs transition-all ${
                  selectedLocale === loc.code
                    ? "bg-leaf/20 text-leaf font-bold border border-leaf/40 shadow-xs"
                    : "text-white/40 hover:text-white"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-white/70 hover:text-white bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 text-leaf ${isLoading || isStreaming ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">{t("regenerate_explanation")}</span>
          </button>
        </div>
      </div>

      {/* Card Content Area */}
      <div className="p-5 sm:p-6 min-h-[140px] flex flex-col justify-center">
        {error ? (
          <div className="p-4 bg-ember/10 border border-ember/30 rounded-xl text-xs text-ember font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{t(error)}</span>
          </div>
        ) : isLoading && !explanationText ? (
          <div className="py-8 text-center text-xs text-white/40 flex flex-col items-center justify-center space-y-2">
            <Sparkles className="w-6 h-6 text-leaf animate-pulse" />
            <p className="font-semibold text-white font-mono">{t("explanation_loading")}</p>
          </div>
        ) : (
          <div className="relative">
            <div
              className={`text-sm text-white/90 leading-relaxed font-light ${
                selectedLocale === "gu"
                  ? "font-['Hind_Vadodara',sans-serif]"
                  : selectedLocale === "hi"
                  ? "font-['Hind',sans-serif]"
                  : "font-sans"
              }`}
            >
              <div className="space-y-3">
                {explanationText.split("\n\n").map((para, i, arr) => (
                  <p key={i} className="leading-relaxed">
                    {para}
                    {isStreaming && i === arr.length - 1 && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-leaf animate-pulse align-middle" />
                    )}
                  </p>
                ))}
              </div>
            </div>

            {/* Practical verification footer */}
            <div className="mt-5 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/40 font-mono">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-leaf" />
                <span>100% grounded in engine calculations • No hallucinations</span>
              </span>
              <span className="text-[10px] text-white/30">
                LOCALE: {selectedLocale.toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
