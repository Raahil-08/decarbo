import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import { apiClient } from "../../lib/api";
import { formatIndianNumber } from "../../lib/format";

interface CoverageGridProps {
  factoryId: string;
}

export function CoverageGrid({ factoryId }: CoverageGridProps) {
  const [coverageData, setCoverageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadCoverage = useCallback(async () => {
    try {
      const data = await apiClient<any>(`/factories/${factoryId}/activity-records/coverage`);
      setCoverageData(data);
    } catch (err) {
      console.error("Failed to load coverage", err);
    } finally {
      setLoading(false);
    }
  }, [factoryId]);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  if (loading) {
    return <div className="text-center py-8 text-xs text-muted">Loading 12-month coverage matrix...</div>;
  }

  if (!coverageData || !coverageData.activities || coverageData.activities.length === 0) {
    return (
      <div className="bg-white border border-rule rounded-lg p-6 text-center text-xs text-muted">
        No activity records confirmed yet. Upload a template or bill above to initialize your 12-month coverage grid.
      </div>
    );
  }

  const { months, activities, overall_coverage_pct } = coverageData;

  return (
    <div className="bg-white border border-rule rounded-lg p-6 space-y-5">
      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-ink" />
            <h3 className="text-sm font-bold text-ink tracking-tight">12-Month Data Completeness Matrix</h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Audit coverage grid across operational pools. Missing months are flagged for annualisation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-muted font-semibold block">
              Overall Completeness
            </span>
            <span className="text-sm font-bold font-mono text-ink">
              {overall_coverage_pct}%
            </span>
          </div>
          <div className="w-24 h-2 bg-paper rounded-full overflow-hidden border border-rule">
            <div
              className={`h-full ${
                overall_coverage_pct >= 90 ? "bg-leaf" : overall_coverage_pct >= 60 ? "bg-brass" : "bg-ember"
              }`}
              style={{ width: `${overall_coverage_pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="border border-rule rounded-md overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-paper border-b border-rule font-semibold text-ink">
            <tr>
              <th className="py-2.5 px-3 min-w-[180px]">Activity Type</th>
              <th className="py-2.5 px-2 text-center w-16">Coverage</th>
              {months.map((m: string) => (
                <th key={m} className="py-2.5 px-2 text-center font-mono text-[11px] min-w-[64px]">
                  {m.slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule font-mono">
            {activities.map((act: any) => {
              return (
                <tr key={act.activity_type} className="hover:bg-paper/40">
                  <td className="py-2 px-3">
                    <div className="font-semibold text-ink font-sans text-xs">{act.label_en}</div>
                    <div className="text-[10px] text-muted font-mono">{act.activity_type}</div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        act.coverage_pct >= 90
                          ? "bg-leaf/10 text-leaf"
                          : act.coverage_pct >= 60
                          ? "bg-brass/10 text-brass"
                          : "bg-ember/10 text-ember"
                      }`}
                    >
                      {act.months_filled}/{months.length}
                    </span>
                  </td>
                  {months.map((m: string) => {
                    const hasData = m in act.monthly_data;
                    const val = act.monthly_data[m];

                    return (
                      <td key={m} className="py-2 px-2 text-center">
                        {hasData ? (
                          <div
                            className="bg-leaf/10 text-leaf font-bold rounded py-1 px-1 text-[10px] truncate max-w-[70px] mx-auto border border-leaf/20"
                            title={`${act.label_en} (${m}): ${formatIndianNumber(val)} ${act.canonical_unit}`}
                          >
                            <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                            {formatIndianNumber(val)}
                          </div>
                        ) : (
                          <div
                            className="bg-paper text-muted/40 rounded py-1 px-1 text-[10px] border border-dashed border-rule"
                            title={`Missing data for ${m}`}
                          >
                            <AlertCircle className="w-3 h-3 inline text-ember/60" />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
