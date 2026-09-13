import { useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { TrendingDown, Table, BarChart2, CheckCircle2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { formatINR } from "../../lib/format";


export interface MaccItem {
  code: string;
  title_en: string;
  tco2_cut: number;
  cost_per_tonne_inr: number;
  capex_inr: number;
  annual_savings_inr: number;
  payback_months?: number | null;
  cumulative_tco2: number;
  in_selected_plan?: boolean;
}

interface MaccChartProps {
  items: MaccItem[];
}

export function MaccChart({ items }: MaccChartProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

  // Filter out any zero or invalid items and sort by cost_per_tonne_inr ascending
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.cost_per_tonne_inr - b.cost_per_tonne_inr);
  }, [items]);

  const moneySavingCount = useMemo(() => {
    return sortedItems.filter((it) => it.cost_per_tonne_inr < 0).length;
  }, [sortedItems]);

  const chartOption = useMemo(() => {
    if (sortedItems.length === 0) return {};

    const categories = sortedItems.map((item) => {
      return item.title_en.length > 22
        ? `${item.title_en.slice(0, 20)}…`
        : item.title_en;
    });

    const seriesData = sortedItems.map((item) => {
      const isNegative = item.cost_per_tonne_inr < 0;
      const color = isNegative ? "#2D7A57" : "#A97A2B"; // Leaf for negative, Brass for positive
      const isSelected = !!item.in_selected_plan;

      return {
        value: item.cost_per_tonne_inr,
        itemStyle: {
          color,
          borderColor: isSelected ? "#1D2A45" : undefined,
          borderWidth: isSelected ? 2.5 : 0,
          borderRadius: [2, 2, 2, 2],
        },
        rawItem: item,
      };
    });

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#1D2A45",
        borderColor: "#1D2A45",
        textStyle: { color: "#FFFFFF", fontSize: 12 },
        formatter: (params: any) => {
          if (!params || !params[0]) return "";
          const p = params[0];
          const raw: MaccItem = p.data.rawItem;
          const isNegative = raw.cost_per_tonne_inr < 0;

          return `
            <div style="padding: 4px 8px; font-family: sans-serif;">
              <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
                ${raw.title_en} ${raw.in_selected_plan ? '<span style="color:#A97A2B; font-size:11px;">[In Selected Plan]</span>' : ""}
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 4px;">
                <span style="color: #D6DAE1;">Cost / Tonne:</span>
                <span style="font-weight: bold; color: ${isNegative ? "#48bb78" : "#ecc94b"};">
                  ${raw.cost_per_tonne_inr < 0 ? "-" : ""}₹${Math.abs(raw.cost_per_tonne_inr).toLocaleString("en-IN")} / t
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 2px;">
                <span style="color: #D6DAE1;">Annual Cut:</span>
                <span style="font-weight: 600;">${raw.tco2_cut.toFixed(2)} tCO₂e</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 2px;">
                <span style="color: #D6DAE1;">Capex:</span>
                <span style="font-weight: 600;">₹${raw.capex_inr.toLocaleString("en-IN")}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 2px;">
                <span style="color: #D6DAE1;">Annual Savings:</span>
                <span style="font-weight: 600; color: #48bb78;">₹${raw.annual_savings_inr.toLocaleString("en-IN")} / yr</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 2px;">
                <span style="color: #D6DAE1;">Payback:</span>
                <span style="font-weight: 600;">${raw.payback_months ? `~${raw.payback_months.toFixed(1)} months` : "Immediate / Low"}</span>
              </div>
              ${isNegative ? '<div style="margin-top: 6px; font-size: 11px; color: #48bb78; font-weight: 500;">[NET SAVING] Pays for itself over lifetime</div>' : ""}
            </div>
          `;
        },
      },
      grid: {
        top: "14%",
        bottom: "22%",
        left: "4%",
        right: "4%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          interval: 0,
          rotate: 35,
          color: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#8B95A8" : "#5A6478",
          fontSize: 10,
          formatter: (value: string) => {
            return value.length > 15 ? `${value.slice(0, 13)}…` : value;
          },
        },
        axisLine: { lineStyle: { color: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "rgba(255,255,255,0.12)" : "#D6DAE1" } },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: "value",
        name: "₹ / tCO₂e Cut",
        nameTextStyle: {
          color: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#8B95A8" : "#5A6478",
          fontSize: 11,
          align: "left",
        },
        axisLabel: {
          color: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#8B95A8" : "#5A6478",
          fontSize: 10,
          formatter: (val: number) => {
            if (val === 0) return "₹0";
            if (Math.abs(val) >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
            return `₹${(val / 1000).toFixed(0)}k`;
          },
        },
        splitLine: {
          lineStyle: {
            color: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "rgba(255,255,255,0.06)" : "#E2E8F0",
            type: "dashed",
          },
        },
      },
      series: [
        {
          name: "Cost per Tonne",
          type: "bar",
          barWidth: "48%",
          data: seriesData,
          markLine: {
            symbol: ["none", "none"],
            label: {
              show: true,
              position: "end",
              formatter: "Break-even (₹0 / t)",
              color: "#1D2A45",
              fontSize: 10,
              fontWeight: 600,
            },
            lineStyle: {
              color: "#1D2A45",
              type: "solid",
              width: 1.5,
            },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
  }, [sortedItems]);

  return (
    <div className="bg-white border border-rule rounded-xl p-6 shadow-xs">
      {/* MACC Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-rule">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider font-mono">
              {t("macc_chart_title")}
            </h3>
            {moneySavingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-leaf/10 text-leaf border border-leaf/20 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                {moneySavingCount} fixes pay for themselves
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">{t("macc_chart_subtitle")}</p>
        </div>

        {/* Legend & Toggle */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-leaf inline-block" />
              <span className="text-muted text-[11px]">{t("macc_pays_for_itself")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-brass inline-block" />
              <span className="text-muted text-[11px]">{t("macc_positive_cost")}</span>
            </div>
          </div>

          {/* View as Table toggle per PRD §17.3 */}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "chart" ? "table" : "chart")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink bg-paper hover:bg-rule/40 rounded-md border border-rule transition-colors"
          >
            {viewMode === "chart" ? (
              <>
                <Table className="w-3.5 h-3.5 text-muted" />
                <span>{t("macc_view_table")}</span>
              </>
            ) : (
              <>
                <BarChart2 className="w-3.5 h-3.5 text-muted" />
                <span>{t("macc_view_chart")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Chart View */}
      {viewMode === "chart" ? (
        <div className="w-full">
          {sortedItems.length > 0 ? (
            <ReactECharts
              option={chartOption}
              style={{ height: "360px", width: "100%" }}
              opts={{ renderer: "svg" }}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted text-xs">
              No MACC data available.
            </div>
          )}
        </div>
      ) : (
        /* Accessible Table View */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-rule bg-paper text-[11px] text-muted uppercase">
                <th className="py-2.5 px-3">{t("macc_col_fix")}</th>
                <th className="py-2.5 px-3 text-right">{t("macc_col_tco2")}</th>
                <th className="py-2.5 px-3 text-right">{t("macc_col_cpt")}</th>
                <th className="py-2.5 px-3 text-right">{t("macc_col_capex")}</th>
                <th className="py-2.5 px-3 text-right">{t("macc_col_savings")}</th>
                <th className="py-2.5 px-3 text-right">{t("macc_col_payback")}</th>
                <th className="py-2.5 px-3 text-center">{t("macc_col_in_plan")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {sortedItems.map((item) => {
                const isNegative = item.cost_per_tonne_inr < 0;
                return (
                  <tr
                    key={item.code}
                    className={`hover:bg-paper/80 ${
                      item.in_selected_plan ? "bg-brass/5" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans font-medium text-ink">
                      {item.title_en}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-leaf">
                      {item.tco2_cut.toFixed(2)} t
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        isNegative ? "text-leaf" : "text-brass"
                      }`}
                    >
                      {item.cost_per_tonne_inr < 0 ? "-" : ""}
                      {formatINR(Math.abs(item.cost_per_tonne_inr))}
                    </td>
                    <td className="py-2.5 px-3 text-right text-brass">
                      {formatINR(item.capex_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-leaf">
                      +{formatINR(item.annual_savings_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted">
                      {item.payback_months ? `~${item.payback_months.toFixed(1)} mo` : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.in_selected_plan ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-brass">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-muted/60">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
