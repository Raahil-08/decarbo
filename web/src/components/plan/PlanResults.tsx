import { useState, useEffect } from "react";
import { Check, CheckCircle2, AlertTriangle, FileText, Loader2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { formatINR, formatLakh } from "../../lib/format";
import { generatePlanReport, downloadReportFile } from "../../lib/api";
import { PlanLedger } from "./PlanLedger";
import type { PlanLedgerItem } from "./PlanLedger";
import { MaccChart } from "./MaccChart";
import type { MaccItem } from "./MaccChart";
import { PlanExplanationCard } from "./PlanExplanationCard";
import { BudgetFrontierChart } from "./BudgetFrontierChart";
import type { FrontierPoint } from "./BudgetFrontierChart";

export interface PlanData {
  id: string;
  mode: string;
  label: string;
  feasible: boolean;
  message?: string | null;
  duplicate_of?: string | null;
  is_selected: boolean;
  totals: {
    total_capex_inr?: number;
    capex_inr?: number;
    annual_gross_savings_inr?: number;
    annual_savings_inr?: number;
    annual_reduction_tco2e?: number;
    reduction_tco2e?: number;
    reduction_kg?: number;
    reduction_pct?: number;
    payback_years?: number | null;
    payback_months?: number | null;
    baseline_tco2e?: number;
    net_five_year_savings_inr?: number;
    uncertainty?: any;
  };
  uncertainty?: {
    n_samples: number;
    seed: number;
    prob_target_met: number;
    tco2_cut: { p10: number; p50: number; p90: number };
    annual_savings_inr: { p10: number; p50: number; p90: number };
    capex_inr: { p10: number; p50: number; p90: number };
    payback_months: { p10: number | null; p50: number | null; p90: number | null };
  };
  ledger: PlanLedgerItem[];
}

interface PlanResultsProps {
  plans: PlanData[];
  macc: MaccItem[];
  frontier?: FrontierPoint[];
  factoryId?: string;
  targetReductionPct?: number;
  onSelectPlan: (planId: string) => Promise<void>;
}

export function PlanResults({
  plans,
  macc,
  frontier = [],
  factoryId,
  targetReductionPct = 20,
  onSelectPlan,
}: PlanResultsProps) {
  const { t, locale } = useI18n();

  // Helper getters for robust field access across API variations
  const getCapex = (p: PlanData) => p.totals.total_capex_inr ?? p.totals.capex_inr ?? 0;
  const getSavings = (p: PlanData) => p.totals.annual_gross_savings_inr ?? p.totals.annual_savings_inr ?? 0;
  const getReductionTco2e = (p: PlanData) =>
    p.totals.annual_reduction_tco2e ?? p.totals.reduction_tco2e ?? ((p.totals.reduction_kg ?? 0) / 1000);
  const getReductionPct = (p: PlanData) => p.totals.reduction_pct ?? 0;
  const getPaybackYears = (p: PlanData) => {
    if (p.totals.payback_years !== undefined && p.totals.payback_years !== null) return p.totals.payback_years;
    if (p.totals.payback_months !== undefined && p.totals.payback_months !== null) return p.totals.payback_months / 12;
    return null;
  };

  // Find initial selected or default to first plan
  const [activePlanId, setActivePlanId] = useState<string>(() => {
    const selected = plans.find((p) => p.is_selected);
    return selected ? selected.id : plans[0]?.id || "";
  });

  const [isSelecting, setIsSelecting] = useState(false);
  const [activeView, setActiveView] = useState<"ledger" | "macc">("ledger");
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [reportDownloadError, setReportDownloadError] = useState<string | null>(null);

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

  const handleDownloadReport = async () => {
    if (!activePlan) return;
    setIsDownloadingReport(true);
    setReportDownloadError(null);
    try {
      const res = await generatePlanReport(activePlan.id, locale);
      await downloadReportFile(res.report_id, `decarbo_report_${locale}_${activePlan.mode}.pdf`);
    } catch (err: unknown) {
      console.error("Failed to generate/download report:", err);
      setReportDownloadError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setIsDownloadingReport(false);
    }
  };

  // Update MACC items with current active plan's items
  const activeCodes = new Set(activePlan.ledger.map((item) => item.intervention_code));
  const contextualMacc = macc.map((m) => ({
    ...m,
    in_selected_plan: activeCodes.has(m.code),
  }));

  const activeCapex = getCapex(activePlan);
  const activeSavings = getSavings(activePlan);
  const activeReductionTco2e = getReductionTco2e(activePlan);
  const activeReductionPct = getReductionPct(activePlan);
  const activePaybackYears = getPaybackYears(activePlan);

  const normalizedTotals = {
    total_capex_inr: activeCapex,
    annual_gross_savings_inr: activeSavings,
    annual_reduction_tco2e: activeReductionTco2e,
    reduction_pct: activeReductionPct,
    payback_years: activePaybackYears,
    baseline_tco2e: activePlan.totals.baseline_tco2e,
  };

  // Net 5-year savings calculation
  const fiveYearNet =
    activePlan.totals.net_five_year_savings_inr ??
    (activeSavings * 5 - activeCapex);

  return (
    <div className="space-y-6">
      {/* 3 Plan Tabs Header */}
      <div className="bg-white border border-rule rounded-xl p-2 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            const planCapex = getCapex(plan);
            const planReductionPct = getReductionPct(plan);

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
                    {planReductionPct.toFixed(1)}% cut
                  </span>
                  <span className="text-brass font-medium">
                    {planCapex >= 100000 ? formatLakh(planCapex) : formatINR(planCapex)}
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

      {/* Monte Carlo Uncertainty Banner (PRD §13.5) */}
      {(() => {
        const unc = activePlan.uncertainty || (activePlan.totals as any)?.uncertainty;
        if (!unc) return null;
        return (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-leaf/5 border border-leaf/20 rounded-lg text-xs">
            <div className="flex flex-wrap items-center gap-2 text-ink">
              <span className="w-2 h-2 rounded-full bg-leaf shrink-0" />
              <span className="font-semibold text-leaf">
                Cuts {unc.tco2_cut?.p10?.toFixed(1)}–{unc.tco2_cut?.p90?.toFixed(1)} t a year{" "}
                <span className="text-muted font-normal">(most likely {unc.tco2_cut?.p50?.toFixed(1)} t)</span>
              </span>
              <span className="text-rule hidden sm:inline">•</span>
              <span className="font-medium text-ink">
                {Math.round((unc.prob_target_met ?? 1.0) * 100)}% chance of reaching your {targetReductionPct}% target
              </span>
            </div>
            <span className="text-[10px] text-muted font-mono self-start sm:self-auto bg-paper px-2 py-0.5 rounded border border-rule">
              Monte Carlo P10–P90 (N=1,000, seed=42)
            </span>
          </div>
        );
      })()}

      {/* Headline Totals Strip with Large Tabular Numerals (PRD §17.4) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total Investment */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_investment")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-brass mt-1 tracking-tight">
            {activeCapex >= 100000
              ? formatLakh(activeCapex)
              : formatINR(activeCapex)}
          </div>
          <span className="text-[11px] text-muted font-mono mt-0.5 block">
            {formatINR(activeCapex)}
          </span>
          {(() => {
            const unc = activePlan.uncertainty || (activePlan.totals as any)?.uncertainty;
            if (!unc?.capex_inr) return null;
            return (
              <span className="text-[10px] text-muted/80 font-mono mt-1 block">
                P10–P90: {formatINR(unc.capex_inr.p10)} – {formatINR(unc.capex_inr.p90)}
              </span>
            );
          })()}
        </div>

        {/* Annual CO2 Cut */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_co2_cut")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-leaf mt-1 tracking-tight">
            {activeReductionTco2e.toFixed(1)} t
          </div>
          <span className="text-[11px] text-leaf font-bold font-mono mt-0.5 block">
            {activeReductionPct.toFixed(1)}% of footprint
          </span>
          {(() => {
            const unc = activePlan.uncertainty || (activePlan.totals as any)?.uncertainty;
            if (!unc?.tco2_cut) return null;
            return (
              <span className="text-[10px] text-leaf/80 font-mono mt-1 block">
                P10–P90: {unc.tco2_cut.p10.toFixed(1)} – {unc.tco2_cut.p90.toFixed(1)} t
              </span>
            );
          })()}
        </div>

        {/* Annual Savings */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_savings")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-leaf mt-1 tracking-tight">
            {activeSavings >= 100000
              ? formatLakh(activeSavings)
              : formatINR(activeSavings)}
          </div>
          <span className="text-[11px] text-muted font-mono mt-0.5 block">
            +{formatINR(activeSavings)} / yr
          </span>
          {(() => {
            const unc = activePlan.uncertainty || (activePlan.totals as any)?.uncertainty;
            if (!unc?.annual_savings_inr) return null;
            return (
              <span className="text-[10px] text-muted/80 font-mono mt-1 block">
                P10–P90: {formatINR(unc.annual_savings_inr.p10)} – {formatINR(unc.annual_savings_inr.p90)}
              </span>
            );
          })()}
        </div>

        {/* Simple Payback */}
        <div className="bg-white border border-rule rounded-lg p-4 shadow-xs">
          <span className="text-xs font-medium text-muted block">
            {t("plan_headline_payback")}
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-ink mt-1 tracking-tight">
            {activePaybackYears !== null && activePaybackYears !== undefined
              ? `${activePaybackYears.toFixed(1)} yr`
              : "-"}
          </div>
          <span className="text-[11px] text-muted mt-0.5 block">
            {activePaybackYears && activePaybackYears < 1
              ? `~${Math.round(activePaybackYears * 12)} months`
              : "Full capital recovery"}
          </span>
          {(() => {
            const unc = activePlan.uncertainty || (activePlan.totals as any)?.uncertainty;
            if (!unc?.payback_months?.p10) return null;
            return (
              <span className="text-[10px] text-muted/80 font-mono mt-1 block">
                P10–P90: {unc.payback_months.p10.toFixed(1)} – {unc.payback_months.p90.toFixed(1)} mo
              </span>
            );
          })()}
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

      {/* AI Plan Explanation Card */}
      <PlanExplanationCard
        planId={activePlan.id}
        factoryId={factoryId}
        planMode={activePlan.mode}
      />

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
            data-testid="download-report-btn"
            disabled={isDownloadingReport}
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-ink bg-white hover:bg-paper border border-rule transition-colors shadow-xs disabled:opacity-60"
          >
            {isDownloadingReport ? (
              <Loader2 className="w-4 h-4 text-brass animate-spin" />
            ) : (
              <FileText className="w-4 h-4 text-muted" />
            )}
            <span>
              {isDownloadingReport
                ? t("plan_btn_generating_report")
                : t("plan_btn_download_report")}
            </span>
          </button>
        </div>
      </div>

      {reportDownloadError && (
        <div className="p-3 text-xs bg-ember/10 border border-ember/30 rounded-md text-ember flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{reportDownloadError}</span>
        </div>
      )}

      {/* Main Content Area: Ledger or MACC */}
      {activeView === "ledger" ? (
        <div className="space-y-6">
          <PlanLedger
            items={activePlan.ledger}
            totals={normalizedTotals}
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
            totals={normalizedTotals}
            targetReductionPct={targetReductionPct}
          />
        </div>
      )}

      {/* Budget Frontier Step Chart (PRD §13.6) */}
      {frontier && frontier.length > 0 && (
        <div className="pt-4">
          <BudgetFrontierChart
            frontier={frontier}
            userBudgetInr={activeCapex}
            targetReductionPct={targetReductionPct}
          />
        </div>
      )}
    </div>
  );
}
