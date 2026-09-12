import { useState } from "react";
import { Sliders, RotateCcw, CheckSquare, Zap, Layers, Sparkles, Sun, Flame } from "lucide-react";
import { useI18n } from "../../lib/i18n";

export interface AvailableLever {
  code: string;
  name?: string;
  title_en?: string;
  effect_type: string;
  pool?: string;
  target_pool?: string;
  category?: string;
  description?: string;
  levels?: number[] | null;
  level_unit?: string | null;
  default_level?: number | null;
  difficulty?: number;
  standalone_reduction_tco2e?: number;
  standalone_capex_inr?: number;
  standalone_payback_months?: number | null;
  standalone_savings_inr?: number;
}

export type ActiveLeversState = Record<string, boolean | { kwp?: number; level?: number }>;

interface SimulateLeversProps {
  levers: AvailableLever[];
  activeLevers: ActiveLeversState;
  onToggleLever: (code: string, currentSetting?: boolean | { kwp?: number; level?: number }) => void;
  onUpdateLevel: (code: string, levelValue: number, levelUnit?: string | null) => void;
  onResetAll: () => void;
  onSelectAll: () => void;
  isLoading?: boolean;
}

export function SimulateLevers({
  levers,
  activeLevers,
  onToggleLever,
  onUpdateLevel,
  onResetAll,
  onSelectAll,
  isLoading = false,
}: SimulateLeversProps) {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const activeCount = Object.keys(activeLevers).length;

  // Filter levers by category
  const filteredLevers = levers.filter((lev) => {
    if (selectedCategory === "all") return true;
    if (selectedCategory === "energy") {
      return (
        lev.category === "energy" ||
        lev.category === "process" ||
        lev.category === "equipment" ||
        lev.effect_type === "reduce_fraction" ||
        lev.effect_type === "fuel_to_electric"
      );
    }
    if (selectedCategory === "material") {
      return lev.category === "material" || lev.effect_type === "shift_to_secondary";
    }
    if (selectedCategory === "renewables") {
      return lev.category === "renewables" || lev.effect_type === "onsite_generation";
    }
    return true;
  });

  const getCategoryIcon = (effectType: string) => {
    switch (effectType) {
      case "onsite_generation":
        return <Sun className="w-4 h-4 text-brass" />;
      case "fuel_to_electric":
        return <Flame className="w-4 h-4 text-ember" />;
      case "shift_to_secondary":
        return <Layers className="w-4 h-4 text-leaf" />;
      default:
        return <Zap className="w-4 h-4 text-ink" />;
    }
  };

  const getDifficultyLabel = (diff?: number) => {
    if (diff === 1) return "L1 • Drop-in";
    if (diff === 2) return "L2 • Minor Equipment";
    if (diff === 3) return "L3 • Major Retooling";
    return "L1";
  };

  return (
    <div className="bg-white border border-rule rounded-xl shadow-xs overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-rule bg-paper/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-ink" />
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
              {t("levers_panel_title")}
            </h2>
            <span className="text-[11px] font-semibold text-leaf bg-leaf/10 border border-leaf/25 px-2 py-0.5 rounded-full">
              {t("active_levers_count", { count: activeCount, total: levers.length })}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">{t("levers_panel_subtitle")}</p>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={isLoading}
            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-ink bg-white border border-rule hover:bg-paper rounded-md transition-colors shadow-2xs"
          >
            <CheckSquare className="w-3.5 h-3.5 text-leaf" />
            <span>{t("select_all_levers")}</span>
          </button>
          <button
            type="button"
            onClick={onResetAll}
            disabled={isLoading || activeCount === 0}
            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-muted hover:text-ember bg-white border border-rule hover:border-ember/30 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t("reset_levers")}</span>
          </button>
        </div>
      </div>

      {/* Category Pills Filter */}
      <div className="px-4 py-2.5 bg-paper/20 border-b border-rule flex items-center space-x-2 overflow-x-auto text-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted mr-1">
          {t("filter_by_category")}:
        </span>
        {[
          { id: "all", label: t("lever_category_all") },
          { id: "energy", label: t("lever_category_energy") },
          { id: "material", label: t("lever_category_material") },
          { id: "renewables", label: t("lever_category_renewables") },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1 rounded-full font-medium transition-all text-xs whitespace-nowrap ${
              selectedCategory === cat.id
                ? "bg-ink text-white shadow-2xs"
                : "bg-paper text-muted hover:text-ink hover:bg-rule/40 border border-rule"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Levers List */}
      <div className="divide-y divide-rule overflow-y-auto max-h-[640px]">
        {filteredLevers.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">No levers in this category.</div>
        ) : (
          filteredLevers.map((lever) => {
            const setting = activeLevers[lever.code];
            const isActive = !!setting;

            // Extract active level value if applicable
            let activeLevelValue: number | null = null;
            if (setting && typeof setting === "object") {
              if ("kwp" in setting && setting.kwp !== undefined) {
                activeLevelValue = Number(setting.kwp);
              } else if ("level" in setting && setting.level !== undefined) {
                activeLevelValue = Number(setting.level);
              }
            } else if (lever.default_level) {
              activeLevelValue = lever.default_level;
            }

            return (
              <div
                key={lever.code}
                className={`p-4 transition-colors ${
                  isActive ? "bg-leaf/5" : "hover:bg-paper/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: icon + info */}
                  <div className="flex items-start space-x-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg border mt-0.5 shrink-0 ${
                        isActive
                          ? "bg-white border-leaf/40 text-leaf shadow-2xs"
                          : "bg-paper border-rule text-muted"
                      }`}
                    >
                      {getCategoryIcon(lever.effect_type)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-ink truncate">
                          {lever.title_en || lever.name || lever.code}
                        </span>
                        <span className="font-mono text-[10px] text-muted bg-paper px-1.5 py-0.2 rounded border border-rule">
                          {lever.code}
                        </span>
                        {lever.difficulty && (
                          <span className="text-[10px] text-muted bg-rule/30 px-1.5 py-0.2 rounded">
                            {getDifficultyLabel(lever.difficulty)}
                          </span>
                        )}
                      </div>

                      {lever.description && (
                        <p className="text-[11px] text-muted mt-0.5 line-clamp-2">
                          {lever.description}
                        </p>
                      )}

                      {/* Standalone impact badge */}
                      {lever.standalone_reduction_tco2e !== undefined &&
                        lever.standalone_reduction_tco2e > 0 && (
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                            <span className="text-leaf font-semibold flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              ~{lever.standalone_reduction_tco2e.toFixed(1)} tCO₂e/yr
                            </span>
                            {lever.standalone_capex_inr !== undefined && (
                              <span className="text-muted">
                                {lever.standalone_capex_inr === 0
                                  ? "₹0 Capex"
                                  : `Capex: ₹${(lever.standalone_capex_inr / 100000).toFixed(1)} L`}
                              </span>
                            )}
                            {lever.standalone_payback_months !== undefined &&
                              lever.standalone_payback_months !== null && (
                                <span className="text-muted">
                                  PB: {lever.standalone_payback_months < 12
                                    ? `${lever.standalone_payback_months.toFixed(0)} mo`
                                    : `${(lever.standalone_payback_months / 12).toFixed(1)} yr`}
                                </span>
                              )}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Right: Master Toggle Switch */}
                  <div className="shrink-0 flex items-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      onClick={() => onToggleLever(lever.code, setting)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-1 ${
                        isActive ? "bg-leaf" : "bg-rule"
                      }`}
                    >
                      <span className="sr-only">Toggle {lever.title_en || lever.name || lever.code}</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isActive ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Sub-level options for stepped levers (Solar kWp or Recycled %) */}
                {isActive && lever.levels && lever.levels.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-rule/60 pl-11">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-ink">
                        {t("lever_level_label")}:
                      </span>
                      <span className="font-mono text-xs font-bold text-ink bg-white px-2 py-0.5 rounded border border-rule">
                        {lever.level_unit === "recycled_share"
                          ? `${Math.round((activeLevelValue || 0.85) * 100)}% Recycled`
                          : `${activeLevelValue || 50} kWp`}
                      </span>
                    </div>

                    {/* Stepped Pill Buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {lever.levels.map((lvl) => {
                        const isLevelSelected =
                          activeLevelValue !== null &&
                          Math.abs(activeLevelValue - lvl) < 0.001;

                        const displayLabel =
                          lever.level_unit === "recycled_share"
                            ? `${Math.round(lvl * 100)}%`
                            : `${lvl} kWp`;

                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => onUpdateLevel(lever.code, lvl, lever.level_unit)}
                            className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                              isLevelSelected
                                ? "bg-ink text-white font-bold shadow-2xs scale-102"
                                : "bg-white text-muted hover:text-ink hover:bg-paper border border-rule"
                            }`}
                          >
                            {displayLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
