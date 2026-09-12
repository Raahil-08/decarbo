import { Zap, TrendingDown, Target, Clock, ArrowRight, ShieldCheck, RefreshCw } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { formatINR, formatLakh } from "../../lib/format";

interface SimulateOutcomesProps {
  baselineTco2e: number;
  projectedTco2e: number;
  reductionTco2e: number;
  reductionPct: number;
  totalCapexInr: number;
  annualSavingsInr: number;
  simplePaybackMonths: number | null;
  calcTimeMs: number;
  onOpenPlanner?: () => void;
  isLoading?: boolean;
}

export function SimulateOutcomes({
  baselineTco2e,
  projectedTco2e,
  reductionTco2e,
  reductionPct,
  totalCapexInr,
  annualSavingsInr,
  simplePaybackMonths,
  calcTimeMs,
  onOpenPlanner,
  isLoading = false,
}: SimulateOutcomesProps) {
  const { t } = useI18n();

  const targetPct = 20.0;
  const isTargetAchieved = reductionPct >= targetPct;
  const gapPct = Math.max(0, targetPct - reductionPct);
  const targetProgressRatio = Math.min(1.5, reductionPct / targetPct);

  // Format Payback
  let paybackDisplay = "—";
  if (totalCapexInr === 0 && reductionPct > 0) {
    paybackDisplay = "Instant (₹0 Capex)";
  } else if (simplePaybackMonths !== null && simplePaybackMonths > 0) {
    if (simplePaybackMonths < 12) {
      paybackDisplay = `${simplePaybackMonths.toFixed(1)} mo`;
    } else {
      const yrs = simplePaybackMonths / 12;
      paybackDisplay = `${yrs.toFixed(1)} yrs (${simplePaybackMonths.toFixed(0)} mo)`;
    }
  }

  return (
    <div className={`space-y-4 ${isLoading ? "opacity-90" : ""} transition-opacity`}>
      {/* Top Banner: Speed Badge & Target Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white border border-rule rounded-xl shadow-xs text-xs">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-paper border border-rule text-leaf">
            {isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 fill-leaf/20" />
            )}
          </div>
          <span className="font-mono text-muted">
            {isLoading
              ? "Recalculating..."
              : t("speed_badge", { ms: calcTimeMs > 0 ? calcTimeMs.toFixed(1) : "< 10" })}
          </span>
        </div>

        {/* Target Status Pill */}
        <div className="flex items-center space-x-1.5">
          <Target className="w-3.5 h-3.5 text-muted" />
          <span className="font-semibold text-ink">
            {isTargetAchieved ? (
              <span className="text-leaf flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t("sim_target_achieved", { pct: reductionPct.toFixed(1) })}
              </span>
            ) : (
              <span className="text-muted">
                {t("sim_target_gap", { gap: gapPct.toFixed(1) })}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Target Gauge / Progress Bar */}
      <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-bold text-ink uppercase tracking-wider">
            Target Progress (20% Baseline Cut)
          </span>
          <span className="font-mono font-bold text-ink">
            {reductionPct.toFixed(1)}% / 20.0%
          </span>
        </div>
        <div className="relative w-full h-3 bg-paper rounded-full overflow-hidden border border-rule">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              isTargetAchieved ? "bg-leaf" : "bg-leaf/80"
            }`}
            style={{ width: `${Math.min(100, targetProgressRatio * 100)}%` }}
          />
          {/* Target 20% Marker Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-ink"
            style={{ left: "66.6%" }}
            title="20% Target Threshold"
          />
        </div>
        <div className="flex justify-between items-center text-[10px] text-muted mt-1.5 font-mono">
          <span>0%</span>
          <span className="font-bold text-ink">Target: 20%</span>
          <span>30%+</span>
        </div>
      </div>

      {/* Primary KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Simulated Reduction */}
        <div className="col-span-2 sm:col-span-1 bg-leaf/5 border border-leaf/30 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-bold text-leaf uppercase tracking-wider block">
            {t("sim_cut_label")}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-leaf tracking-tight">
              {reductionTco2e.toFixed(1)}
            </span>
            <span className="text-xs text-leaf font-medium">tCO₂e / yr</span>
          </div>
          <div className="mt-1 text-xs font-bold text-leaf">
            <TrendingDown className="w-3.5 h-3.5 inline mr-1" />
            {reductionPct.toFixed(1)}% reduction
          </div>
        </div>

        {/* Projected Footprint */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted block">
            {t("sim_projected_label")}
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-ink tracking-tight">
              {projectedTco2e.toFixed(1)}
            </span>
            <span className="text-xs text-muted">tCO₂e</span>
          </div>
          <span className="text-[11px] text-muted block mt-1 font-mono">
            vs {baselineTco2e.toFixed(1)} baseline
          </span>
        </div>

        {/* Total Investment */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted block">
            {t("sim_capex_label")}
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-brass tracking-tight">
              {totalCapexInr >= 100000 ? formatLakh(totalCapexInr) : formatINR(totalCapexInr)}
            </span>
          </div>
          <span className="text-[11px] text-muted block mt-1">Upfront Capex</span>
        </div>

        {/* Annual Savings */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted block">
            {t("sim_savings_label")}
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-leaf tracking-tight">
              {annualSavingsInr >= 100000
                ? formatLakh(annualSavingsInr)
                : formatINR(annualSavingsInr)}
            </span>
            <span className="text-xs text-muted">/ yr</span>
          </div>
          <span className="text-[11px] text-muted block mt-1">Net bill savings</span>
        </div>

        {/* Simple Payback */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted block">
            {t("sim_payback_label")}
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold font-mono text-ink tracking-tight">
              {paybackDisplay}
            </span>
          </div>
          <span className="text-[11px] text-muted block mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted" />
            Cash payback
          </span>
        </div>

        {/* Action Button: Open in Planner */}
        {onOpenPlanner && (
          <div className="col-span-2 sm:col-span-1 bg-ink text-white rounded-xl p-4 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold text-brass-light block uppercase tracking-wider">
                Ready to execute?
              </span>
              <p className="text-xs text-paper/80 mt-0.5">
                Generate bankable PDF and MILP plan.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenPlanner}
              className="mt-3 inline-flex items-center justify-between w-full px-3 py-1.5 text-xs font-bold text-ink bg-white hover:bg-paper rounded-lg transition-colors"
            >
              <span>{t("save_as_target")}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Compounding Callout Notice (PRD Non-negotiable #5) */}
      <div className="p-3 bg-paper border border-rule rounded-xl text-xs text-muted flex items-start space-x-2">
        <ShieldCheck className="w-4 h-4 text-leaf shrink-0 mt-0.5" />
        <span className="text-[11px] leading-relaxed">
          {t("compounding_notice")}
        </span>
      </div>
    </div>
  );
}
