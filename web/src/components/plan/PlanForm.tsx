import React, { useState } from "react";
import { Sliders, ChevronDown, ChevronUp, Sparkles, AlertCircle, IndianRupee } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { formatINR, formatLakh, parseIndianCurrency } from "../../lib/format";

export interface PlanFormParams {
  budget_inr: number;
  target_reduction_pct?: number;
  horizon_months: number;
  max_payback_months?: number;
  max_difficulty?: number;
  weights?: Record<string, number>;
}

interface PlanFormProps {
  onSubmit: (params: PlanFormParams) => void;
  isLoading: boolean;
  initialBudget?: number;
  initialTarget?: number;
}

export function PlanForm({
  onSubmit,
  isLoading,
  initialBudget = 1000000,
  initialTarget = 20,
}: PlanFormProps) {
  const { t } = useI18n();

  const [budgetString, setBudgetString] = useState(
    initialBudget >= 100000 ? `${initialBudget / 100000} L` : initialBudget.toString()
  );
  const [targetPct, setTargetPct] = useState<number>(initialTarget);
  const [hasTarget, setHasTarget] = useState<boolean>(true);
  const [horizonMonths, setHorizonMonths] = useState<number>(24);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Advanced options
  const [maxPayback, setMaxPayback] = useState<string>("");
  const [maxDifficulty, setMaxDifficulty] = useState<string>("3");
  const [weightCapex, setWeightCapex] = useState<number>(1.0);
  const [weightSavings, setWeightSavings] = useState<number>(1.0);
  const [weightCarbon, setWeightCarbon] = useState<number>(1.0);

  const parsedBudget = parseIndianCurrency(budgetString);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedBudget <= 0) return;

    const params: PlanFormParams = {
      budget_inr: parsedBudget,
      target_reduction_pct: hasTarget ? targetPct : undefined,
      horizon_months: horizonMonths,
      max_payback_months: maxPayback ? parseFloat(maxPayback) : undefined,
      max_difficulty: maxDifficulty ? parseInt(maxDifficulty, 10) : undefined,
      weights: {
        capex: weightCapex,
        savings: weightSavings,
        carbon: weightCarbon,
      },
    };
    onSubmit(params);
  };

  return (
    <div className="bg-white border border-rule rounded-xl p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 pb-4 border-b border-rule">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Sliders className="w-5 h-5 text-brass" />
            {t("plan_planner_title")}
          </h2>
          <p className="text-xs text-muted mt-0.5">{t("plan_planner_subtitle")}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-leaf/10 text-leaf border border-leaf/20 self-start sm:self-auto">
          <Sparkles className="w-3.5 h-3.5" />
          <span>MILP SCIP Optimizer</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Budget Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="budget-input" className="text-xs font-semibold text-ink">
                {t("plan_form_budget_label")}
              </label>
              {parsedBudget > 0 && (
                <span className="text-xs font-mono font-medium text-brass bg-brass/10 px-2 py-0.5 rounded">
                  {parsedBudget >= 100000 ? formatLakh(parsedBudget) : formatINR(parsedBudget)}
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                <IndianRupee className="w-4 h-4" />
              </div>
              <input
                id="budget-input"
                type="text"
                value={budgetString}
                onChange={(e) => setBudgetString(e.target.value)}
                placeholder={t("plan_form_budget_placeholder")}
                className="w-full pl-9 pr-3 py-2 text-sm border border-rule rounded-md shadow-xs bg-white text-ink font-mono focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink"
                required
              />
            </div>
            <p className="text-[11px] text-muted">
              Accepts Indian shorthand, e.g. <span className="font-mono">10 L</span>,{" "}
              <span className="font-mono">25,00,000</span>, or <span className="font-mono">1.5 Cr</span>.
            </p>
          </div>

          {/* Target Reduction % Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="target-slider" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <span>{t("plan_form_target_label")}</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-muted flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasTarget}
                    onChange={(e) => setHasTarget(e.target.checked)}
                    className="rounded border-rule text-ink focus:ring-ink w-3.5 h-3.5"
                  />
                  <span>Active</span>
                </label>
                {hasTarget && (
                  <span className="text-xs font-mono font-bold text-leaf bg-leaf/10 px-2 py-0.5 rounded">
                    {targetPct}%
                  </span>
                )}
              </div>
            </div>
            <input
              id="target-slider"
              type="range"
              min="5"
              max="60"
              step="5"
              disabled={!hasTarget}
              value={targetPct}
              onChange={(e) => setTargetPct(parseInt(e.target.value, 10))}
              className={`w-full accent-leaf cursor-pointer mt-2 ${
                !hasTarget ? "opacity-40 cursor-not-allowed" : ""
              }`}
            />
            <div className="flex justify-between text-[10px] text-muted font-mono">
              <span>5%</span>
              <span>20% (Recommended)</span>
              <span>40%</span>
              <span>60%</span>
            </div>
          </div>

          {/* Planning Horizon */}
          <div className="space-y-1.5">
            <label htmlFor="horizon-select" className="text-xs font-semibold text-ink">
              {t("plan_form_horizon_label")}
            </label>
            <select
              id="horizon-select"
              value={horizonMonths}
              onChange={(e) => setHorizonMonths(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 text-sm border border-rule rounded-md shadow-xs bg-white text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink"
            >
              <option value={12}>12 {t("months")} (1 {t("years")})</option>
              <option value={24}>24 {t("months")} (2 {t("years")} - Standard)</option>
              <option value={36}>36 {t("months")} (3 {t("years")})</option>
              <option value={60}>60 {t("months")} (5 {t("years")})</option>
            </select>
            <p className="text-[11px] text-muted">
              Used for payback constraints and multi-year savings projections.
            </p>
          </div>
        </div>

        {/* Collapsible Advanced Parameters */}
        <div className="border-t border-rule pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-medium text-ink hover:text-ink/80 transition-colors focus:outline-none"
          >
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4 text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted" />
            )}
            <span>{t("plan_form_advanced_title")}</span>
          </button>

          {showAdvanced && (
            <div className="mt-4 p-4 bg-paper rounded-lg border border-rule grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-in fade-in duration-150">
              {/* Max Payback Filter */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink">
                  {t("plan_form_max_payback")}
                </label>
                <select
                  value={maxPayback}
                  onChange={(e) => setMaxPayback(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-rule rounded bg-white text-ink"
                >
                  <option value="">No limit</option>
                  <option value="12">≤ 12 months (1 yr)</option>
                  <option value="24">≤ 24 months (2 yrs)</option>
                  <option value="36">≤ 36 months (3 yrs)</option>
                  <option value="48">≤ 48 months (4 yrs)</option>
                </select>
              </div>

              {/* Max Difficulty Filter */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink">
                  {t("plan_form_max_difficulty")}
                </label>
                <select
                  value={maxDifficulty}
                  onChange={(e) => setMaxDifficulty(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-rule rounded bg-white text-ink"
                >
                  <option value="3">{t("plan_difficulty_any")}</option>
                  <option value="1">{t("plan_difficulty_1")}</option>
                  <option value="2">{t("plan_difficulty_2")}</option>
                </select>
              </div>

              {/* Priority Sliders */}
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-medium text-ink block">
                  Optimizer Priorities (Objective Weights)
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{t("plan_priority_carbon")}</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.25"
                      value={weightCarbon}
                      onChange={(e) => setWeightCarbon(parseFloat(e.target.value))}
                      className="w-24 accent-leaf"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{t("plan_priority_savings")}</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.25"
                      value={weightSavings}
                      onChange={(e) => setWeightSavings(parseFloat(e.target.value))}
                      className="w-24 accent-leaf"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{t("plan_priority_capex")}</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.25"
                      value={weightCapex}
                      onChange={(e) => setWeightCapex(parseFloat(e.target.value))}
                      className="w-24 accent-brass"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {parsedBudget <= 0 && (
            <span className="text-xs text-ember flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Please enter a valid budget amount
            </span>
          )}
          <button
            type="submit"
            disabled={isLoading || parsedBudget <= 0}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-md text-sm font-semibold text-white bg-ink hover:bg-ink/90 disabled:opacity-50 shadow-xs transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                {t("plan_btn_generating")}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brass" />
                {t("plan_btn_generate")}
              </span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
