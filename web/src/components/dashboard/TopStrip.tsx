import { Flame, Gauge, Zap, ShieldCheck, AlertTriangle } from "lucide-react";
import { formatEmissionsT, formatIndianNumber } from "../../lib/format";
import { useI18n } from "../../lib/i18n";

interface TopStripProps {
  annualTco2e: number;
  totalKgco2e: number;
  intensityTco2ePerT: number | null;
  kwhPerTonne: number | null;
  estimatedFactorPct: number;
  onOpenProvenance: () => void;
}

export function TopStrip({
  annualTco2e,
  totalKgco2e,
  intensityTco2ePerT,
  kwhPerTonne,
  estimatedFactorPct,
  onOpenProvenance,
}: TopStripProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Annual Footprint */}
      <div
        onClick={onOpenProvenance}
        className="bg-white border border-rule rounded-xl p-5 shadow-sm hover:border-ember/40 transition-all cursor-pointer group"
        title="Click to view full calculation provenance"
      >
        <div className="flex items-center justify-between text-muted text-xs font-medium">
          <span>{t("annual_footprint")}</span>
          <Flame className="w-4 h-4 text-ember group-hover:scale-110 transition-transform" />
        </div>
        <div className="text-3xl font-bold font-mono text-ember mt-2 tracking-tight">
          {formatEmissionsT(annualTco2e * 1000.0)}
        </div>
        <div className="text-[11px] text-muted mt-1 font-mono flex items-center justify-between">
          <span>{formatIndianNumber(Math.round(totalKgco2e))} kgCO2e</span>
          <span className="text-leaf text-[10px] underline decoration-dotted group-hover:text-ink">
            Inspect formula →
          </span>
        </div>
      </div>

      {/* 2. Carbon Intensity */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-muted text-xs font-medium">
          <span>{t("carbon_intensity")}</span>
          <Gauge className="w-4 h-4 text-ink" />
        </div>
        <div className="text-3xl font-bold font-mono text-ink mt-2 tracking-tight">
          {intensityTco2ePerT !== null ? `${intensityTco2ePerT.toFixed(2)} tCO2e/t` : "—"}
        </div>
        <div className="text-[11px] text-muted mt-1 truncate">
          {t("per_tonne_output")}
        </div>
      </div>

      {/* 3. Electrical Intensity */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-muted text-xs font-medium">
          <span>{t("electrical_intensity")}</span>
          <Zap className="w-4 h-4 text-ink" />
        </div>
        <div className="text-3xl font-bold font-mono text-ink mt-2 tracking-tight">
          {kwhPerTonne !== null ? `${formatIndianNumber(kwhPerTonne)}` : "—"}
        </div>
        <div className="text-[11px] text-muted mt-1 truncate">
          {t("kwh_per_tonne")}
        </div>
      </div>

      {/* 4. Factor Confidence / Data Quality */}
      <div
        onClick={onOpenProvenance}
        className="bg-white border border-rule rounded-xl p-5 shadow-sm hover:border-ink/40 transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between text-muted text-xs font-medium">
          <span>{t("data_quality")}</span>
          {estimatedFactorPct > 0 ? (
            <AlertTriangle className="w-4 h-4 text-brass" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-leaf" />
          )}
        </div>
        <div className="mt-2">
          {estimatedFactorPct > 0 ? (
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold font-mono text-brass">
                {estimatedFactorPct.toFixed(1)}%
              </span>
              <span className="text-[11px] font-medium bg-brass/10 text-brass px-2 py-0.5 rounded border border-brass/20">
                Estimate
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-leaf">
              <ShieldCheck className="w-6 h-6" />
              <span className="text-xl font-bold tracking-tight">100% Verified</span>
            </div>
          )}
        </div>
        <div className="text-[11px] text-muted mt-1 truncate">
          {estimatedFactorPct > 0
            ? t("estimated_notice", { pct: estimatedFactorPct.toFixed(1) })
            : t("verified_sources")}
        </div>
      </div>
    </div>
  );
}
