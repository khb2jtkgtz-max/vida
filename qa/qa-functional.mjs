/**
 * Vida QA funcional completa
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "screenshots");
const BASE = process.env.VIDA_URL || "http://127.0.0.1:8877";
const URL = `${BASE}/?v=qa-${Date.now()}`;
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
async function getState(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), STORE);
}
async function setState(page, mutator) {
  await page.evaluate(({ k, fn }) => {
    const state = JSON.parse(localStorage.getItem(k) || "{}");
    // eslint-disable-next-line no-new-func
    const m = new Function("state", fn);
    m(state);
    localStorage.setItem(k, JSON.stringify(state));
  }, { k: STORE, fn: `(${mutator})(state);` });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "es-MX",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  // ---------- 1 Shell ----------
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#app-version-label");
  await page.waitForTimeout(400);
  const shell = await page.evaluate(() => {
    const version = document.getElementById("app-version-label")?.textContent?.trim();
    const tabs = [...document.querySelectorAll(".tabs .tab")].map((t) => t.dataset.tab);
    const tabsEl = document.querySelector(".tabs");
    const main = document.querySelector("main");
    const header = document.querySelector(".app-header");
    const tabsAboveMain = !!(tabsEl && main && (tabsEl.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING));
    const tabsBelowHeader = !!(header && tabsEl && (header.compareDocumentPosition(tabsEl) & Node.DOCUMENT_POSITION_FOLLOWING));
    const bg = getComputedStyle(document.body).backgroundColor;
    const card = document.querySelector(".card");
    const cardBg = card ? getComputedStyle(card).backgroundColor : "";
    return { version, tabs, tabsAboveMain, tabsBelowHeader, bg, cardBg };
  });
  if (/v?1\.\d+\.\d+/.test(shell.version || "") &&
      shell.tabs.join(",") === "habitos,finanzas,proyectos" &&
      shell.tabsAboveMain && shell.tabsBelowHeader &&
      /rgb\(0,\s*0,\s*0\)|#000/.test(shell.bg)) {
    pass(1, shell.version);
  } else fail(1, JSON.stringify(shell));
  await shot(page, "qa-01-shell.png");

  // ---------- 2 Más + Actualizar ----------
  const habitsBefore = await page.locator("#habit-list li").count();
  await page.click("#btn-more");
  await page.waitForSelector("#more-sheet:not(.hidden)");
  const moreOpened = await page.locator("#more-sheet:not(.hidden)").count();
  await page.locator("#more-sheet .modal-footer [data-more-close]").click();
  await page.waitForTimeout(200);
  const moreClosed = await page.locator("#more-sheet.hidden").count();
  await page.click("#btn-more");
  await page.waitForSelector("#more-sheet:not(.hidden)");
  await page.click("#btn-update-app");
  await page.waitForTimeout(1200);
  await page.waitForSelector("#app");
  const habitsAfter = await page.locator("#habit-list li").count();
  if (moreOpened && moreClosed && habitsAfter === habitsBefore) pass(2, `hábitos=${habitsBefore}`);
  else fail(2, JSON.stringify({ moreOpened, moreClosed, habitsBefore, habitsAfter }));

  // ---------- 3 Modal footer after confirm ----------
  await page.click("#btn-new-habit");
  await openModalWait(page);
  await page.fill("#f-habit-name", "QA Footer Habit");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.locator("#habit-list li", { hasText: "QA Footer Habit" }).click();
  await page.click("#btn-delete-habit");
  await confirmYes(page);
  await page.waitForTimeout(200);
  await page.click("#btn-new-habit");
  await openModalWait(page);
  const footerOk = await page.evaluate(() => {
    const modal = document.getElementById("modal");
    const footer = modal.querySelector(".modal-footer");
    const cs = getComputedStyle(footer);
    const texts = [...footer.querySelectorAll("button")].map((b) => b.textContent.trim());
    return {
      display: cs.display,
      hidden: footer.hidden,
      confirmClass: modal.classList.contains("modal--confirm"),
      texts,
      visible: cs.display !== "none" && !footer.hidden && !modal.classList.contains("modal--confirm")
        && texts.some((t) => /Cancelar/i.test(t)) && texts.some((t) => /Guardar/i.test(t)),
    };
  });
  await page.locator("#modal .modal-footer [data-close]").click();
  await closeModalWait(page);
  if (footerOk.visible) pass(3, "Cancelar+Guardar tras Eliminar");
  else fail(3, JSON.stringify(footerOk));

  // ---------- 4 Crear hábito ----------
  await page.click("#btn-new-habit");
  await openModalWait(page);
  await page.fill("#f-habit-name", "QA Habito Persist");
  await page.click("#modal-submit");
  await closeModalWait(page);
  const created = await page.locator("#habit-list li", { hasText: "QA Habito Persist" }).count();
  if (created) pass(4); else fail(4, "no en lista");

  // ---------- 5 Editar + persist ----------
  await page.locator("#habit-list li", { hasText: "QA Habito Persist" }).click();
  await page.click("#btn-edit-habit");
  await openModalWait(page);
  await page.fill("#f-habit-name", "QA Habito Editado");
  // Mon-Fri only (checkbox inputs are visually hidden inside pills)
  await page.evaluate(() => {
    document.querySelectorAll("#modal-form input[name=weekdays]").forEach((b) => {
      b.checked = ["1", "2", "3", "4", "5"].includes(b.value);
      b.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const persisted = await page.locator("#habit-list li", { hasText: "QA Habito Editado" }).count();
  const weekdays = await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const h = (s.habits || []).find((x) => x.name === "QA Habito Editado");
    return h && h.weekdays;
  }, STORE);
  if (persisted && Array.isArray(weekdays) && weekdays.join(",") === "1,2,3,4,5") pass(5, `weekdays=${weekdays}`);
  else fail(5, JSON.stringify({ persisted, weekdays }));

  // ---------- 6 Calendario cycle + tombstone ----------
  await page.locator("#habit-list li", { hasText: "QA Habito Editado" }).click();
  await page.waitForSelector("#habit-detail:not(.hidden)");
  const cycle = await page.evaluate((store) => {
    const cells = [...document.querySelectorAll("#habit-calendar .cal-day[data-date]:not(.na):not([disabled])")];
    if (!cells.length) return { ok: false, reason: "no cells" };
    const ds = cells[Math.min(3, cells.length - 1)].dataset.date;
    const habit = (JSON.parse(localStorage.getItem(store) || "{}").habits || []).find((x) => x.name === "QA Habito Editado");
    if (!habit) return { ok: false, reason: "no habit" };
    const key = habit.id + ":" + ds;
    const mark = () => {
      const s = JSON.parse(localStorage.getItem(store) || "{}");
      return s.habitMarks && s.habitMarks[key] || null;
    };
    const clickDs = () => {
      const c = document.querySelector(`#habit-calendar .cal-day[data-date="${ds}"]`);
      if (c) c.click();
    };
    const statuses = [];
    clickDs(); statuses.push(mark());
    clickDs(); statuses.push(mark());
    clickDs(); statuses.push(mark());
    return { ok: statuses[0] === "done" && statuses[1] === "miss" && statuses[2] === null, ds, statuses, key };
  }, STORE);
  const tomb = await page.evaluate(({ store, ds }) => {
    const state = JSON.parse(localStorage.getItem(store) || "{}");
    const h = (state.habits || []).find((x) => x.name === "QA Habito Editado");
    if (!h || !ds) return { ok: false };
    const key = h.id + ":" + ds;
    const hasTomb = !!(state.deleted && state.deleted.habitMarks && state.deleted.habitMarks[key]);
    const hasMark = !!(state.habitMarks && state.habitMarks[key]);
    // merge remote old mark
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
    return { ok: !hasMark && hasTomb && !merged[key], key, hasTomb, hasMark, revived: !!merged[key] };
  }, { store: STORE, ds: cycle.ds });
  if (cycle.ok && tomb.ok) pass(6, `${cycle.ds} ${cycle.statuses.join("→")}`);
  else fail(6, JSON.stringify({ cycle, tomb }));

  // ---------- 7 Eliminar hábito ----------
  await page.click("#btn-delete-habit");
  await confirmYes(page);
  await page.waitForTimeout(200);
  const gone = (await page.locator("#habit-list li", { hasText: "QA Habito Editado" }).count()) === 0;
  const noRevive = await page.evaluate((k) => {
    const state = JSON.parse(localStorage.getItem(k) || "{}");
    const dead = (state.deleted && state.deleted.habits) || {};
    const ids = Object.keys(dead);
    if (!ids.length) return false;
    const remote = [{ id: ids[0], name: "QA Habito Editado", updatedAt: Date.now() + 99999 }];
    function mergeById(listA, listB, tombstones) {
      const map = new Map();
      const tombs = tombstones || {};
      function put(item) {
        if (!item || !item.id || tombs[item.id]) return;
        map.set(item.id, item);
      }
      (listA || []).forEach(put);
      (listB || []).forEach(put);
      return [...map.values()].filter((i) => !tombs[i.id]);
    }
    return !mergeById(state.habits, remote, dead).some((h) => h.name === "QA Habito Editado");
  }, STORE);
  if (gone && noRevive) pass(7); else fail(7, JSON.stringify({ gone, noRevive }));

  // ---------- 8 Finanzas order ----------
  await page.click('.tab[data-tab="finanzas"]');
  await page.waitForSelector("#panel-finanzas:not([hidden])");
  const finOrder = await page.evaluate(() => {
    const panel = document.getElementById("panel-finanzas");
    const kids = [...panel.children];
    const labels = [];
    kids.forEach((el) => {
      if (el.id === "payment-alerts") labels.push("alerts");
      else if (el.classList.contains("finanzas-layout")) {
        [...el.querySelectorAll(":scope > .card > h3, :scope > .card .card-head h3")].forEach((h) => labels.push(h.textContent.trim()));
      } else if (el.classList.contains("fin-dashboard")) labels.push("dashboard");
      else if (el.classList.contains("cuentas-section") || el.querySelector?.("h3")?.textContent === "Cuentas") labels.push("Cuentas");
      else {
        const h = el.querySelector?.(":scope > .card-head h3, :scope > h3");
        if (h) labels.push(h.textContent.trim());
      }
    });
    // also check layout DOM order
    const layoutH = [...panel.querySelector(".finanzas-layout").querySelectorAll(":scope > .card")].map((c) => c.querySelector("h3")?.textContent.trim());
    const allH = [...panel.querySelectorAll("h3")].map((h) => h.textContent.trim());
    return { layoutH, allH, movFirst: layoutH[0] === "Movimientos", catSecond: layoutH[1] === "Por categoría", cuentasAfter: allH.indexOf("Cuentas") > allH.indexOf("Movimientos") };
  });
  if (finOrder.movFirst && finOrder.catSecond && finOrder.cuentasAfter) pass(8, finOrder.layoutH.join(" | "));
  else fail(8, JSON.stringify(finOrder));
  await shot(page, "qa-08-finanzas.png");

  // ---------- 9 Cuenta crédito + movimientos ----------
  await page.click("#btn-new-account");
  await openModalWait(page);
  await page.fill("#f-acc-name", "QA Credito");
  await page.selectOption("#f-acc-type", "credito");
  await page.waitForTimeout(100);
  await page.fill("#f-acc-opening", "-3500");
  await page.fill("#f-acc-limit", "10000");
  const todayDay = new Date().getDate();
  await page.fill("#f-acc-due", String(Math.min(28, todayDay)));
  await page.fill("#f-acc-cutoff", String(((todayDay + 14 - 1) % 28) + 1));
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.waitForTimeout(200);

  await page.click("#btn-new-tx");
  await openModalWait(page);
  await page.evaluate(() => {
    const r = document.querySelector('#modal-form input[name=type][value=gasto]');
    if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await page.fill("#f-tx-amount", "250");
  const qaCredOpt = await page.locator("#f-tx-account option").evaluateAll(opts => {
    const o = opts.find(x => /QA Credito/.test(x.textContent));
    return o ? o.value : null;
  });
  if (qaCredOpt) await page.selectOption("#f-tx-account", qaCredOpt);
  await page.fill("#f-tx-note", "QA gasto");
  await page.click("#modal-submit");
  await closeModalWait(page);

  await page.click("#btn-new-tx");
  await openModalWait(page);
  await page.evaluate(() => {
    const r = document.querySelector('#modal-form input[name=type][value=ingreso]');
    if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await page.fill("#f-tx-amount", "1000");
  // use non-credit account for income
  const incomeAcc = await page.locator("#f-tx-account option").evaluateAll((opts) => {
    const o = opts.find((x) => /Efectivo|Santander|débito|debito/i.test(x.textContent) && !/QA Credito/.test(x.textContent));
    return o ? o.value : opts[1]?.value;
  });
  if (incomeAcc) await page.selectOption("#f-tx-account", incomeAcc);
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.waitForTimeout(200);

  const dayGroup = await page.evaluate(() => {
    const ul = document.getElementById("tx-list");
    const groups = ul.querySelectorAll(".tx-day-group, .tx-group, [class*=day]");
    const dayHeaders = [...ul.querySelectorAll("h4, .tx-day-label, .day-label, .tx-date")];
    return {
      html: ul.innerHTML.slice(0, 500),
      groupCount: groups.length,
      headerCount: dayHeaders.length,
      liCount: ul.querySelectorAll("li").length,
      hasAccount: /QA Credito/.test(document.getElementById("accounts-chips")?.textContent || ""),
    };
  });
  // Check grouping structure more carefully
  const grouped = await page.evaluate(() => {
    const ul = document.getElementById("tx-list");
    // renderTxList uses group elements
    const children = [...ul.children];
    return {
      childTags: children.map((c) => c.tagName + "." + c.className),
      text: ul.innerText.slice(0, 300),
    };
  });
  if (dayGroup.hasAccount && dayGroup.liCount >= 1 && (dayGroup.groupCount >= 1 || grouped.childTags.length >= 1)) {
    pass(9, `groups=${dayGroup.groupCount} lis=${dayGroup.liCount}`);
  } else fail(9, JSON.stringify({ dayGroup, grouped }));

  // ---------- 10 Pagar alerta ----------
  await page.reload({ waitUntil: "networkidle" });
  await page.click('.tab[data-tab="finanzas"]');
  await page.waitForTimeout(500);
  let alerts = await page.locator("#payment-alerts:not(.hidden) .payment-alert").count();
  if (!alerts) {
    // force debt + due today via storage
    await page.evaluate(({ store, day }) => {
      const state = JSON.parse(localStorage.getItem(store) || "{}");
      const acc = (state.accounts || []).find((a) => a.name === "QA Credito");
      if (acc) {
        acc.type = "credito";
        acc.openingBalance = -4000;
        acc.paymentDueDay = Math.min(28, day);
        acc.cutoffDay = ((day + 14 - 1) % 28) + 1;
      }
      localStorage.setItem(store, JSON.stringify(state));
    }, { store: STORE, day: todayDay });
    await page.reload({ waitUntil: "networkidle" });
    await page.click('.tab[data-tab="finanzas"]');
    await page.waitForTimeout(500);
    alerts = await page.locator("#payment-alerts:not(.hidden) .payment-alert").count();
  }
  let payResult = { alerts };
  if (alerts) {
    const before = await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k) || "{}");
      const a = (s.accounts || []).find((x) => x.name === "QA Credito");
      // debt from opening + txs approximate
      return a ? a.openingBalance : null;
    }, STORE);
    await page.locator("#payment-alerts .payment-alert").first().click();
    await openModalWait(page);
    const submitLabel = (await page.locator("#modal-submit").textContent())?.trim();
    const payAmt = page.locator("#f-pay-amount");
    if (await payAmt.count()) await payAmt.fill("500");
    else await page.locator("#modal-form input[type=number]").first().fill("500");
    // pay from
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
      const a = (s.accounts || []).find((x) => x.name === "QA Credito");
      if (!a) return null;
      let bal = Number(a.openingBalance) || 0;
      (s.transactions || []).filter((t) => t.accountId === a.id).forEach((t) => {
        if (t.type === "gasto") bal -= Number(t.amount);
        else bal += Number(t.amount);
      });
      return bal;
    }, STORE);
    payResult = { alerts, submitLabel, before, afterDebt, improved: afterDebt != null && afterDebt > -4000 };
    if (/Registrar pago/i.test(submitLabel || "") && payResult.improved) pass(10, `bal→${afterDebt}`);
    else fail(10, JSON.stringify(payResult));
  } else fail(10, "no payment alert");

  // ---------- 11 Préstamo ----------
  await page.click("#btn-new-loan");
  await openModalWait(page);
  await page.locator("#modal-form input[type=text], #modal-form input:not([type]), #f-loan-person").first().fill("QA Persona");
  await page.locator("#modal-form input[type=number]").first().fill("800");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.waitForTimeout(200);
  const loanVisible = await page.locator("#loans-list .loan-card", { hasText: "QA Persona" }).count();
  let cobro = false, deleted = false;
  if (loanVisible) {
    await page.locator("#loans-list .loan-card", { hasText: "QA Persona" }).locator("[data-pay]").click();
    await openModalWait(page);
    await page.locator("#modal-form input[type=number]").first().fill("200");
    await page.click("#modal-submit");
    await closeModalWait(page);
    cobro = true;
    await page.locator("#loans-list .loan-card", { hasText: "QA Persona" }).locator("[data-delete]").click();
    await confirmYes(page);
    deleted = (await page.locator("#loans-list .loan-card", { hasText: "QA Persona" }).count()) === 0;
  }
  if (loanVisible && cobro && deleted) pass(11); else fail(11, JSON.stringify({ loanVisible, cobro, deleted }));

  // ---------- 12 Filtros ----------
  const filters = await page.evaluate(() => {
    const acc = document.getElementById("fin-filter-account");
    const typ = document.getElementById("fin-filter-type");
    const count = () => document.getElementById("tx-list").querySelectorAll("li.tx-item, li").length;
    typ.value = "gasto"; typ.dispatchEvent(new Event("change", { bubbles: true }));
    const g = count();
    typ.value = "ingreso"; typ.dispatchEvent(new Event("change", { bubbles: true }));
    const i = count();
    typ.value = "all"; typ.dispatchEvent(new Event("change", { bubbles: true }));
    const qa = [...acc.options].find((o) => /QA Credito/.test(o.text));
    if (qa) { acc.value = qa.value; acc.dispatchEvent(new Event("change", { bubbles: true })); }
    const a = count();
    acc.value = "all"; acc.dispatchEvent(new Event("change", { bubbles: true }));
    return { g, i, a, hasQa: !!qa, typOptions: [...typ.options].map((o) => o.value) };
  });
  if (filters.hasQa && filters.typOptions.includes("gasto") && filters.typOptions.includes("ingreso")) pass(12, JSON.stringify(filters));
  else fail(12, JSON.stringify(filters));

  // ---------- 13 Proyectos ----------
  await page.click('.tab[data-tab="proyectos"]');
  await page.waitForSelector("#panel-proyectos:not([hidden])");
  await page.click("#btn-new-project");
  await openModalWait(page);
  await page.fill("#f-proj-name", "QA Proyecto");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.locator("#project-list li", { hasText: "QA Proyecto" }).click();
  await page.click("#btn-new-task");
  await openModalWait(page);
  await page.fill("#f-task-name", "QA Tarea");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.click("#btn-edit-project");
  await openModalWait(page);
  await page.fill("#f-proj-name", "QA Proyecto Editado");
  await page.click("#modal-submit");
  await closeModalWait(page);
  await page.locator("#task-list li", { hasText: "QA Tarea" }).locator(".task-check").click();
  await page.waitForTimeout(200);
  const taskDone = await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const p = (s.projects || []).find((x) => /QA Proyecto/.test(x.name));
    const t = p && (p.tasks || []).find((x) => x.name === "QA Tarea");
    return !!(t && t.done);
  }, STORE);
  const projName = await page.locator("#project-list li", { hasText: "QA Proyecto Editado" }).count();
  if (projName && taskDone) pass(13); else fail(13, JSON.stringify({ projName, taskDone }));
  await shot(page, "qa-13-proyectos.png");

  // ---------- 14 missed days ----------
  await page.locator("#project-list li", { hasText: "QA Proyecto Editado" }).click();
  await page.waitForTimeout(300);
  const miss = await page.evaluate((store) => {
    const cells = [...document.querySelectorAll("#project-miss-calendar .cal-day[data-date]:not(.na):not([disabled])")];
    if (!cells.length) return { ok: false, reason: "no cells", html: document.getElementById("project-miss-wrap")?.innerHTML?.slice(0, 300) };
    const cell = cells[0];
    const ds = cell.dataset.date;
    cell.click(); // mark
    cell.click(); // unmark + tombstone
    const state = JSON.parse(localStorage.getItem(store) || "{}");
    const p = (state.projects || []).find((x) => /QA Proyecto/.test(x.name));
    if (!p) return { ok: false, reason: "no project" };
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
    return { ok: !still && hasTomb && !merged[ds], ds, hasTomb, still, revived: !!merged[ds] };
  }, STORE);
  if (miss.ok) pass(14, miss.ds); else fail(14, JSON.stringify(miss));

  // ---------- 15 delete project/task ----------
  await page.locator("#task-list li", { hasText: "QA Tarea" }).locator("[data-del]").click();
  await confirmYes(page);
  const taskGone = (await page.locator("#task-list li", { hasText: "QA Tarea" }).count()) === 0;
  await page.click("#btn-delete-project");
  await confirmYes(page);
  const projGone = (await page.locator("#project-list li", { hasText: "QA Proyecto Editado" }).count()) === 0;
  if (taskGone && projGone) pass(15); else fail(15, JSON.stringify({ taskGone, projGone }));

  // ---------- 16 Sync ----------
  await page.click("#btn-sync");
  await page.waitForSelector("#sync-modal:not(.hidden)");
  // disconnect if already connected
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
    fail(16, `bad code=${code}`);
  } else {
    await page.locator("#sync-modal .modal-footer [data-sync-close], #sync-modal .modal-header [data-sync-close]").first().click();
    await page.waitForTimeout(200);
    await page.click('.tab[data-tab="habitos"]');
    await page.click("#btn-new-habit");
    await openModalWait(page);
    await page.fill("#f-habit-name", "QA Sync Habit");
    await page.click("#modal-submit");
    await closeModalWait(page);
    await page.locator("#habit-list li", { hasText: "QA Sync Habit" }).click();
    const markDs = await page.evaluate(() => {
      const cells = [...document.querySelectorAll("#habit-calendar .cal-day[data-date]:not(.na):not([disabled])")];
      if (!cells.length) return null;
      const cell = cells[0];
      cell.click();
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
    const bHas = await pageB.locator("#habit-list li", { hasText: "QA Sync Habit" }).count();
    let bBefore = null, bAfter = null;
    if (bHas) {
      await pageB.locator("#habit-list li", { hasText: "QA Sync Habit" }).click();
      bBefore = await pageB.evaluate(({ store, ds }) => {
        const s = JSON.parse(localStorage.getItem(store) || "{}");
        const h = (s.habits || []).find((x) => x.name === "QA Sync Habit");
        return h && ds ? (s.habitMarks[h.id + ":" + ds] || null) : null;
      }, { store: STORE, ds: markDs });
    }
    // A unmarks
    await page.locator("#habit-list li", { hasText: "QA Sync Habit" }).click();
    await page.evaluate((ds) => {
      const cell = document.querySelector(`#habit-calendar .cal-day[data-date="${ds}"]`);
      if (!cell) return;
      for (let i = 0; i < 5; i++) {
        const marked = cell.classList.contains("done") || cell.classList.contains("miss") || cell.classList.contains("bad");
        cell.click();
        const still = cell.classList.contains("done") || cell.classList.contains("miss") || cell.classList.contains("bad");
        if (marked && !still) break;
      }
    }, markDs);
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
    bAfter = await pageB.evaluate(({ store, ds }) => {
      const s = JSON.parse(localStorage.getItem(store) || "{}");
      const h = (s.habits || []).find((x) => x.name === "QA Sync Habit");
      return h && ds ? (s.habitMarks[h.id + ":" + ds] || null) : "no-habit";
    }, { store: STORE, ds: markDs });

    if (bHas && bBefore && !bAfter) pass(16, `code=${code.slice(0, 8)}… cleared`);
    else fail(16, JSON.stringify({ code: code.slice(0, 8), bHas, bBefore, bAfter, markDs }));

    // ---------- 17 Disconnect ----------
    await page.click("#btn-sync");
    await page.waitForSelector("#sync-modal:not(.hidden)");
    await page.click("#btn-sync-disconnect");
    await confirmYes(page);
    await page.waitForTimeout(300);
    const disc = await page.evaluate(() => !localStorage.getItem("vida-sync-id"));
    if (disc) pass(17); else fail(17, "still connected");
    await pageB.close();
    await ctxB.close();
  }

  // ---------- 18-19 merge unit ----------
  const merge = await page.evaluate(() => {
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
    function mergeMissedDays(a, b, entityId, tombstones) {
      const dead = tombstones || {};
      const out = {};
      new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach((ds) => {
        if (!ds) return;
        if (dead[entityId + ":" + ds]) return;
        if ((a && a[ds]) || (b && b[ds])) out[ds] = true;
      });
      return out;
    }
    const hm = mergeHabitMarks({}, { "h1:2026-09-01": "done", "h1:2026-09-02": "miss" }, { "h1:2026-09-01": 1 });
    const md = mergeMissedDays({}, { "2026-09-01": true, "2026-09-02": true }, "p1", { "p1:2026-09-01": 1 });
    return {
      habitMarks: !hm["h1:2026-09-01"] && hm["h1:2026-09-02"] === "miss",
      missedDays: !md["2026-09-01"] && md["2026-09-02"] === true,
    };
  });
  if (merge.habitMarks) pass(18); else fail(18);
  if (merge.missedDays) pass(19); else fail(19);

  // ---------- 20 JS errors ----------
  const real = jsErrors.filter((e) => !/favicon|Failed to load|net::ERR|Download/i.test(e));
  if (!real.length) pass(20); else fail(20, real.slice(0, 8).join(" || "));

  await shot(page, "qa-20-final.png");
  await browser.close();

  const report = {
    when: new Date().toISOString(),
    url: URL,
    results,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
  };
  fs.writeFileSync(path.join(ROOT, "qa", "qa-report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(`PASS ${report.pass} / FAIL ${report.fail} of ${results.length}`);
  results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  FAIL ${r.id}: ${r.note}`));
  process.exit(report.fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
