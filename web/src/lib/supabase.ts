import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://pqmygjztbojhltqapacw.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbXlnanp0Ym9qaGx0cWFwYWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDQxNTksImV4cCI6MjEwNDcyMDE1OX0.UAwRsHc7ka8W7bzwUAIQJWiYQjvL9fbDmdBZRC_K6oQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

