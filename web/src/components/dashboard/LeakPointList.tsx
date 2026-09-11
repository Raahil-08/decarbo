import { Flame, Sparkles, ArrowRight } from "lucide-react";
import { formatEmissionsT } from "../../lib/format";
import { useI18n } from "../../lib/i18n";

interface BestFix {
  title: string;
  description: string;
  capex_inr: number;
  annual_savings_inr: number;
  payback_str: string;
  cuts_pct: number;
}

interface LeakPoint {
  rank: number;
  activity_type: string;
  name: string;
  scope: string;
  category: string;
  tco2e: number;
  pct_of_total: number;
  cumulative_pct: number;
  is_pareto_leakpoint: boolean;
  best_fix?: BestFix | null;
}

interface LeakPointListProps {
  leakPoints: LeakPoint[];
  onSelectLeakPoint?: (activityType: string) => void;
  onBuildPlan?: () => void;
}

export function LeakPointList({
  leakPoints,
  onSelectLeakPoint,
  onBuildPlan,
}: LeakPointListProps) {
  const { t } = useI18n();

  return (
    <div className="bg-white border border-rule rounded-xl p-6 shadow-sm space-y-5 flex flex-col justify-between">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <div>
            <h3 className="text-base font-bold text-ink tracking-tight flex items-center">
              <Flame className="w-4 h-4 text-ember mr-2" />
              <span>{t("leak_points_title")}</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {t("leak_points_subtitle")}
            </p>
          </div>
          <span className="text-[11px] font-mono text-muted bg-paper px-2 py-0.5 rounded border border-rule">
            Pareto 80% Cutoff
          </span>
        </div>

        {/* Rows List (PRD §17.2: Not a card grid, clean quiet rows) */}
        {leakPoints.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted">
            No leak points identified yet.
          </div>
        ) : (
          <div className="divide-y divide-rule/60">
            {leakPoints.map((lp) => {
              const isMajor = lp.pct_of_total >= 20.0;
              return (
                <div
                  key={lp.rank}
                  onClick={() => onSelectLeakPoint && onSelectLeakPoint(lp.activity_type)}
                  className="py-3.5 px-2 hover:bg-paper/50 rounded-lg transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Rank, Name, Category */}
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-md bg-paper border border-rule flex items-center justify-center text-xs font-mono font-bold text-ink shrink-0 mt-0.5">
                        {lp.rank}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-ink group-hover:text-ember transition-colors">
                            {lp.name}
                          </span>
                          {lp.is_pareto_leakpoint && (
                            <span className="text-[10px] font-mono uppercase bg-ember/10 text-ember px-1.5 py-0.2 rounded font-semibold">
                              Pareto Driver
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted flex items-center space-x-2 mt-0.5">
                          <span>{lp.category}</span>
                          <span>•</span>
                          <span>{lp.scope}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Tonnage and Share */}
                    <div className="text-right shrink-0 font-mono">
                      <div className="text-xs font-bold text-ember">
                        {formatEmissionsT(lp.tco2e * 1000.0)}
                      </div>
                      <div className="text-[11px] text-muted">
                        {lp.pct_of_total.toFixed(1)}% of total
                      </div>
                    </div>
                  </div>

                  {/* Share Bar */}
                  <div className="mt-2.5 w-full bg-paper rounded-full h-1.5 overflow-hidden border border-rule/50">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isMajor ? "bg-ember" : "bg-brass"
                      }`}
                      style={{ width: `${Math.min(lp.pct_of_total, 100)}%` }}
                    />
                  </div>

                  {/* Best Fix Callout */}
                  {lp.best_fix && (
                    <div className="mt-2.5 p-2 bg-leaf/5 border border-leaf/20 rounded-md flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5 truncate">
                        <Sparkles className="w-3.5 h-3.5 text-leaf shrink-0" />
                        <span className="font-medium text-ink truncate">
                          {lp.best_fix.title}
                        </span>
                      </div>
                      <div className="shrink-0 font-mono text-[11px] text-leaf font-semibold ml-2">
                        {lp.best_fix.payback_str}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Primary Action Button (PRD §17.2: "Build my plan") */}
      <div className="pt-4 border-t border-rule">
        <button
          onClick={onBuildPlan}
          className="w-full py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-ink hover:bg-ink-light transition-all shadow-md flex items-center justify-center space-x-2 group"
        >
          <Sparkles className="w-4 h-4 text-leaf group-hover:scale-110 transition-transform" />
          <span>{t("build_plan")}</span>
          <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
        </button>
        <p className="text-[11px] text-center text-muted mt-2">
          Deterministic linear optimization solves optimal fixes under your budget
        </p>
      </div>
    </div>
  );
}
