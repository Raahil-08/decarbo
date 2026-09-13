import { supabase } from "./supabase";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export async function getAuthToken(): Promise<string> {
  const devToken = localStorage.getItem("decarbo_dev_token");
  if (devToken) return devToken;
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (session?.access_token) return session.access_token;
  } catch {
    // fallback
  }
  return "dev-owner-token";
}

import {
  DEMO_FACTORY,
  DEMO_FACTORY_ID,
  DEMO_DASHBOARD_DATA,
  DEMO_PLANS_DATA,
  DEMO_TRACKING_DATA,
  DEMO_LEVERS,
} from "./demoData";

function getMockResponse(endpoint: string, options: RequestInit = {}): any {
  if (endpoint === "/factories" && (!options.method || options.method === "GET")) {
    return [DEMO_FACTORY];
  }
  if (endpoint === "/factories" && options.method === "POST") {
    try {
      const parsed = typeof options.body === "string" ? JSON.parse(options.body) : {};
      return { ...DEMO_FACTORY, ...parsed, id: DEMO_FACTORY_ID };
    } catch {
      return DEMO_FACTORY;
    }
  }
  if (endpoint.includes("/demo-seed")) {
    return { success: true, count: 12, message: "Demo 12-month records seeded" };
  }
  if (endpoint.includes("/dashboard")) {
    return DEMO_DASHBOARD_DATA;
  }
  if (endpoint.includes("/circularity")) {
    return DEMO_DASHBOARD_DATA.circularity;
  }
  if (endpoint.includes("/records")) {
    return [];
  }
  if (endpoint.includes("/plans/generate") || endpoint.endsWith("/plans")) {
    return DEMO_PLANS_DATA;
  }
  if (endpoint.includes("/plans/")) {
    const planId = endpoint.split("/plans/")[1]?.split("/")[0];
    const plan = DEMO_PLANS_DATA.plans.find((p) => p.id === planId) || DEMO_PLANS_DATA.plans[0];
    return plan;
  }
  if (endpoint.includes("/explain")) {
    return {
      plan_id: "plan-quick-wins",
      locale: "en",
      summary: "Priority focus on compressed-air leakage audits and crucible refractory insulation, yielding 42.8 tCO2e reduction within 4.6 months average payback.",
      sections: [
        {
          title: "Executive Summary",
          content: "The Jamnagar brass unit can achieve immediate 10% decarbonisation with a modest outlay of ₹1,65,000, recovering ₹4,32,000 annually through lower electricity tariffs.",
        },
        {
          title: "Operational Roadmap",
          content: "Phase 1 replaces 18 leaky drop couplers and installs ultrasonic drain valves. Phase 2 fits high-alumina ceramic jackets on the 250kg induction furnace.",
        },
      ],
      disclaimer: "Figures calculated deterministically via Decarbo engine v0.1.",
    };
  }
  if (endpoint.includes("/simulate/levers")) {
    return { levers: DEMO_LEVERS };
  }
  if (endpoint.includes("/simulate")) {
    return {
      baseline_annual_kgco2e: 428600,
      baseline_annual_tco2e: 428.6,
      simulated_annual_kgco2e: 360200,
      simulated_annual_tco2e: 360.2,
      reduction_kgco2e: 68400,
      reduction_tco2e: 68.4,
      reduction_pct: 16.0,
      total_capex_inr: 470000,
      total_annual_savings_inr: 722000,
      simple_payback_months: 7.8,
      category_breakdown: [
        { category: "electricity", before_kgco2e: 296200, after_kgco2e: 227800 },
        { category: "fuel", before_kgco2e: 82400, after_kgco2e: 82400 },
        { category: "material", before_kgco2e: 50000, after_kgco2e: 50000 },
      ],
    };
  }
  if (endpoint.includes("/tracking")) {
    return DEMO_TRACKING_DATA;
  }
  if (endpoint.includes("/chat")) {
    return {
      reply: "Based on the Jamnagar factory data, fixing compressed air leaks and insulating the induction crucible is your fastest route to cutting 42.8 tonnes of CO2 while saving ₹4.32 Lakhs annually.",
    };
  }
  return {};
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // If requesting the demo factory, return in-browser demo data immediately
  if (endpoint.includes(DEMO_FACTORY_ID)) {
    return getMockResponse(endpoint, options) as T;
  }

  try {
    const token = await getAuthToken();

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.warn(`[Decarbo] Backend unreachable at ${endpoint}, serving in-browser demo data.`, err);
    return getMockResponse(endpoint, options) as T;
  }
}

export interface ReportResponse {
  id: string;
  report_id: string;
  factory_id: string;
  plan_id: string;
  locale: string;
  storage_path: string;
  download_url: string;
  created_at: string;
}

export async function generatePlanReport(planId: string, locale: string = "en"): Promise<ReportResponse> {
  return apiClient<ReportResponse>(`/plans/${planId}/report`, {
    method: "POST",
    body: JSON.stringify({ locale }),
  });
}

export async function downloadReportFile(reportId: string, filename?: string): Promise<void> {
  const devToken = localStorage.getItem("decarbo_dev_token");
  let token: string | null | undefined = devToken;
  if (!token) {
    const session = (await supabase.auth.getSession()).data.session;
    token = session?.access_token;
  }

  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error("Failed to download PDF report");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `decarbo_report_${reportId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
