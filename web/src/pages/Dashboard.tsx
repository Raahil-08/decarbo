import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Building2,
  LogOut,
  UploadCloud,
  Layers,
  Sparkles,
  RefreshCw,
  LayoutDashboard,
  Calendar,
  Sliders,
} from "lucide-react";
import { apiClient } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { LanguageSwitcher } from "../components/dashboard/LanguageSwitcher";
import { TopStrip } from "../components/dashboard/TopStrip";
import { DriftBanner } from "../components/dashboard/DriftBanner";
import { SankeyChart } from "../components/dashboard/SankeyChart";
import { LeakPointList } from "../components/dashboard/LeakPointList";
import { ProvenanceDrawer } from "../components/dashboard/ProvenanceDrawer";
import { EmptyDashboard } from "../components/dashboard/EmptyDashboard";
import { UploadModal } from "../components/ingestion/UploadModal";
import { ReviewScreen } from "../components/ingestion/ReviewScreen";
import { CoverageGrid } from "../components/ingestion/CoverageGrid";
import { ActivityRecordsTable } from "../components/ingestion/ActivityRecordsTable";
import { PlanPage } from "./PlanPage";
import { WhatIfPage } from "./WhatIfPage";


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

interface DashboardData {
  factory_id: string;
  factory_name: string;
  industry: string;
  city?: string;
  state?: string;
  cluster?: string;
  has_data: boolean;
  period_start?: string;
  period_end?: string;
  annual_tco2e: number;
  intensity_tco2e_per_tonne_output: number | null;
  kwh_per_tonne_output: number | null;
  estimated_factor_pct: number;
  data_quality_label: string;
  scope1_tco2e: number;
  scope2_tco2e: number;
  scope3_tco2e: number;
  sankey: {
    nodes: Array<{ name: string; itemStyle?: { color: string } }>;
    links: Array<{ source: string; target: string; value: number }>;
    table_rows: Array<{
      scope: string;
      category: string;
      activity: string;
      tco2e: number;
      share_pct: number;
    }>;
  };
  leak_points: Array<{
    rank: number;
    activity_type: string;
    name: string;
    scope: string;
    category: string;
    tco2e: number;
    pct_of_total: number;
    cumulative_pct: number;
    is_pareto_leakpoint: boolean;
    best_fix?: any;
  }>;
  drift_alerts: Array<{
    activity_type: string;
    percentage_change: number;
    period_start: string;
    period_end: string;
    severity: string;
    message: string;
    recommendation: string;
  }>;
  provenance_items: any[];
}

export function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "plan" | "simulate" | "coverage" | "records">("overview");
  const [loading, setLoading] = useState(true);


  // Dashboard Data state
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Ingestion & Review state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [reviewUpload, setReviewUpload] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Provenance Drawer state
  const [isProvenanceOpen, setIsProvenanceOpen] = useState(false);
  const [provenanceFilter, setProvenanceFilter] = useState<string | null>(null);

  // Create Factory Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFactoryName, setNewFactoryName] = useState("");
  const [newFactoryIndustry, setNewFactoryIndustry] = useState("brass_parts");
  const [newFactoryCity, setNewFactoryCity] = useState("Jamnagar");
  const [newFactoryOutput, setNewFactoryOutput] = useState("1200");
  const [newFactoryTariff, setNewFactoryTariff] = useState("8.2");
  const [creatingFactory, setCreatingFactory] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const { t } = useI18n();
  const navigate = useNavigate();

  // Load Factories List
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

  // Load Dashboard Data for selected factory
  const loadDashboard = useCallback(async () => {
    if (!selectedFactoryId) return;
    setDashboardLoading(true);
    try {
      const data = await apiClient<DashboardData>(`/factories/${selectedFactoryId}/dashboard`);
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setDashboardLoading(false);
    }
  }, [selectedFactoryId]);

  useEffect(() => {
    const devToken = localStorage.getItem("decarbo_dev_token");
    if (devToken) {
      setUser({ id: "11111111-1111-1111-1111-111111111111", email: "owner@jamnagarbrass.com" });
      loadFactories();
      return;
    }

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
      if (!session && !localStorage.getItem("decarbo_dev_token")) {
        navigate("/login");
      } else if (session) {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, loadFactories]);

  useEffect(() => {
    if (selectedFactoryId) {
      loadDashboard();
    }
  }, [selectedFactoryId, refreshTrigger, loadDashboard]);

  const handleLogout = async () => {
    localStorage.removeItem("decarbo_dev_token");
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

  const handleSeedDemoData = async () => {
    if (!selectedFactoryId) return;
    setLoadingDemo(true);
    try {
      await apiClient(`/factories/${selectedFactoryId}/demo-seed`, {
        method: "POST",
      });
      setRefreshTrigger((c) => c + 1);
    } catch (err) {
      console.error("Failed to seed demo data", err);
      alert("Demo data seeding failed. Please check server logs.");
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleQuickSeedDemo = async () => {
    setCreatingFactory(true);
    try {
      const created = await apiClient<Factory>("/factories", {
        method: "POST",
        body: JSON.stringify({
          name: "Sample Brass Components (demo)",
          industry: "brass_components",
          products: "Precision turned brass components and inserts",
          city: "Jamnagar",
          state: "Gujarat",
          cluster: "Jamnagar Brass",
          grid_region: "IN-GJ",
          output_unit: "t",
          annual_output: 540,
          electricity_tariff_inr_per_kwh: 7.8,
        }),
      });
      setFactories((prev) => [...prev, created]);
      setSelectedFactoryId(created.id);

      // Seed 12-month demo records
      await apiClient(`/factories/${created.id}/demo-seed`, {
        method: "POST",
      });
      setRefreshTrigger((c) => c + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingFactory(false);
    }
  };

  const handleOpenProvenanceForActivity = (activityKeyOrName: string) => {
    setProvenanceFilter(activityKeyOrName);
    setIsProvenanceOpen(true);
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col font-sans">
      {/* Top Application Header */}
      <header className="border-b border-rule bg-white sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center text-paper font-semibold text-lg shadow-sm">
              D
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-ink">
                {t("app_title")}
              </span>
              <span className="ml-2 text-xs font-mono text-muted bg-paper px-2 py-0.5 rounded border border-rule hidden sm:inline-block">
                {t("app_subtitle")}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Language Switcher */}
            <LanguageSwitcher />

            <div className="h-4 w-px bg-rule hidden sm:block" />

            <span className="text-xs text-muted font-mono hidden md:inline-block">
              {user?.email}
            </span>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-paper transition-colors"
              title={t("sign_out")}
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
          /* Empty Factory State */
          <div className="bg-white border border-rule rounded-2xl p-12 text-center max-w-lg mx-auto mt-8 shadow-sm space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-paper flex items-center justify-center mx-auto text-ink border border-rule shadow-xs">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink tracking-tight">No factory registered yet</h3>
              <p className="mt-1.5 text-xs text-muted">
                Add your factory or load the pre-configured Jamnagar Brass benchmark unit to start uploading data.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={handleQuickSeedDemo}
                disabled={creatingFactory}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-ink hover:bg-ink-light transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-2 text-leaf" />
                Load Demo Jamnagar Unit
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold text-ink bg-paper border border-rule hover:border-ink transition-all shadow-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Custom Factory
              </button>
            </div>
          </div>
        ) : reviewUpload ? (
          /* Review Screen Active */
          <div className="space-y-4">
            <button
              onClick={() => setReviewUpload(null)}
              className="inline-flex items-center text-xs text-muted hover:text-ink transition-colors font-medium"
            >
              ← Back to dashboard
            </button>
            <ReviewScreen
              upload={reviewUpload}
              onConfirmed={() => {
                setReviewUpload(null);
                setRefreshTrigger((c) => c + 1);
                setActiveTab("overview");
              }}
              onCancel={() => setReviewUpload(null)}
            />
          </div>
        ) : (
          /* Active Factory Workspace */
          <div className="space-y-6">
            {/* Top Factory Header Bar */}
            <div className="bg-white border border-rule rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-paper border border-rule text-ink shadow-xs">
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

                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted">
                      <span>{selectedFactory?.city}, {selectedFactory?.state}</span>
                      <span>•</span>
                      <span className="font-mono bg-paper px-1.5 py-0.5 rounded border border-rule text-[11px]">
                        {selectedFactory?.cluster || "Cluster: Jamnagar Brass"}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-[11px]">
                        Grid: {selectedFactory?.grid_region || "IN-GJ"}
                      </span>
                      {selectedFactory?.annual_output && (
                        <>
                          <span>•</span>
                          <span>{selectedFactory.annual_output} t/yr finished output</span>
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
              <div className="flex items-center space-x-2.5">
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-ink hover:bg-ink-light transition-all shadow-sm"
                >
                  <UploadCloud className="w-4 h-4 mr-1.5 text-brass" />
                  <span>{t("upload_data")}</span>
                </button>

                <button
                  onClick={() => setRefreshTrigger((c) => c + 1)}
                  disabled={dashboardLoading}
                  className="p-2 rounded-xl text-muted hover:text-ink bg-paper border border-rule hover:border-ink transition-all shadow-xs"
                  title="Recalculate and refresh numbers"
                >
                  <RefreshCw className={`w-4 h-4 ${dashboardLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* View Navigation Tabs */}
            <div className="border-b border-rule flex space-x-6">
              <button
                onClick={() => setActiveTab("overview")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider flex items-center space-x-2 border-b-2 transition-colors ${
                  activeTab === "overview"
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>{t("dashboard")}</span>
              </button>

              <button
                onClick={() => setActiveTab("plan")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider flex items-center space-x-2 border-b-2 transition-colors ${
                  activeTab === "plan"
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>{t("build_plan")}</span>
              </button>

              <button
                onClick={() => setActiveTab("simulate")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider flex items-center space-x-2 border-b-2 transition-colors ${
                  activeTab === "simulate"
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <Sliders className="w-4 h-4 text-brass" />
                <span>{t("what_if_nav_link")}</span>
              </button>


              <button
                onClick={() => setActiveTab("coverage")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider flex items-center space-x-2 border-b-2 transition-colors ${
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
                className={`pb-3 text-xs font-bold uppercase tracking-wider flex items-center space-x-2 border-b-2 transition-colors ${
                  activeTab === "records"
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Activity Records Ledger</span>
              </button>
            </div>

            {/* Tab 1: Phase 4 Dashboard Overview */}
            {activeTab === "overview" && (
              <>
                {dashboardLoading ? (
                  <div className="py-24 text-center text-xs text-muted">
                    Executing calculation engine & compiling provenance...
                  </div>
                ) : !dashboardData || !dashboardData.has_data ? (
                  /* Empty State */
                  <EmptyDashboard
                    onUploadClick={() => setIsUploadOpen(true)}
                    onLoadDemoClick={handleSeedDemoData}
                    loadingDemo={loadingDemo}
                  />
                ) : (
                  /* Full Hero Dashboard */
                  <div className="space-y-6">
                    {/* 1. Top Strip */}
                    <TopStrip
                      annualTco2e={dashboardData.annual_tco2e}
                      totalKgco2e={dashboardData.annual_tco2e * 1000.0}
                      intensityTco2ePerT={dashboardData.intensity_tco2e_per_tonne_output}
                      kwhPerTonne={dashboardData.kwh_per_tonne_output}
                      estimatedFactorPct={dashboardData.estimated_factor_pct}
                      onOpenProvenance={() => {
                        setProvenanceFilter(null);
                        setIsProvenanceOpen(true);
                      }}
                    />

                    {/* 2. Drift Alert Banner */}
                    <DriftBanner
                      alerts={dashboardData.drift_alerts}
                      onInspectAction={() => {
                        setProvenanceFilter("grid_electricity");
                        setIsProvenanceOpen(true);
                      }}
                    />

                    {/* 3. Main Dashboard Visual Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* Left 7 cols: Sankey Diagram */}
                      <div className="lg:col-span-7">
                        <SankeyChart
                          nodes={dashboardData.sankey.nodes}
                          links={dashboardData.sankey.links}
                          tableRows={dashboardData.sankey.table_rows}
                          onSelectActivity={handleOpenProvenanceForActivity}
                        />
                      </div>

                      {/* Right 5 cols: Ranked Leak-Point List */}
                      <div className="lg:col-span-5">
                        <LeakPointList
                          leakPoints={dashboardData.leak_points}
                          onSelectLeakPoint={handleOpenProvenanceForActivity}
                          onBuildPlan={() => {
                            setActiveTab("plan");
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Tab: Decarbonisation Planner */}
            {activeTab === "plan" && selectedFactoryId && (
              <PlanPage
                embeddedFactoryId={selectedFactoryId}
                onBackToDashboard={() => setActiveTab("overview")}
              />
            )}

            {/* Tab: What-if Simulator */}
            {activeTab === "simulate" && selectedFactoryId && (
              <WhatIfPage
                embeddedFactoryId={selectedFactoryId}
                onBackToDashboard={() => setActiveTab("overview")}
                onOpenPlanner={() => setActiveTab("plan")}
              />
            )}


            {/* Tab 2: 12-Month Coverage Grid */}
            {activeTab === "coverage" && selectedFactoryId && (
              <CoverageGrid factoryId={selectedFactoryId} key={`coverage-${refreshTrigger}`} />
            )}

            {/* Tab 3: Activity Records Table */}
            {activeTab === "records" && selectedFactoryId && (
              <ActivityRecordsTable
                factoryId={selectedFactoryId}
                refreshTrigger={refreshTrigger}
              />
            )}
          </div>
        )}

        {/* Provenance Slide-over Drawer */}
        <ProvenanceDrawer
          isOpen={isProvenanceOpen}
          onClose={() => setIsProvenanceOpen(false)}
          items={dashboardData?.provenance_items || []}
          initialActivityFilter={provenanceFilter}
        />

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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rule space-y-5">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <h3 className="text-base font-bold text-ink">Register New Factory</h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-xs text-muted hover:text-ink font-medium"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreateFactory} className="space-y-4 text-xs">
                <div>
                  <label className="block text-ink font-semibold mb-1">Factory Name</label>
                  <input
                    type="text"
                    required
                    value={newFactoryName}
                    onChange={(e) => setNewFactoryName(e.target.value)}
                    placeholder="e.g. Radhe Brass Industries"
                    className="w-full px-3 py-2 bg-paper border border-rule rounded-lg focus:outline-none focus:border-ink text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink font-semibold mb-1">Industry</label>
                    <select
                      value={newFactoryIndustry}
                      onChange={(e) => setNewFactoryIndustry(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-lg focus:outline-none focus:border-ink text-xs font-medium"
                    >
                      <option value="brass_parts">Brass Parts (Jamnagar)</option>
                      <option value="textiles">Textiles (Surat)</option>
                      <option value="foundry">Foundry (Rajkot)</option>
                      <option value="ceramics">Ceramics (Morbi)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-ink font-semibold mb-1">City</label>
                    <input
                      type="text"
                      value={newFactoryCity}
                      onChange={(e) => setNewFactoryCity(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-lg focus:outline-none focus:border-ink text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink font-semibold mb-1">Annual Output (t/yr)</label>
                    <input
                      type="number"
                      value={newFactoryOutput}
                      onChange={(e) => setNewFactoryOutput(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-lg focus:outline-none focus:border-ink text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-ink font-semibold mb-1">Tariff (₹/kWh)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newFactoryTariff}
                      onChange={(e) => setNewFactoryTariff(e.target.value)}
                      className="w-full px-3 py-2 bg-paper border border-rule rounded-lg focus:outline-none focus:border-ink text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-rule flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs text-muted hover:text-ink font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingFactory}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-ink hover:bg-ink-light transition-all shadow-sm"
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
