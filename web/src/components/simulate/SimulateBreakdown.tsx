import { useState } from "react";
import { Table, BarChart2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";

export interface CategoryBreakdown {
  category: string;
  before_kgco2e: number;
  after_kgco2e: number;
}

interface BreakdownProps {
  baselineTco2e: number;
  afterTco2e: number;
  byCategory: CategoryBreakdown[];
}

export function SimulateBreakdown({
  baselineTco2e,
  afterTco2e,
  byCategory = [],
}: BreakdownProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<"visual" | "table">("visual");

  const getCategoryLabel = (cat: string) => {
    switch (cat.toLowerCase()) {
      case "electricity":
        return t("pool_electricity");
      case "fuel":
        return t("pool_fuel");
      case "material":
        return t("pool_brass_rod");
      case "transport":
        return "Logistics & Freight";
      case "waste":
        return "Waste & By-products";
      default:
        return cat.charAt(0).toUpperCase() + cat.slice(1);
    }
  };

  // Convert kgCO2e to tCO2e for display (PRD: store kgCO2e, display tCO2e with 1 decimal)
  const categoryRows = byCategory.map((c) => {
    const beforeT = c.before_kgco2e / 1000.0;
    const afterT = c.after_kgco2e / 1000.0;
    const cutT = Math.max(0, beforeT - afterT);
    const cutPct = beforeT > 0 ? (cutT / beforeT) * 100 : 0;
    return {
      category: c.category,
      label: getCategoryLabel(c.category),
      beforeT,
      afterT,
      cutT,
      cutPct,
    };
  });

  // Calculate Scopes from categories
  // Scope 1: Fuel
  const fuelCat = categoryRows.find((c) => c.category === "fuel");
  const s1Before = fuelCat?.beforeT || 0;
  const s1After = fuelCat?.afterT || 0;

  // Scope 2: Electricity
  const elecCat = categoryRows.find((c) => c.category === "electricity");
  const s2Before = elecCat?.beforeT || 0;
  const s2After = elecCat?.afterT || 0;

  // Scope 3: Material, Transport, Waste
  const s3Before = categoryRows
    .filter((c) => ["material", "transport", "waste"].includes(c.category))
    .reduce((acc, c) => acc + c.beforeT, 0);
  const s3After = categoryRows
    .filter((c) => ["material", "transport", "waste"].includes(c.category))
    .reduce((acc, c) => acc + c.afterT, 0);

  const scopes = [
    {
      id: "scope1",
      label: t("scope_1"),
      before: s1Before,
      after: s1After,
      color: "bg-ember",
    },
    {
      id: "scope2",
      label: t("scope_2"),
      before: s2Before,
      after: s2After,
      color: "bg-brass",
    },
    {
      id: "scope3",
      label: t("scope_3"),
      before: s3Before,
      after: s3After,
      color: "bg-leaf",
    },
  ];

  const totalCutT = Math.max(0, baselineTco2e - afterTco2e);
  const totalCutPct = baselineTco2e > 0 ? (totalCutT / baselineTco2e) * 100 : 0;

  return (
    <div className="bg-white border border-rule rounded-xl shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-rule bg-paper/40 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
            {t("before_after_title")}
          </h2>
          <p className="text-xs text-muted mt-0.5">{t("before_after_subtitle")}</p>
        </div>

        <button
          type="button"
          onClick={() => setViewMode(viewMode === "visual" ? "table" : "visual")}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-ink bg-white hover:bg-paper rounded-md border border-rule transition-colors shadow-2xs"
        >
          {viewMode === "visual" ? (
            <>
              <Table className="w-3.5 h-3.5 text-muted" />
              <span>{t("view_table")}</span>
            </>
          ) : (
            <>
              <BarChart2 className="w-3.5 h-3.5 text-muted" />
              <span>Visual Bars</span>
            </>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-5">
        {viewMode === "visual" ? (
          <div className="space-y-6">
            {/* Scopes Visual Comparison */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                GHG Protocol Scopes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {scopes.map((s) => {
                  const cut = Math.max(0, s.before - s.after);
                  const pct = s.before > 0 ? (cut / s.before) * 100 : 0;
                  return (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-lg border border-rule bg-paper/20 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">{s.label}</span>
                        {pct > 0 && (
                          <span className="font-mono text-leaf font-bold text-[11px]">
                            -{pct.toFixed(1)}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between font-mono text-xs">
                        <span className="text-muted">
                          {s.before.toFixed(1)} →{" "}
                          <span className="text-ink font-bold">{s.after.toFixed(1)}</span>
                        </span>
                        <span className="text-[10px] text-muted">tCO₂e</span>
                      </div>

                      {/* Bar comparison */}
                      <div className="space-y-1">
                        <div className="w-full bg-rule/50 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-muted h-full rounded-full opacity-50"
                            style={{
                              width: `${Math.min(
                                100,
                                (s.before / (baselineTco2e || 1)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="w-full bg-rule/50 h-2 rounded-full overflow-hidden">
                          <div
                            className={`${s.color} h-full rounded-full transition-all duration-300`}
                            style={{
                              width: `${Math.min(
                                100,
                                (s.after / (baselineTco2e || 1)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Categories / Emission Pools Visual Bars */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                Compounded Levers Impact by Category
              </h3>
              <div className="space-y-3">
                {categoryRows.map((cat) => {
                  const maxVal = Math.max(
                    ...categoryRows.map((r) => r.beforeT),
                    1
                  );
                  return (
                    <div
                      key={cat.category}
                      className="p-3 rounded-lg border border-rule bg-white hover:bg-paper/30 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-ink">{cat.label}</span>
                        <div className="flex items-center space-x-2 font-mono text-xs">
                          <span className="text-muted">
                            {cat.beforeT.toFixed(1)} →{" "}
                            <span className="text-ink font-bold">{cat.afterT.toFixed(1)}</span>{" "}
                            tCO₂e
                          </span>
                          {cat.cutPct > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-leaf/10 text-leaf font-bold text-[11px]">
                              -{cat.cutPct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="relative w-full h-2.5 bg-paper rounded-full overflow-hidden border border-rule">
                        <div
                          className="absolute top-0 bottom-0 left-0 bg-muted/40 rounded-full"
                          style={{ width: `${(cat.beforeT / maxVal) * 100}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 left-0 bg-leaf rounded-full transition-all duration-300"
                          style={{ width: `${(cat.afterT / maxVal) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Table View */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-rule text-[11px] font-bold uppercase tracking-wider text-muted">
                  <th className="py-2.5 px-3">Emission Category / Pool</th>
                  <th className="py-2.5 px-3 text-right">Before (tCO₂e)</th>
                  <th className="py-2.5 px-3 text-right">After (tCO₂e)</th>
                  <th className="py-2.5 px-3 text-right text-leaf">Cut (tCO₂e)</th>
                  <th className="py-2.5 px-3 text-right text-leaf">Reduction %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-mono">
                {/* Total Row */}
                <tr className="bg-paper font-bold text-ink">
                  <td className="py-2.5 px-3 font-sans">Total Footprint</td>
                  <td className="py-2.5 px-3 text-right">{baselineTco2e.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right">{afterTco2e.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right text-leaf">{totalCutT.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right text-leaf">{totalCutPct.toFixed(1)}%</td>
                </tr>

                {/* Scopes */}
                {scopes.map((s) => {
                  const cut = Math.max(0, s.before - s.after);
                  const pct = s.before > 0 ? (cut / s.before) * 100 : 0;
                  return (
                    <tr key={s.id} className="hover:bg-paper/30">
                      <td className="py-2 px-3 font-sans text-ink">{s.label}</td>
                      <td className="py-2 px-3 text-right text-muted">{s.before.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right text-ink font-semibold">
                        {s.after.toFixed(1)}
                      </td>
                      <td className="py-2 px-3 text-right text-leaf font-semibold">
                        {cut.toFixed(1)}
                      </td>
                      <td className="py-2 px-3 text-right text-leaf font-semibold">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}

                {/* Categories */}
                {categoryRows.map((cat) => (
                  <tr key={cat.category} className="hover:bg-paper/30">
                    <td className="py-2 px-3 font-sans text-muted pl-6">↳ {cat.label}</td>
                    <td className="py-2 px-3 text-right text-muted">{cat.beforeT.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-ink">{cat.afterT.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-leaf">{cat.cutT.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-leaf">{cat.cutPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
