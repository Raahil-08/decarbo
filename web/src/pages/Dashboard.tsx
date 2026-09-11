import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Building2,
  LogOut,
  UploadCloud,
  Play,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  Flame,
} from "lucide-react";
import { apiClient } from "../lib/api";
import { formatIndianNumber, formatEmissionsT } from "../lib/format";
import { UploadModal } from "../components/ingestion/UploadModal";
import { ReviewScreen } from "../components/ingestion/ReviewScreen";
import { CoverageGrid } from "../components/ingestion/CoverageGrid";
import { ActivityRecordsTable } from "../components/ingestion/ActivityRecordsTable";

interface Factory {
  id: string;
  name: string;
  industry: string;
  products?: string;
  city?: string;
  state?: string;
  cluster?: string;
  grid_region?: string;
  output_unit?: string;
  annual_output?: number;
  electricity_tariff_inr_per_kwh?: number;
}

interface CalcRun {
  id: string;
  factory_id: string;
  total_kgco2e: number;
  output_quantity: number | null;
  intensity_kgco2e_per_output: number | null;
  summary: {
    total_kgco2e: number;
    scope1_kgco2e: number;
    scope2_kgco2e: number;
    scope3_kgco2e: number;
    hotspots: Array<{
      activity_type: string;
      kgco2e: number;
      pct_of_total: number;
      cumulative_pct: number;
      is_pareto_leakpoint: boolean;
    }>;
    circularity: {
      circularity_score: number;
      secondary_material_share: number;
    };
    drift_alerts: Array<{
      activity_type: string;
      message: string;
      percentage_change: number;
    }>;
  };
}

export function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"coverage" | "records" | "calc">("coverage");
  const [loading, setLoading] = useState(true);

  // Ingestion & Modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [reviewUpload, setReviewUpload] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Create Factory Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFactoryName, setNewFactoryName] = useState("");
  const [newFactoryIndustry, setNewFactoryIndustry] = useState("brass_parts");
  const [newFactoryCity, setNewFactoryCity] = useState("Jamnagar");
  const [newFactoryOutput, setNewFactoryOutput] = useState("1200");
  const [newFactoryTariff, setNewFactoryTariff] = useState("8.2");
  const [creatingFactory, setCreatingFactory] = useState(false);

  // Calculation state
  const [calculating, setCalculating] = useState(false);
  const [latestCalcRun, setLatestCalcRun] = useState<CalcRun | null>(null);

  const navigate = useNavigate();

  const loadFactories = useCallback(async () => {
    try {
      const data = await apiClient<Factory[]>("/factories");
      setFactories(data);
      if (data.length > 0 && !selectedFactoryId) {
        setSelectedFactoryId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load factories", err);
    } finally {
      setLoading(false);
    }
  }, [selectedFactoryId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
        loadFactories();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, loadFactories]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const selectedFactory = factories.find((f) => f.id === selectedFactoryId);

  const handleCreateFactory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingFactory(true);
    try {
      const created = await apiClient<Factory>("/factories", {
        method: "POST",
        body: JSON.stringify({
          name: newFactoryName || "Radhe Brass Industries",
          industry: newFactoryIndustry || "brass_parts",
          city: newFactoryCity || "Jamnagar",
          state: "Gujarat",
          cluster: "Jamnagar Brass",
          grid_region: "IN-GJ",
          output_unit: "t",
          annual_output: parseFloat(newFactoryOutput) || 1200,
          electricity_tariff_inr_per_kwh: parseFloat(newFactoryTariff) || 8.2,
        }),
      });

      setFactories((prev) => [...prev, created]);
      setSelectedFactoryId(created.id);
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error("Failed to create factory", err);
      alert("Failed to create factory. Please check inputs.");
    } finally {
      setCreatingFactory(false);
    }
  };

  const handleQuickSeedDemo = async () => {
    setCreatingFactory(true);
    try {
      const created = await apiClient<Factory>("/factories", {
        method: "POST",
        body: JSON.stringify({
          name: "Radhe Brass Industries",
          industry: "brass_parts",
          products: "Precision turned brass components and inserts",
          city: "Jamnagar",
          state: "Gujarat",
          cluster: "Jamnagar Brass",
          grid_region: "IN-GJ",
          output_unit: "t",
          annual_output: 1200,
          electricity_tariff_inr_per_kwh: 8.2,
        }),
      });
      setFactories((prev) => [...prev, created]);
      setSelectedFactoryId(created.id);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingFactory(false);
    }
  };

  const handleRunCalculation = async () => {
    if (!selectedFactoryId) return;
    setCalculating(true);
    try {
      const run = await apiClient<CalcRun>(`/factories/${selectedFactoryId}/calculate`, {
        method: "POST",
      });
      setLatestCalcRun(run);
      setActiveTab("calc");
    } catch (err: any) {
      console.error("Calculation failed", err);
      alert("Calculation run failed: " + (err?.error?.message_key || "No activity records found"));
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-rule bg-white sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-ink flex items-center justify-center text-paper font-semibold text-lg shadow-sm">
              D
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-ink">Decarbo</span>
              <span className="ml-2 text-xs font-mono text-muted bg-paper px-2 py-0.5 rounded border border-rule">
                SME Planner
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-xs text-muted font-mono hidden sm:inline-block">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-paper transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {loading ? (
          <div className="text-center py-20 text-sm text-muted">Loading factories...</div>
        ) : factories.length === 0 ? (
          /* Empty State */
          <div className="bg-white border border-rule rounded-xl p-12 text-center max-w-lg mx-auto mt-8 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-paper flex items-center justify-center mx-auto text-ink mb-4 border border-rule">
              <Building2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-ink tracking-tight">No factory registered yet</h3>
            <p className="mt-2 text-sm text-muted">
              Add your factory or load the pre-configured Jamnagar Brass benchmark unit to start uploading data.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleQuickSeedDemo}
                disabled={creatingFactory}
                className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium text-white bg-ink hover:bg-ink-light transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-2 text-leaf" />
                Load Demo Jamnagar Unit
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium text-ink bg-paper border border-rule hover:border-ink transition-colors"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Custom Factory
              </button>
            </div>
          </div>
        ) : reviewUpload ? (
          /* Review Mode Active */
          <div className="space-y-4">
            <button
              onClick={() => setReviewUpload(null)}
              className="inline-flex items-center text-xs text-muted hover:text-ink transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Back to dashboard
            </button>
            <ReviewScreen
              upload={reviewUpload}
              onConfirmed={() => {
                setReviewUpload(null);
                setRefreshTrigger((c) => c + 1);
                setActiveTab("records");
              }}
              onCancel={() => setReviewUpload(null)}
            />
          </div>
        ) : (
          /* Factory Workspace */
          <div className="space-y-6">
            {/* Top Workspace Bar */}
            <div className="bg-white border border-rule rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-paper border border-rule text-ink">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <select
                        value={selectedFactoryId || ""}
                        onChange={(e) => setSelectedFactoryId(e.target.value)}
                        className="text-lg font-bold text-ink bg-transparent border-0 border-b border-dashed border-rule focus:outline-none focus:border-ink cursor-pointer pr-4"
                      >
                        {factories.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="p-1 rounded text-muted hover:text-ink hover:bg-paper"
                        title="Add another factory"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center space-x-3 mt-1 text-xs text-muted">
                      <span>{selectedFactory?.city}, {selectedFactory?.state}</span>
                      <span>•</span>
                      <span className="font-mono bg-paper px-1.5 py-0.5 rounded border border-rule">
                        {selectedFactory?.cluster || "Cluster: Generic"}
                      </span>
                      <span>•</span>
                      <span className="font-mono">
                        Grid: {selectedFactory?.grid_region || "IN"}
                      </span>
                      {selectedFactory?.annual_output && (
                        <>
                          <span>•</span>
                          <span>{selectedFactory.annual_output} t/yr</span>
                        </>
                      )}
                      {selectedFactory?.electricity_tariff_inr_per_kwh && (
                        <>
                          <span>•</span>
                          <span>₹{selectedFactory.electricity_tariff_inr_per_kwh}/kWh</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-ink hover:bg-ink-light transition-colors shadow-sm"
                >
                  <UploadCloud className="w-4 h-4 mr-1.5 text-brass" />
                  Upload Data
                </button>
                <button
                  onClick={handleRunCalculation}
                  disabled={calculating}
                  className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-leaf hover:bg-leaf/90 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  {calculating ? "Calculating..." : "Run Engine"}
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-rule flex space-x-6">
              <button
                onClick={() => setActiveTab("coverage")}
                className={`pb-3 text-xs font-semibold tracking-wide flex items-center space-x-2 border-b-2 transition-colors ${
                  activeTab === "coverage"
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>12-Month Coverage</span>
              </button>
              <button
                onClick={() => setActiveTab("records")}
                className={`pb-3 text-xs font-semibold tracking-wide flex items-center space-x-2 border-b-2 transition-colors ${
                  activeTab === "records"
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Activity Records Ledger</span>
              </button>
              {latestCalcRun && (
                <button
                  onClick={() => setActiveTab("calc")}
                  className={`pb-3 text-xs font-semibold tracking-wide flex items-center space-x-2 border-b-2 transition-colors ${
                    activeTab === "calc"
                      ? "border-leaf text-leaf"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <Flame className="w-4 h-4 text-ember" />
                  <span>Emissions Run Summary</span>
                </button>
              )}
            </div>

            {/* Tab Contents */}
            {activeTab === "coverage" && selectedFactoryId && (
              <CoverageGrid factoryId={selectedFactoryId} key={`coverage-${refreshTrigger}`} />
            )}

            {activeTab === "records" && selectedFactoryId && (
              <ActivityRecordsTable
                factoryId={selectedFactoryId}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === "calc" && latestCalcRun && (
              <div className="space-y-6">
                {/* Metrics Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
                    <div className="text-xs text-muted font-medium">Total Footprint</div>
                    <div className="text-2xl font-bold font-mono text-ember mt-1">
                      {formatEmissionsT(latestCalcRun.total_kgco2e)}
                    </div>
                    <div className="text-[11px] text-muted mt-1 font-mono">
                      {formatIndianNumber(Math.round(latestCalcRun.total_kgco2e))} kgCO2e
                    </div>
                  </div>

                  <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
                    <div className="text-xs text-muted font-medium">Carbon Intensity</div>
                    <div className="text-2xl font-bold font-mono text-ink mt-1">
                      {latestCalcRun.intensity_kgco2e_per_output
                        ? (latestCalcRun.intensity_kgco2e_per_output / 1000).toFixed(2) + " tCO2e/t"
                        : "—"}
                    </div>
                    <div className="text-[11px] text-muted mt-1">Per tonne finished brass output</div>
                  </div>

                  <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
                    <div className="text-xs text-muted font-medium">Circularity Score</div>
                    <div className="text-2xl font-bold font-mono text-leaf mt-1">
                      {latestCalcRun.summary?.circularity?.circularity_score ?? 0}/100
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {((latestCalcRun.summary?.circularity?.secondary_material_share ?? 0) * 100).toFixed(0)}% recycled scrap share
                    </div>
                  </div>

                  <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
                    <div className="text-xs text-muted font-medium">Scope Breakdown</div>
                    <div className="flex items-center space-x-2 mt-2 text-xs font-mono">
                      <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        S1: {formatEmissionsT(latestCalcRun.summary.scope1_kgco2e)}
                      </span>
                      <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        S2: {formatEmissionsT(latestCalcRun.summary.scope2_kgco2e)}
                      </span>
                    </div>
                    <div className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-1 inline-block text-xs font-mono">
                      S3: {formatEmissionsT(latestCalcRun.summary.scope3_kgco2e)}
                    </div>
                  </div>
                </div>

                {/* Pareto Leak-Points */}
                <div className="bg-white border border-rule rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-ink flex items-center">
                        <Flame className="w-4 h-4 text-ember mr-2" />
                        80% Pareto Leak-Points
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        These key drivers represent the majority of your factory emissions
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-rule/60">
                    {latestCalcRun.summary?.hotspots
                      ?.filter((h) => h.is_pareto_leakpoint)
                      .map((h, idx) => (
                        <div key={idx} className="py-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-ink">
                              {h.activity_type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                            </span>
                            <span className="ml-2 text-[11px] text-muted font-mono">
                              Cumulative {h.cumulative_pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="font-bold text-ember">
                              {formatEmissionsT(h.kgco2e)}
                            </span>{" "}
                            <span className="text-muted">({h.pct_of_total.toFixed(1)}%)</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Modal */}
        {selectedFactoryId && (
          <UploadModal
            factoryId={selectedFactoryId}
            isOpen={isUploadOpen}
            onClose={() => setIsUploadOpen(false)}
            onUploadReadyForReview={(upload) => {
              setIsUploadOpen(false);
              setReviewUpload(upload);
            }}
          />
        )}

        {/* Add Factory Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-rule space-y-5">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <h3 className="text-base font-bold text-ink">Register New Factory</h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-xs text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreateFactory} className="space-y-4 text-xs">
                <div>
                  <label className="block text-ink font-medium mb-1">Factory Name</label>
                  <input
                    type="text"
                    required
                    value={newFactoryName}
                    onChange={(e) => setNewFactoryName(e.target.value)}
                    placeholder="e.g. Radhe Brass Industries"
                    className="w-full px-3 py-2 bg-paper border border-rule rounded-md focus:outline-none focus:border-ink text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink font-medium mb-1">Industry</label>
                    <select
                      value={newFactoryIndustry}
                      onChange={(e) => setNewFactoryIndustry(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-md focus:outline-none focus:border-ink text-xs"
                    >
                      <option value="brass_parts">Brass Parts (Jamnagar)</option>
                      <option value="textiles">Textiles (Surat)</option>
                      <option value="foundry">Foundry (Rajkot)</option>
                      <option value="ceramics">Ceramics (Morbi)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-ink font-medium mb-1">City</label>
                    <input
                      type="text"
                      value={newFactoryCity}
                      onChange={(e) => setNewFactoryCity(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-md focus:outline-none focus:border-ink text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink font-medium mb-1">Annual Output (t/yr)</label>
                    <input
                      type="number"
                      value={newFactoryOutput}
                      onChange={(e) => setNewFactoryOutput(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-md focus:outline-none focus:border-ink text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-ink font-medium mb-1">Tariff (₹/kWh)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newFactoryTariff}
                      onChange={(e) => setNewFactoryTariff(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-md focus:outline-none focus:border-ink text-xs"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-rule flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3 py-1.5 rounded text-xs text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingFactory}
                    className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-ink hover:bg-ink-light transition-colors"
                  >
                    {creatingFactory ? "Creating..." : "Save Factory"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
