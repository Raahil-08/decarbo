import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate, Link } from "react-router-dom";
import { DecarboLogo } from "../components/common/DecarboLogo";
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
  ShieldCheck,
  Sun,
  Moon,
} from "lucide-react";
import { apiClient } from "../lib/api";
import { DEMO_FACTORY, DEMO_FACTORY_ID } from "../lib/demoData";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
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
import { CircularityCard } from "../components/dashboard/CircularityCard";
import { DriftDiagnosisModal } from "../components/dashboard/DriftDiagnosisModal";
import { TrackingView } from "../components/tracking/TrackingView";
import { AskDecarboDrawer } from "../components/chat/AskDecarboDrawer";


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
  circularity?: any;
}

export function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "plan" | "simulate" | "tracking" | "coverage" | "records">("overview");
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

  // Drift Diagnosis Modal state
  const [isDriftModalOpen, setIsDriftModalOpen] = useState(false);

  // Ask Decarbo Chat Drawer state
  const [isChatOpen, setIsChatOpen] = useState(false);

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
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Load Factories List
  const loadFactories = useCallback(async () => {
    try {
      const data = await apiClient<Factory[]>("/factories");
      const list = data && data.length > 0 ? data : [DEMO_FACTORY];
      setFactories(list);
      if (!selectedFactoryId) {
        setSelectedFactoryId(list[0].id);
      }
    } catch (err) {
      console.warn("API unreachable, falling back to in-browser Jamnagar demo factory", err);
      setFactories([DEMO_FACTORY]);
      setSelectedFactoryId(DEMO_FACTORY_ID);
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
    } catch (err: any) {
      console.error("Failed to create factory", err);
      const msg =
        err?.error?.details?.msg ||
        err?.error?.message_key ||
        (err instanceof Error ? err.message : "Please check API connection and inputs.");
      alert(`Failed to create factory: ${msg}`);
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
      setFactories((prev) => {
        const exists = prev.find((f) => f.id === DEMO_FACTORY_ID);
        return exists ? prev : [DEMO_FACTORY, ...prev];
      });
      setSelectedFactoryId(DEMO_FACTORY_ID);
      setRefreshTrigger((c) => c + 1);
    } catch (err: any) {
      console.error("Failed to quick-seed demo factory", err);
    } finally {
      setCreatingFactory(false);
    }
  };

  const handleOpenProvenanceForActivity = (activityKeyOrName: string) => {
    setProvenanceFilter(activityKeyOrName);
    setIsProvenanceOpen(true);
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col font-sans relative overflow-x-hidden">
      {/* Blueprint Matrix Grid Background Layer (Matches Landing Page) */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-20 dark:opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "70px 70px",
        }}
      />
      {/* Subtle Ambient Radial Glows */}
      <div className="fixed top-20 right-10 w-96 h-96 bg-leaf/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-96 h-96 bg-brass/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Application Header */}
      <header className="border-b border-rule bg-white/80 dark:bg-[#07090e]/85 backdrop-blur-xl sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center space-x-3 group cursor-pointer transition-transform active:scale-95"
            title="← Revert back to Landing Page"
          >
            <DecarboLogo size={32} withGlow={true} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-ink group-hover:text-leaf transition-colors flex items-center font-mono">
                  <span className="text-leaf">DE</span>CARBO
                </span>
                <span className="text-[10px] font-mono tracking-wider text-muted border border-rule/80 px-2 py-0.5 rounded bg-paper/60 group-hover:border-leaf/40 group-hover:text-leaf transition-all flex items-center gap-1 shadow-2xs">
                  <span>←</span>
                  <span className="underline decoration-dotted">Landing</span>
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted block -mt-0.5">
                {t("app_subtitle")}
              </span>
            </div>
          </Link>

          <div className="flex items-center space-x-3">
            {/* Theme Switcher */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-paper transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-brass" /> : <Moon className="w-4 h-4 text-ink" />}
            </button>

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
            <div className="bg-white/90 dark:bg-[#0c101a]/90 backdrop-blur-md border border-rule dark:border-white/[0.08] rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative overflow-hidden">
              {/* Corner Tech Accents */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-leaf/40 pointer-events-none" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-leaf/40 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-leaf/40 pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-leaf/40 pointer-events-none" />

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
                        className="text-lg font-bold text-ink bg-transparent border-0 border-b border-dashed border-rule focus:outline-none focus:border-leaf cursor-pointer pr-4"
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
                  className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold text-white bg-ink hover:bg-ink-light transition-all shadow-sm border border-white/10"
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
            <div className="border-b border-rule flex space-x-2 sm:space-x-4 overflow-x-auto pb-px scrollbar-none">
              {[
                { id: "overview", label: t("dashboard"), icon: LayoutDashboard },
                { id: "plan", label: t("build_plan"), icon: Sliders },
                { id: "simulate", label: t("what_if_nav_link"), icon: Sliders, color: "text-brass" },
                { id: "tracking", label: t("tracking_nav_link"), icon: ShieldCheck, color: "text-leaf" },
                { id: "coverage", label: "12-Month Coverage", icon: Calendar },
                { id: "records", label: "Activity Records Ledger", icon: Layers },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`pb-3 pt-1 px-3 text-xs font-mono font-bold uppercase tracking-wider flex items-center space-x-2 border-b-2 transition-all shrink-0 ${
                      isActive
                        ? "border-leaf text-leaf shadow-[0_2px_10px_rgba(45,122,87,0.2)]"
                        : "border-transparent text-muted hover:text-ink hover:border-rule"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${tab.color || ""}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
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
                        setIsDriftModalOpen(true);
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

                    {/* 4. Circularity Score Card (PRD §11.3) */}
                    <CircularityCard data={dashboardData.circularity} />
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

            {/* Tab: Implementation Tracking (PRD §14.3) */}
            {activeTab === "tracking" && selectedFactoryId && (
              <TrackingView factoryId={selectedFactoryId} />
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

        {/* Drift Diagnosis Modal (PRD §11.2) */}
        <DriftDiagnosisModal
          isOpen={isDriftModalOpen}
          onClose={() => setIsDriftModalOpen(false)}
          factoryId={selectedFactoryId || undefined}
          onGoToPlanner={() => setActiveTab("plan")}
        />

        {/* Floating Ask Decarbo Button (PRD §15) */}
        {selectedFactoryId && (
          <>
            <button
              onClick={() => setIsChatOpen(true)}
              className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg bg-ink text-white hover:bg-ink-light border border-rule transition-all hover:scale-105 active:scale-95"
              title="Ask Decarbo Assistant"
            >
              <Sparkles className="w-4 h-4 text-leaf animate-pulse" />
              <span className="text-xs font-bold tracking-wide">{t("ask_decarbo")}</span>
            </button>

            <AskDecarboDrawer
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              factoryId={selectedFactoryId}
              factoryName={selectedFactory?.name}
            />
          </>
        )}
      </main>
    </div>
  );
}
