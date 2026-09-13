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
        className="bg-white/90 dark:bg-[#0c101a]/90 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl p-5 shadow-sm hover:border-ember/40 hover:shadow-[0_0_25px_rgba(181,67,44,0.15)] transition-all cursor-pointer group relative overflow-hidden"
        title="Click to view full calculation provenance"
      >
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-ember/40 pointer-events-none" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-ember/40 pointer-events-none" />
        <div className="flex items-center justify-between text-muted text-xs font-mono uppercase tracking-wider font-medium">
          <span>{t("annual_footprint")}</span>
          <div className="p-1.5 rounded-md bg-ember/10 border border-ember/20 text-ember group-hover:scale-110 transition-transform">
            <Flame className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-3xl font-bold font-mono text-ember mt-2 tracking-tight">
          {formatEmissionsT(annualTco2e * 1000.0)}
        </div>
        <div className="text-[11px] text-muted mt-1 font-mono flex items-center justify-between">
          <span>{formatIndianNumber(Math.round(totalKgco2e))} kgCO2e</span>
          <span className="text-leaf text-[10px] underline decoration-dotted group-hover:text-ink font-semibold">
            Inspect formula →
          </span>
        </div>
      </div>

      {/* 2. Carbon Intensity */}
      <div className="bg-white/90 dark:bg-[#0c101a]/90 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl p-5 shadow-sm hover:border-white/20 transition-all relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 pointer-events-none" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20 pointer-events-none" />
        <div className="flex items-center justify-between text-muted text-xs font-mono uppercase tracking-wider font-medium">
          <span>{t("carbon_intensity")}</span>
          <div className="p-1.5 rounded-md bg-white/[0.05] border border-white/10 text-ink">
            <Gauge className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-3xl font-bold font-mono text-ink mt-2 tracking-tight">
          {intensityTco2ePerT !== null ? `${intensityTco2ePerT.toFixed(2)} tCO2e/t` : "—"}
        </div>
        <div className="text-[11px] text-muted mt-1 truncate font-mono">
          {t("per_tonne_output")}
        </div>
      </div>

      {/* 3. Electrical Intensity */}
      <div className="bg-white/90 dark:bg-[#0c101a]/90 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl p-5 shadow-sm hover:border-white/20 transition-all relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 pointer-events-none" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20 pointer-events-none" />
        <div className="flex items-center justify-between text-muted text-xs font-mono uppercase tracking-wider font-medium">
          <span>{t("electrical_intensity")}</span>
          <div className="p-1.5 rounded-md bg-white/[0.05] border border-white/10 text-ink">
            <Zap className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-3xl font-bold font-mono text-ink mt-2 tracking-tight">
          {kwhPerTonne !== null ? `${formatIndianNumber(kwhPerTonne)}` : "—"}
        </div>
        <div className="text-[11px] text-muted mt-1 truncate font-mono">
          {t("kwh_per_tonne")}
        </div>
      </div>

      {/* 4. Factor Confidence / Data Quality */}
      <div
        onClick={onOpenProvenance}
        className="bg-white/90 dark:bg-[#0c101a]/90 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl p-5 shadow-sm hover:border-brass/40 hover:shadow-[0_0_25px_rgba(169,122,43,0.15)] transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-brass/40 pointer-events-none" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-brass/40 pointer-events-none" />
        <div className="flex items-center justify-between text-muted text-xs font-mono uppercase tracking-wider font-medium">
          <span>{t("data_quality")}</span>
          <div className="p-1.5 rounded-md bg-brass/10 border border-brass/20 text-brass">
            {estimatedFactorPct > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-brass" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-leaf" />
            )}
          </div>
        </div>
        <div className="mt-2">
          {estimatedFactorPct > 0 ? (
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold font-mono text-brass">
                {estimatedFactorPct.toFixed(1)}%
              </span>
              <span className="text-[11px] font-mono font-medium bg-brass/10 text-brass px-2 py-0.5 rounded border border-brass/20">
                Estimate
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-leaf">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xl font-bold font-mono tracking-tight">100% Verified</span>
            </div>
          )}
        </div>
        <div className="text-[11px] text-muted mt-1 truncate font-mono">
          {estimatedFactorPct > 0
            ? t("estimated_notice", { pct: estimatedFactorPct.toFixed(1) })
            : t("verified_sources")}
        </div>
      </div>
    </div>
  );
}
