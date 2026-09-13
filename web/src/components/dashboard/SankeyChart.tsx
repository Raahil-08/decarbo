import { useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Table, BarChart3 } from "lucide-react";
import { formatEmissionsT } from "../../lib/format";
import { useI18n } from "../../lib/i18n";

interface SankeyNode {
  name: string;
  itemStyle?: { color: string };
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyTableRow {
  scope: string;
  category: string;
  activity: string;
  tco2e: number;
  share_pct: number;
}

interface SankeyChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  tableRows: SankeyTableRow[];
  onSelectActivity?: (activityName: string) => void;
}

export function SankeyChart({
  nodes,
  links,
  tableRows,
  onSelectActivity,
}: SankeyChartProps) {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const { t } = useI18n();

  const chartOption = useMemo(() => {
    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
        formatter: (params: any) => {
          if (params.dataType === "edge") {
            return `<div style="font-family: monospace; font-size: 12px; padding: 4px;">
              <b>${params.data.source} → ${params.data.target}</b><br/>
              Emissions: <b>${params.data.value.toFixed(1)} tCO2e</b>
            </div>`;
          }
          return `<div style="font-family: monospace; font-size: 12px; padding: 4px;">
            <b>${params.name}</b>: ${params.value ? params.value.toFixed(1) + " tCO2e" : ""}
          </div>`;
        },
      },
      series: [
        {
          type: "sankey",
          layout: "none",
          emphasis: {
            focus: "adjacency",
          },
          data: nodes,
          links: links,
          orient: "horizontal",
          nodeWidth: 16,
          nodeGap: 14,
          draggable: true,
          label: {
            position: "right",
            color: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#F7F8FA" : "#1D2A45",
            fontSize: 11,
            fontFamily: "IBM Plex Sans, sans-serif",
            fontWeight: 500,
          },
          lineStyle: {
            color: "gradient",
            curveness: 0.5,
            opacity: 0.35,
          },
        },
      ],
    };
  }, [nodes, links]);

  return (
    <div className="bg-white/90 dark:bg-[#0c101a]/90 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl p-6 shadow-sm space-y-4 relative overflow-hidden">
      {/* Corner Tech Accents */}
      <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-leaf/40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-leaf/40 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-leaf/40 pointer-events-none" />

      {/* Header with Title and "View as table" toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-rule pb-3">
        <div>
          <h3 className="text-base font-bold text-ink tracking-tight flex items-center">
            <span>Carbon Flow Analysis</span>
            <span className="ml-2 text-xs font-mono font-normal text-muted bg-paper px-2 py-0.5 rounded border border-rule">
              Scope → Category → Activity
            </span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Interactive Sankey mapping factory emissions from origin pools to operational processes
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={() => setViewMode(viewMode === "chart" ? "table" : "chart")}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-paper text-ink border border-rule hover:border-ink transition-colors shadow-xs"
          >
            {viewMode === "chart" ? (
              <>
                <Table className="w-3.5 h-3.5 mr-1.5 text-muted" />
                <span>{t("view_table")}</span>
              </>
            ) : (
              <>
                <BarChart3 className="w-3.5 h-3.5 mr-1.5 text-leaf" />
                <span>{t("view_chart")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content: Either ECharts Sankey or Accessible Table */}
      {viewMode === "chart" ? (
        nodes.length === 0 ? (
          <div className="py-20 text-center text-xs text-muted">
            No emission flows available yet.
          </div>
        ) : (
          <div className="w-full h-[380px]">
            <ReactECharts
              option={chartOption}
              style={{ height: "100%", width: "100%" }}
              onEvents={{
                click: (params: any) => {
                  if (onSelectActivity && params.name) {
                    onSelectActivity(params.name);
                  }
                },
              }}
            />
          </div>
        )
      ) : (
        /* Accessible Table View */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-paper/80 border-b border-rule font-medium text-muted">
                <th className="py-2.5 px-3">Scope</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Activity</th>
                <th className="py-2.5 px-3 text-right">Emissions (tCO2e)</th>
                <th className="py-2.5 px-3 text-right">Share of Total</th>
                <th className="py-2.5 px-3 text-center">Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {tableRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-paper/30 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-medium text-ink whitespace-nowrap">
                    {row.scope}
                  </td>
                  <td className="py-2.5 px-3 text-muted">{row.category}</td>
                  <td className="py-2.5 px-3 font-medium text-ink">{row.activity}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ember whitespace-nowrap">
                    {formatEmissionsT(row.tco2e * 1000.0)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink whitespace-nowrap">
                    {row.share_pct.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => onSelectActivity && onSelectActivity(row.activity)}
                      className="text-[11px] text-leaf hover:text-ink font-medium underline decoration-dotted"
                    >
                      Audit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
