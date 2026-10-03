/* =============================================================================
 * Vercel Serverless Function - delete my account
 * -----------------------------------------------------------------------------
 * Called from Account -> Danger zone with the signed-in user's own access token.
 * It checks that token with Supabase, then removes that user's synced ledger and
 * the user itself using the service-role key (which only ever lives in a Vercel
 * environment variable, never in the browser). A user can only delete THEMSELVES:
 * the id comes from the verified token, never from the request body.
 * ========================================================================== */
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { res.status(500).json({ error: "not-configured" }); return; }
  const token = String((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "Missing token" }); return; }
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data || !data.user) { res.status(401).json({ error: "Invalid token" }); return; }
    const id = data.user.id;
    await admin.from("ledger_data").delete().eq("user_id", id);   // best effort: the foreign key normally cascades anyway
    const del = await admin.auth.admin.deleteUser(id);
    if (del.error) { res.status(500).json({ error: del.error.message || "Could not delete" }); return; }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
