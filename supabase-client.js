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
 * Module scripts run after the document is parsed — but this one also awaits
 * a dynamic import from a CDN (a real network round-trip, sometimes several:
 * esm.sh resolves @supabase/supabase-js into ~10 chained module fetches), and
 * that can take longer than DOMContentLoaded takes to fire. sync.js's
 * initSync() cannot simply assume window.SUPABASE is already set by the time
 * it runs — it was written on that assumption, and on a slow connection it
 * silently lost the race: syncAvailable() read false at that one moment,
 * initSync() returned before ever registering the onAuthStateChange listener,
 * and nothing in the app tried again. Cloud Sync would work — you could sign
 * in and Supabase would accept it — but nothing was listening for that event,
 * so the page just never updated. No error, because there wasn't one.
 *
 * The "supabase-ready" event closes that gap: it fires exactly once, only on
 * success, after window.SUPABASE is actually usable, so initSync() can wait
 * for it instead of gambling on being called late enough.
 *
 * If the import fails outright (offline, CDN down, or the two placeholders
 * below were never replaced), window.SUPABASE stays undefined, no event ever
 * fires, and every call site in sync.js guards for that — Cloud Sync just
 * shows "not configured" with zero effect on the rest of the app.
 *
 * SETUP: replace the two placeholders below with your own Supabase project's
 * URL and anon (public) key — Settings → API in the Supabase dashboard.
 * Never put the service_role key here or anywhere in client code: it bypasses
 * Row Level Security, unlike the anon key, which is safe to expose because
 * the ledger_data table's RLS policies (not key secrecy) enforce that a
 * signed-in user can only ever read/write their own row.
 * ========================================================================== */
const SUPABASE_URL = "https://joymdwpxfnrrkunoparx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveW1kd3B4Zm5ycmt1bm9wYXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI0MTUsImV4cCI6MjEwNTgxODQxNX0.zh2l3wtGWl8bHKH9bmCp8VO8VpCxhlmMkQR1TwgwLE8";

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
    window.dispatchEvent(new Event("supabase-ready"));
  } catch (e) {
    // CDN unreachable, offline, etc. — leave window.SUPABASE unset; sync.js
    // treats that identically to "not configured."
  }
}
