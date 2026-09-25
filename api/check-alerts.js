/* =============================================================================
 * Vercel Serverless Function — price alert checker
 * -----------------------------------------------------------------------------
 * Invoked server-to-server every ~5 minutes by an external cron pinger (see
 * DEPLOY.md — Vercel's own free-tier cron only runs once a day, too coarse for
 * a price alert). NOT CORS-open like the other api/* files: this is never
 * called from a browser, only from the cron pinger with the shared secret.
 *
 * For every enabled price_alerts row, across every user: fetch that ticker's
 * current price (deduped — one fetch per unique ticker, not per alert), and if
 * the target is met, push a notification to every device that user has
 * subscribed on. Runs with the Supabase service-role key (bypasses Row Level
 * Security) since this has no user session — it must read/write across every
 * user's rows, which the anon key's RLS policies specifically forbid.
 * ========================================================================== */
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");
const { fetchTimeout } = require("./_lib");

module.exports = async (req, res) => {
  if (String((req.query && req.query.key) || "") !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server not configured (missing Supabase env vars)" });
    return;
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: "Server not configured (missing VAPID env vars)" });
    return;
  }

  webpush.setVapidDetails("mailto:divz-app@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const [alertsRes, subsRes] = await Promise.all([
      admin.from("price_alerts").select("*").eq("enabled", true),
      admin.from("push_subscriptions").select("*"),
    ]);
    if (alertsRes.error) throw alertsRes.error;
    if (subsRes.error) throw subsRes.error;
    const alerts = alertsRes.data || [];
    const subs = subsRes.data || [];

    if (!alerts.length) { res.status(200).json({ checked: 0, triggered: 0 }); return; }

    // One price fetch per unique ticker, no matter how many alerts (across however
    // many users) reference it — reuses the app's own already-deployed quote proxy
    // rather than duplicating Yahoo-parsing logic here.
    const tickers = [...new Set(alerts.map((a) => a.ticker))];
    const origin = `https://${req.headers.host}`;
    const prices = {};
    await Promise.all(tickers.map(async (tk) => {
      try {
        const r = await fetchTimeout(`${origin}/api/quote?symbol=${encodeURIComponent(tk)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (d && d.price != null) prices[tk] = d.price;
      } catch (e) { /* this ticker just isn't evaluated this tick — retried next tick */ }
    }));

    const subsByUser = {};
    subs.forEach((s) => { (subsByUser[s.user_id] = subsByUser[s.user_id] || []).push(s); });

    const now = new Date().toISOString();
    let triggered = 0;
    const deadEndpoints = new Set();

    for (const alert of alerts) {
      const price = prices[alert.ticker];
      if (price == null) continue;
      const hit = alert.direction === "above" ? price >= alert.target_price : price <= alert.target_price;

      if (hit && alert.armed) {
        triggered++;
        const payload = JSON.stringify({
          title: `${alert.ticker} ${alert.direction === "above" ? "crossed above" : "dropped below"} ${alert.target_price}`,
          body: `Now at ${price}.`,
          url: "/#/alerts",
          tag: alert.id,
        });
        const userSubs = subsByUser[alert.user_id] || [];
        await Promise.all(userSubs.map(async (s) => {
          const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
          try {
            await webpush.sendNotification(subscription, payload);
          } catch (e) {
            // 410 Gone / 404 Not Found = the browser/OS discarded this subscription
            // (uninstalled, re-subscribed, etc.) — stop trying to push to it.
            if (e && (e.statusCode === 410 || e.statusCode === 404)) deadEndpoints.add(s.endpoint);
          }
        }));
        const patch = alert.recurring
          ? { armed: false, last_triggered_at: now }
          : { enabled: false, armed: false, last_triggered_at: now };
        await admin.from("price_alerts").update(patch).eq("id", alert.id);
      } else if (!hit && alert.recurring && !alert.armed) {
        // Silent re-arm once price crosses back to the not-yet-triggered side — a
        // recurring alert should fire once per genuine crossing, not once per tick
        // for as long as the price happens to sit past the target.
        await admin.from("price_alerts").update({ armed: true }).eq("id", alert.id);
      }
    }

    if (deadEndpoints.size) {
      await admin.from("push_subscriptions").delete().in("endpoint", [...deadEndpoints]);
    }

    res.status(200).json({ checked: alerts.length, tickers: tickers.length, triggered, prunedSubscriptions: deadEndpoints.size });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
