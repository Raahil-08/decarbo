import { useState, useEffect } from "react";
import { X, ShieldCheck, AlertCircle, Calculator, Filter } from "lucide-react";
import { formatEmissionsT, formatIndianNumber } from "../../lib/format";
import { useI18n } from "../../lib/i18n";

interface ProvenanceRecord {
  id: string;
  activity_type: string;
  activity_name: string;
  period: string;
  scope: string;
  quantity: number;
  unit: string;
  quantity_canonical: number;
  canonical_unit: string;
  factor_name: string;
  factor_source: string;
  factor_version: string;
  factor_year: number;
  factor_value: number;
  factor_unit: string;
  formula: string;
  kgco2e: number;
  tco2e: number;
  verified: boolean;
}

interface ProvenanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: ProvenanceRecord[];
  initialActivityFilter?: string | null;
}

export function ProvenanceDrawer({
  isOpen,
  onClose,
  items,
  initialActivityFilter,
}: ProvenanceDrawerProps) {
  const [selectedActivity, setSelectedActivity] = useState<string>("all");
  const { t } = useI18n();

  useEffect(() => {
    if (initialActivityFilter) {
      setSelectedActivity(initialActivityFilter);
    } else {
      setSelectedActivity("all");
    }
  }, [initialActivityFilter, isOpen]);

  if (!isOpen) return null;

  const activities = Array.from(new Set(items.map((i) => i.activity_type)));

  const filteredItems = items.filter((item) => {
    if (selectedActivity === "all") return true;
    return item.activity_type === selectedActivity || item.activity_name === selectedActivity;
  });

  const totalFilteredTco2e = filteredItems.reduce((acc, curr) => acc + curr.tco2e, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-rule flex flex-col animate-in slide-in-from-right duration-200">
          {/* Top Header */}
          <div className="p-5 border-b border-rule bg-paper/60 flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <Calculator className="w-4 h-4 text-ink" />
                <h3 className="text-base font-bold text-ink">
                  {t("provenance_title")}
                </h3>
              </div>
              <p className="text-xs text-muted mt-1">
                {t("provenance_subtitle")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-rule/40 transition-colors"
              title={t("close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Bar */}
          <div className="p-3 border-b border-rule bg-white flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Filter className="w-3.5 h-3.5 text-muted" />
              <select
                value={selectedActivity}
                onChange={(e) => setSelectedActivity(e.target.value)}
                className="bg-paper border border-rule rounded px-2.5 py-1 text-xs text-ink focus:outline-none focus:border-ink font-medium cursor-pointer"
              >
                <option value="all">All Activities ({items.length} records)</option>
                {activities.map((act) => (
                  <option key={act} value={act}>
                    {act.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            <div className="font-mono text-xs text-ink font-semibold">
              Total: <span className="text-ember">{formatEmissionsT(totalFilteredTco2e * 1000.0)}</span>
            </div>
          </div>

          {/* Records List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 divide-y divide-rule/60">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted">
                No provenance entries found for this activity.
              </div>
            ) : (
              filteredItems.map((record) => (
                <div key={record.id} className="pt-4 first:pt-0 space-y-2.5 text-xs">
                  {/* Record Title & Verification Badge */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-ink text-sm">
                        {record.activity_name}
                      </span>
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        [{record.period}]
                      </span>
                    </div>

                    <div>
                      {record.verified ? (
                        <span className="inline-flex items-center text-[10px] font-semibold text-leaf bg-leaf/10 border border-leaf/20 px-2 py-0.5 rounded">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          {t("verified_badge")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-semibold text-brass bg-brass/10 border border-brass/20 px-2 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {t("estimate_badge")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Formula Box (PRD Non-negotiable: Every emission number has formula string) */}
                  <div className="bg-paper border border-rule rounded-lg p-3 space-y-1.5 font-mono text-xs">
                    <div className="text-[10px] uppercase font-bold text-muted tracking-wider">
                      {t("formula")}
                    </div>
                    <div className="text-ink font-semibold text-xs break-all">
                      {record.formula}
                    </div>
                    <div className="text-right text-[11px] font-bold text-ember">
                      = {formatEmissionsT(record.kgco2e)} ({formatIndianNumber(Math.round(record.kgco2e))} kgCO2e)
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted bg-white border border-rule/60 rounded-lg p-2.5">
                    <div>
                      <span className="font-medium text-ink block">{t("factor_source")}</span>
                      <span>{record.factor_source} ({record.factor_version})</span>
                    </div>
                    <div>
                      <span className="font-medium text-ink block">{t("reference_year")}</span>
                      <span>{record.factor_year}</span>
                    </div>
                    <div>
                      <span className="font-medium text-ink block">Emission Factor Value</span>
                      <span className="font-mono font-medium text-ink">
                        {record.factor_value} kgCO2e / {record.factor_unit}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-ink block">Quantity Consumed</span>
                      <span className="font-mono font-medium text-ink">
                        {formatIndianNumber(record.quantity_canonical)} {record.canonical_unit}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-rule bg-paper/40 flex items-center justify-between text-[11px] text-muted">
            <span>Decarbo Engine • CEA / IPCC Standard Provenance</span>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-ink text-white text-xs font-semibold hover:bg-ink-light transition-colors"
            >
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
