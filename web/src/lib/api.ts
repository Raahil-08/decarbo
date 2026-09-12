import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const devToken = localStorage.getItem("decarbo_dev_token");
  let token: string | null | undefined = devToken;
  if (!token) {
    const session = (await supabase.auth.getSession()).data.session;
    token = session?.access_token;
  }



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
