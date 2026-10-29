import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

function looksValid(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** True only when both public Supabase values are present and well-formed. */
export const supabaseConfigured = Boolean(url && anonKey && looksValid(url));

/**
 * The Supabase client, or null when Supabase is not configured.
 * Only the public anon key is used here. Data access is enforced by Row Level Security.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anonKey, {
      // PKCE keeps auth tokens out of the URL hash, which the app uses for page routing
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
