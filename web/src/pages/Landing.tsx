import { Link } from "react-router-dom";
import { ArrowRight, Zap, TrendingDown, IndianRupee, ShieldCheck } from "lucide-react";

export function Landing() {
  return (
    <div className="min-h-screen bg-paper flex flex-col justify-between">
      {/* Navbar */}
      <header className="border-b border-rule bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-ink flex items-center justify-center text-paper font-semibold text-lg">
              D
            </div>
            <span className="text-xl font-bold tracking-tight text-ink">Decarbo</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              to="/login"
              className="text-sm font-medium text-ink hover:text-ink-light transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-ink hover:bg-ink-light transition-colors shadow-sm"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center text-center">
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-leaf/10 text-leaf border border-leaf/20 mb-6">
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
          Tailored for Indian SME Factories
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-ink max-w-3xl tracking-tight leading-tight sm:leading-tight">
          The cheapest way to cut your factory's CO₂
        </h1>

        <p className="mt-4 text-lg text-muted max-w-2xl">
          Upload your electricity bill and production/purchase data. Get an actionable decarbonisation plan with rupees and payback for every step.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-md text-base font-medium text-white bg-ink hover:bg-ink-light transition-colors shadow-sm"
          >
            Start free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>

        {/* Feature Highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <div className="bg-white p-6 rounded-lg border border-rule">
            <div className="w-10 h-10 rounded-md bg-ember/10 flex items-center justify-center text-ember mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-ink">Find leak points</h3>
            <p className="mt-2 text-sm text-muted">
              Auto-extract data from electricity bills and Tally exports to pinpoint carbon hotspots across Scope 1, 2, and 3.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg border border-rule">
            <div className="w-10 h-10 rounded-md bg-brass/10 flex items-center justify-center text-brass mb-4">
              <IndianRupee className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-ink">Costed plan ledger</h3>
            <p className="mt-2 text-sm text-muted">
              Deterministic mathematical optimization gives you the exact combination of fixes within your budget with payback in months.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg border border-rule">
            <div className="w-10 h-10 rounded-md bg-leaf/10 flex items-center justify-center text-leaf mb-4">
              <TrendingDown className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-ink">100% Traceable provenance</h3>
            <p className="mt-2 text-sm text-muted">
              Every emission figure is traceable to official CEA and IPCC factors. No hallucinations, full audit transparency.
            </p>
          </div>
        </div>

        {/* Preview of the Plan Ledger */}
        <div className="mt-16 w-full bg-white rounded-lg border border-rule overflow-hidden shadow-sm text-left">
          <div className="px-6 py-4 border-b border-rule flex items-center justify-between bg-paper">
            <div>
              <h4 className="text-sm font-semibold text-ink">Sample Decarbonisation Ledger</h4>
              <p className="text-xs text-muted">Optimized fixes in execution order</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-leaf/10 text-leaf font-medium border border-leaf/20">
              -20.6% CO₂ Target Met
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-rule bg-paper/50 text-xs text-muted uppercase">
                <tr>
                  <th className="py-2.5 px-4 text-left">Order</th>
                  <th className="py-2.5 px-4 text-left">Intervention</th>
                  <th className="py-2.5 px-4 text-right">Investment (₹)</th>
                  <th className="py-2.5 px-4 text-right">Annual Savings (₹)</th>
                  <th className="py-2.5 px-4 text-right">Cuts (tCO₂e/yr)</th>
                  <th className="py-2.5 px-4 text-right">Payback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                <tr>
                  <td className="py-3 px-4 font-mono text-muted">01</td>
                  <td className="py-3 px-4 font-medium text-ink">Fix compressed-air leaks</td>
                  <td className="py-3 px-4 text-right font-mono text-brass">₹40,000</td>
                  <td className="py-3 px-4 text-right font-mono text-leaf font-medium">₹2,05,000</td>
                  <td className="py-3 px-4 text-right font-mono text-ink">18.2 t</td>
                  <td className="py-3 px-4 text-right font-mono text-leaf">2.3 mo</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-muted">02</td>
                  <td className="py-3 px-4 font-medium text-ink">Rooftop solar (150 kWp)</td>
                  <td className="py-3 px-4 text-right font-mono text-brass">₹6,00,000</td>
                  <td className="py-3 px-4 text-right font-mono text-leaf font-medium">₹1,75,000</td>
                  <td className="py-3 px-4 text-right font-mono text-ink">145.0 t</td>
                  <td className="py-3 px-4 text-right font-mono text-leaf">41.1 mo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-rule py-6 bg-white text-center text-xs text-muted">
        Decarbo &copy; 2026. Built for Indian SME Factories.
      </footer>
    </div>
  );
}
