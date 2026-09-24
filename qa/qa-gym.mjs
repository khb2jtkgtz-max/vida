/**
 * Vida QA funcional AMPLIADA (gym)
 * Screenshots: screenshots/qa-gym-*.png
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "screenshots");
const BASE = process.env.VIDA_URL || "http://127.0.0.1:8877";
const URL = `${BASE}/?v=qa-gym-${Date.now()}`;
const FORBIDDEN = "491dcb93-4bce-482a-9f31-8b61aa37c288";
const STORE = "vida-app-v1";

const results = [];
const log = (id, status, note = "") => {
  results.push({ id, status, note });
  console.log(`${status} ${id}${note ? " — " + note : ""}`);
};
const pass = (id, note) => log(id, "PASS", note);
const fail = (id, note) => log(id, "FAIL", note);

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}
async function openModalWait(page) {
  await page.waitForFunction(() => {
    const m = document.getElementById("modal");
    return m && !m.classList.contains("hidden");
  }, { timeout: 8000 });
}
async function closeModalWait(page) {
  await page.waitForFunction(() => {
    const m = document.getElementById("modal");
    return m && m.classList.contains("hidden");
  }, { timeout: 8000 });
}
async function confirmYes(page) {
  await page.waitForSelector("#confirm-yes", { timeout: 5000 });
  await page.click("#confirm-yes");
  await page.waitForTimeout(250);
}
async function confirmNo(page) {
  await page.waitForSelector("#confirm-no", { timeout: 5000 });
  await page.click("#confirm-no");
  await page.waitForTimeout(250);
}
async function footerVisible(page) {
  return page.evaluate(() => {
    const modal = document.getElementById("modal");
    const footer = modal?.querySelector(".modal-footer");
    if (!modal || !footer) return { ok: false, reason: "no footer" };
    const cs = getComputedStyle(footer);
    const texts = [...footer.querySelectorAll("button")].map((b) => b.textContent.trim());
    return {
      ok:
        !modal.classList.contains("hidden") &&
        !modal.classList.contains("modal--confirm") &&
        cs.display !== "none" &&
        !footer.hidden &&
        texts.some((t) => /Cancelar/i.test(t)) &&
        texts.some((t) => /Guardar/i.test(t)),
      texts,
      display: cs.display,
      hidden: footer.hidden,
      confirmClass: modal.classList.contains("modal--confirm"),
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "es-MX",
    colorScheme: "dark",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  // ========== 1 Shell ==========
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#app-version-label");
  await page.waitForTimeout(500);
  const shell = await page.evaluate(() => {
    const version = document.getElementById("app-version-label")?.textContent?.trim();
    const tabs = [...document.querySelectorAll(".tabs .tab")].map((t) => t.dataset.tab);
    return { version, tabs };
  });
  if (/v?1\.\d+\.\d+/.test(shell.version || "") && shell.tabs.join(",") === "habitos,finanzas,proyectos") {
    pass("1-shell", shell.version);
  } else fail("1-shell", JSON.stringify(shell));
  await shot(page, "qa-gym-01-shell.png");

  // ========== 2 Más / Actualizar / Export-Import ==========
  const habitsBefore = await page.locator("#habit-list li").count();
  await page.click("#btn-more");
  await page.waitForSelector("#more-sheet:not(.hidden)");
  const moreOk = await page.locator("#more-sheet:not(.hidden)").count();
  // Export
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }).catch(() => null),
    page.click("#btn-export-backup"),
  ]);
  const exportOk = !!(download && (await download.suggestedFilename()).includes("vida-respaldo"));
  await page.waitForTimeout(400);
  // reopen more for import cancel via MM confirm cancel
  await page.click("#btn-more");
  await page.waitForSelector("#more-sheet:not(.hidden)");
  await page.click("#btn-update-app");
  await page.waitForTimeout(1200);
  await page.waitForSelector("#app");
  const habitsAfter = await page.locator("#habit-list li").count();
  // Import MM cancel
  await page.click('.tab[data-tab="finanzas"]');
  await page.waitForTimeout(200);
  const mmBtn = page.locator("#btn-import-mm");
  let importCancelOk = false;
  if (await mmBtn.count()) {
    await mmBtn.click();
    await page.waitForSelector("#confirm-no", { timeout: 5000 });
    await confirmNo(page);
    await page.waitForTimeout(200);
    const modalHidden = await page.evaluate(() => document.getElementById("modal")?.classList.contains("hidden"));
    importCancelOk = !!modalHidden;
  }
  // backup file cancel = no file chosen → noop; simulate by calling importBackupFile(null) path
  // Also test: pick file then cancel confirm
  const backupPath = path.join(SHOTS, "qa-gym-backup-tmp.json");
  fs.writeFileSync(backupPath, JSON.stringify({ version: "1.12.11", state: { habits: [], projects: [], accounts: [], transactions: [], loans: [], habitMarks: {}, deleted: {} } }));
  await page.click("#btn-more");
  await page.waitForSelector("#more-sheet:not(.hidden)");
  await page.evaluate(() => {
    // mark that we will cancel
    window.__qaImportCancel = true;
  });
  // Use setInputFiles then cancel confirm
  await page.setInputFiles("#backup-file-input", backupPath);
  await page.waitForSelector("#confirm-no", { timeout: 5000 }).catch(() => null);
  if (await page.locator("#confirm-no").count()) {
    await confirmNo(page);
    importCancelOk = true;
  }
  await page.waitForTimeout(300);
  if (moreOk && habitsAfter === habitsBefore && exportOk && importCancelOk) {
    pass("2-mas-export-import", `habits=${habitsBefore} export=${exportOk} importCancel`);
  } else {
    fail("2-mas-export-import", JSON.stringify({ moreOk, habitsBefore, habitsAfter, exportOk, importCancelOk }));
  }
  await shot(page, "qa-gym-02-mas.png");

  // ========== 3 Footer tras Eliminar CANCELADO (hábito/proyecto/tarea) ==========
  await page.click('.tab[data-tab="habitos"]');
  await page.waitForTimeout(200);
  // create habit for edit test
  await page.click("#btn-new-habit");
  await openModalWait(page);
  await page.fill("#f-habit-name", "QA Footer Habit");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.locator("#habit-list li", { hasText: "QA Footer Habit" }).click();
  // delete cancel then edit
  await page.click("#btn-delete-habit");
  await confirmNo(page);
  await page.click("#btn-edit-habit");
  await openModalWait(page);
  const footHabit = await footerVisible(page);
  await page.locator("#modal .modal-footer [data-close]").click();
  await closeModalWait(page);

  // project
  await page.click('.tab[data-tab="proyectos"]');
  await page.click("#btn-new-project");
  await openModalWait(page);
  await page.fill("#f-proj-name", "QA Footer Proj");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.locator("#project-list li", { hasText: "QA Footer Proj" }).click();
  await page.click("#btn-new-task");
  await openModalWait(page);
  await page.fill("#f-task-name", "QA Footer Task");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.click("#btn-delete-project");
  await confirmNo(page);
  await page.click("#btn-edit-project");
  await openModalWait(page);
  const footProj = await footerVisible(page);
  await page.locator("#modal .modal-footer [data-close]").click();
  await closeModalWait(page);
  // task delete cancel then edit
  await page.locator("#task-list li", { hasText: "QA Footer Task" }).locator("[data-del]").click();
  await confirmNo(page);
  await page.locator("#task-list li", { hasText: "QA Footer Task" }).locator("[data-edit]").click();
  await openModalWait(page);
  const footTask = await footerVisible(page);
  await page.locator("#modal .modal-footer [data-close]").click();
  await closeModalWait(page);

  if (footHabit.ok && footProj.ok && footTask.ok) pass("3-footer-cancel-delete", "hábito+proyecto+tarea");
  else fail("3-footer-cancel-delete", JSON.stringify({ footHabit, footProj, footTask }));

  // ========== 4 Racha: labels + done/miss/done/done/miss → mejor=2 ==========
  await page.click('.tab[data-tab="habitos"]');
  await page.click("#btn-new-habit");
  await openModalWait(page);
  await page.fill("#f-habit-name", "QA Racha");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.locator("#habit-list li", { hasText: "QA Racha" }).click();
  await page.waitForSelector("#habit-detail:not(.hidden)");

  const streak = await page.evaluate((store) => {
    const state = JSON.parse(localStorage.getItem(store) || "{}");
    const h = (state.habits || []).find((x) => x.name === "QA Racha");
    if (!h) return { ok: false, reason: "no habit" };
    h.weekdays = [0, 1, 2, 3, 4, 5, 6];
    h.type = "buen";
    // Build 5 consecutive days ending YESTERDAY: done, miss, done, done, miss
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const iso = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const pattern = ["done", "miss", "done", "done", "miss"];
    const dates = [];
    for (let i = 5; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(iso(d));
    }
    // clear existing marks for this habit
    Object.keys(state.habitMarks || {}).forEach((k) => {
      if (k.startsWith(h.id + ":")) delete state.habitMarks[k];
    });
    if (!state.habitMarks) state.habitMarks = {};
    pattern.forEach((m, i) => {
      state.habitMarks[h.id + ":" + dates[i]] = m;
    });
    // leave TODAY empty (grace)
    localStorage.setItem(store, JSON.stringify(state));
    return { habitId: h.id, dates, pattern, today: iso(today) };
  }, STORE);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator("#habit-list li", { hasText: "QA Racha" }).click();
  await page.waitForTimeout(400);
  const streakUI = await page.evaluate(() => {
    const pills = [...document.querySelectorAll("#habit-detail .stat-pill")].map((p) => p.textContent.trim());
    const text = document.getElementById("habit-detail")?.innerText || "";
    const hasActual = /Racha actual/i.test(text);
    const hasMejor = /Mejor racha/i.test(text);
    const actual = pills.find((p) => /Racha actual/i.test(p));
    const mejor = pills.find((p) => /Mejor racha/i.test(p));
    const actualN = actual ? Number((actual.match(/(\d+)/) || [])[1]) : null;
    const mejorN = mejor ? Number((mejor.match(/(\d+)/) || [])[1]) : null;
    return { pills, hasActual, hasMejor, actualN, mejorN };
  });
  // best=2 (done,done between misses); current=0 because yesterday=miss and today empty
  if (
    streakUI.hasActual &&
    streakUI.hasMejor &&
    streakUI.mejorN === 2 &&
    streakUI.actualN === 0
  ) {
    pass("4-racha", `mejor=${streakUI.mejorN} actual=${streakUI.actualN} dates=${streak.dates?.join(",")}`);
  } else {
    fail("4-racha", JSON.stringify({ streak, streakUI }));
  }
  await shot(page, "qa-gym-04-racha.png");

  // ========== 5 Calendario ciclo + tombstone ==========
  await page.click("#btn-new-habit");
  await openModalWait(page);
  await page.fill("#f-habit-name", "QA Cal Ciclo");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.locator("#habit-list li", { hasText: "QA Cal Ciclo" }).click();
  await page.waitForSelector("#habit-calendar");
  const cycle = await page.evaluate((store) => {
    const cells = [...document.querySelectorAll("#habit-calendar .cal-day[data-date]:not(.na):not([disabled])")];
    // pick a past day (not today) so cycle is stable
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const past = cells.filter((c) => c.dataset.date < isoToday);
    const cell = past[Math.min(2, past.length - 1)] || cells[0];
    if (!cell) return { ok: false, reason: "no cells" };
    const ds = cell.dataset.date;
    const habit = (JSON.parse(localStorage.getItem(store) || "{}").habits || []).find((x) => x.name === "QA Cal Ciclo");
    if (!habit) return { ok: false, reason: "no habit" };
    const key = habit.id + ":" + ds;
    const mark = () => {
      const s = JSON.parse(localStorage.getItem(store) || "{}");
      return (s.habitMarks && s.habitMarks[key]) || null;
    };
    const clickDs = () => {
      const c = document.querySelector(`#habit-calendar .cal-day[data-date="${ds}"]`);
      if (c) c.click();
    };
    const statuses = [];
    clickDs();
    statuses.push(mark());
    clickDs();
    statuses.push(mark());
    clickDs();
    statuses.push(mark());
    // tombstone after clear
    const state = JSON.parse(localStorage.getItem(store) || "{}");
    const hasTomb = !!(state.deleted && state.deleted.habitMarks && state.deleted.habitMarks[key]);
    const hasMark = !!(state.habitMarks && state.habitMarks[key]);
    function normalizeMarkValue(v) {
      if (v === "done" || v === "miss" || v === "bad") return v;
      return null;
    }
    function mergeHabitMarks(a, b, tombstones) {
      const dead = tombstones || {};
      const out = {};
      new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach((k) => {
        if (dead[k]) return;
        const av = normalizeMarkValue(a && a[k]);
        const bv = normalizeMarkValue(b && b[k]);
        const val = av != null ? av : bv;
        if (val) out[k] = val;
      });
      return out;
    }
    const merged = mergeHabitMarks(state.habitMarks || {}, { [key]: "done" }, (state.deleted && state.deleted.habitMarks) || {});
    return {
      ok: statuses[0] === "done" && statuses[1] === "miss" && statuses[2] === null && !hasMark && hasTomb && !merged[key],
      ds,
      statuses,
      hasTomb,
      hasMark,
      revived: !!merged[key],
    };
  }, STORE);
  if (cycle.ok) pass("5-calendario-tombstone", `${cycle.ds} ${cycle.statuses.join("→")}`);
  else fail("5-calendario-tombstone", JSON.stringify(cycle));

  // ========== 6 Finanzas: orden, pago alerta, filtros, préstamos ==========
  await page.click('.tab[data-tab="finanzas"]');
  await page.waitForSelector("#panel-finanzas:not([hidden])");
  const finOrder = await page.evaluate(() => {
    const panel = document.getElementById("panel-finanzas");
    const layoutH = [...panel.querySelector(".finanzas-layout").querySelectorAll(":scope > .card")].map(
      (c) => c.querySelector("h3")?.textContent.trim()
    );
    const allH = [...panel.querySelectorAll("h3")].map((h) => h.textContent.trim());
    return {
      layoutH,
      movFirst: layoutH[0] === "Movimientos",
      catSecond: layoutH[1] === "Por categoría",
      cuentasAfter: allH.indexOf("Cuentas") > allH.indexOf("Movimientos"),
    };
  });
  if (!(finOrder.movFirst && finOrder.catSecond && finOrder.cuentasAfter)) {
    fail("6a-fin-orden", JSON.stringify(finOrder));
  } else pass("6a-fin-orden", finOrder.layoutH.join(" | "));
  await shot(page, "qa-gym-06-finanzas.png");

  // credit account + alert pay
  const todayDay = new Date().getDate();
  await page.click("#btn-new-account");
  await openModalWait(page);
  await page.fill("#f-acc-name", "QA Credito Gym");
  await page.selectOption("#f-acc-type", "credito");
  await page.waitForTimeout(100);
  await page.fill("#f-acc-opening", "-4000");
  await page.fill("#f-acc-limit", "10000");
  await page.fill("#f-acc-due", String(Math.min(28, todayDay)));
  await page.fill("#f-acc-cutoff", String(((todayDay + 14 - 1) % 28) + 1));
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.click('.tab[data-tab="finanzas"]');
  await page.waitForTimeout(500);
  let alerts = await page.locator("#payment-alerts:not(.hidden) .payment-alert").count();
  if (!alerts) {
    await page.evaluate(
      ({ store, day }) => {
        const state = JSON.parse(localStorage.getItem(store) || "{}");
        const acc = (state.accounts || []).find((a) => a.name === "QA Credito Gym");
        if (acc) {
          acc.type = "credito";
          acc.openingBalance = -4000;
          acc.paymentDueDay = Math.min(28, day);
          acc.cutoffDay = ((day + 14 - 1) % 28) + 1;
        }
        localStorage.setItem(store, JSON.stringify(state));
      },
      { store: STORE, day: todayDay }
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.click('.tab[data-tab="finanzas"]');
    await page.waitForTimeout(500);
    alerts = await page.locator("#payment-alerts:not(.hidden) .payment-alert").count();
  }
  if (alerts) {
    const alertGym = page.locator("#payment-alerts .payment-alert", { hasText: "QA Credito Gym" });
    if (await alertGym.count()) await alertGym.first().click();
    else await page.locator("#payment-alerts .payment-alert").first().click();
    await openModalWait(page);
    const submitLabel = (await page.locator("#modal-submit").textContent())?.trim();
    const payAmt = page.locator("#f-pay-amount");
    if (await payAmt.count()) await payAmt.fill("500");
    else await page.locator("#modal-form input[type=number]").first().fill("500");
    const fromSel = page.locator("#f-pay-from, #modal-form select").first();
    if (await fromSel.count()) {
      const opts = await fromSel.locator("option").count();
      if (opts > 1) await fromSel.selectOption({ index: 1 });
    }
    await page.click("#modal-submit");
    await closeModalWait(page);
    await page.waitForTimeout(400);
    const afterDebt = await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k) || "{}");
      const a = (s.accounts || []).find((x) => x.name === "QA Credito Gym");
      if (!a) return null;
      let bal = Number(a.openingBalance) || 0;
      (s.transactions || [])
        .filter((t) => t.accountId === a.id)
        .forEach((t) => {
          if (t.type === "gasto") bal -= Number(t.amount);
          else bal += Number(t.amount);
        });
      return bal;
    }, STORE);
    if (/Registrar pago/i.test(submitLabel || "") && afterDebt != null && afterDebt > -4000) {
      pass("6b-pago-alerta", `bal→${afterDebt}`);
    } else fail("6b-pago-alerta", JSON.stringify({ submitLabel, afterDebt, alerts }));
  } else fail("6b-pago-alerta", "no alert");

  // loan
  await page.click("#btn-new-loan");
  await openModalWait(page);
  await page.locator("#modal-form input[type=text], #f-loan-person").first().fill("QA Persona Gym");
  await page.locator("#modal-form input[type=number]").first().fill("800");
  await page.click("#modal-submit");
  await closeModalWait(page);
  const loanVisible = await page.locator("#loans-list .loan-card", { hasText: "QA Persona Gym" }).count();
  let cobro = false,
    deleted = false;
  if (loanVisible) {
    await page.locator("#loans-list .loan-card", { hasText: "QA Persona Gym" }).locator("[data-pay]").click();
    await openModalWait(page);
    await page.locator("#modal-form input[type=number]").first().fill("200");
    await page.click("#modal-submit");
    await closeModalWait(page);
    cobro = true;
    await page.locator("#loans-list .loan-card", { hasText: "QA Persona Gym" }).locator("[data-delete]").click();
    await confirmYes(page);
    deleted = (await page.locator("#loans-list .loan-card", { hasText: "QA Persona Gym" }).count()) === 0;
  }
  if (loanVisible && cobro && deleted) pass("6c-prestamo");
  else fail("6c-prestamo", JSON.stringify({ loanVisible, cobro, deleted }));

  // filters — seed a gasto first
  await page.click("#btn-new-tx");
  await openModalWait(page);
  await page.evaluate(() => {
    const r = document.querySelector("#modal-form input[name=type][value=gasto]");
    if (r) {
      r.checked = true;
      r.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.fill("#f-tx-amount", "75");
  const qaCredOpt = await page.locator("#f-tx-account option").evaluateAll((opts) => {
    const o = opts.find((x) => /QA Credito Gym/.test(x.textContent));
    return o ? o.value : null;
  });
  if (qaCredOpt) await page.selectOption("#f-tx-account", qaCredOpt);
  await page.click("#modal-submit");
  await closeModalWait(page);
  const filters = await page.evaluate(() => {
    const acc = document.getElementById("fin-filter-account");
    const typ = document.getElementById("fin-filter-type");
    const count = () => document.getElementById("tx-list").querySelectorAll("li").length;
    typ.value = "gasto";
    typ.dispatchEvent(new Event("change", { bubbles: true }));
    const g = count();
    typ.value = "ingreso";
    typ.dispatchEvent(new Event("change", { bubbles: true }));
    const i = count();
    typ.value = "all";
    typ.dispatchEvent(new Event("change", { bubbles: true }));
    const qa = [...acc.options].find((o) => /QA Credito Gym/.test(o.text));
    if (qa) {
      acc.value = qa.value;
      acc.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const a = count();
    acc.value = "all";
    acc.dispatchEvent(new Event("change", { bubbles: true }));
    return { g, i, a, hasQa: !!qa, typOptions: [...typ.options].map((o) => o.value) };
  });
  if (filters.hasQa && filters.typOptions.includes("gasto") && filters.g >= 1) pass("6d-filtros", JSON.stringify(filters));
  else fail("6d-filtros", JSON.stringify(filters));

  // ========== 7 Proyectos: incumplidos + tareas hechas editables ==========
  await page.click('.tab[data-tab="proyectos"]');
  await page.locator("#project-list li", { hasText: "QA Footer Proj" }).click();
  await page.waitForTimeout(300);
  const miss = await page.evaluate((store) => {
    const cells = [...document.querySelectorAll("#project-miss-calendar .cal-day[data-date]:not(.na):not([disabled])")];
    // Prefer a past day so UI is stable
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const past = cells.filter((c) => c.dataset.date < isoToday);
    const cell = past[0] || cells[0];
    if (!cell) return { ok: false, reason: "no cells" };
    const ds = cell.dataset.date;
    const projName = /QA Footer Proj/;
    const read = () => {
      const state = JSON.parse(localStorage.getItem(store) || "{}");
      const p = (state.projects || []).find((x) => projName.test(x.name));
      return { state, p };
    };
    document.querySelector(`#project-miss-calendar .cal-day[data-date="${ds}"]`)?.click();
    const afterMark = read();
    const marked = !!(afterMark.p && afterMark.p.missedDays && afterMark.p.missedDays[ds]);
    document.querySelector(`#project-miss-calendar .cal-day[data-date="${ds}"]`)?.click();
    const { state, p } = read();
    if (!p) return { ok: false, reason: "no project", marked };
    const tombKey = p.id + ":" + ds;
    const hasTomb = !!(state.deleted && state.deleted.missedDays && state.deleted.missedDays[tombKey]);
    const still = !!(p.missedDays && p.missedDays[ds]);
    function mergeMissedDays(a, b, entityId, tombstones) {
      const dead = tombstones || {};
      const out = {};
      new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach((d) => {
        if (!d) return;
        if (dead[entityId + ":" + d]) return;
        if ((a && a[d]) || (b && b[d])) out[d] = true;
      });
      return out;
    }
    const merged = mergeMissedDays(p.missedDays || {}, { [ds]: true }, p.id, (state.deleted && state.deleted.missedDays) || {});
    return { ok: marked && !still && hasTomb && !merged[ds], ds, hasTomb, still, revived: !!merged[ds], marked };
  }, STORE);
  if (miss.ok) pass("7a-incumplidos-tombstone", miss.ds);
  else fail("7a-incumplidos-tombstone", JSON.stringify(miss));

  // mark task done then edit
  const taskLi = page.locator("#task-list li", { hasText: "QA Footer Task" });
  await taskLi.locator(".task-check").click();
  await page.waitForTimeout(200);
  await taskLi.locator("[data-edit]").click();
  await openModalWait(page);
  const taskEdit = await page.evaluate(() => {
    const name = document.getElementById("f-task-name")?.value;
    const footer = document.querySelector("#modal .modal-footer");
    const cs = footer && getComputedStyle(footer);
    return {
      name,
      footerOk: footer && cs.display !== "none" && !footer.hidden,
    };
  });
  await page.fill("#f-task-name", "QA Footer Task Editada");
  await page.click("#modal-submit");
  await closeModalWait(page);
  const taskDoneEdited = await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const p = (s.projects || []).find((x) => /QA Footer Proj/.test(x.name));
    const t = p && (p.tasks || []).find((x) => /QA Footer Task/.test(x.name));
    return t ? { done: !!t.done, name: t.name } : null;
  }, STORE);
  if (taskEdit.name === "QA Footer Task" && taskEdit.footerOk && taskDoneEdited?.done && /Editada/.test(taskDoneEdited.name)) {
    pass("7b-tarea-hecha-editable", taskDoneEdited.name);
  } else fail("7b-tarea-hecha-editable", JSON.stringify({ taskEdit, taskDoneEdited }));
  await shot(page, "qa-gym-07-proyectos.png");

  // ========== 8 Sync A/B efímero: weekdays + clear mark ==========
  await page.click("#btn-sync");
  await page.waitForSelector("#sync-modal:not(.hidden)");
  if (await page.locator("#sync-has-code:not(.hidden) #btn-sync-disconnect").count()) {
    await page.click("#btn-sync-disconnect");
    if (await page.locator("#confirm-yes").count()) await confirmYes(page);
    await page.waitForTimeout(300);
  }
  await page.click("#btn-sync-create");
  await page.waitForTimeout(1500);
  let code = await page.inputValue("#sync-code-display");
  if (!code) {
    await page.waitForTimeout(2000);
    code = await page.inputValue("#sync-code-display");
  }
  if (!code || code === FORBIDDEN) {
    fail("8-sync-ab", `bad code=${code}`);
  } else {
    await page.locator("#sync-modal .modal-footer [data-sync-close], #sync-modal .modal-header [data-sync-close]").first().click();
    await page.waitForTimeout(200);
    await page.click('.tab[data-tab="habitos"]');
    await page.click("#btn-new-habit");
    await openModalWait(page);
    await page.fill("#f-habit-name", "QA Sync Gym");
    // Mon-Fri
    await page.evaluate(() => {
      document.querySelectorAll("#modal-form input[name=weekdays]").forEach((b) => {
        b.checked = ["1", "2", "3", "4", "5"].includes(b.value);
        b.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    await page.click("#modal-submit");
    await closeModalWait(page);
    await page.locator("#habit-list li", { hasText: "QA Sync Gym" }).click();
    const markDs = await page.evaluate(() => {
      const cells = [...document.querySelectorAll("#habit-calendar .cal-day[data-date]:not(.na):not([disabled])")];
      const today = new Date();
      const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const past = cells.filter((c) => c.dataset.date < isoToday);
      const cell = past[0] || cells[0];
      if (!cell) return null;
      cell.click(); // done
      return cell.dataset.date;
    });
    await page.click("#btn-sync");
    await page.waitForSelector("#sync-modal:not(.hidden)");
    await page.click("#btn-sync-now");
    await page.waitForTimeout(3000);
    await page.locator("#sync-modal .modal-footer [data-sync-close], #sync-modal .modal-header [data-sync-close]").first().click();

    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX", colorScheme: "dark" });
    const pageB = await ctxB.newPage();
    await pageB.goto(URL, { waitUntil: "networkidle" });
    await pageB.waitForTimeout(400);
    await pageB.click("#btn-sync");
    await pageB.waitForSelector("#sync-modal:not(.hidden)");
    await pageB.fill("#sync-code-input", code);
    await pageB.click("#btn-sync-connect");
    await pageB.waitForTimeout(3500);
    await pageB.locator("#sync-modal .modal-footer [data-sync-close], #sync-modal .modal-header [data-sync-close]").first().click().catch(() => {});
    await pageB.waitForTimeout(400);
    const bHas = await pageB.locator("#habit-list li", { hasText: "QA Sync Gym" }).count();
    const bWeekdaysBefore = await pageB.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k) || "{}");
      const h = (s.habits || []).find((x) => x.name === "QA Sync Gym");
      return h && h.weekdays;
    }, STORE);
    let bBefore = null;
    if (bHas) {
      await pageB.locator("#habit-list li", { hasText: "QA Sync Gym" }).click();
      bBefore = await pageB.evaluate(
        ({ store, ds }) => {
          const s = JSON.parse(localStorage.getItem(store) || "{}");
          const h = (s.habits || []).find((x) => x.name === "QA Sync Gym");
          return h && ds ? s.habitMarks[h.id + ":" + ds] || null : null;
        },
        { store: STORE, ds: markDs }
      );
    }

    // A: clear mark FIRST (while day still scheduled), then edit weekdays to weekends
    await page.locator("#habit-list li", { hasText: "QA Sync Gym" }).click();
    await page.waitForTimeout(200);
    const clearedOnA = await page.evaluate(({ store, ds }) => {
      // Cycle until empty via fresh query each click (DOM re-renders)
      for (let i = 0; i < 6; i++) {
        const s = JSON.parse(localStorage.getItem(store) || "{}");
        const h = (s.habits || []).find((x) => x.name === "QA Sync Gym");
        if (!h) return { ok: false, reason: "no habit" };
        const key = h.id + ":" + ds;
        const cur = (s.habitMarks && s.habitMarks[key]) || null;
        if (!cur) return { ok: true, key, tomb: !!(s.deleted && s.deleted.habitMarks && s.deleted.habitMarks[key]) };
        const cell = document.querySelector(`#habit-calendar .cal-day[data-date="${ds}"]`);
        if (!cell) return { ok: false, reason: "no cell", cur };
        cell.click();
      }
      const s2 = JSON.parse(localStorage.getItem(store) || "{}");
      const h2 = (s2.habits || []).find((x) => x.name === "QA Sync Gym");
      const key2 = h2.id + ":" + ds;
      return { ok: !(s2.habitMarks && s2.habitMarks[key2]), key: key2, tomb: !!(s2.deleted && s2.deleted.habitMarks && s2.deleted.habitMarks[key2]) };
    }, { store: STORE, ds: markDs });
    await page.click("#btn-edit-habit");
    await openModalWait(page);
    await page.evaluate(() => {
      document.querySelectorAll("#modal-form input[name=weekdays]").forEach((b) => {
        b.checked = ["0", "6"].includes(b.value);
        b.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    await page.click("#modal-submit");
    await closeModalWait(page);
    if (!clearedOnA.ok) {
      fail("8-sync-ab", "clear on A failed: " + JSON.stringify(clearedOnA));
    }
    await page.click("#btn-sync");
    await page.waitForSelector("#sync-modal:not(.hidden)");
    await page.click("#btn-sync-now");
    await page.waitForTimeout(3000);
    await page.locator("#sync-modal .modal-footer [data-sync-close], #sync-modal .modal-header [data-sync-close]").first().click();

    await pageB.click("#btn-sync");
    await pageB.waitForSelector("#sync-modal:not(.hidden)");
    await pageB.click("#btn-sync-now");
    await pageB.waitForTimeout(3500);
    await pageB.locator("#sync-modal .modal-footer [data-sync-close], #sync-modal .modal-header [data-sync-close]").first().click().catch(() => {});
    const bAfter = await pageB.evaluate(
      ({ store, ds }) => {
        const s = JSON.parse(localStorage.getItem(store) || "{}");
        const h = (s.habits || []).find((x) => x.name === "QA Sync Gym");
        return {
          mark: h && ds ? s.habitMarks[h.id + ":" + ds] || null : "no-habit",
          weekdays: h && h.weekdays,
        };
      },
      { store: STORE, ds: markDs }
    );

    const weekdaysOk = Array.isArray(bAfter.weekdays) && bAfter.weekdays.join(",") === "0,6";
    const markCleared = bHas && bBefore && !bAfter.mark;
    if (weekdaysOk && markCleared && code !== FORBIDDEN && clearedOnA.ok) {
      pass("8-sync-ab", `code=${code.slice(0, 8)}… wd=${bAfter.weekdays} cleared`);
    } else {
      fail("8-sync-ab", JSON.stringify({ code: code.slice(0, 8), bHas, bBefore, bAfter, bWeekdaysBefore, markDs, weekdaysOk, markCleared, clearedOnA }));
    }

    // disconnect A
    await page.click("#btn-sync");
    await page.waitForSelector("#sync-modal:not(.hidden)");
    await page.click("#btn-sync-disconnect");
    await confirmYes(page);
    await page.waitForTimeout(300);
    const disc = await page.evaluate(() => !localStorage.getItem("vida-sync-id"));
    if (disc) pass("8b-sync-disconnect");
    else fail("8b-sync-disconnect", "still connected");
    await pageB.close();
    await ctxB.close();
  }

  // ========== 9 JS errors ==========
  const real = jsErrors.filter((e) => !/favicon|Failed to load|net::ERR|Download|Download is starting/i.test(e));
  if (!real.length) pass("9-js-errors");
  else fail("9-js-errors", real.slice(0, 8).join(" || "));
  await shot(page, "qa-gym-09-final.png");

  await browser.close();

  const report = {
    when: new Date().toISOString(),
    url: URL,
    results,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
  };
  fs.writeFileSync(path.join(ROOT, "qa", "qa-gym-report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== GYM SUMMARY ===");
  console.log(`PASS ${report.pass} / FAIL ${report.fail} of ${results.length}`);
  results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  FAIL ${r.id}: ${r.note}`));
  process.exit(report.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
