import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate, Link } from "react-router-dom";
import { Mail, ArrowLeft, Sparkles, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

export function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const navigate = useNavigate();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) throw error;

      setMessage({
        type: "success",
        text: "Check your email for the secure magic sign-in link.",
      });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to send magic link.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to initiate Google sign in.",
      });
    }
  };

  const handleDemoSignIn = () => {
    const DEV_TOKEN =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZW1haWwiOiJvd25lckBqYW1uYWdhcmJyYXNzLmNvbSJ9.eS12sK2y2X-86M-64jH_9k_9p17YJ_Ovd90E3YfX6iY";
    localStorage.setItem("decarbo_dev_token", DEV_TOKEN);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-leaf/30 selection:text-white">
      {/* Background blueprint grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Ambient background glow */}
      <div
        className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full pointer-events-none opacity-10"
        style={{
          background: "radial-gradient(circle, rgba(45,122,87,0.4) 0%, rgba(169,122,43,0.2) 40%, transparent 70%)",
        }}
      />

      {/* Top back navigation */}
      <div className="absolute top-6 left-6 z-20">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-white/40 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Overview
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 relative z-10">
        <div className="flex items-center justify-center space-x-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-leaf animate-pulse" />
          <span className="text-xl font-bold tracking-[0.35em] uppercase text-white">
            <span className="text-leaf">DE</span>CARBO
          </span>
        </div>
        <h2 className="text-center text-2xl font-light text-white tracking-tight">
          Factory Terminal Access
        </h2>
        <p className="mt-1.5 text-center text-xs font-mono text-white/40 max-w-xs mx-auto">
          Audit carbon leak points, run OR-Tools optimizers, and track factory emissions.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 relative z-10">
        <div className="bg-[#0c101a]/90 backdrop-blur-xl py-8 px-6 border border-white/[0.08] rounded-xl sm:px-10 shadow-2xl relative">
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-2.5 h-2.5">
            <div className="absolute top-0 left-0 h-px w-full bg-leaf/40" />
            <div className="absolute top-0 left-0 w-px h-full bg-leaf/40" />
          </div>
          <div className="absolute top-0 right-0 w-2.5 h-2.5">
            <div className="absolute top-0 right-0 h-px w-full bg-leaf/40" />
            <div className="absolute top-0 right-0 w-px h-full bg-leaf/40" />
          </div>
          <div className="absolute bottom-0 left-0 w-2.5 h-2.5">
            <div className="absolute bottom-0 left-0 h-px w-full bg-leaf/40" />
            <div className="absolute bottom-0 left-0 w-px h-full bg-leaf/40" />
          </div>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5">
            <div className="absolute bottom-0 right-0 h-px w-full bg-leaf/40" />
            <div className="absolute bottom-0 right-0 w-px h-full bg-leaf/40" />
          </div>

          {message && (
            <div
              className={`mb-6 p-3.5 rounded-lg flex items-start space-x-2.5 text-xs font-mono ${
                message.type === "success"
                  ? "bg-leaf/10 text-leaf border border-leaf/30"
                  : "bg-ember/10 text-ember border border-ember/30"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Quick Demo Access Button Prominent */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleDemoSignIn}
              className="w-full group relative flex items-center justify-between py-3 px-4 border border-leaf/40 rounded-lg text-xs font-mono uppercase tracking-wider font-semibold text-white bg-gradient-to-r from-leaf/20 to-leaf/5 hover:from-leaf/30 hover:to-leaf/10 transition-all shadow-[0_0_20px_rgba(45,122,87,0.15)]"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-leaf/20 border border-leaf/40 flex items-center justify-center text-leaf group-hover:scale-105 transition-transform">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-white text-xs font-bold">Jamnagar Demo Factory</div>
                  <div className="text-[10px] text-white/50 lowercase">Instant evaluator sign in</div>
                </div>
              </div>
              <span className="text-leaf text-[11px] font-mono group-hover:translate-x-0.5 transition-transform">
                Launch &rarr;
              </span>
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono">
              <span className="bg-[#0c101a] px-3 text-white/30">Or Magic Link Access</span>
            </div>
          </div>

          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-mono uppercase text-white/60 mb-1">
                Authorized Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="factory.owner@sme.in"
                className="w-full px-3 py-2 border border-white/10 rounded-lg text-xs font-mono text-white placeholder-white/20 bg-black/40 focus:outline-none focus:border-leaf transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg text-xs font-mono uppercase tracking-wider font-semibold text-white bg-white/10 hover:bg-white/15 focus:outline-none disabled:opacity-50 transition-colors"
            >
              {loading ? (
                "Sending link..."
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5 mr-2 text-white/60" />
                  Send Magic Login Link
                </>
              )}
            </button>
          </form>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-white/10 rounded-lg text-xs font-mono text-white/70 bg-black/20 hover:bg-white/[0.04] transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign In with Google
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-white/30">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-leaf" /> RLS Enabled
            </span>
            <span>Mumbai Postgres Region</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
