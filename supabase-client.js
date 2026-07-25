/* =============================================================================
 * Supabase client bootstrap — Cloud Sync (optional, opt-in)
 * -----------------------------------------------------------------------------
 * This file is deliberately tiny and dumb: import the client, create it, hand
 * it to the classic-script world as window.SUPABASE. All the actual sync
 * logic (auth, push/pull, the Account panel) lives in sync.js, which — being
 * a classic <script> loaded after app.js — shares app.js's top-level scope
 * and can call saveStore()/snapshot()/render()/etc. directly. This file can't
 * do that (ES modules have their own scope), so it stays a thin bridge.
 *
 * Module scripts always run after the document is parsed, regardless of
 * where the <script type="module"> tag sits — so by the time init() runs
 * (on DOMContentLoaded), window.SUPABASE is already set if the CDN import
 * succeeded. If it didn't (offline, CDN down, or the two placeholders below
 * were never replaced), window.SUPABASE stays undefined and every call site
 * in sync.js guards for that — Cloud Sync just shows "not configured" with
 * zero effect on the rest of the app.
 *
 * SETUP: replace the two placeholders below with your own Supabase project's
 * URL and anon (public) key — Settings → API in the Supabase dashboard.
 * Never put the service_role key here or anywhere in client code: it bypasses
 * Row Level Security, unlike the anon key, which is safe to expose because
 * the ledger_data table's RLS policies (not key secrecy) enforce that a
 * signed-in user can only ever read/write their own row.
 * ========================================================================== */
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

if (SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.startsWith("YOUR_")) {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
    // flowType: "pkce" is load-bearing, not optional — Supabase's default
    // ("implicit") magic-link flow returns the session token in the URL HASH
    // fragment, which is exactly where this app's own hash-router reads
    // (location.hash / currentPageKey()). PKCE returns a ?code= query param
    // instead, avoiding that collision entirely.
    window.SUPABASE = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce", detectSessionInUrl: true },
    });
  } catch (e) {
    // CDN unreachable, offline, etc. — leave window.SUPABASE unset; sync.js
    // treats that identically to "not configured."
  }
}
