// Supabase connection for cloud sync.
// Both values are safe to commit: the publishable key only works together with
// the Row Level Security rules in supabase/setup.sql, and sign-ups are turned off.
// Leave them empty and the app runs exactly as before (local-only).
// NOTE: sw.js caches this file cache-first. If you ever change these values, bump
// CACHE_NAME in sw.js in the same commit or phones keep the old values.
export const SUPABASE_URL = 'https://joifwthlhwmymufhmpkx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_gBUBaFmtkrKBeTF3JzPYew_wixnaeCu';
