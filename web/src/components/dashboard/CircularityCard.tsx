import { useState } from "react";
import { Recycle, Info, Sparkles, Table as TableIcon } from "lucide-react";

export interface CircularitySubScore {
  key: string;
  name: string;
  score: number;
  weight: number;
  formula: string;
  available: boolean;
}

export interface CircularityData {
  overall: number;
  sub_scores: CircularitySubScore[];
  biggest_opportunity: {
    key: string;
    name: string;
    gap: number;
    action_hint: string;
  } | null;
}

interface CircularityCardProps {
  data?: CircularityData | null;
}

export function CircularityCard({ data }: CircularityCardProps) {
  const [showTable, setShowTable] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  if (!data || !data.sub_scores || data.sub_scores.length === 0) {
    return null;
  }

  const overall = Math.round(data.overall);

  // Overall rating tier
  const getRating = (score: number) => {
    if (score >= 75) return { label: "Leader", color: "text-leaf", bg: "bg-leaf/10 border-leaf/30" };
    if (score >= 50) return { label: "Progressing", color: "text-brass", bg: "bg-brass/10 border-brass/30" };
    return { label: "Linear Baseline", color: "text-muted", bg: "bg-paper border-rule" };
  };

  const rating = getRating(overall);

  return (
    <div className="bg-white/90 dark:bg-[#0c101a]/90 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl p-5 shadow-xs relative overflow-hidden">
      {/* Corner Tech Accents */}
      <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-leaf/40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-leaf/40 pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-rule">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-leaf/10 text-leaf">
            <Recycle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider font-mono">
                Circularity Score
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${rating.bg} ${rating.color}`}>
                {rating.label}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              4-pillar circularity assessment per PRD §11.3
            </p>
          </div>
        </div>

        {/* View as table toggle (Decarbo WCAG rule) */}
        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rule text-xs font-semibold text-ink bg-paper hover:bg-white transition-colors self-start sm:self-auto"
        >
          <TableIcon className="w-3.5 h-3.5 text-muted" />
          {showTable ? "View as meters" : "View as table"}
        </button>
      </div>

      {/* Main Score & Pillars */}
      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-rule bg-paper text-muted uppercase text-[10px]">
                <th className="py-2.5 px-3">Circularity Pillar</th>
                <th className="py-2.5 px-3 text-right">Score (0–100)</th>
                <th className="py-2.5 px-3 text-right">Weight</th>
                <th className="py-2.5 px-3">Formula / Metric Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.sub_scores.map((sub) => (
                <tr key={sub.key} className="hover:bg-paper/50">
                  <td className="py-2 px-3 font-semibold text-ink">{sub.name}</td>
                  <td className="py-2 px-3 text-right font-bold text-leaf font-mono">
                    {Math.round(sub.score)}
                  </td>
                  <td className="py-2 px-3 text-right text-muted font-mono">{sub.weight}%</td>
                  <td className="py-2 px-3 text-[11px] text-muted">{sub.formula}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-rule bg-paper/60 font-bold">
                <td className="py-2.5 px-3 text-ink">Overall Weighted Circularity</td>
                <td className="py-2.5 px-3 text-right text-leaf text-sm">{overall} / 100</td>
                <td className="py-2.5 px-3 text-right text-muted">100%</td>
                <td className="py-2.5 px-3 text-[11px] text-muted">Weighted composite score</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Circular Gauge / Headline Score (Left 4 cols) */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-paper/60 rounded-xl border border-rule text-center">
            <div className="relative flex items-center justify-center w-28 h-28">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-rule"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-leaf transition-all duration-500"
                  strokeDasharray={`${overall}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-3xl font-bold font-mono text-ink tracking-tight">
                  {overall}
                </span>
                <span className="text-[10px] uppercase font-bold text-muted">/ 100</span>
              </div>
            </div>
            <span className="text-xs font-semibold text-ink mt-2">Circularity Index</span>
            <span className="text-[11px] text-muted">BEE & Industrial Ecology benchmark</span>
          </div>

          {/* 4 Pillars Progress Bars (Right 8 cols) */}
          <div className="md:col-span-8 space-y-3">
            {data.sub_scores.map((sub) => {
              const scoreVal = Math.round(sub.score);
              return (
                <div key={sub.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-ink">{sub.name}</span>
                      <div className="relative">
                        <button
                          type="button"
                          onMouseEnter={() => setActiveTooltip(sub.key)}
                          onMouseLeave={() => setActiveTooltip(null)}
                          onClick={() => setActiveTooltip(activeTooltip === sub.key ? null : sub.key)}
                          className="text-muted hover:text-ink transition-colors"
                          title={sub.formula}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        {activeTooltip === sub.key && (
                          <div className="absolute left-5 top-0 z-30 w-64 p-2.5 bg-ink text-white text-[11px] rounded-lg shadow-xl border border-rule">
                            <div className="font-bold text-brass mb-1">Formula & Weight ({sub.weight}%)</div>
                            <div className="font-mono text-paper leading-snug">{sub.formula}</div>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted font-mono">({sub.weight}% wt)</span>
                    </div>
                    <span className="font-mono font-bold text-ink">{scoreVal} / 100</span>
                  </div>

                  <div className="h-2 w-full bg-paper rounded-full overflow-hidden border border-rule/60">
                    <div
                      className={`h-full transition-all duration-500 ${
                        scoreVal >= 70 ? "bg-leaf" : scoreVal >= 40 ? "bg-brass" : "bg-muted"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, scoreVal))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Biggest Opportunity Callout */}
      {data.biggest_opportunity && (
        <div className="mt-4 pt-3 border-t border-rule flex items-start gap-2.5 bg-leaf/5 rounded-lg p-3 text-xs">
          <Sparkles className="w-4 h-4 text-leaf shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-leaf">
              Biggest Opportunity: {data.biggest_opportunity.name}
            </span>
            <p className="text-muted text-[11px] mt-0.5">
              {data.biggest_opportunity.action_hint ||
                "Increasing secondary scrap intake and in-house swarf segregation provides the fastest circularity improvement."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
