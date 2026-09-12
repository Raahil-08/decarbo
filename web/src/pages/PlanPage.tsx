import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sliders, AlertCircle } from "lucide-react";
import { apiClient } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { PlanForm } from "../components/plan/PlanForm";
import type { PlanFormParams } from "../components/plan/PlanForm";
import { PlanResults } from "../components/plan/PlanResults";
import type { PlanData } from "../components/plan/PlanResults";
import type { MaccItem } from "../components/plan/MaccChart";


interface PlanPageProps {
  embeddedFactoryId?: string;
  onBackToDashboard?: () => void;
}

export function PlanPage({ embeddedFactoryId, onBackToDashboard }: PlanPageProps) {
  const { factoryId: paramFactoryId } = useParams<{ factoryId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const activeFactoryId = embeddedFactoryId || paramFactoryId;

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [macc, setMacc] = useState<MaccItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(true);
  const [lastTargetPct, setLastTargetPct] = useState<number>(20);

  // Load existing plans and MACC if available
  const loadExistingPlans = useCallback(async () => {
    if (!activeFactoryId) return;
    setIsLoading(true);
    setError(null);
    try {
      const plansList = await apiClient<any[]>(`/factories/${activeFactoryId}/plans`);
      if (plansList && plansList.length > 0) {
        // Fetch full details for the top plans
        const detailedPlans: PlanData[] = [];
        for (const p of plansList.slice(0, 3)) {
          try {
            const detail = await apiClient<PlanData>(`/factories/${activeFactoryId}/plans/${p.id}`);
            detailedPlans.push(detail);
          } catch (e) {
            console.error("Failed to load plan detail", e);
          }
        }

        if (detailedPlans.length > 0) {
          setPlans(detailedPlans);
          setShowForm(false);
        }
      }

      // Fetch MACC curve
      try {
        const maccData = await apiClient<MaccItem[]>(`/factories/${activeFactoryId}/macc`);
        setMacc(maccData);
      } catch (e) {
        console.warn("Could not fetch MACC curve directly", e);
      }
    } catch (err: any) {
      console.warn("No previous plans loaded", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeFactoryId]);

  useEffect(() => {
    loadExistingPlans();
  }, [loadExistingPlans]);

  // Handle Generate Plans submission
  const handleGeneratePlans = async (params: PlanFormParams) => {
    if (!activeFactoryId) {
      setError("Please select a factory first.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    if (params.target_reduction_pct) {
      setLastTargetPct(params.target_reduction_pct);
    }

    try {
      const response = await apiClient<{
        plans: PlanData[];
        macc: MaccItem[];
      }>(`/factories/${activeFactoryId}/plans`, {
        method: "POST",
        body: JSON.stringify(params),
      });

      setPlans(response.plans);
      setMacc(response.macc);
      setShowForm(false);
    } catch (err: any) {
      console.error("Plan generation error:", err);
      const errMsg =
        err?.error?.message_key || err?.detail?.error?.message_key || err?.message || "Failed to generate plans.";
      setError(errMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle plan selection persistence
  const handleSelectPlan = async (planId: string) => {
    if (!activeFactoryId) return;
    try {
      await apiClient(`/factories/${activeFactoryId}/plans/${planId}/select`, {
        method: "PATCH",
      });

      // Update local state
      setPlans((prev) =>
        prev.map((p) => ({
          ...p,
          is_selected: p.id === planId,
        }))
      );
    } catch (err) {
      console.error("Failed to select plan", err);
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
              <span>{t("plan_planner_title")}</span>
            </h1>
            <span className="text-xs text-muted">
              MILP Multi-objective Optimization • 3 Plans • Accounting Ledger
            </span>
          </div>
        </div>

        {plans.length > 0 && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-ink bg-paper hover:bg-rule/40 rounded-md border border-rule transition-colors self-start sm:self-auto"
          >
            <Sliders className="w-3.5 h-3.5 text-brass" />
            <span>{showForm ? "Hide Parameters" : "Adjust Budget / Target"}</span>
          </button>
        )}
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="p-4 bg-ember/10 border border-ember/30 rounded-lg text-xs text-ember flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Optimizer Form (Collapsible when plans are loaded) */}
      {(showForm || plans.length === 0) && (
        <PlanForm
          onSubmit={handleGeneratePlans}
          isLoading={isGenerating}
          initialBudget={1000000}
          initialTarget={lastTargetPct}
        />
      )}

      {/* Results View */}
      {isLoading ? (
        <div className="bg-white border border-rule rounded-xl p-12 text-center text-muted text-xs space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink border-t-transparent mx-auto" />
          <p>Loading decarbonisation plans...</p>
        </div>
      ) : plans.length > 0 ? (
        <PlanResults
          plans={plans}
          macc={macc}
          factoryId={activeFactoryId || ""}
          targetReductionPct={lastTargetPct}
          onSelectPlan={handleSelectPlan}
        />
      ) : !showForm ? (
        <div className="bg-white border border-rule rounded-xl p-8 text-center text-muted text-xs">
          No plans generated yet. Click "Build my plan" above to optimize.
        </div>
      ) : null}
    </div>
  );
}
