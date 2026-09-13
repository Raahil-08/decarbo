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

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
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


  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: { code: "UNKNOWN_ERROR", message_key: response.statusText, details: {} } };
    }
    throw errorData;
  }

  return response.json();
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
