import { useState, useEffect, useCallback } from "react";
import { X, AlertTriangle, Wrench, ArrowRight, Table as TableIcon, Activity } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { apiClient } from "../../lib/api";

interface DriftSeriesPoint {
  month: string;
  kwh: number;
  output: number;
  intensity: number;
  is_recent: boolean;
}

interface AnomalyPoint {
  month: string;
  intensity: number;
  z_score: number;
}

interface DriftDataResponse {
  factory_id: string;
  has_drift: boolean;
  drift_pct: number;
  mean_last_intensity?: number;
  mean_prior_intensity?: number;
  message: string;
  anomalies: AnomalyPoint[];
  series: DriftSeriesPoint[];
}

interface DriftDiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  factoryId?: string;
  onGoToPlanner?: () => void;
}

export function DriftDiagnosisModal({
  isOpen,
  onClose,
  factoryId,
  onGoToPlanner,
}: DriftDiagnosisModalProps) {
  const [data, setData] = useState<DriftDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showTable, setShowTable] = useState<boolean>(false);

  const fetchDrift = useCallback(async () => {
    if (!factoryId) return;
    setIsLoading(true);
    try {
      const res = await apiClient<DriftDataResponse>(`/factories/${factoryId}/drift`);
      setData(res);
    } catch (e) {
      console.error("Failed to load drift diagnostic data", e);
    } finally {
      setIsLoading(false);
    }
  }, [factoryId]);

  useEffect(() => {
    if (isOpen && factoryId) {
      fetchDrift();
    }
  }, [isOpen, factoryId, fetchDrift]);

  if (!isOpen) return null;

  const series = data?.series || [];
  const xMonths = series.map((s) => s.month);
  const yIntensities = series.map((s) => s.intensity);
  const meanPrior = data?.mean_prior_intensity || 2100;
  const meanLast = data?.mean_last_intensity || 2400;

  const chartOption = {
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1D2A45",
      borderColor: "#B5432C",
      textStyle: { color: "#F7F8FA", fontFamily: "IBM Plex Sans, sans-serif", fontSize: 12 },
      formatter: (params: any) => {
        if (!params || params.length === 0) return "";
        const idx = params[0].dataIndex;
        const pt = series[idx];
        if (!pt) return "";
        return `
          <div style="font-size:12px; line-height:1.5;">
            <div style="font-weight:700; color:#F7F8FA; margin-bottom:4px;">Month: ${pt.month} ${pt.is_recent ? "(Drift Period)" : ""}</div>
            <div>Electricity Intensity: <span style="font-weight:700; color:${pt.is_recent ? "#B5432C" : "#2D7A57"}">${pt.intensity.toFixed(1)} kWh/t</span></div>
            <div>Grid Consumption: <span style="font-family:monospace">${Math.round(pt.kwh).toLocaleString("en-IN")} kWh</span></div>
            <div>Production Output: <span style="font-family:monospace">${pt.output.toFixed(1)} t</span></div>
          </div>
        `;
      },
    },
    grid: { left: "4%", right: "4%", bottom: "10%", top: "14%", containLabel: true },
    xAxis: {
      type: "category",
      data: xMonths,
      axisLabel: { fontSize: 11, color: "#5A6478", fontFamily: "IBM Plex Sans, sans-serif" },
      axisLine: { lineStyle: { color: "#D6DAE1" } },
    },
    yAxis: {
      type: "value",
      name: "kWh / t Output",
      nameTextStyle: { color: "#5A6478", fontSize: 11 },
      axisLabel: { fontSize: 11, color: "#5A6478", fontFamily: "IBM Plex Sans, sans-serif" },
      splitLine: { lineStyle: { color: "#F0F2F5", type: "dashed" } },
    },
    series: [
      {
        name: "Electricity Intensity",
        type: "line",
        smooth: true,
        data: yIntensities,
        itemStyle: {
          color: (param: any) => (series[param.dataIndex]?.is_recent ? "#B5432C" : "#2D7A57"),
        },
        lineStyle: { width: 2.5, color: "#B5432C" },
        markLine: {
          symbol: "none",
          data: [
            {
              yAxis: meanPrior,
              lineStyle: { color: "#2D7A57", type: "dashed", width: 1.5 },
              label: {
                formatter: `Baseline Mean (${meanPrior.toFixed(0)} kWh/t)`,
                position: "insideStartTop",
                color: "#2D7A57",
                fontSize: 10,
              },
            },
            {
              yAxis: meanLast,
              lineStyle: { color: "#B5432C", type: "dashed", width: 1.5 },
              label: {
                formatter: `Last 3 Mo Mean (${meanLast.toFixed(0)} kWh/t)`,
                position: "insideEndTop",
                color: "#B5432C",
                fontSize: 10,
              },
            },
          ],
        },
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-rule rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-rule bg-paper/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-ember/10 text-ember">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">Energy Intensity Drift Diagnosis</h3>
              <p className="text-xs text-muted">PRD §11.2 12-Month Moving Baseline Anomaly Analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="py-12 text-center text-muted text-xs space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-ember border-t-transparent mx-auto" />
              <p>Analyzing 12-month energy intensity drift...</p>
            </div>
          ) : (
            <>
              {/* Drift Headline Alert */}
              <div className="bg-ember/5 border border-ember/30 rounded-xl p-4 flex items-start gap-3">
                <Activity className="w-5 h-5 text-ember shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ember uppercase tracking-wider">
                      +{((data?.drift_pct || 0.14) * 100).toFixed(1)}% Intensity Increase
                    </span>
                    <span className="text-[10px] font-mono bg-ember text-white px-1.5 py-0.2 rounded font-bold">
                      Flagged
                    </span>
                  </div>
                  <p className="text-xs text-ink mt-1 leading-relaxed">
                    {data?.message ||
                      "Electricity per tonne is up 14.3% in the last 3 months compared to the prior 9-month baseline."}
                  </p>
                </div>
              </div>

              {/* Chart / Table Section */}
              <div className="border border-rule rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-ink font-mono uppercase tracking-wider">
                    12-Month Electricity Intensity Series (kWh / tonne)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTable(!showTable)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-rule text-xs font-medium text-muted hover:text-ink bg-paper"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    {showTable ? "View as chart" : "View as table"}
                  </button>
                </div>

                {showTable ? (
                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-left border-collapse font-mono text-xs">
                      <thead>
                        <tr className="border-b border-rule bg-paper text-muted uppercase text-[10px]">
                          <th className="py-2 px-2.5">Month</th>
                          <th className="py-2 px-2.5 text-right">kWh</th>
                          <th className="py-2 px-2.5 text-right">Output (t)</th>
                          <th className="py-2 px-2.5 text-right">Intensity (kWh/t)</th>
                          <th className="py-2 px-2.5 text-center">Period</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule text-[11px]">
                        {series.map((pt, i) => (
                          <tr key={i} className={pt.is_recent ? "bg-ember/5 font-bold" : ""}>
                            <td className="py-1.5 px-2.5 text-ink">{pt.month}</td>
                            <td className="py-1.5 px-2.5 text-right">{Math.round(pt.kwh).toLocaleString("en-IN")}</td>
                            <td className="py-1.5 px-2.5 text-right">{pt.output.toFixed(1)}</td>
                            <td className={`py-1.5 px-2.5 text-right font-mono ${pt.is_recent ? "text-ember" : "text-leaf"}`}>
                              {pt.intensity.toFixed(1)}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${pt.is_recent ? "bg-ember text-white" : "text-muted"}`}>
                                {pt.is_recent ? "Recent" : "Baseline"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="h-56 w-full">
                    <ReactECharts option={chartOption} style={{ height: "100%", width: "100%" }} />
                  </div>
                )}
              </div>

              {/* Common Causes & Proven Industrial Fixes */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-brass" />
                  Common Causes & Proven Interventions
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl border border-rule bg-paper/50 space-y-1">
                    <span className="text-xs font-bold text-ink block">
                      1. Compressed-Air Distribution Leaks
                    </span>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Acoustic ultrasonic leak audit and sealing typically eliminates 15–20% of wasted compressor power.
                    </p>
                    <span className="inline-block text-[10px] font-bold text-leaf bg-leaf/10 px-2 py-0.5 rounded mt-1">
                      Pays back in ~2 months
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-rule bg-paper/50 space-y-1">
                    <span className="text-xs font-bold text-ink block">
                      2. Idle CNC Machines & Auxiliaries
                    </span>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Hydraulic pumps and coolant pumps left running during idle shifts add 8–12% unnecessary base load.
                    </p>
                    <span className="inline-block text-[10px] font-bold text-leaf bg-leaf/10 px-2 py-0.5 rounded mt-1">
                      Auto-standby pays back in ~8 months
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-rule bg-paper/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-muted hover:text-ink hover:bg-paper"
          >
            Close
          </button>

          {onGoToPlanner && (
            <button
              onClick={() => {
                onClose();
                onGoToPlanner();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-ink hover:bg-ink-light transition-all shadow-sm"
            >
              <span>Build Decarbonisation Plan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
