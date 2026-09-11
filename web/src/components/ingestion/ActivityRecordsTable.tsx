import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../../lib/api";
import { formatINR, formatIndianNumber } from "../../lib/format";
import { Calendar, Filter, Search, FileText, CheckCircle2, AlertCircle } from "lucide-react";

interface ActivityRecord {
  id: string;
  period_month: string;
  activity_type: string;
  quantity: number;
  unit: string;
  quantity_canonical: number;
  canonical_unit: string;
  cost_inr: number;
  data_quality: string;
  verified: boolean;
  notes?: string;
  source_upload_id?: string;
}

interface ActivityRecordsTableProps {
  factoryId: string;
  refreshTrigger?: number;
}

const SCOPE_MAP: Record<string, { scope: string; badgeClass: string }> = {
  grid_electricity: { scope: "Scope 2", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  diesel_generator: { scope: "Scope 1", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  piped_natural_gas: { scope: "Scope 1", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  cng: { scope: "Scope 1", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  lpg: { scope: "Scope 1", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  furnace_oil: { scope: "Scope 1", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  brass_scrap_local: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  brass_ingot_virgin: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  brass_rod_virgin: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  copper_cathode: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  zinc_ingot: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cutting_oil: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  hydraulic_oil: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  corrugated_boxes: { scope: "Scope 3", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  inbound_truck_diesel: { scope: "Scope 3", badgeClass: "bg-purple-50 text-purple-700 border-purple-200" },
  outbound_tempo_diesel: { scope: "Scope 3", badgeClass: "bg-purple-50 text-purple-700 border-purple-200" },
  default: { scope: "Scope 3", badgeClass: "bg-stone-50 text-stone-700 border-stone-200" },
};

export function ActivityRecordsTable({ factoryId, refreshTrigger }: ActivityRecordsTableProps) {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<ActivityRecord[]>(`/factories/${factoryId}/activity-records`);
      data.sort((a, b) => b.period_month.localeCompare(a.period_month));
      setRecords(data);
    } catch (err) {
      console.error("Failed to fetch activity records", err);
    } finally {
      setLoading(false);
    }
  }, [factoryId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords, refreshTrigger]);

  const months = Array.from(new Set(records.map((r) => r.period_month))).sort().reverse();

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.activity_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesMonth = selectedMonth === "all" || r.period_month === selectedMonth;
    return matchesSearch && matchesMonth;
  });

  const formatActivityName = (type: string) => {
    return type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <div className="bg-white border border-rule rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-rule bg-paper/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-ink" />
          <h2 className="text-base font-semibold text-ink">Confirmed Activity Records</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-rule text-ink font-mono font-medium">
            {records.length} records
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-rule rounded-md focus:outline-none focus:border-ink w-44 sm:w-56"
            />
          </div>

          <div className="relative flex items-center">
            <Filter className="w-3.5 h-3.5 text-muted absolute left-2 pointer-events-none" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs bg-white border border-rule rounded-md focus:outline-none focus:border-ink cursor-pointer"
            >
              <option value="all">All Months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-muted">Loading activity ledger...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted">
          {records.length === 0
            ? "No activity records confirmed yet. Upload a template, bill, or Tally CSV to populate."
            : "No records match your filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-paper/80 border-b border-rule font-medium text-muted">
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Activity</th>
                <th className="py-3 px-4">Scope</th>
                <th className="py-3 px-4 text-right">Canonical Quantity</th>
                <th className="py-3 px-4 text-right">Entered Quantity</th>
                <th className="py-3 px-4 text-right">Spend (INR)</th>
                <th className="py-3 px-4 text-center">Quality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {filtered.map((record) => {
                const scopeInfo = SCOPE_MAP[record.activity_type] || SCOPE_MAP.default;
                return (
                  <tr key={record.id} className="hover:bg-paper/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-ink font-medium whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted" />
                        <span>{record.period_month}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-ink">{formatActivityName(record.activity_type)}</div>
                      {record.notes && (
                        <div className="text-[11px] text-muted truncate max-w-xs">{record.notes}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full border ${scopeInfo.badgeClass}`}
                      >
                        {scopeInfo.scope}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-ink whitespace-nowrap font-medium">
                      {formatIndianNumber(record.quantity_canonical)}{" "}
                      <span className="text-muted text-[11px]">{record.canonical_unit}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-muted whitespace-nowrap">
                      {formatIndianNumber(record.quantity)}{" "}
                      <span className="text-[11px]">{record.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-ink whitespace-nowrap font-medium">
                      {record.cost_inr ? formatINR(record.cost_inr) : "—"}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {record.verified ? (
                        <span className="inline-flex items-center text-[11px] text-leaf font-medium">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[11px] text-brass font-medium bg-brass/10 px-2 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Estimate
                        </span>
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
