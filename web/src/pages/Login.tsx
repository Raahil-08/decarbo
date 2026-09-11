import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";

export function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      setMessage({
        type: "success",
        text: "Check your email for the login link.",
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

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div className="w-8 h-8 rounded bg-ink flex items-center justify-center text-paper font-semibold text-lg">
            D
          </div>
          <span className="text-2xl font-bold tracking-tight text-ink">Decarbo</span>
        </div>
        <h2 className="text-center text-2xl font-semibold text-ink">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-muted">
          Track emissions and find the cheapest way to decarbonise your factory
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-sm border border-rule sm:rounded-lg sm:px-10">
          {message && (
            <div
              className={`mb-6 p-4 rounded-md flex items-start space-x-3 text-sm ${
                message.type === "success"
                  ? "bg-leaf/10 text-leaf border border-leaf/20"
                  : "bg-ember/10 text-ember border border-ember/20"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink">
                Email address
              </label>
              <div className="mt-1 relative">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@jamnagarbrass.com"
                  className="w-full px-3 py-2 border border-rule rounded-md shadow-sm placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink text-sm bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-ink hover:bg-ink-light focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink disabled:opacity-50 transition-colors"
            >
              {loading ? (
                "Sending link..."
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send magic link
                </>
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-rule" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted">Or continue with</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-rule rounded-md shadow-sm text-sm font-medium text-ink bg-white hover:bg-paper focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink transition-colors"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
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
                Google
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
