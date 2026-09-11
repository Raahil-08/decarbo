import { useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Zap, RefreshCw } from "lucide-react";
import { apiClient } from "../../lib/api";
import { formatINR, formatIndianNumber } from "../../lib/format";

interface ReviewScreenProps {
  upload: any;
  onConfirmed: () => void;
  onCancel: () => void;
}

export function ReviewScreen({ upload, onConfirmed, onCancel }: ReviewScreenProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State for generic table item mappings
  const [itemMappings, setItemMappings] = useState<any[]>(
    upload?.mapping?.item_mappings || []
  );

  const kind = upload?.kind;
  const issues = upload?.issues || [];
  const draftRecords = upload?.mapping?.draft_records || [];
  const extraction = upload?.mapping?.extraction || {};
  const proposedRecord = upload?.mapping?.proposed_record;

  const handleConfirm = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    try {
      let bodyPayload: any = {};
      if (kind === "generic_table") {
        bodyPayload = {
          confirmed_mapping: {
            ...upload.mapping,
            item_mappings: itemMappings,
          },
        };
      } else if (kind === "template_xlsx") {
        bodyPayload = {
          confirmed_records: draftRecords,
        };
      }

      await apiClient(`/uploads/${upload.id}/confirm`, {
        method: "POST",
        body: JSON.stringify(bodyPayload),
      });

      onConfirmed();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.error?.message_key || "Failed to confirm upload.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-rule rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-rule pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono uppercase bg-paper text-muted px-2 py-0.5 rounded border border-rule">
              {kind}
            </span>
            <h2 className="text-lg font-bold text-ink tracking-tight">
              Review: {upload.original_filename}
            </h2>
          </div>
          <p className="text-xs text-muted mt-1">
            Verify extracted activity mappings and quantities before committing to audit records.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink hover:bg-paper rounded-md transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-leaf hover:bg-leaf/90 rounded-md transition-colors shadow-sm"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Confirm & Add to Audit Records
              </>
            )}
          </button>
        </div>
      </div>

      {/* Issues Banner */}
      {issues.length > 0 && (
        <div className="p-4 bg-ember/5 border border-ember/20 rounded-lg space-y-2">
          <div className="flex items-center space-x-2 text-ember text-xs font-bold">
            <AlertTriangle className="w-4 h-4" />
            <span>{issues.length} Validation Notice(s) Detected</span>
          </div>
          <div className="space-y-1 text-xs text-ink/80">
            {issues.map((iss: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between border-b border-ember/10 py-1 last:border-0">
                <span className="font-mono text-[11px] text-muted">{iss.row || "General"}</span>
                <span className="font-medium text-ember">{iss.code}</span>
                <span className="text-muted">{iss.message_key}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-ember/10 border border-ember/20 rounded-md text-xs text-ember flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. Template Review Table */}
      {kind === "template_xlsx" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{draftRecords.length} records parsed ready for confirmation</span>
          </div>
          <div className="border border-rule rounded-md overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-paper border-b border-rule font-semibold text-ink sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Month</th>
                  <th className="py-2.5 px-3">Activity Type</th>
                  <th className="py-2.5 px-3 text-right">Quantity</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3 text-right">Cost</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-mono">
                {draftRecords.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-paper/50">
                    <td className="py-2 px-3 text-ink font-semibold">{r.period_month?.slice(0, 7)}</td>
                    <td className="py-2 px-3 text-ink">{r.activity_type}</td>
                    <td className="py-2 px-3 text-right text-ink tabular-nums">
                      {formatIndianNumber(r.quantity_canonical)}
                    </td>
                    <td className="py-2 px-3 text-muted">{r.unit}</td>
                    <td className="py-2 px-3 text-right text-muted tabular-nums">
                      {r.cost_inr ? formatINR(r.cost_inr) : "—"}
                    </td>
                    <td className="py-2 px-3 text-muted text-[11px] font-sans truncate max-w-[150px]">
                      {r.source_note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Generic Table / Tally Mapping Review */}
      {kind === "generic_table" && (
        <div className="space-y-4">
          <div className="p-3 bg-paper rounded border border-rule text-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="font-semibold text-ink">Detected Columns:</span>
              <div className="flex flex-wrap gap-2 text-muted">
                {Object.entries(upload?.mapping?.columns || {}).map(([k, v]) => (
                  <span key={k} className="bg-white border border-rule px-2 py-0.5 rounded">
                    {k}: <strong className="text-ink">{v as string}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">
              Item Activity Classifications ({itemMappings.length} items)
            </div>
            <div className="border border-rule rounded-md overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-paper border-b border-rule font-semibold text-ink">
                  <tr>
                    <th className="py-2.5 px-3">Item in Register</th>
                    <th className="py-2.5 px-3">Mapped Decarbo Activity</th>
                    <th className="py-2.5 px-3 text-center">Confidence</th>
                    <th className="py-2.5 px-3">Status / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {itemMappings.map((item: any, idx: number) => {
                    const isHigh = item.confidence >= 0.8;
                    const isMedium = item.confidence >= 0.6 && item.confidence < 0.8;

                    return (
                      <tr key={idx} className="hover:bg-paper/40">
                        <td className="py-2 px-3 font-semibold text-ink max-w-[200px] truncate">
                          {item.source_label}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.activity_type || ""}
                            onChange={(e) => {
                              const updated = [...itemMappings];
                              updated[idx].activity_type = e.target.value || null;
                              setItemMappings(updated);
                            }}
                            placeholder="Unmapped (Ignore)"
                            className="w-full px-2 py-1 text-xs border border-rule rounded bg-white text-ink focus:outline-none focus:border-ink font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isHigh
                                ? "bg-leaf/10 text-leaf"
                                : isMedium
                                ? "bg-brass/10 text-brass"
                                : "bg-ember/10 text-ember"
                            }`}
                          >
                            {(item.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-muted text-[11px]">
                          {item.reason || (item.activity_type ? "Mapped" : "Non-emission item")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Electricity Bill Receipt Summary */}
      {(kind === "bill_pdf" || kind === "bill_image") && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bill Parameters Ledger */}
            <div className="border border-rule rounded-lg p-5 bg-paper space-y-4">
              <div className="flex items-center justify-between border-b border-rule pb-2">
                <span className="text-xs font-bold text-ink uppercase tracking-wide">
                  {extraction.discom_name || "Discom Electricity Bill"}
                </span>
                <span className="text-xs font-mono font-semibold text-muted">
                  {extraction.consumer_number || "••••••4182"}
                </span>
              </div>

              <div className="space-y-2 text-xs divide-y divide-rule/60">
                <div className="flex justify-between py-1">
                  <span className="text-muted">Billing Period</span>
                  <span className="font-mono text-ink">
                    {extraction.billing_period_start} to {extraction.billing_period_end}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-muted">Active Consumption (Units)</span>
                  <span className="font-mono font-bold text-ink text-sm">
                    {formatIndianNumber(extraction.units_kwh || 0)} kWh
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-muted">Energy Charges</span>
                  <span className="font-mono text-ink">
                    {formatINR(extraction.energy_charges_inr || 0)}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-muted">Fixed / Demand Charges</span>
                  <span className="font-mono text-ink">
                    {formatINR(extraction.fixed_or_demand_charges_inr || 0)}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-muted">Fuel Surcharge (FPPPA)</span>
                  <span className="font-mono text-ink">
                    {formatINR(extraction.fuel_surcharge_inr || 0)}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-muted">Electricity Duty</span>
                  <span className="font-mono text-ink">
                    {formatINR(extraction.electricity_duty_inr || 0)}
                  </span>
                </div>

                <div className="flex justify-between py-2 pt-3 font-bold text-sm">
                  <span className="text-ink">Total Net Payable</span>
                  <span className="font-mono text-ink text-base">
                    {formatINR(extraction.total_amount_inr || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Derived Energy Metrics Card */}
            <div className="border border-rule rounded-lg p-5 bg-white space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-brass text-xs font-bold uppercase tracking-wider mb-2">
                  <Zap className="w-4 h-4" />
                  <span>Derived Energy Rate</span>
                </div>
                <h3 className="text-base font-bold text-ink">Variable Electricity Tariff</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Decarbo excludes demand charges to accurately price energy-saving interventions:
                </p>

                <div className="mt-4 p-4 rounded-md bg-paper border border-rule flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-ink font-mono">
                      ₹{proposedRecord?.attributes?.variable_tariff_inr_per_kwh || "8.00"}
                    </span>
                    <span className="text-xs text-muted font-normal ml-1">/ kWh</span>
                  </div>
                  <span className="text-[11px] font-mono text-leaf bg-leaf/10 px-2 py-0.5 rounded font-bold">
                    Effective Variable Rate
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-rule text-xs text-muted flex items-center justify-between">
                <span>Assigned Audit Month:</span>
                <span className="font-mono font-bold text-ink">
                  {proposedRecord?.period_month?.slice(0, 7)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
