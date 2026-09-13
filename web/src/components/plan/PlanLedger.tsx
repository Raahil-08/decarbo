import { useState, useMemo, Fragment } from "react";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";

import { useI18n } from "../../lib/i18n";
import { formatINR } from "../../lib/format";


export interface PlanLedgerItem {
  id?: string;
  sequence: number;
  intervention_code: string;
  title_en: string;
  category: string;
  pool: string;
  difficulty: number;
  circularity_points: number;
  level?: any;
  capex_inr: number;
  annual_savings_inr: number;
  reduction_kgco2e: number;
  reduction_tco2e: number;
  payback_months?: number | null;
  cost_per_tonne_inr?: number | null;
  added_grid_kwh?: number;
}

interface PlanLedgerProps {
  items: PlanLedgerItem[];
  totals: {
    total_capex_inr: number;
    annual_gross_savings_inr: number;
    annual_reduction_tco2e: number;
    reduction_pct: number;
    payback_years?: number | null;
    baseline_tco2e?: number;
  };
  targetReductionPct?: number;
}

export function PlanLedger({ items, totals, targetReductionPct = 20 }: PlanLedgerProps) {
  const { t } = useI18n();
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const toggleRow = (seq: number) => {
    setExpandedRows((prev) => ({ ...prev, [seq]: !prev[seq] }));
  };

  // Compute running total cut percentage
  const baselineTotal = totals.baseline_tco2e || (totals.annual_reduction_tco2e > 0 && totals.reduction_pct > 0 
    ? totals.annual_reduction_tco2e / (totals.reduction_pct / 100) 
    : 100);

  const runningItems = useMemo(() => {
    let acc = 0;
    const res: Array<PlanLedgerItem & { runningPct: number }> = [];
    for (let i = 0; i < items.length; i++) {
      acc += items[i].reduction_tco2e;
      const runningPct = baselineTotal > 0 ? (acc / baselineTotal) * 100 : 0;
      res.push({
        ...items[i],
        runningPct: Math.min(100, Math.round(runningPct * 10) / 10),
      });
    }
    return res;
  }, [items, baselineTotal]);



  const getDifficultyBadge = (diff: number) => {
    switch (diff) {
      case 1:
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-leaf/10 text-leaf border border-leaf/20">
            Drop-in
          </span>
        );
      case 2:
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-brass/10 text-brass border border-brass/20">
            Retooling
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-ember/10 text-ember border border-ember/20">
            Process Change
          </span>
        );
    }
  };

  return (
    <div className="bg-white/95 dark:bg-[#0c101a]/95 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl shadow-xs overflow-hidden relative">
      {/* Corner Tech Accents */}
      <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-leaf/40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-leaf/40 pointer-events-none" />

      {/* Ledger Header */}
      <div className="px-6 py-4 border-b border-rule bg-paper/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink uppercase tracking-wider font-mono">
            {t("plan_ledger_title")}
          </h3>
          <p className="text-xs text-muted mt-0.5">{t("plan_ledger_subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-leaf" />
            Compounded Savings
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-brass" />
            Verified Capital
          </span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-rule bg-paper font-mono text-[11px] text-muted uppercase tracking-wider">
              <th className="py-2.5 px-3 w-12 text-center">{t("ledger_col_order")}</th>
              <th className="py-2.5 px-4 min-w-[220px]">{t("ledger_col_fix")}</th>
              <th className="py-2.5 px-4 text-right">{t("ledger_col_capex")}</th>
              <th className="py-2.5 px-4 text-right">{t("ledger_col_savings")}</th>
              <th className="py-2.5 px-4 text-right">{t("ledger_col_cuts")}</th>
              <th className="py-2.5 px-4 text-right">{t("ledger_col_payback")}</th>
              <th className="py-2.5 px-4 min-w-[160px] text-right">{t("ledger_col_running")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/60">
            {runningItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  No interventions in this plan.
                </td>
              </tr>
            ) : (
              runningItems.map((row) => {
                const isExpanded = !!expandedRows[row.sequence];
                return (
                  <Fragment key={row.sequence}>
                    <tr
                      onClick={() => toggleRow(row.sequence)}
                      className={`cursor-pointer transition-colors hover:bg-paper/80 ${
                        isExpanded ? "bg-paper/40" : ""
                      }`}
                    >
                      {/* Order */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-ink">
                        <div className="flex items-center justify-center gap-1">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted" />
                          )}
                          <span>{row.sequence}</span>
                        </div>
                      </td>

                      {/* Fix details */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{row.title_en}</span>
                          {getDifficultyBadge(row.difficulty)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
                          <span className="capitalize">{row.category.replace(/_/g, " ")}</span>
                          <span>•</span>
                          <span className="font-mono text-muted/80">{row.pool}</span>
                          {row.circularity_points > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-leaf font-medium">
                                +{row.circularity_points} circularity pts
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Invest (Capex) */}
                      <td className="py-3 px-4 text-right font-mono font-medium text-brass">
                        {row.capex_inr > 0 ? formatINR(row.capex_inr) : "₹0"}
                      </td>

                      {/* Saves / yr */}
                      <td className="py-3 px-4 text-right font-mono font-medium text-leaf">
                        {row.annual_savings_inr > 0 ? (
                          `+${formatINR(row.annual_savings_inr)}`
                        ) : (
                          "₹0"
                        )}
                      </td>

                      {/* Cuts (tCO2e) */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-leaf">
                        {row.reduction_tco2e.toFixed(1)} t
                      </td>

                      {/* Payback */}
                      <td className="py-3 px-4 text-right font-mono text-muted">
                        {row.payback_months !== null && row.payback_months !== undefined ? (
                          row.payback_months < 12 ? (
                            <span className="text-leaf font-semibold">
                              ~{row.payback_months.toFixed(1)} mo
                            </span>
                          ) : (
                            `${(row.payback_months / 12).toFixed(1)} yr`
                          )
                        ) : (
                          "Immediate"
                        )}
                      </td>

                      {/* Running Cut Progress Bar */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-ink">
                            <span>{row.runningPct.toFixed(1)}%</span>
                            {targetReductionPct && row.runningPct >= targetReductionPct && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-leaf" />
                            )}
                          </div>
                          {/* Visual progress bar filling towards target line */}
                          <div className="w-28 h-1.5 bg-rule/60 rounded-full relative overflow-hidden">
                            <div
                              className="h-full bg-leaf transition-all duration-300"
                              style={{ width: `${Math.min(100, (row.runningPct / 50) * 100)}%` }}
                            />
                            {targetReductionPct && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-ink"
                                style={{ left: `${Math.min(100, (targetReductionPct / 50) * 100)}%` }}
                                title={`Target: ${targetReductionPct}%`}
                              />
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable row detail */}
                    {isExpanded && (
                      <tr className="bg-paper/50 border-b border-rule">
                        <td colSpan={7} className="py-3 px-6 text-xs text-muted space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-3 bg-white border border-rule rounded-sm font-mono text-[11px]">
                            <div>
                              <span className="block text-muted/70 text-[10px] uppercase">
                                Action Level / Configuration
                              </span>
                              <span className="font-semibold text-ink">
                                {typeof row.level === "object" && row.level !== null
                                  ? JSON.stringify(row.level)
                                  : row.level !== null && row.level !== undefined
                                  ? String(row.level)
                                  : "Standard Specification"}
                              </span>
                            </div>
                            <div>
                              <span className="block text-muted/70 text-[10px] uppercase">
                                Marginal Cost / Tonne Cut
                              </span>
                              <span className={`font-semibold ${
                                (row.cost_per_tonne_inr || 0) < 0 ? "text-leaf" : "text-brass"
                              }`}>
                                {row.cost_per_tonne_inr !== null && row.cost_per_tonne_inr !== undefined
                                  ? `${formatINR(row.cost_per_tonne_inr)} / t`
                                  : "Calculated"}
                              </span>
                            </div>
                            <div>
                              <span className="block text-muted/70 text-[10px] uppercase">
                                Added Grid Load
                              </span>
                              <span className="font-semibold text-ink">
                                {row.added_grid_kwh && row.added_grid_kwh > 0
                                  ? `+${row.added_grid_kwh.toLocaleString("en-IN")} kWh`
                                  : "None (Zero)"}
                              </span>
                            </div>
                            <div>
                              <span className="block text-muted/70 text-[10px] uppercase">
                                Carbon Reduction (Precise)
                              </span>
                              <span className="font-semibold text-leaf">
                                {row.reduction_kgco2e.toLocaleString("en-IN")} kgCO₂e
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>

          {/* Double-Ruled Totals Closing Line (PRD §17.4 Accounting Double Underline) */}
          <tfoot>
            <tr className="border-t-2 border-b-4 border-double border-rule dark:border-white/20 bg-paper/80 dark:bg-[#07090e] font-mono text-xs">
              <td className="py-3.5 px-3 text-center font-bold text-ink dark:text-white">∑</td>
              <td className="py-3.5 px-4 font-bold text-ink dark:text-white uppercase tracking-wider">
                {t("ledger_totals_label")}
              </td>
              <td className="py-3.5 px-4 text-right font-bold text-brass text-sm">
                {formatINR(totals.total_capex_inr)}
              </td>
              <td className="py-3.5 px-4 text-right font-bold text-leaf text-sm">
                +{formatINR(totals.annual_gross_savings_inr)}
              </td>
              <td className="py-3.5 px-4 text-right font-bold text-leaf text-sm">
                {totals.annual_reduction_tco2e.toFixed(1)} t
              </td>
              <td className="py-3.5 px-4 text-right font-bold text-ink dark:text-white/80">
                {totals.payback_years !== null && totals.payback_years !== undefined
                  ? `${totals.payback_years.toFixed(1)} yr`
                  : "-"}
              </td>
              <td className="py-3.5 px-4 text-right font-bold text-ink dark:text-white text-sm">
                <span className="text-leaf font-bold">{totals.reduction_pct.toFixed(1)}%</span>
                <span className="text-[10px] text-muted dark:text-white/40 block">cut achieved</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
