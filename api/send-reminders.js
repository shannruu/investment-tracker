/* =============================================================================
 * Vercel Serverless Function - dividend reminder sender
 * -----------------------------------------------------------------------------
 * Runs once a day (see vercel.json). The app copies each user's upcoming
 * reminders (ex-dividend / payment day) into the dividend_reminders table; this
 * sends every one that is due and not yet sent to all of that user's devices
 * (push_subscriptions) as a Web Push notification, then marks it sent.
 * Called by Vercel's cron (Authorization: Bearer CRON_SECRET) or by hand with
 * ?key=CRON_SECRET. Uses the Supabase service-role key, so it never runs in a browser.
 * ========================================================================== */
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");

module.exports = async (req, res) => {
  const bearer = String((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "");
  const key = String((req.query && req.query.key) || bearer || "");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { res.status(500).json({ error: "Missing Supabase env vars" }); return; }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) { res.status(500).json({ error: "Missing VAPID env vars" }); return; }

  webpush.setVapidDetails("mailto:divz-app@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const oldest = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);   // never send something older than 3 days
    const [dueRes, subsRes] = await Promise.all([
      admin.from("dividend_reminders").select("*").eq("sent", false).lte("fire_on", today).gte("fire_on", oldest),
      admin.from("push_subscriptions").select("*"),
    ]);
    if (dueRes.error) throw dueRes.error;
    if (subsRes.error) throw subsRes.error;
    const due = dueRes.data || [], subsByUser = {};
    (subsRes.data || []).forEach((s) => { (subsByUser[s.user_id] = subsByUser[s.user_id] || []).push(s); });

    let sent = 0; const dead = new Set();
    for (const r of due) {
      const payload = JSON.stringify({ title: r.title, body: r.body, url: "/#/dividends", tag: r.rid });
      await Promise.all((subsByUser[r.user_id] || []).map(async (s) => {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); sent++; }
        catch (e) { if (e && (e.statusCode === 410 || e.statusCode === 404)) dead.add(s.endpoint); }
      }));
      await admin.from("dividend_reminders").update({ sent: true }).eq("id", r.id);
    }
    if (dead.size) await admin.from("push_subscriptions").delete().in("endpoint", [...dead]);
    await admin.from("dividend_reminders").delete().lt("fire_on", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));   // tidy old rows
    res.status(200).json({ due: due.length, sent, prunedSubscriptions: dead.size });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
