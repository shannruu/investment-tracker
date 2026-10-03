/* =============================================================================
 * Account page (#/profile) — who you are, how you sign in, and whether your records are backed up to your
 * account, laid out like the account page of any website: a header card, then one panel per topic with a
 * "label + hint on the left, control on the right" row per setting.
 *
 *   header ...... photo, name, email, status, member-since, and quick counts (Brokers / Holdings / Transactions)
 *   Profile ..... photo, name, email, investing-since                      (one Save button for the lot)
 *   Security .... change password, sign out, sign out everywhere           (signed in only)
 *   Cloud sync .. status, last synced, Sync now                            (signed in only)
 *   Back up & sync  the create-account / sign-in form                      (when not signed in)
 *
 * Backup files and CSV import/export are NOT here: Settings -> Data & Backup is their one home.
 *
 * A classic <script> loaded after sync.js, so it shares app.js's top-level scope (t(), toast(), render(),
 * USER, SYNC_USER, SUPABASE, wireAgEyes(), mapAuthError() ...). app.js's pageProfile() just calls
 * pageAccount(). The sign-in form keeps the ids sync.js's mountAccountSyncPanel() wires up: #signInForm,
 * #signInStatus, #toggleSyncMode, #syncNowBtn, #signOutBtn, #reopenReconcile. Styles: ".ap-*" in styles.css
 * (".acct-*" already belongs to the sidebar's account switcher).
 * ========================================================================== */

const acctRow = (title, desc, control) => `<div class="ap-row">
    <div class="ap-row-label"><div class="ap-row-title">${title}</div>${desc ? `<div class="ap-row-desc">${desc}</div>` : ""}</div>
    <div class="ap-row-ctl">${control}</div>
  </div>`;
const acctSection = (id, title, body) =>
  `<section class="panel ap-sec" id="${id}"><div class="panel-head"><h2>${title}</h2></div>${body}</section>`;

/* A password box with the show/hide eye the sign-in page has; `name` is what a submitted form carries. */
function acctPwField(id, name, label, placeholder, autocomplete) {
  return `<label>${label}<span class="ag-pw">
    <input id="${id}" name="${name}" type="password" placeholder="${escAttr(placeholder)}" autocomplete="${autocomplete}" minlength="6" required>
    <button type="button" class="ag-eye" data-eye-for="${id}" aria-label="${escAttr(t("Show password"))}" aria-pressed="false">${AG_EYE}</button>
  </span></label>`;
}

function pageAccount() {
  const idn = acctIdentity();
  const signedIn = !!SYNC_USER;
  const online = syncAvailable();
  const needsChoice = signedIn && SYNC_STATUS === "needs-reconciliation";
  const label = idn.hasIdentity ? (idn.name || idn.email) : "";
  const created = signedIn && SYNC_USER.created_at ? fmtDate(String(SYNC_USER.created_at).slice(0, 10)) : "";
  const status = !signedIn ? `<span class="badge subtle">${t("Local only")}</span>`
    : needsChoice ? `<span class="badge warn">${t("Needs your attention")}</span>` : `<span class="badge pos">${t("Synced")}</span>`;
  const stat = (href, n, name) => `<a class="ap-stat" href="${href}"><span class="ap-stat-v">${n}</span><span class="ap-stat-k">${name}</span></a>`;
  const head = dzTopHTML({ eyebrow: t("Account"), h1: t("Your account"), sub: t("Profile, security and sync"), noLive: true });

  /* ---------- identity card */
  const hero = `<section class="ap-hero">
    <div class="avatar-upload">
      <span class="brand-mark xl" id="profileAvatarPreview" role="button" tabindex="0" aria-label="${escAttr(t("Change photo"))}">${avatarInnerHTML(label)}</span>
      <button type="button" class="avatar-edit-btn" id="avatarEditBtn" aria-label="${escAttr(t("Change photo"))}"><svg class="icon"><use href="#i-camera"/></svg></button>
      <input type="file" id="avatarFileInput" accept="image/*" hidden>
    </div>
    <div class="ap-id">
      <h1 class="ap-name">${esc(idn.name || t("Your account"))}</h1>
      <div class="ap-email">${idn.email ? esc(idn.email) : t("Not signed in")}</div>
      <div class="ap-chips">${status}${created ? `<span class="badge">${t("Member since")} ${created}</span>` : ""}${USER.joined ? `<span class="badge">${t("Investing since")} ${fmtDate(USER.joined)}</span>` : ""}</div>
    </div>
    <div class="ap-stats">
      ${stat("#/brokers", BROKERS.length, t("Brokers"))}${stat("#/portfolio", T.holdings.length, t("Holdings"))}${stat("#/records", ALL_TRANSACTIONS.length, t("Transactions"))}
    </div>
  </section>`;

  /* ---------- profile form */
  const emailCtl = signedIn
    ? `<input type="email" value="${esc(SYNC_USER.email)}" readonly aria-readonly="true" class="ap-readonly">`
    : `<input name="email" type="email" value="${esc(USER.email)}" placeholder="you@example.com">`;
  const profile = acctSection("acctProfile", t("Profile"), `<form id="profileForm" class="form" autocomplete="off">
    <div class="ap-rows">
      ${acctRow(t("Photo"), t("A square picture works best."), `<button type="button" class="btn" id="avatarUploadBtn">${t("Upload photo")}</button>${USER.avatar ? `<button type="button" class="btn ghost" id="avatarRemoveBtn">${t("Remove photo")}</button>` : ""}`)}
      ${acctRow(t("Name"), t("Shown in the sidebar, on this page and in your Dashboard greeting."), `<input name="name" value="${esc(USER.name)}" placeholder="${escAttr(t("Your name"))}">`)}
      ${acctRow(t("Email"), signedIn ? t("The email you sign in with. Change it under Security.") : t("Optional. Only stored on this device."), emailCtl)}
      ${acctRow(t("Investing since"), t("When you started investing. Optional."), `<input name="joined" type="date" value="${esc(USER.joined)}">`)}
    </div>
    <div class="ap-actions"><button class="btn primary" type="submit">${t("Save changes")}</button></div>
  </form>`);

  /* ---------- your Divz at a glance */
  const dates = ALL_TRANSACTIONS.map((x) => x.date).filter(Boolean).sort();
  const glance = acctSection("acctGlance", t("Your Divz at a glance"), `<div class="ap-rows">
    ${acctRow(t("Records"), "", `<span class="ap-val">${ALL_TRANSACTIONS.length}</span>`)}
    ${acctRow(t("First record"), "", `<span class="ap-val">${dates.length ? fmtDate(dates[0]) : "—"}</span>`)}
    ${acctRow(t("Latest record"), "", `<span class="ap-val">${dates.length ? fmtDate(dates[dates.length - 1]) : "—"}</span>`)}
    ${acctRow(t("Last backup"), t("A backup file you saved from Settings."), `<span class="ap-val">${SETTINGS.lastBackup ? fmtDate(SETTINGS.lastBackup) : t("Never")}</span>`)}
    ${acctRow(t("Your data"), t("Export, back up, or make a yearly tax report."), `<a class="btn" href="#/settings" id="acctToData">${t("Open Data & backup")}</a>`)}
  </div>`);

  /* ---------- security + sync (signed in)  /  the sign-in form (not signed in) */
  let security = "", sync = "";
  if (signedIn) {
    security = acctSection("acctSecurity", t("Security"), `<div class="ap-rows">
      ${acctRow(t("Email"), t("The email you sign in with. We send a confirmation link to the new address."), `<span class="ap-val">${esc(SYNC_USER.email)}</span><button type="button" class="btn" id="emToggle" aria-expanded="false" aria-controls="emForm">${t("Change email")}</button>`)}
      <form id="emForm" class="form ap-pw" hidden novalidate>
        <div class="form-grid"><label>${t("New email")}<input id="acctNewEmail" name="newEmail" type="email" placeholder="you@example.com" autocomplete="email" required></label></div>
        <p class="ap-status" id="emStatus" role="status"></p>
        <div class="form-actions"><button class="btn primary" type="submit">${t("Send confirmation link")}</button><button class="btn ghost" type="button" id="emCancel">${t("Cancel")}</button></div>
      </form>
      ${acctRow(t("Password"), t("Choose a new password for your account."), `<button type="button" class="btn" id="pwToggle" aria-expanded="false" aria-controls="pwForm">${t("Change password")}</button>`)}
      <form id="pwForm" class="form ap-pw" hidden novalidate>
        <div class="form-grid">
          ${acctPwField("acctPw", "acctPw", t("New password"), t("At least 6 characters."), "new-password")}
          ${acctPwField("acctPw2", "acctPw2", t("Confirm password"), t("Repeat your password"), "new-password")}
        </div>
        <p class="ap-status err" id="pwStatus" role="alert"></p>
        <div class="form-actions"><button class="btn primary" type="submit">${t("Update password")}</button><button class="btn ghost" type="button" id="pwCancel">${t("Cancel")}</button></div>
      </form>
      ${acctRow(t("Sign out"), t("Sign out of Divz on this device. Your data stays safe in your account."), `<button type="button" class="btn" id="signOutBtn">${t("Sign out")}</button>`)}
      ${acctRow(t("Sign out everywhere"), t("Sign out on every device where you're signed in."), `<button type="button" class="btn ghost" id="signOutAllBtn">${t("Sign out everywhere")}</button>`)}
    </div>`);
    sync = acctSection("acctSync", t("Cloud sync"), online ? `<div class="ap-rows">
      ${acctRow(t("Status"), t("Your records are saved to your account and available on every device you sign in on."),
        needsChoice ? `<span class="badge warn">${t("Needs your attention")}</span><a class="link" href="#" id="reopenReconcile">${t("Finish choosing which data to keep")}</a>`
          : `<span class="badge pos">${t("Synced")}</span>`)}
      ${acctRow(t("Last synced"), "", `<span class="ap-val">${LAST_SYNCED ? fmtDateTime(LAST_SYNCED) : t("Not yet synced")}</span><button type="button" class="btn" id="syncNowBtn">${t("Sync now")}</button>`)}
      ${acctRow(t("Restore a copy"), t("Bring back the copy saved in your account. Find it in Data & backup."), `<a class="btn" href="#/settings" id="acctToRestore">${t("Open Data & backup")}</a>`)}
    </div>` : `<p class="muted" style="margin:0">${t("Cloud sync isn't set up for this deployment yet.")}</p>`);
  } else {
    const signup = SYNC_FORM_MODE === "signup";
    sync = acctSection("acctSync", t("Back up & sync"), online ? `
      <p class="ap-intro">${t("You're using Divz without an account, so your data lives only in this browser. Create a free account to back it up and use Divz on all your devices.")}</p>
      <form id="signInForm" class="form" autocomplete="off">
        <div class="form-grid">
          <label>${t("Email")}<input name="email" type="email" placeholder="you@example.com" autocomplete="email" required></label>
          ${acctPwField("acctSignInPw", "password", t("Password"), signup ? t("At least 6 characters.") : "••••••••", signup ? "new-password" : "current-password")}
          ${signup ? acctPwField("acctSignInPw2", "password2", t("Confirm password"), t("Repeat your password"), "new-password") : ""}
        </div>
        <p class="ap-status" id="signInStatus" role="status"></p>
        <div class="form-actions"><button class="btn primary" type="submit">${signup ? t("Create account") : t("Sign in")}</button></div>
      </form>
      <p class="muted ap-switch">${signup ? t("Already have an account?") : t("New here?")} <button type="button" class="link" id="toggleSyncMode">${signup ? t("Sign in instead") : t("Create an account")}</button></p>`
      : `<p class="muted" style="margin:0">${t("Cloud sync isn't set up for this deployment yet.")}</p>`);
  }

  const tabs = signedIn ? [["profile", t("Profile")], ["security", t("Security")], ["sync", t("Cloud sync")], ["danger", t("Danger zone")]] : [["profile", t("Profile")], ["sync", t("Back up & sync")]];
  if (!tabs.some((x) => x[0] === acctTab)) acctTab = "profile";
  const nav = `<nav class="st-nav" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="${acctTab === k ? "on" : ""}" data-actab="${k}">${l}</button>`).join("")}</nav>`;
  const acDesc = { profile: t("Photo, name and your records at a glance"), security: t("Email, password and sign out"), sync: t("Back up and sync your records"), danger: t("Delete your account") };
  const acMenu = `<div class="st-menu"><div class="st-mg">${tabs.filter((x) => x[0] !== "danger").map(([k, l]) => `<button type="button" class="st-mi" data-acopen="${k}"><span class="st-mt"><b>${l}</b><small>${acDesc[k] || ""}</small></span><span class="st-mc">›</span></button>`).join("")}</div>${signedIn ? `<div class="st-mg"><button type="button" class="st-mi dng" data-acopen="danger"><span class="st-mt"><b>${t("Danger zone")}</b><small>${acDesc.danger}</small></span><span class="st-mc">›</span></button></div>` : ""}</div>`;
  const html = `<div class="pfx pfx-set pfx-acct">${head}<div class="st-wrap" data-tab="ac${acctTab}" data-open="${acctPhoneOpen ? 1 : 0}">${nav}${acMenu}<div class="st-main"><button type="button" class="st-back" id="acBack">‹ ${t("Account")}</button><h1 class="st-sh" id="acSh">${(tabs.find((x) => x[0] === acctTab) || [0, ""])[1]}</h1>
    <div class="st-sec" data-sec="acprofile">${hero}${profile}${glance}</div>
    ${signedIn ? `<div class="st-sec" data-sec="acsecurity">${security}</div>` : ""}
    <div class="st-sec" data-sec="acsync">${sync}</div>
    ${signedIn ? `<div class="st-sec" data-sec="acdanger">${acctSection("acctDanger", t("Delete my account"), `<p class="ap-intro" style="margin-bottom:14px">${t("This permanently deletes your Divz account and the copy of your records stored in it. It cannot be undone. Records saved on this device are cleared too, so export a backup first if you want to keep them.")}</p>
      <form id="delForm" class="form" autocomplete="off" novalidate><label>${t("Type DELETE to confirm")}<input id="delConfirm" name="confirm" autocomplete="off" autocapitalize="characters" placeholder="DELETE"></label>
      <p class="ap-status err" id="delStatus" role="alert"></p><div class="form-actions"><button class="btn danger" type="submit" id="delBtn" disabled>${t("Delete my account")}</button></div></form>`)}</div>` : ""}
  </div></div></div>`;

  return { title: "Account", subtitle: "Your profile, security and sync.", html,
    mount() {
      const bell = $("#dzBell"); if (bell) bell.addEventListener("click", () => toggleMoreSheet());
      $$("[data-acopen]").forEach((b) => b.addEventListener("click", () => {
        acctTab = b.dataset.acopen; acctPhoneOpen = true;
        const w = $(".st-wrap"); w.dataset.tab = "ac" + acctTab; w.dataset.open = "1"; stPush(".st-main"); $("#acSh").textContent = (tabs.find((x) => x[0] === acctTab) || [0, ""])[1];
        $$("[data-actab]").forEach((x) => x.classList.toggle("on", x.dataset.actab === acctTab));
        window.scrollTo(0, 0);
      }));
      const acBackBtn = $("#acBack"); if (acBackBtn) acBackBtn.addEventListener("click", () => { acctPhoneOpen = false; $(".st-wrap").dataset.open = "0"; stPush(".st-menu", true); window.scrollTo(0, 0); });
      $$("[data-actab]").forEach((b) => b.addEventListener("click", () => {
        acctTab = b.dataset.actab;
        $(".st-wrap").dataset.tab = "ac" + acctTab;
        $$("[data-actab]").forEach((x) => x.classList.toggle("on", x === b));
      }));
      const toData = () => { settingsTab = "data"; };
      ["#acctToData", "#acctToRestore"].forEach((s) => { const el = $(s); if (el) el.addEventListener("click", toData); });
      /* profile form */
      mountDatePickers($("#profileForm"));
      $("#profileForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target).entries());
        USER.name = (d.name || "").trim();
        if (!signedIn) USER.email = (d.email || "").trim();   // a signed-in email belongs to the account, not this form
        USER.joined = d.joined || "";
        saveStore(); toast(t("Profile saved")); render();
      });
      /* photo */
      const fileInput = $("#avatarFileInput");
      const openPicker = () => fileInput.click();
      $("#avatarEditBtn").addEventListener("click", openPicker);
      $("#avatarUploadBtn").addEventListener("click", openPicker);
      const preview = $("#profileAvatarPreview");
      preview.addEventListener("click", openPicker);
      preview.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); } });
      fileInput.addEventListener("change", (e) => { if (e.target.files[0]) handleAvatarFile(e.target.files[0]); e.target.value = ""; });
      const removeBtn = $("#avatarRemoveBtn");
      if (removeBtn) removeBtn.addEventListener("click", () => { USER.avatar = ""; saveStore(); toast(t("Profile photo removed")); render(); });
      /* change email (signed in) */
      const emForm = $("#emForm"), emToggle = $("#emToggle");
      if (emForm && emToggle) {
        const msg = $("#emStatus");
        const close = () => { emForm.hidden = true; emForm.reset(); msg.textContent = ""; emToggle.setAttribute("aria-expanded", "false"); };
        emToggle.addEventListener("click", () => { emForm.hidden = !emForm.hidden; emToggle.setAttribute("aria-expanded", String(!emForm.hidden)) });
        $("#emCancel").addEventListener("click", close);
        emForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const em = emForm.newEmail.value.trim();
          if (!/^\S+@\S+\.\S+$/.test(em)) { msg.textContent = t("Enter a valid email."); return; }
          if (em.toLowerCase() === String(SYNC_USER.email).toLowerCase()) { msg.textContent = t("That is already your email."); return; }
          const btn = emForm.querySelector("button[type=submit]"); btn.disabled = true; msg.textContent = "";
          try {
            const { error } = await SUPABASE.auth.updateUser({ email: em });
            if (!error) { close(); toast(`${t("We sent a confirmation link to")} ${em}. ${t("Your sign-in email changes after you open it.")}`); }
            else msg.textContent = mapAuthError(error, "reset");
          } catch (err) { msg.textContent = t("Something went wrong — try again."); }
          btn.disabled = false;
        });
      }
      /* change password (signed in) */
      const pwForm = $("#pwForm"), pwToggle = $("#pwToggle");
      if (pwForm && pwToggle) {
        wireAgEyes(pwForm);
        const msg = $("#pwStatus");
        const close = () => { pwForm.hidden = true; pwForm.reset(); msg.textContent = ""; pwToggle.setAttribute("aria-expanded", "false"); };
        pwToggle.addEventListener("click", () => {
          pwForm.hidden = !pwForm.hidden;
          pwToggle.setAttribute("aria-expanded", String(!pwForm.hidden));
        });
        $("#pwCancel").addEventListener("click", close);
        pwForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const pw = pwForm.acctPw.value;
          if (pw.length < 6) { msg.textContent = t("Password must be at least 6 characters."); return; }
          if (pw !== pwForm.acctPw2.value) { msg.textContent = t("Passwords don't match — please retype them."); return; }
          const btn = pwForm.querySelector("button[type=submit]"); btn.disabled = true; msg.textContent = "";
          try {
            const { error } = await SUPABASE.auth.updateUser({ password: pw });
            if (!error) { close(); toast(t("Password updated")); }
            else if (/reauth/i.test(`${error.code} ${error.message}`)) msg.textContent = t("For security, sign out and sign in again, then change your password.");
            else msg.textContent = mapAuthError(error, "reset");
          } catch (err) { msg.textContent = t("Something went wrong — try again."); }
          btn.disabled = false;
        });
      }
      /* delete my account (signed in) */
      const delForm = $("#delForm");
      if (delForm) {
        const inp = $("#delConfirm"), btn = $("#delBtn"), msg = $("#delStatus");
        inp.addEventListener("input", () => { btn.disabled = inp.value.trim() !== "DELETE"; });
        delForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (inp.value.trim() !== "DELETE") return;
          btn.disabled = true; msg.textContent = "";
          try {
            const { data } = await SUPABASE.auth.getSession();
            const token = data && data.session && data.session.access_token;
            const r = await fetch(`${API_BASE}/api/delete-account`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              msg.textContent = j.error === "not-configured" ? t("Account deletion isn't switched on for this site yet. Please contact support.") : t("Couldn't delete your account — try again.");
              btn.disabled = false; return;
            }
            try { await SUPABASE.auth.signOut(); } catch (err) { /* the account is already gone */ }
            SYNC_USER = null; clearAllData();
            try { localStorage.clear(); } catch (err) {}
            toast(t("Your account was deleted."));
            setTimeout(() => location.replace("/"), 800);
          } catch (err) { msg.textContent = t("Something went wrong — try again."); btn.disabled = false; }
        });
      }
      /* sign out on every device */
      const allBtn = $("#signOutAllBtn");
      if (allBtn) allBtn.addEventListener("click", async () => {
        if (!(await showConfirmModal(t("Sign out on all your devices? You'll need to sign in again on each one."), { title: "Sign out everywhere", okLabel: "Sign out everywhere" }))) return;
        try { await SUPABASE.auth.signOut({ scope: "global" }); } catch (err) { /* the local session is cleared below either way */ }
        SYNC_USER = null;
        toast(t("Signed out everywhere."));
        render();
      });

      /* create account: ask for the password twice, like the sign-up page does. Registered before
         mountAccountSyncPanel() so it can stop sync.js's own submit handler when they don't match. */
      const form = $("#signInForm");
      if (form) {
        wireAgEyes(form);
        form.addEventListener("submit", (e) => {
          const again = form.elements.password2;
          if (again && again.value !== form.elements.password.value) {
            e.preventDefault(); e.stopImmediatePropagation();
            $("#signInStatus").textContent = t("Passwords don't match — please retype them.");
          }
        });
      }
      /* the sign-in submit, Sync now, Sign out and "finish choosing" link are wired in sync.js */
      mountAccountSyncPanel();
    } };
}

/* ------------------------------------------------------------------ Chinese (zh) — only adds keys the app doesn't already have */
const ACCT_ZH = {
  "Photo, name and your records at a glance": "照片、姓名和记录概览",
  "Email, password and sign out": "邮箱、密码和退出登录",
  "Back up and sync your records": "备份并同步您的记录",
  "Delete your account": "删除您的账户",

  "Delete my account": "删除我的账户",
  "This permanently deletes your Divz account and the copy of your records stored in it. It cannot be undone. Records saved on this device are cleared too, so export a backup first if you want to keep them.": "这会永久删除您的 Divz 账户以及保存在账户里的记录副本，无法撤销。此设备上保存的记录也会被清除，如需保留请先导出备份。",
  "Type DELETE to confirm": "输入 DELETE 以确认",
  "Account deletion isn't switched on for this site yet. Please contact support.": "此网站尚未开启账户删除功能，请联系客服。",
  "Couldn't delete your account — try again.": "无法删除您的账户，请重试。",
  "Your account was deleted.": "您的账户已删除。",

  "Profile, security and sync": "个人资料、安全与同步",
  "Account": "账户",
  "Shown in the sidebar, on this page and in your Dashboard greeting.": "显示在侧边栏、本页面和仪表盘的问候语中。",
  "The email you sign in with. Change it under Security.": "您登录时使用的邮箱。可在“安全”中修改。",
  "Your Divz at a glance": "您的 Divz 一览",
  "Records": "记录",
  "First record": "第一笔记录",
  "Latest record": "最近一笔记录",
  "A backup file you saved from Settings.": "您在设置里保存的备份文件。",
  "Your data": "您的数据",
  "Export, back up, or make a yearly tax report.": "导出、备份，或生成年度税务报告。",
  "Open Data & backup": "打开“数据与备份”",
  "The email you sign in with. We send a confirmation link to the new address.": "您登录时使用的邮箱。我们会向新邮箱发送确认链接。",
  "Change email": "修改邮箱",
  "New email": "新邮箱",
  "Send confirmation link": "发送确认链接",
  "Enter a valid email.": "请输入有效的邮箱。",
  "That is already your email.": "这已经是您的邮箱了。",
  "We sent a confirmation link to": "我们已向以下邮箱发送确认链接：",
  "Your sign-in email changes after you open it.": "打开链接后，您的登录邮箱才会更改。",
  "Restore a copy": "恢复副本",
  "Bring back the copy saved in your account. Find it in Data & backup.": "取回保存在您账户里的副本，请到“数据与备份”操作。",

  "Your account": "您的账户", "Not signed in": "未登录", "Needs your attention": "需要您处理",
  "Photo": "照片", "A square picture works best.": "正方形的图片效果最好。",
  "Shown in the sidebar and on this page.": "显示在侧边栏和本页面。", "The email you sign in with.": "您登录时使用的邮箱。",
  "Optional. Only stored on this device.": "选填，只保存在这台设备上。", "When you started investing. Optional.": "您开始投资的时间，选填。",
  "Save changes": "保存更改", "Security": "安全", "Password": "密码", "Choose a new password for your account.": "为您的账户设置新密码。",
  "Change password": "修改密码", "New password": "新密码", "Update password": "更新密码", "Password updated": "密码已更新",
  "Sign out of Divz on this device. Your data stays safe in your account.": "在这台设备上退出 Divz。您的数据仍安全保存在账户中。",
  "Sign out everywhere": "在所有设备上退出", "Sign out on every device where you're signed in.": "在您登录过的每台设备上退出。",
  "Sign out on all your devices? You'll need to sign in again on each one.": "要在所有设备上退出吗？之后每台设备都需要重新登录。",
  "Signed out everywhere.": "已在所有设备上退出。",
  "For security, sign out and sign in again, then change your password.": "出于安全考虑，请先退出并重新登录，然后再修改密码。",
  "Cloud sync": "云同步", "Status": "状态", "Your records are saved to your account and available on every device you sign in on.": "您的记录保存在账户中，可在您登录的每台设备上使用。",
  "Last synced": "上次同步", "Back up & sync": "备份与同步",
  "You're using Divz without an account, so your data lives only in this browser. Create a free account to back it up and use Divz on all your devices.": "您目前没有使用账户，数据只保存在这个浏览器里。创建免费账户即可备份数据，并在所有设备上使用 Divz。",
};
Object.keys(ACCT_ZH).forEach((k) => { if (!I18N.zh[k]) I18N.zh[k] = ACCT_ZH[k]; });
