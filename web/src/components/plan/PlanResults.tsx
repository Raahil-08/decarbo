import { useState, useEffect } from "react";
import { Check, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { formatINR, formatLakh } from "../../lib/format";
import { PlanLedger } from "./PlanLedger";
import type { PlanLedgerItem } from "./PlanLedger";
import { MaccChart } from "./MaccChart";
import type { MaccItem } from "./MaccChart";

export interface PlanData {
  id: string;
  mode: string;
  label: string;
  feasible: boolean;
  message?: string | null;
  duplicate_of?: string | null;
  is_selected: boolean;
  totals: {
    total_capex_inr: number;
    annual_gross_savings_inr: number;
    annual_reduction_tco2e: number;
    reduction_pct: number;
    payback_years?: number | null;
    baseline_tco2e?: number;
    net_five_year_savings_inr?: number;
  };
  ledger: PlanLedgerItem[];
}

interface PlanResultsProps {
  plans: PlanData[];
  macc: MaccItem[];
  factoryId?: string;
  targetReductionPct?: number;
  onSelectPlan: (planId: string) => Promise<void>;
}

export function PlanResults({
  plans,
  macc,
  targetReductionPct = 20,
  onSelectPlan,
}: PlanResultsProps) {

  const { t } = useI18n();

  // Find initial selected or default to first plan
  const [activePlanId, setActivePlanId] = useState<string>(() => {
    const selected = plans.find((p) => p.is_selected);
    return selected ? selected.id : plans[0]?.id || "";
  });

  const [isSelecting, setIsSelecting] = useState(false);
  const [activeView, setActiveView] = useState<"ledger" | "macc">("ledger");

  // Keep activePlanId updated if plans change
  useEffect(() => {
    if (plans.length > 0 && !plans.some((p) => p.id === activePlanId)) {
      const selected = plans.find((p) => p.is_selected);
      setActivePlanId(selected ? selected.id : plans[0].id);
    }
  }, [plans, activePlanId]);

  const activePlan = plans.find((p) => p.id === activePlanId) || plans[0];

  if (!activePlan) return null;

  const handleChoosePlan = async () => {
    setIsSelecting(true);
    try {
      await onSelectPlan(activePlan.id);
    } finally {
      setIsSelecting(false);
    }
  };

  // Update MACC items with current active plan's items
  const activeCodes = new Set(activePlan.ledger.map((item) => item.intervention_code));
  const contextualMacc = macc.map((m) => ({
    ...m,
    in_selected_plan: activeCodes.has(m.code),
  }));

  // Net 5-year savings calculation
  const fiveYearNet =
    activePlan.totals.net_five_year_savings_inr ??
    activePlan.totals.annual_gross_savings_inr * 5 - activePlan.totals.total_capex_inr;

  return (
    <div className="space-y-6">
      {/* 3 Plan Tabs Header */}
      <div className="bg-white border border-rule rounded-xl p-2 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setActivePlanId(plan.id)}
                className={`relative flex flex-col p-3.5 text-left rounded-lg transition-all border ${
                  isActive
                    ? "bg-paper border-ink shadow-xs"
                    : "bg-white border-transparent hover:bg-paper/60"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                    {plan.mode === "best_value" && (
                      <span className="w-2 h-2 rounded-full bg-leaf" />
                    )}
                    {plan.mode === "min_capex_for_target" && (
                      <span className="w-2 h-2 rounded-full bg-brass" />
                    )}
                    {plan.mode === "max_reduction_in_budget" && (
                      <span className="w-2 h-2 rounded-full bg-ink" />
                    )}
                    {plan.label}
                  </span>
                  {plan.is_selected && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-leaf/15 text-leaf border border-leaf/30">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  )}
                </div>

                {/* Subtitle / summary metric */}
                <div className="flex items-center justify-between text-xs font-mono mt-1">
                  <span className="text-leaf font-bold">
                    {plan.totals.reduction_pct.toFixed(1)}% cut
                  </span>
                  <span className="text-brass font-medium">
                    {plan.totals.total_capex_inr >= 100000
                      ? formatLakh(plan.totals.total_capex_inr)
                      : formatINR(plan.totals.total_capex_inr)}
                  </span>
                </div>

                {/* Duplicate / Shortfall pill */}
                {plan.duplicate_of && (
                  <div className="mt-2 text-[10px] text-muted italic line-clamp-1">
                    Matches {plan.duplicate_of.replace(/_/g, " ")}
                  </div>
                )}
                {!plan.feasible && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-ember font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    Budget Shortfall
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shortfall or Duplicate Alert Banner */}
      {activePlan.message && (
        <div className="p-4 rounded-lg bg-brass/10 border border-brass/25 text-xs text-ink flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-brass shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{activePlan.message}</span>
            {!activePlan.feasible && (
              <p className="text-muted text-[11px] mt-0.5">
                The requested reduction target exceeds the specified budget. Showing the maximum
                reduction achievable within this investment ceiling.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Headline Totals Strip with Large Tabular Numerals (PRD §17.4) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total Investment */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_investment")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-brass mt-1 tracking-tight">
            {activePlan.totals.total_capex_inr >= 100000
              ? formatLakh(activePlan.totals.total_capex_inr)
              : formatINR(activePlan.totals.total_capex_inr)}
          </div>
          <span className="text-[11px] text-muted font-mono mt-0.5 block">
            {formatINR(activePlan.totals.total_capex_inr)}
          </span>
        </div>

        {/* Annual CO2 Cut */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_co2_cut")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-leaf mt-1 tracking-tight">
            {activePlan.totals.annual_reduction_tco2e.toFixed(1)} t
          </div>
          <span className="text-[11px] text-leaf font-bold font-mono mt-0.5 block">
            {activePlan.totals.reduction_pct.toFixed(1)}% of footprint
          </span>
        </div>

        {/* Annual Savings */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_savings")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-leaf mt-1 tracking-tight">
            {activePlan.totals.annual_gross_savings_inr >= 100000
              ? formatLakh(activePlan.totals.annual_gross_savings_inr)
              : formatINR(activePlan.totals.annual_gross_savings_inr)}
          </div>
          <span className="text-[11px] text-muted font-mono mt-0.5 block">
            +{formatINR(activePlan.totals.annual_gross_savings_inr)} / yr
          </span>
        </div>

        {/* Simple Payback */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_payback")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-ink mt-1 tracking-tight">
            {activePlan.totals.payback_years !== null && activePlan.totals.payback_years !== undefined
              ? `${activePlan.totals.payback_years.toFixed(1)} yr`
              : "-"}
          </div>
          <span className="text-[11px] text-muted mt-0.5 block">
            {activePlan.totals.payback_years && activePlan.totals.payback_years < 1
              ? `~${Math.round(activePlan.totals.payback_years * 12)} months`
              : "Full capital recovery"}
          </span>
        </div>

        {/* 5-Year Net ROI */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs col-span-2 sm:col-span-1">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_5yr_net")}
          </span>
          <div className={`text-xl sm:text-2xl font-bold font-mono mt-1 tracking-tight ${
            fiveYearNet >= 0 ? "text-leaf" : "text-ember"
          }`}>
            {fiveYearNet >= 100000 ? formatLakh(fiveYearNet) : formatINR(fiveYearNet)}
          </div>
          <span className="text-[11px] text-muted font-mono mt-0.5 block">
            Net cumulative return
          </span>
        </div>
      </div>

      {/* Action Bar & Section Nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        {/* View switcher between Ledger & MACC */}
        <div className="inline-flex rounded-lg border border-rule bg-paper p-1 self-start">
          <button
            type="button"
            onClick={() => setActiveView("ledger")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeView === "ledger"
                ? "bg-white text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            {t("plan_ledger_title")}
          </button>
          <button
            type="button"
            onClick={() => setActiveView("macc")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeView === "macc"
                ? "bg-white text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            {t("macc_chart_title")}
          </button>
        </div>

        {/* Actions: Choose this plan & Download report */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {activePlan.is_selected ? (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-leaf/10 text-leaf border border-leaf/30">
              <CheckCircle2 className="w-4 h-4" />
              <span>{t("plan_badge_selected")}</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isSelecting}
              onClick={handleChoosePlan}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold text-white bg-ink hover:bg-ink/90 shadow-xs transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4 text-brass" />
              <span>{isSelecting ? "Saving..." : t("plan_btn_choose")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              alert("PDF Report generator (Phase 9) will export this plan ledger in English/Gujarati.");
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-ink bg-white hover:bg-paper border border-rule transition-colors shadow-xs"
          >
            <FileText className="w-4 h-4 text-muted" />
            <span>{t("plan_btn_download_report")}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Ledger or MACC */}
      {activeView === "ledger" ? (
        <div className="space-y-6">
          <PlanLedger
            items={activePlan.ledger}
            totals={activePlan.totals}
            targetReductionPct={targetReductionPct}
          />
          {/* Also include MACC below the ledger for complete view */}
          <MaccChart items={contextualMacc} />
        </div>
      ) : (
        <div className="space-y-6">
          <MaccChart items={contextualMacc} />
          <PlanLedger
            items={activePlan.ledger}
            totals={activePlan.totals}
            targetReductionPct={targetReductionPct}
          />
        </div>
      )}
    </div>
  );
}
