import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle, RefreshCw, Sliders, Building2 } from "lucide-react";
import { apiClient } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { SimulateLevers } from "../components/simulate/SimulateLevers";
import type { AvailableLever, ActiveLeversState } from "../components/simulate/SimulateLevers";
import { SimulateOutcomes } from "../components/simulate/SimulateOutcomes";
import { SimulateBreakdown } from "../components/simulate/SimulateBreakdown";

export interface SimulateResponse {
  baseline_kgco2e: number;
  after_kgco2e: number;
  reduction_kgco2e: number;
  reduction_pct: number;
  baseline_tco2e: number;
  after_tco2e: number;
  reduction_tco2e: number;
  intensity_before?: number | null;
  intensity_after?: number | null;
  total_capex_inr: number;
  annual_savings_inr: number;
  payback_months: number | null;
  by_category: Array<{ category: string; before_kgco2e: number; after_kgco2e: number }>;
  available_levers: AvailableLever[];
  calc_time_ms: number;
}

interface WhatIfPageProps {
  embeddedFactoryId?: string;
  onBackToDashboard?: () => void;
  onOpenPlanner?: () => void;
}

export function WhatIfPage({
  embeddedFactoryId,
  onBackToDashboard,
  onOpenPlanner,
}: WhatIfPageProps) {
  const { factoryId: paramFactoryId } = useParams<{ factoryId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [factories, setFactories] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string>(
    embeddedFactoryId || paramFactoryId || ""
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeLevers, setActiveLevers] = useState<ActiveLeversState>({});
  const [availableLevers, setAvailableLevers] = useState<AvailableLever[]>([]);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);

  const debounceTimeoutRef = useRef<any>(null);

  // If standalone and no factory selected, fetch user's factories
  useEffect(() => {
    if (!embeddedFactoryId && !paramFactoryId) {
      apiClient<Array<{ id: string; name: string }>>("/factories")
        .then((data) => {
          if (data && data.length > 0) {
            setFactories(data);
            setSelectedFactoryId(data[0].id);
          }
        })
        .catch((err) => {
          console.error("Failed to load factories", err);
        });
    } else if (embeddedFactoryId) {
      setSelectedFactoryId(embeddedFactoryId);
    } else if (paramFactoryId) {
      setSelectedFactoryId(paramFactoryId);
    }
  }, [embeddedFactoryId, paramFactoryId]);

  // Initial load: Fetch baseline & available levers
  const loadInitialData = useCallback(async (factoryId: string) => {
    if (!factoryId) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient<SimulateResponse>(
        `/factories/${factoryId}/simulate`,
        {
          method: "POST",
          body: JSON.stringify({ active_levers: {} }),
        }
      );
      setSimResult(response);
      setAvailableLevers(response.available_levers || []);

      // Default recommendation: Turn on top 2 efficiency levers to demonstrate instant feedback
      const initialLevers: ActiveLeversState = {};
      const sorted = [...(response.available_levers || [])].sort(
        (a, b) => (b.standalone_reduction_tco2e || 0) - (a.standalone_reduction_tco2e || 0)
      );

      // Pre-select 1 or 2 high impact levers if available
      if (sorted.length > 0) {
        const top = sorted[0];
        if (top.effect_type === "onsite_generation") {
          initialLevers[top.code] = { kwp: top.default_level || (top.levels && top.levels.length > 0 ? top.levels[0] : 50) };
        } else if (top.effect_type === "shift_to_secondary") {
          initialLevers[top.code] = { level: top.default_level || (top.levels && top.levels.length > 0 ? top.levels[0] : 0.85) };
        } else {
          initialLevers[top.code] = true;
        }
      }

      if (Object.keys(initialLevers).length > 0) {
        setActiveLevers(initialLevers);
        // Run initial simulation with pre-selected lever
        const simulated = await apiClient<SimulateResponse>(
          `/factories/${factoryId}/simulate`,
          {
            method: "POST",
            body: JSON.stringify({ active_levers: initialLevers }),
          }
        );
        setSimResult(simulated);
      }
    } catch (err: any) {
      console.error("Failed to initialize simulator:", err);
      const errMsg =
        err?.error?.message_key || err?.detail?.error?.message_key || "Failed to load simulator.";
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFactoryId) {
      loadInitialData(selectedFactoryId);
    }
  }, [selectedFactoryId, loadInitialData]);

  // Run simulation API with debouncing (< 500ms response guarantee)
  const runSimulation = useCallback(
    async (leversToSimulate: ActiveLeversState) => {
      if (!selectedFactoryId) return;
      setIsSimulating(true);

      try {
        const response = await apiClient<SimulateResponse>(
          `/factories/${selectedFactoryId}/simulate`,
          {
            method: "POST",
            body: JSON.stringify({ active_levers: leversToSimulate }),
          }
        );
        setSimResult(response);
      } catch (err: any) {
        console.error("Simulation error:", err);
        const errMsg =
          err?.error?.message_key || err?.detail?.error?.message_key || "Simulation failed.";
        setError(errMsg);
      } finally {
        setIsSimulating(false);
      }
    },
    [selectedFactoryId]
  );

  // Handle lever toggle
  const handleToggleLever = (
    code: string,
    currentSetting?: boolean | { kwp?: number; level?: number }
  ) => {
    const next = { ...activeLevers };
    if (currentSetting) {
      delete next[code];
    } else {
      // Find default level if stepped lever
      const def = availableLevers.find((l) => l.code === code);
      if (def?.effect_type === "onsite_generation") {
        next[code] = { kwp: def.default_level || (def.levels && def.levels.length > 0 ? def.levels[0] : 50) };
      } else if (def?.effect_type === "shift_to_secondary") {
        next[code] = { level: def.default_level || (def.levels && def.levels.length > 0 ? def.levels[0] : 0.85) };
      } else {
        next[code] = true;
      }
    }

    setActiveLevers(next);

    // Immediate or debounced trigger
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      runSimulation(next);
    }, 150);
  };

  // Handle stepped level adjustment
  const handleUpdateLevel = (
    code: string,
    levelValue: number,
    levelUnit?: string | null
  ) => {
    const next = { ...activeLevers };
    if (levelUnit === "kwp") {
      next[code] = { kwp: levelValue };
    } else if (levelUnit === "recycled_share") {
      next[code] = { level: levelValue };
    } else {
      next[code] = { level: levelValue };
    }

    setActiveLevers(next);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      runSimulation(next);
    }, 150);
  };

  // Handle Select All
  const handleSelectAll = () => {
    const next: ActiveLeversState = {};
    for (const lev of availableLevers) {
      if (lev.effect_type === "onsite_generation") {
        next[lev.code] = { kwp: lev.default_level || (lev.levels && lev.levels.length > 0 ? lev.levels[0] : 50) };
      } else if (lev.effect_type === "shift_to_secondary") {
        next[lev.code] = { level: lev.default_level || (lev.levels && lev.levels.length > 0 ? lev.levels[0] : 0.85) };
      } else {
        next[lev.code] = true;
      }
    }
    setActiveLevers(next);
    runSimulation(next);
  };

  // Handle Reset All
  const handleResetAll = () => {
    setActiveLevers({});
    runSimulation({});
  };

  const handleOpenPlanner = () => {
    if (onOpenPlanner) {
      onOpenPlanner();
    } else if (selectedFactoryId) {
      navigate(`/f/${selectedFactoryId}/plan`);
    } else {
      navigate("/plan");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-rule shadow-xs">
        <div className="flex items-center gap-3">
          {onBackToDashboard ? (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink bg-paper hover:bg-rule/40 rounded-md border border-rule transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted" />
              <span>Back to Dashboard</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink bg-paper hover:bg-rule/40 rounded-md border border-rule transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted" />
              <span>Dashboard</span>
            </button>
          )}

          <div>
            <h1 className="text-base font-bold text-ink flex items-center gap-2">
              <Sliders className="w-4 h-4 text-brass" />
              <span>{t("what_if_title")}</span>
            </h1>
            <span className="text-xs text-muted">{t("what_if_subtitle")}</span>
          </div>
        </div>

        {/* Factory Switcher (if multiple and not embedded) */}
        {!embeddedFactoryId && factories.length > 1 && (
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-muted" />
            <select
              value={selectedFactoryId}
              onChange={(e) => setSelectedFactoryId(e.target.value)}
              className="text-xs font-semibold text-ink bg-paper border border-rule rounded-md px-2.5 py-1.5 focus:outline-none focus:border-ink"
            >
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-ember/10 border border-ember/30 rounded-lg text-xs text-ember flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="bg-white border border-rule rounded-xl p-16 text-center text-muted text-xs space-y-3">
          <RefreshCw className="w-8 h-8 text-ink animate-spin mx-auto" />
          <p className="font-semibold text-ink">Loading simulator levers and baseline data...</p>
          <p className="text-muted">Fetching verified factory emission pools and intervention catalog</p>
        </div>
      ) : simResult ? (
        /* Simulator Main Grid: Levers on Left, Outcomes & Breakdown on Right */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Levers Panel (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <SimulateLevers
              levers={availableLevers}
              activeLevers={activeLevers}
              onToggleLever={handleToggleLever}
              onUpdateLevel={handleUpdateLevel}
              onResetAll={handleResetAll}
              onSelectAll={handleSelectAll}
              isLoading={isSimulating}
            />
          </div>

          {/* Right Column: Outcomes KPI Cards + Before/After Breakdown (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <SimulateOutcomes
              baselineTco2e={simResult.baseline_tco2e}
              projectedTco2e={simResult.after_tco2e}
              reductionTco2e={simResult.reduction_tco2e}
              reductionPct={simResult.reduction_pct}
              totalCapexInr={simResult.total_capex_inr}
              annualSavingsInr={simResult.annual_savings_inr}
              simplePaybackMonths={simResult.payback_months}
              calcTimeMs={simResult.calc_time_ms}
              onOpenPlanner={handleOpenPlanner}
              isLoading={isSimulating}
            />

            <SimulateBreakdown
              baselineTco2e={simResult.baseline_tco2e}
              afterTco2e={simResult.after_tco2e}
              byCategory={simResult.by_category}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
