export const APP_CONFIG = {
  supabaseUrl: window.__APP_ENV__?.SUPABASE_URL || "",
  supabaseAnonKey: window.__APP_ENV__?.SUPABASE_ANON_KEY || "",
  // If false, app uses localStorage mode.
  enableSupabase: true,
};
