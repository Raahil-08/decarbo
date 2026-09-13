import React, { useState, useEffect, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import {
  AlertTriangle,
  RefreshCw,
  Table as TableIcon,
  LineChart as ChartIcon,
  ShieldCheck,
  TrendingDown,
  Layers,
  Edit2,
  Save,
  X,
} from "lucide-react";
import { apiClient } from "../../lib/api";
import { formatINR, formatLakh } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";

interface AdoptionItem {
  id: string;
  factory_id: string;
  plan_item_id?: string | null;
  intervention_code: string;
  title_en: string;
  title_gu?: string | null;
  title_hi?: string | null;
  category: string;
  pool: string;
  status: "planned" | "in_progress" | "done" | "dropped";
  started_on?: string | null;
  completed_on?: string | null;
  actual_capex_inr?: number | null;
  estimated_capex_inr: number;
  estimated_reduction_tco2e: number;
  estimated_annual_savings_inr: number;
  notes?: string | null;
  sequence: number;
}

interface TrackingData {
  factory_id: string;
  active_plan_id?: string | null;
  baseline_intensity: number;
  current_intensity: number;
  target_intensity: number;
  progress_pct: number;
  production_change_alert: boolean;
  production_change_pct: number;
  adoptions: AdoptionItem[];
  trend: Array<{
    month: string;
    intensity: number;
    is_recent: boolean;
    completed_fixes: string[];
  }>;
}

interface TrackingViewProps {
  factoryId: string;
}

export function TrackingView({ factoryId }: TrackingViewProps) {
  const { t, locale } = useI18n();
  const { theme } = useTheme();
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showTrendTable, setShowTrendTable] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCapex, setEditCapex] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const fetchTracking = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient<TrackingData>(`/factories/${factoryId}/tracking`);
      setData(res);
    } catch (err) {
      console.error("Failed to load tracking data:", err);
    } finally {
      setLoading(false);
    }
  }, [factoryId]);

  useEffect(() => {
    fetchTracking();
  }, [fetchTracking]);

  const handleStatusChange = async (
    adoptionId: string,
    newStatus: "planned" | "in_progress" | "done" | "dropped"
  ) => {
    if (!data) return;
    try {
      setUpdatingStatusId(adoptionId);
      // Optimistic update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          adoptions: prev.adoptions.map((ad) =>
            ad.id === adoptionId
              ? {
                  ...ad,
                  status: newStatus,
                  completed_on:
                    newStatus === "done" && !ad.completed_on
                      ? new Date().toISOString().split("T")[0]
                      : ad.completed_on,
                }
              : ad
          ),
        };
      });

      await apiClient(`/factories/${factoryId}/tracking/adoptions/${adoptionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: newStatus,
          completed_on:
            newStatus === "done" ? new Date().toISOString().split("T")[0] : undefined,
        }),
      });
      // Re-fetch to update accurate recalculated progress & current intensity
      await fetchTracking();
    } catch (err) {
      console.error("Failed to update adoption status:", err);
      fetchTracking();
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSaveEdit = async (adoptionId: string) => {
    try {
      const parsedCapex = editCapex.trim() ? parseFloat(editCapex) : null;
      await apiClient(`/factories/${factoryId}/tracking/adoptions/${adoptionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          actual_capex_inr: parsedCapex !== null && !isNaN(parsedCapex) ? parsedCapex : undefined,
          completed_on: editDate.trim() ? editDate : undefined,
          notes: editNotes.trim() ? editNotes : undefined,
          status: data?.adoptions.find((a) => a.id === adoptionId)?.status || "planned",
        }),
      });
      setEditingId(null);
      await fetchTracking();
    } catch (err) {
      console.error("Failed to save adoption details:", err);
    }
  };

  const handleSyncFromPlan = async () => {
    try {
      setSyncing(true);
      await apiClient(`/factories/${factoryId}/tracking/init`, {
        method: "POST",
      });
      await fetchTracking();
    } catch (err) {
      console.error("Failed to sync from active plan:", err);
    } finally {
      setSyncing(false);
    }
  };

  const startEditing = (ad: AdoptionItem) => {
    setEditingId(ad.id);
    setEditCapex(ad.actual_capex_inr !== null && ad.actual_capex_inr !== undefined ? String(ad.actual_capex_inr) : "");
    setEditDate(ad.completed_on || "");
    setEditNotes(ad.notes || "");
  };

  if (loading && !data) {
    return (
      <div className="bg-white border border-rule rounded-xl p-12 text-center text-xs text-muted">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-ink" />
        Loading tracking records and intensity metrics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-rule rounded-xl p-8 text-center text-xs text-muted">
        Unable to load tracking information.
      </div>
    );
  }

  // Calculate adoption counts
  const totalCount = data.adoptions.length;
  const doneCount = data.adoptions.filter((a) => a.status === "done").length;
  const inProgressCount = data.adoptions.filter((a) => a.status === "in_progress").length;
  const totalActualCapex = data.adoptions.reduce(
    (sum, a) => sum + (a.actual_capex_inr || 0),
    0
  );
  const totalEstCapex = data.adoptions.reduce(
    (sum, a) => sum + (a.estimated_capex_inr || 0),
    0
  );

  // ECharts Trend Option
  const isDark = theme === "dark";
  const trendX = data.trend.map((t) => t.month);
  const trendY = data.trend.map((t) => t.intensity);

  const trendOption = {
    tooltip: {
      trigger: "axis",
      backgroundColor: isDark ? "#0c101a" : "#1D2A45",
      borderColor: isDark ? "rgba(45,122,87,0.6)" : "#2D7A57",
      borderWidth: 1,
      textStyle: { color: "#F7F8FA", fontFamily: "IBM Plex Sans, sans-serif", fontSize: 12 },
      formatter: (params: any) => {
        if (!params || params.length === 0) return "";
        const idx = params[0].dataIndex;
        const pt = data.trend[idx];
        const fixes = pt.completed_fixes && pt.completed_fixes.length > 0
          ? `<div style="margin-top:4px; font-size:11px; color:#2D7A57"><span style="font-weight:700;">[COMPLETE]</span> Fixes: ${pt.completed_fixes.join(", ")}</div>`
          : "";
        return `
          <div style="font-size:12px; line-height:1.5">
            <div style="font-weight:700; color:#F7F8FA">${pt.month}</div>
            <div>Intensity: <span style="font-weight:700; color:#B5432C">${pt.intensity.toFixed(1)} kgCO₂e/t</span></div>
            ${fixes}
          </div>
        `;
      },
    },
    grid: {
      left: "4%",
      right: "5%",
      bottom: "10%",
      top: "12%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: trendX,
      axisLabel: { color: isDark ? "#8B95A8" : "#5A6478", fontSize: 11 },
      axisLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.12)" : "#D6DAE1" } },
    },
    yAxis: {
      type: "value",
      name: "kgCO₂e / tonne",
      nameTextStyle: { color: isDark ? "#8B95A8" : "#5A6478", fontSize: 11 },
      axisLabel: { color: isDark ? "#8B95A8" : "#5A6478", fontSize: 11 },
      splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB", type: "dashed" } },
    },
    series: [
      {
        name: "Intensity",
        type: "line",
        smooth: true,
        data: trendY,
        lineStyle: { color: "#B5432C", width: 2.5 },
        itemStyle: { color: "#B5432C" },
        markLine: {
          symbol: ["none", "none"],
          data: [
            {
              yAxis: data.baseline_intensity,
              lineStyle: { color: "#5A6478", type: "dashed", width: 1.5 },
              label: {
                show: true,
                position: "end",
                formatter: `Base: ${data.baseline_intensity.toFixed(0)}`,
                color: "#5A6478",
                fontSize: 10,
              },
            },
            {
              yAxis: data.target_intensity,
              lineStyle: { color: "#2D7A57", type: "dashed", width: 1.5 },
              label: {
                show: true,
                position: "end",
                formatter: `Target: ${data.target_intensity.toFixed(0)}`,
                color: "#2D7A57",
                fontSize: 10,
              },
            },
          ],
        },
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-leaf" />
            {t("tracking_title")}
          </h2>
          <p className="text-xs text-muted mt-0.5">{t("tracking_subtitle")}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSyncFromPlan}
            disabled={syncing}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold text-ink bg-paper border border-rule hover:border-ink transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-leaf ${syncing ? "animate-spin" : ""}`} />
            {t("sync_active_plan")}
          </button>
        </div>
      </div>

      {/* Production Drift Alert Banner */}
      {data.production_change_alert && (
        <div className="p-4 bg-brass/10 border border-brass/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-brass shrink-0 mt-0.5" />
          <div className="text-xs text-ink space-y-1">
            <div className="font-bold text-ink">
              {t("production_drift_warning", {
                pct: Math.abs(Math.round(data.production_change_pct * 100)),
              })}
            </div>
            <p className="text-muted">
              Because emissions are divided by actual finished tonnage, your decarbonisation score measures operational efficiency improvements, protecting your targets from production fluctuations.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Baseline Intensity */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
            {t("baseline_intensity")}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-ink">
            {data.baseline_intensity.toFixed(1)}
            <span className="text-xs font-normal text-muted ml-1">kgCO₂e/t</span>
          </div>
          <div className="text-[11px] text-muted mt-1">Starting reference level</div>
        </div>

        {/* Current Intensity */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
            {t("current_intensity")}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-ember">
            {data.current_intensity.toFixed(1)}
            <span className="text-xs font-normal text-muted ml-1">kgCO₂e/t</span>
          </div>
          <div className="text-[11px] text-muted mt-1 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-leaf" />
            <span>-{(data.baseline_intensity - data.current_intensity).toFixed(1)} kgCO₂e/t cut</span>
          </div>
        </div>

        {/* Target Intensity */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
            {t("target_intensity")}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-leaf">
            {data.target_intensity.toFixed(1)}
            <span className="text-xs font-normal text-muted ml-1">kgCO₂e/t</span>
          </div>
          <div className="text-[11px] text-muted mt-1">Target under active plan</div>
        </div>

        {/* Target Progress Bar */}
        <div className="bg-white border border-rule rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider">
              <span className="text-muted">{t("target_progress")}</span>
              <span className="font-mono text-leaf">{data.progress_pct.toFixed(1)}%</span>
            </div>
            <div className="mt-2.5 w-full bg-paper rounded-full h-2.5 overflow-hidden border border-rule">
              <div
                className="bg-leaf h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, data.progress_pct))}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] text-muted mt-2">
            {doneCount} of {totalCount} completed ({inProgressCount} in progress)
          </div>
        </div>
      </div>

      {/* Intensity Trend Section */}
      {data.trend && data.trend.length > 0 && (
        <div className="bg-white border border-rule rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-leaf" />
                Monthly Carbon Intensity Trend
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Observed factory emissions normalized by monthly output (dashed lines show baseline & target)
              </p>
            </div>

            <button
              onClick={() => setShowTrendTable(!showTrendTable)}
              className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-muted hover:text-ink bg-paper border border-rule rounded-md transition-colors self-start sm:self-auto"
            >
              {showTrendTable ? (
                <>
                  <ChartIcon className="w-3.5 h-3.5 mr-1 text-leaf" />
                  View Chart
                </>
              ) : (
                <>
                  <TableIcon className="w-3.5 h-3.5 mr-1" />
                  View as table
                </>
              )}
            </button>
          </div>

          {!showTrendTable ? (
            <div className="h-64 w-full">
              <ReactECharts
                option={trendOption}
                style={{ height: "100%", width: "100%" }}
                notMerge={true}
              />
            </div>
          ) : (
            <div className="overflow-x-auto border border-rule rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-paper border-b border-rule text-muted">
                    <th className="py-2.5 px-3 font-semibold">Month</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Intensity (kgCO₂e/t)</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Completed Fixes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {data.trend.map((pt, idx) => (
                    <tr key={idx} className="hover:bg-paper/40">
                      <td className="py-2 px-3 font-mono font-medium text-ink">{pt.month}</td>
                      <td className="py-2 px-3 font-mono text-right text-ember font-bold">
                        {pt.intensity.toFixed(1)}
                      </td>
                      <td className="py-2 px-3 text-muted">
                        {pt.is_recent ? (
                          <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-brass/10 text-brass font-medium">
                            Recent window
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted">Baseline history</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-leaf font-medium">
                        {pt.completed_fixes && pt.completed_fixes.length > 0
                          ? pt.completed_fixes.join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Implementation Ledger Table */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Layers className="w-4 h-4 text-ink" />
              Intervention Adoption Ledger
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Sequence of planned measures. Update statuses and actual spends as fixes are deployed on the shop floor.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted">
              Total Actual Capex:{" "}
              <strong className="text-ink font-mono">{formatINR(totalActualCapex)}</strong> /{" "}
              <span className="font-mono text-muted">{formatINR(totalEstCapex)}</span>
            </span>
          </div>
        </div>

        {data.adoptions.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted border border-dashed border-rule rounded-lg">
            No active plan items found. Generate and select a plan first, or click "Sync with Active Plan" above.
          </div>
        ) : (
          <div className="overflow-x-auto border border-rule rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-paper border-b border-rule text-muted">
                  <th className="py-2.5 px-3 font-semibold w-12 text-center">#</th>
                  <th className="py-2.5 px-3 font-semibold">Intervention</th>
                  <th className="py-2.5 px-3 font-semibold">Pool & Category</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Est. Cut</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Est. Capex</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{t("actual_capex")}</th>
                  <th className="py-2.5 px-3 font-semibold w-36">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {data.adoptions.map((ad) => {
                  const isEditing = editingId === ad.id;
                  const localizedTitle =
                    locale === "gu" && ad.title_gu
                      ? ad.title_gu
                      : locale === "hi" && ad.title_hi
                      ? ad.title_hi
                      : ad.title_en;

                  return (
                    <React.Fragment key={ad.id}>
                      <tr className="hover:bg-paper/40 transition-colors">
                        <td className="py-3 px-3 font-mono text-center font-bold text-muted">
                          {ad.sequence}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-ink">{localizedTitle}</div>
                          <div className="text-[11px] text-muted font-mono">{ad.intervention_code}</div>
                          {ad.notes && !isEditing && (
                            <div className="text-[11px] text-muted italic mt-0.5">
                              Note: {ad.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-paper border border-rule text-ink mr-1">
                            {ad.pool}
                          </span>
                          <span className="text-[11px] text-muted capitalize">
                            {ad.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-right text-leaf font-bold">
                          {ad.estimated_reduction_tco2e.toFixed(1)} t
                        </td>
                        <td className="py-3 px-3 font-mono text-right text-muted">
                          {formatLakh(ad.estimated_capex_inr)}
                        </td>
                        <td className="py-3 px-3 font-mono text-right">
                          {ad.actual_capex_inr !== null && ad.actual_capex_inr !== undefined ? (
                            <span className="font-bold text-brass">
                              {formatINR(ad.actual_capex_inr)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <select
                            value={ad.status}
                            disabled={updatingStatusId === ad.id}
                            onChange={(e) =>
                              handleStatusChange(
                                ad.id,
                                e.target.value as "planned" | "in_progress" | "done" | "dropped"
                              )
                            }
                            className={`px-2 py-1 rounded text-xs font-semibold border cursor-pointer focus:outline-none ${
                              ad.status === "done"
                                ? "bg-leaf/10 text-leaf border-leaf/30"
                                : ad.status === "in_progress"
                                ? "bg-brass/10 text-brass border-brass/30"
                                : ad.status === "dropped"
                                ? "bg-ember/10 text-ember border-ember/30"
                                : "bg-paper text-ink border-rule"
                            }`}
                          >
                            <option value="planned">{t("status_planned")}</option>
                            <option value="in_progress">{t("status_in_progress")}</option>
                            <option value="done">{t("status_done")}</option>
                            <option value="dropped">{t("status_dropped")}</option>
                          </select>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => (isEditing ? setEditingId(null) : startEditing(ad))}
                            className="p-1 rounded text-muted hover:text-ink hover:bg-paper transition-colors"
                            title="Edit actual spend, dates or notes"
                          >
                            {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* Inline Edit Drawer/Row */}
                      {isEditing && (
                        <tr className="bg-paper/70 border-b border-rule">
                          <td colSpan={8} className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-muted uppercase">
                                  {t("actual_capex")} (₹ INR)
                                </label>
                                <input
                                  type="number"
                                  value={editCapex}
                                  onChange={(e) => setEditCapex(e.target.value)}
                                  placeholder="e.g. 480000"
                                  className="mt-1 w-full px-2.5 py-1.5 text-xs rounded border border-rule bg-white focus:outline-none focus:border-ink font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-muted uppercase">
                                  {t("completion_date")}
                                </label>
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={(e) => setEditDate(e.target.value)}
                                  className="mt-1 w-full px-2.5 py-1.5 text-xs rounded border border-rule bg-white focus:outline-none focus:border-ink"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-muted uppercase">
                                  Field Notes & Quotations
                                </label>
                                <div className="flex gap-2 mt-1">
                                  <input
                                    type="text"
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="e.g. Vendor quoted ₹4.8 Lakhs"
                                    className="w-full px-2.5 py-1.5 text-xs rounded border border-rule bg-white focus:outline-none focus:border-ink"
                                  />
                                  <button
                                    onClick={() => handleSaveEdit(ad.id)}
                                    className="px-3 py-1.5 rounded text-xs font-bold text-white bg-ink hover:bg-ink-light flex items-center gap-1 shrink-0"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    Save
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
