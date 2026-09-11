import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { Plus, Building2, LogOut } from "lucide-react";
import { apiClient } from "../lib/api";

interface Factory {
  id: string;
  name: string;
  industry: string;
  city?: string;
  state?: string;
  annual_output?: number;
}

export function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadFactories = async () => {
    try {
      const data = await apiClient<Factory[]>("/factories");
      setFactories(data);
    } catch (err) {
      console.error("Failed to load factories", err);
    } finally {
      setLoading(false);
    }
  };

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
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-rule bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-ink flex items-center justify-center text-paper font-semibold text-lg">
              D
            </div>
            <span className="text-xl font-bold tracking-tight text-ink">Decarbo</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-muted font-mono">{user?.email}</span>
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

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-ink tracking-tight">Your Factories</h1>
            <p className="text-sm text-muted mt-1">Select a factory to manage decarbonisation plans</p>
          </div>
          <button
            onClick={() => alert("Factory creation wizard will be available in onboarding")}
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-ink hover:bg-ink-light transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add factory
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-muted">Loading factories...</div>
        ) : factories.length === 0 ? (
          <div className="bg-white border border-rule rounded-lg p-12 text-center max-w-lg mx-auto mt-8">
            <div className="w-12 h-12 rounded-full bg-paper flex items-center justify-center mx-auto text-muted mb-4">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-ink">No factory registered yet</h3>
            <p className="mt-1 text-sm text-muted">
              Add your first factory or upload an electricity bill to see your first numbers.
            </p>
            <div className="mt-6">
              <button
                onClick={() => alert("Factory onboarding wizard starts in Phase 3/4")}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-ink hover:bg-ink-light transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add your first factory
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {factories.map((factory) => (
              <div
                key={factory.id}
                className="bg-white border border-rule rounded-lg p-6 hover:border-ink/40 transition-colors cursor-pointer"
              >
                <h3 className="text-base font-semibold text-ink">{factory.name}</h3>
                <p className="text-xs text-muted mt-1">{factory.city}, {factory.state}</p>
                <div className="mt-4 pt-4 border-t border-rule flex justify-between text-xs text-muted">
                  <span>Industry: {factory.industry}</span>
                  {factory.annual_output && <span>{factory.annual_output} t/yr</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
