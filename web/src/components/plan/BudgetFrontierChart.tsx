import { useState } from "react";
import ReactECharts from "echarts-for-react";
import { TrendingUp, Table as TableIcon } from "lucide-react";
import { formatINR, formatLakh } from "../../lib/format";

export interface FrontierPoint {
  budget_inr: number;
  capex_inr: number;
  reduction_pct: number;
  annual_savings_inr: number;
  tco2_cut: number;
  is_user_budget: boolean;
}

interface BudgetFrontierChartProps {
  frontier: FrontierPoint[];
  userBudgetInr?: number;
  targetReductionPct?: number;
}

export function BudgetFrontierChart({
  frontier,
  userBudgetInr = 1000000,
  targetReductionPct = 20,
}: BudgetFrontierChartProps) {
  const [showTable, setShowTable] = useState(false);

  if (!frontier || frontier.length === 0) {
    return null;
  }

  // Sort by budget
  const sortedPoints = [...frontier].sort((a, b) => a.budget_inr - b.budget_inr);

  const xData = sortedPoints.map((p) =>
    p.budget_inr >= 100000 ? formatLakh(p.budget_inr) : formatINR(p.budget_inr)
  );
  const yData = sortedPoints.map((p) => p.reduction_pct);

  // ECharts Option
  const option = {
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1D2A45",
      borderColor: "#2D7A57",
      textStyle: { color: "#F7F8FA", fontFamily: "IBM Plex Sans, sans-serif", fontSize: 12 },
      formatter: (params: any) => {
        if (!params || params.length === 0) return "";
        const idx = params[0].dataIndex;
        const pt = sortedPoints[idx];
        const isCurrent = pt.is_user_budget;

        return `
          <div style="font-size:12px; line-height: 1.5;">
            <div style="font-weight:700; color:${isCurrent ? "#A97A2B" : "#F7F8FA"}; margin-bottom:4px;">
              ${isCurrent ? "★ " : ""}Budget: ${formatINR(pt.budget_inr)} ${isCurrent ? "(Your Budget)" : ""}
            </div>
            <div>CO₂ Cut: <span style="font-weight:700; color:#2D7A57">${pt.reduction_pct.toFixed(1)}%</span> (${pt.tco2_cut.toFixed(1)} t)</div>
            <div>Capex Required: <span style="font-weight:700; font-family:monospace">${formatINR(pt.capex_inr)}</span></div>
            <div>Annual Savings: <span style="font-weight:700; color:#2D7A57; font-family:monospace">${formatINR(pt.annual_savings_inr)} / yr</span></div>
          </div>
        `;
      },
    },
    grid: {
      left: "4%",
      right: "4%",
      bottom: "10%",
      top: "14%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: xData,
      axisLabel: {
        fontSize: 11,
        color: "#5A6478",
        fontFamily: "IBM Plex Sans, sans-serif",
      },
      axisLine: { lineStyle: { color: "#D6DAE1" } },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: "value",
      name: "CO₂ Cut (%)",
      nameTextStyle: { color: "#5A6478", fontSize: 11, padding: [0, 0, 4, 0] },
      axisLabel: {
        formatter: "{value}%",
        fontSize: 11,
        color: "#5A6478",
        fontFamily: "IBM Plex Sans, sans-serif",
      },
      splitLine: { lineStyle: { color: "#F0F2F5", type: "dashed" } },
    },
    series: [
      {
        name: "Reduction Frontier",
        type: "line",
        step: "end",
        data: yData,
        itemStyle: { color: "#2D7A57" },
        lineStyle: { width: 3, color: "#2D7A57" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(45, 122, 87, 0.25)" },
              { offset: 1, color: "rgba(45, 122, 87, 0.02)" },
            ],
          },
        },
        markLine: targetReductionPct
          ? {
              symbol: "none",
              data: [
                {
                  yAxis: targetReductionPct,
                  lineStyle: { color: "#B5432C", type: "dashed", width: 1.5 },
                  label: {
                    formatter: `Target (${targetReductionPct}%)`,
                    position: "insideEndTop",
                    color: "#B5432C",
                    fontSize: 10,
                    fontFamily: "IBM Plex Sans, sans-serif",
                  },
                },
              ],
            }
          : undefined,
        markPoint: {
          symbol: "circle",
          symbolSize: 10,
          itemStyle: { color: "#A97A2B", borderColor: "#FFFFFF", borderWidth: 2 },
          data: sortedPoints
            .filter((p) => p.is_user_budget)
            .map((p) => ({
              coord: [
                p.budget_inr >= 100000 ? formatLakh(p.budget_inr) : formatINR(p.budget_inr),
                p.reduction_pct,
              ],
              label: {
                show: true,
                formatter: "Your budget",
                position: "top",
                color: "#A97A2B",
                fontWeight: "bold",
                fontSize: 10,
              },
            })),
        },
      },
    ],
  };

  return (
    <div className="bg-white border border-rule rounded-xl p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-rule">
        <div>
          <h3 className="text-sm font-bold text-ink uppercase tracking-wider font-mono flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-leaf" />
            What More Budget Buys (Budget Frontier)
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Marginal decarbonisation frontier solved across 0% to 150% of your ₹
            {formatINR(userBudgetInr)} budget
          </p>
        </div>

        {/* View as Table toggle button (Decarbo WCAG rule) */}
        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rule text-xs font-semibold text-ink bg-paper hover:bg-white transition-colors self-start sm:self-auto"
        >
          <TableIcon className="w-3.5 h-3.5 text-muted" />
          {showTable ? "View as chart" : "View as table"}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-rule bg-paper text-muted uppercase text-[11px]">
                <th className="py-2.5 px-3">Budget Level</th>
                <th className="py-2.5 px-3 text-right">Capex Used</th>
                <th className="py-2.5 px-3 text-right">Reduction (%)</th>
                <th className="py-2.5 px-3 text-right">CO₂ Cut (t/yr)</th>
                <th className="py-2.5 px-3 text-right">Annual Savings</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {sortedPoints.map((pt, idx) => (
                <tr
                  key={idx}
                  className={pt.is_user_budget ? "bg-amber-50/50 font-bold" : "hover:bg-paper/50"}
                >
                  <td className="py-2 px-3 text-ink">
                    {formatINR(pt.budget_inr)}{" "}
                    {pt.budget_inr >= 100000 && (
                      <span className="text-muted text-[10px]">({formatLakh(pt.budget_inr)})</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-muted">{formatINR(pt.capex_inr)}</td>
                  <td className="py-2 px-3 text-right text-leaf font-bold">
                    {pt.reduction_pct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right text-ink">{pt.tco2_cut.toFixed(1)} t</td>
                  <td className="py-2 px-3 text-right text-leaf">
                    +{formatINR(pt.annual_savings_inr)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {pt.is_user_budget && (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-brass/20 text-brass">
                        Selected
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
        </div>
      )}
    </div>
  );
}
