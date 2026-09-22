/* Vida — hábitos, finanzas y proyectos (es-MX) */
(function () {
  "use strict";

  const APP_VERSION = "1.9.4";
  // Remote sync API (used when the app is on GitHub Pages / static host)
  const SYNC_REMOTE_BASE = localStorage.getItem("vida-sync-base") || "https://pricing-lindsay-schema-portraits.trycloudflare.com";

  const STORAGE_KEY = "vida-app-v1";
  const SEED_FLAG = "vida-seed-present";
  const SYNC_ID_KEY = "vida-sync-id";
  const SYNC_NS_PREFIX = "vida"; // MantleDB namespace: vida-<syncId>
  const MANTLE_BASE = "https://mantledb.sh/v2";
  const SYNC_DEBOUNCE_MS = 1500;

  const HABIT_COLORS = [
    "#3d9cf0", "#3ecf8e", "#e6a23c", "#f07178",
    "#a78bfa", "#22d3ee", "#f472b6", "#84cc16"
  ];

  const DEFAULT_CATEGORIES = {
    ingreso: ["Salario", "Freelance", "Ventas", "Inversiones", "Otros ingresos"],
    gasto: ["Comida", "Transporte", "Renta", "Servicios", "Salud", "Entretenimiento", "Educación", "Compras", "Otros gastos"]
  };

  const ACCOUNT_TYPES = [
    { id: "efectivo", label: "Efectivo", icon: "💵" },
    { id: "debito", label: "Débito/Banco", icon: "🏦" },
    { id: "credito", label: "Crédito", icon: "💳" },
    { id: "ahorros", label: "Ahorros", icon: "🐷" },
    { id: "inversion", label: "Inversión", icon: "📈" },
    { id: "otro", label: "Otro", icon: "📁" }
  ];

  const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Débito", "Crédito", "SPEI", "Otro"];

  const MONTHS_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  /** Presets MX para chips al crear/editar cuenta (llenan nombre + tipo + color). */
  const INSTITUTION_PRESETS = [
    { group: "Bancos", name: "Santander", type: "debito", color: "#ec0000", icon: "🏦" },
    { group: "Bancos", name: "BBVA", type: "debito", color: "#004481", icon: "🏦" },
    { group: "Bancos", name: "Banorte", type: "debito", color: "#eb0029", icon: "🏦" },
    { group: "Bancos", name: "HSBC", type: "debito", color: "#db0011", icon: "🏦" },
    { group: "Bancos", name: "Scotiabank", type: "debito", color: "#ec111a", icon: "🏦" },
    { group: "Bancos", name: "Citibanamex", type: "debito", color: "#056dae", icon: "🏦" },
    { group: "Bancos", name: "Nu", type: "debito", color: "#820ad1", icon: "💜" },
    { group: "Tarjetas", name: "Amex", type: "credito", color: "#006fcf", icon: "💳" },
    { group: "Tarjetas", name: "Like U", type: "credito", color: "#7c3aed", icon: "💳" },
    { group: "Tarjetas", name: "Santander Free", type: "credito", color: "#ec0000", icon: "💳" },
    { group: "Tarjetas", name: "BBVA Aqua", type: "credito", color: "#00a3e0", icon: "💳" },
    { group: "Tarjetas", name: "Nu tarjeta", type: "credito", color: "#820ad1", icon: "💳" },
    { group: "Tarjetas", name: "Banorte Clásica", type: "credito", color: "#eb0029", icon: "💳" }
  ];

  const MONTHS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  const DOW_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const DOW_SHORT = ["L", "M", "X", "J", "V", "S", "D"]; // Lun=0 … Dom=6
  const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

  // ---------- State ----------
  let state = loadState();
  let selectedHabitId = null;
  let calYear, calMonth; // 0-based month
  let selectedProjectId = null;
  let projMissYear, projMissMonth;
  let projMissTarget = "project"; // "project" | "task:<id>"
  let ganttAnchor = startOfMonth(new Date());
  let ganttScale = "week";
  let modalOnSubmit = null;
  let syncId = localStorage.getItem(SYNC_ID_KEY) || null;
  let syncStatus = "idle"; // idle | pending | synced | offline | error
  let syncTimer = null;
  let syncInFlight = false;
  let lastSyncError = "";
  let applyRemoteLock = false;

  const today = () => {
    const d = new Date();
    return isoDate(d);
  };

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseISO(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function shortSyncCode() {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    let s = "";
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 8; i++) s += alphabet[arr[i] % alphabet.length];
    return s;
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function saveState() {
    if (!state) return;
    if (!applyRemoteLock) {
      state.updatedAt = Date.now();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!applyRemoteLock && syncId) {
      schedulePush();
    }
  }

  function seedData() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const t = today();
    const d = (off) => {
      const x = new Date(y, m, now.getDate() + off);
      return isoDate(x);
    };

    const h1 = uid(), h2 = uid(), h3 = uid();
    const marks = {};
    // good habit: mostly done this month
    for (let day = 1; day <= now.getDate(); day++) {
      const key = `${h1}:${isoDate(new Date(y, m, day))}`;
      marks[key] = day % 5 === 0 ? "miss" : "done";
    }
    marks[`${h1}:${t}`] = "done";
    // bad habit: a few marks
    marks[`${h2}:${d(-3)}`] = "bad";
    marks[`${h2}:${d(-1)}`] = "bad";
    // exercise
    for (let day = 1; day <= now.getDate(); day++) {
      if (day % 2 === 1) marks[`${h3}:${isoDate(new Date(y, m, day))}`] = "done";
    }

    const p1 = uid(), p2 = uid();
    const t1 = uid(), t2 = uid(), t3 = uid(), t4 = uid();
    const aEfectivo = uid(), aSantander = uid(), aAmex = uid();
    // Día de pago de ejemplo: dentro de ~4 días (máx. 28) para mostrar alerta
    const seedPayDay = Math.min(28, Math.max(1, now.getDate() + 4));
    const seedCutoffDay = Math.min(28, Math.max(1, seedPayDay >= 12 ? seedPayDay - 12 : 15));

    return {
      seeded: true,
      habits: [
        { id: h1, name: "Beber agua (2L)", color: "#3d9cf0", type: "buen", frequency: "Diario", startDate: null, endDate: null, weekdays: [0,1,2,3,4,5,6], _seed: true },
        { id: h2, name: "Redes sociales de más", color: "#f07178", type: "mal", frequency: "Evitar", startDate: null, endDate: null, weekdays: [0,1,2,3,4,5,6], _seed: true },
        { id: h3, name: "Ejercicio 30 min", color: "#3ecf8e", type: "buen", frequency: "5× semana", startDate: null, endDate: null, weekdays: [0,1,2,3,4], _seed: true }
      ],
      habitMarks: marks,
      categories: {
        ingreso: [...DEFAULT_CATEGORIES.ingreso],
        gasto: [...DEFAULT_CATEGORIES.gasto]
      },
      accounts: [
        { id: aEfectivo, name: "Efectivo", type: "efectivo", color: "#3ecf8e", icon: "💵", openingBalance: 500, institution: null, _seed: true },
        { id: aSantander, name: "Santander", type: "debito", color: "#ec0000", icon: "🏦", openingBalance: 12000, institution: "Santander", _seed: true },
        { id: aAmex, name: "Amex", type: "credito", color: "#006fcf", icon: "💳", openingBalance: 0, institution: "Amex", creditLimit: 25000, cutoffDay: seedCutoffDay, paymentDueDay: seedPayDay, _seed: true }
      ],
      transactions: [
        { id: uid(), type: "ingreso", amount: 25000, category: "Salario", date: isoDate(new Date(y, m, 1)), note: "Nómina quincenal (ejemplo)", accountId: aSantander, paymentMethod: "Transferencia", _seed: true },
        { id: uid(), type: "ingreso", amount: 4500, category: "Freelance", date: d(-5), note: "Proyecto web", accountId: aSantander, paymentMethod: "SPEI", _seed: true },
        { id: uid(), type: "gasto", amount: 8500, category: "Renta", date: isoDate(new Date(y, m, 2)), note: "Departamento", accountId: aSantander, paymentMethod: "Transferencia", _seed: true },
        { id: uid(), type: "gasto", amount: 1250.5, category: "Comida", date: d(-2), note: "Supermercado", accountId: aEfectivo, paymentMethod: "Efectivo", _seed: true },
        { id: uid(), type: "gasto", amount: 380, category: "Transporte", date: d(-1), note: "Uber / Metro", accountId: aAmex, paymentMethod: "Crédito", _seed: true },
        { id: uid(), type: "gasto", amount: 1250, category: "Compras", date: d(-6), note: "Amazon (ejemplo)", accountId: aAmex, paymentMethod: "Crédito", _seed: true },
        { id: uid(), type: "gasto", amount: 899, category: "Servicios", date: d(-4), note: "Internet", accountId: aSantander, paymentMethod: "Débito", _seed: true }
      ],
      projects: [
        {
          id: p1, name: "App personal Vida", description: "Hábitos, finanzas y proyectos en una sola app.",
          start: isoDate(new Date(y, m, 1)), end: isoDate(new Date(y, m + 1, 15)),
          status: "activo", _seed: true,
          missedDays: {},
          workdays: [0,1,2,3,4],
          tasks: [
            { id: t1, name: "Diseño UI", start: isoDate(new Date(y, m, 1)), end: isoDate(new Date(y, m, 8)), done: true, workdays: [0,1,2,3,4], missedDays: {} },
            { id: t2, name: "Módulo hábitos", start: isoDate(new Date(y, m, 5)), end: isoDate(new Date(y, m, 18)), done: false, workdays: [0,1,2,3,4], missedDays: {} },
            { id: t3, name: "PWA / instalación", start: isoDate(new Date(y, m, 12)), end: isoDate(new Date(y, m + 1, 5)), done: false, workdays: [0,1,2,3,4], missedDays: {} }
          ]
        },
        {
          id: p2, name: "Mudanza CDMX", description: "Preparar cambio de depto.",
          start: isoDate(new Date(y, m - 1, 15)), end: isoDate(new Date(y, m + 1, 1)),
          status: "pausado", missedDays: {}, workdays: [0,1,2,3,4,5,6], _seed: true,
          tasks: [
            { id: t4, name: "Cotizar mudanza", start: isoDate(new Date(y, m - 1, 20)), end: isoDate(new Date(y, m, 5)), done: true, workdays: [0,1,2,3,4,5,6], missedDays: {} }
          ]
        }
      ]
    };
  }

  function ensureState() {
    if (!state) {
      state = seedData();
      saveState();
      localStorage.setItem(SEED_FLAG, "1");
    }
    if (!state.categories) {
      state.categories = { ingreso: [...DEFAULT_CATEGORIES.ingreso], gasto: [...DEFAULT_CATEGORIES.gasto] };
    }
    if (!state.habitMarks) state.habitMarks = {};
    if (!state.habits) state.habits = [];
    if (!state.transactions) state.transactions = [];
    if (!state.projects) state.projects = [];
    if (!Array.isArray(state.loans)) state.loans = [];
    if (!Array.isArray(state.accounts)) state.accounts = [];
    migrateAccounts();
    migrateHabitsAndProjects();
    const repairedMarks = repairHabitMarksIn(state.habitMarks);
    if (JSON.stringify(repairedMarks) !== JSON.stringify(state.habitMarks || {})) {
      state.habitMarks = repairedMarks;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    }
    if (typeof state.updatedAt !== "number") state.updatedAt = Date.now();
  }

  function accountTypeMeta(typeId) {
    return ACCOUNT_TYPES.find((t) => t.id === typeId) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
  }

  function defaultEfectivoAccount() {
    let acc = state.accounts.find((a) => a.type === "efectivo" && a.name === "Efectivo");
    if (!acc) acc = state.accounts.find((a) => a.type === "efectivo");
    if (!acc) {
      acc = {
        id: uid(),
        name: "Efectivo",
        type: "efectivo",
        color: "#3ecf8e",
        icon: "💵",
        openingBalance: 0
      };
      state.accounts.push(acc);
    }
    return acc;
  }

  function migrateAccounts() {
    let changed = false;
    if (!state.accounts.length) {
      defaultEfectivoAccount();
      changed = true;
    }
    const defaultId = defaultEfectivoAccount().id;
    state.accounts.forEach((a) => {
      if (typeof a.openingBalance !== "number") {
        a.openingBalance = Number(a.openingBalance) || 0;
        changed = true;
      }
      if (!a.color) { a.color = HABIT_COLORS[0]; changed = true; }
      if (!a.icon) { a.icon = accountTypeMeta(a.type).icon; changed = true; }
      if (!a.type) { a.type = "otro"; changed = true; }
      if (a.institution === undefined) { a.institution = null; changed = true; }
      // Migrate legacy statementDay → cutoffDay
      if (a.cutoffDay == null && a.statementDay != null) {
        a.cutoffDay = clampDayOfMonth(a.statementDay);
        changed = true;
      }
      if (a.creditLimit === undefined) { a.creditLimit = null; changed = true; }
      if (a.cutoffDay === undefined) { a.cutoffDay = null; changed = true; }
      if (a.paymentDueDay === undefined) { a.paymentDueDay = null; changed = true; }
      if (a.nextStatementDate === undefined) { a.nextStatementDate = null; changed = true; }
      if (a.nextPaymentDate === undefined) { a.nextPaymentDate = null; changed = true; }
      // Normalize day fields when present
      if (a.cutoffDay != null && a.cutoffDay !== "") {
        const c = clampDayOfMonth(a.cutoffDay);
        if (c !== a.cutoffDay) { a.cutoffDay = c; changed = true; }
      }
      if (a.paymentDueDay != null && a.paymentDueDay !== "") {
        const p = clampDayOfMonth(a.paymentDueDay);
        if (p !== a.paymentDueDay) { a.paymentDueDay = p; changed = true; }
      }
    });
    state.transactions.forEach((t) => {
      if (!t.accountId || !state.accounts.some((a) => a.id === t.accountId)) {
        t.accountId = defaultId;
        changed = true;
      }
      if (!t.paymentMethod) {
        t.paymentMethod = "Efectivo";
        changed = true;
      }
    });
    // Persist migration into localStorage (and sync blob) when not applying remote
    if (changed && !applyRemoteLock) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
    }
  }

  function migrateHabitsAndProjects() {
    let changed = false;
    (state.habits || []).forEach((h) => {
      if (!Array.isArray(h.weekdays) || !h.weekdays.length) {
        h.weekdays = ALL_WEEKDAYS.slice();
        changed = true;
      }
      if (h.startDate === undefined) { h.startDate = null; changed = true; }
      if (h.endDate === undefined) { h.endDate = null; changed = true; }
      if (h.startDate === "") { h.startDate = null; changed = true; }
      if (h.endDate === "") { h.endDate = null; changed = true; }
    });
    (state.projects || []).forEach((p) => {
      if (!p.missedDays || typeof p.missedDays !== "object") { p.missedDays = {}; changed = true; }
      if (!Array.isArray(p.workdays) || !p.workdays.length) {
        p.workdays = ALL_WEEKDAYS.slice();
        changed = true;
      }
      (p.tasks || []).forEach((t) => {
        if (!t.missedDays || typeof t.missedDays !== "object") { t.missedDays = {}; changed = true; }
        if (!Array.isArray(t.workdays) || !t.workdays.length) {
          t.workdays = ALL_WEEKDAYS.slice();
          changed = true;
        }
      });
    });
    if (changed && !applyRemoteLock) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
    }
  }

  function dowMon0(d) {
    return (d.getDay() + 6) % 7;
  }

  function normalizeWeekdays(list) {
    if (!Array.isArray(list) || !list.length) return ALL_WEEKDAYS.slice();
    return list.map(Number).filter((n) => n >= 0 && n <= 6);
  }

  function habitWeekdays(habit) {
    return normalizeWeekdays(habit && habit.weekdays);
  }

  function isInDateRange(dateStr, startDate, endDate) {
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  }

  function isHabitScheduled(habit, dateStr) {
    if (!habit) return false;
    if (!isInDateRange(dateStr, habit.startDate || null, habit.endDate || null)) return false;
    return habitWeekdays(habit).includes(dowMon0(parseISO(dateStr)));
  }

  function workdaysOf(entity) {
    return normalizeWeekdays(entity && entity.workdays);
  }

  function isWorkdayScheduled(entity, dateStr) {
    if (!entity) return false;
    const start = entity.start || entity.startDate || null;
    const end = entity.end || entity.endDate || null;
    if (!isInDateRange(dateStr, start, end)) return false;
    return workdaysOf(entity).includes(dowMon0(parseISO(dateStr)));
  }

  function weekdayPillsHtml(name, selected) {
    const sel = normalizeWeekdays(selected);
    return `<div class="weekday-pills" role="group" aria-label="Días de la semana">` +
      DOW_SHORT.map((label, i) => {
        const checked = sel.includes(i) ? "checked" : "";
        return `<label class="weekday-pill"><input type="checkbox" name="${name}" value="${i}" ${checked} /><span>${label}</span></label>`;
      }).join("") +
      `</div>`;
  }

  function readWeekdaysFromForm(fd, name) {
    const vals = fd.getAll(name).map(Number).filter((n) => n >= 0 && n <= 6);
    return vals.length ? vals : ALL_WEEKDAYS.slice();
  }

  function formatPeriodLabel(startDate, endDate) {
    if (!startDate && !endDate) return "Indefinido";
    if (startDate && endDate) return `${startDate} → ${endDate}`;
    if (startDate) return `Desde ${startDate}`;
    return `Hasta ${endDate}`;
  }

  function formatWeekdaysShort(weekdays) {
    const w = normalizeWeekdays(weekdays);
    if (w.length === 7) return "Todos los días";
    return w.map((i) => DOW_SHORT[i]).join(" ");
  }

  function toggleMissedDay(bag, dateStr) {
    if (!bag || typeof bag !== "object") return;
    if (bag[dateStr]) delete bag[dateStr];
    else bag[dateStr] = true;
  }

  function countMissedInMonth(bag, year, month) {
    if (!bag) return 0;
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    return Object.keys(bag).filter((k) => bag[k] && k.startsWith(prefix)).length;
  }

  function loanOutstanding(loan) {
    const paid = (loan.payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    return Math.max(0, (Number(loan.amount) || 0) - paid);
  }

  function totalLoanOutstanding() {
    return (state.loans || []).reduce((sum, loan) => sum + loanOutstanding(loan), 0);
  }

  function accountBalance(accountId) {
    const acc = state.accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    let bal = Number(acc.openingBalance) || 0;
    state.transactions.forEach((t) => {
      if (t.accountId !== accountId) return;
      const amt = Number(t.amount) || 0;
      if (t.type === "ingreso") bal += amt;
      else bal -= amt;
    });
    return bal;
  }

  function totalAccountsBalance() {
    return state.accounts.reduce((sum, a) => sum + accountBalance(a.id), 0);
  }

  function accountById(id) {
    return state.accounts.find((a) => a.id === id) || null;
  }

  function accountOptionsHtml(selectedId) {
    return state.accounts.map((a) =>
      `<option value="${escapeAttr(a.id)}" ${a.id === selectedId ? "selected" : ""}>${escapeHtml(a.icon || "")} ${escapeHtml(a.name)}</option>`
    ).join("");
  }

  function paymentMethodOptionsHtml(selected) {
    const sel = selected || "Efectivo";
    return PAYMENT_METHODS.map((m) =>
      `<option value="${escapeAttr(m)}" ${m === sel ? "selected" : ""}>${escapeHtml(m)}</option>`
    ).join("");
  }

  function accountTypeOptionsHtml(selected) {
    return ACCOUNT_TYPES.map((t) =>
      `<option value="${escapeAttr(t.id)}" ${t.id === selected ? "selected" : ""}>${escapeHtml(t.icon)} ${escapeHtml(t.label)}</option>`
    ).join("");
  }

  function clampDayOfMonth(day) {
    const n = parseInt(day, 10);
    if (!Number.isFinite(n)) return null;
    return Math.min(28, Math.max(1, n));
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysBetween(a, b) {
    return Math.round((startOfLocalDay(b) - startOfLocalDay(a)) / 86400000);
  }

  function formatDayMonth(d) {
    if (!d || isNaN(d.getTime())) return "";
    return `${d.getDate()} ${MONTHS_SHORT_ES[d.getMonth()]}`;
  }

  function formatTxDay(dateKey) {
    const parts = String(dateKey || "").split("-").map(Number);
    const [year, month, day] = parts;
    if (!year || !month || !day) return String(dateKey || "");
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return String(dateKey || "");
    }
    const weekday = new Intl.DateTimeFormat("es-MX", { weekday: "long" }).format(date);
    return `${weekday} ${day} ${MONTHS_SHORT_ES[month - 1]} ${year}`;
  }

  /** Deuda de tarjeta: gastos bajan el saldo; saldo negativo = debe. */
  function creditDebtAmount(accOrId) {
    const acc = typeof accOrId === "string" ? accountById(accOrId) : accOrId;
    if (!acc) return 0;
    const bal = accountBalance(acc.id);
    if (acc.type === "credito") return bal < 0 ? Math.abs(bal) : 0;
    return bal < 0 ? Math.abs(bal) : 0;
  }

  /**
   * Próxima fecha de pago a partir de paymentDueDay (1–28) o nextPaymentDate.
   * Si el día de pago de este mes ya pasó y aún hay deuda → vencido (overdue).
   */
  function creditPaymentInfo(acc, from = new Date()) {
    if (!acc || acc.type !== "credito") return null;
    const today = startOfLocalDay(from);
    const dueDay = clampDayOfMonth(acc.paymentDueDay);
    const debt = creditDebtAmount(acc);
    let dueDate = null;
    let overdue = false;

    if (dueDay != null) {
      const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), dueDay);
      if (today.getTime() > thisMonthDue.getTime() && debt > 0) {
        overdue = true;
        dueDate = thisMonthDue;
      } else if (today.getTime() <= thisMonthDue.getTime()) {
        dueDate = thisMonthDue;
      } else {
        dueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
      }
    } else if (acc.nextPaymentDate) {
      const parsed = parseISO(String(acc.nextPaymentDate));
      if (!isNaN(parsed.getTime())) {
        dueDate = startOfLocalDay(parsed);
        if (dueDate.getTime() < today.getTime()) {
          overdue = debt > 0;
          if (!overdue) {
            // Sin deuda: rollover al próximo mes con ese día (máx 28)
            const d = Math.min(28, dueDate.getDate());
            const rolled = new Date(today.getFullYear(), today.getMonth(), d);
            dueDate = rolled.getTime() >= today.getTime()
              ? rolled
              : new Date(today.getFullYear(), today.getMonth() + 1, d);
          }
        }
      }
    }

    if (!dueDate) return null;
    const daysLeft = daysBetween(today, dueDate);
    return { dueDate, daysLeft, overdue, debt };
  }

  function creditPaymentLabel(info) {
    if (!info || !info.dueDate) return "";
    const when = formatDayMonth(info.dueDate);
    if (info.overdue) {
      const n = Math.abs(info.daysLeft);
      return n === 0
        ? `Vencido hoy (${when})`
        : `Vencido hace ${n} día${n === 1 ? "" : "s"} (${when})`;
    }
    if (info.daysLeft === 0) return `Pago hoy (${when})`;
    if (info.daysLeft === 1) return `Próximo pago: ${when} (mañana)`;
    return `Próximo pago: ${when} (${info.daysLeft} días)`;
  }

  // ---------- Toast / Modal ----------
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  function openModal(title, html, onSubmit) {
    document.getElementById("modal-title").textContent = title;
    const form = document.getElementById("modal-form");
    form.innerHTML = html;
    modalOnSubmit = onSubmit;
    document.getElementById("modal").classList.remove("hidden");
    const first = form.querySelector("input, select, textarea");
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal() {
    document.getElementById("modal").classList.add("hidden");
    modalOnSubmit = null;
  }

  // ---------- Tabs ----------
  function initTabs() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => {
          t.classList.toggle("active", t === btn);
          t.setAttribute("aria-selected", t === btn ? "true" : "false");
        });
        document.querySelectorAll(".panel").forEach((p) => {
          const on = p.id === "panel-" + btn.dataset.tab;
          p.classList.toggle("active", on);
          p.hidden = !on;
        });
      });
    });
  }

  // ========== HÁBITOS ==========
  function habitMarkKey(habitId, dateStr) {
    return `${habitId}:${dateStr}`;
  }

  function getMark(habitId, dateStr) {
    return normalizeMarkValue(state.habitMarks[habitMarkKey(habitId, dateStr)]) || null;
  }

  function setMark(habitId, dateStr, status) {
    const k = habitMarkKey(habitId, dateStr);
    if (!status) delete state.habitMarks[k];
    else state.habitMarks[k] = status;
    saveState();
  }

  function cycleMark(habit, dateStr) {
    if (!isHabitScheduled(habit, dateStr)) return null;
    const cur = getMark(habit.id, dateStr);
    let next;
    if (habit.type === "mal") {
      // vacío → Mal → Evitado (miss) → vacío
      if (!cur) next = "bad";
      else if (cur === "bad") next = "miss";
      else next = null;
    } else {
      // vacío → Hecho → Incumplido (miss) → vacío
      if (!cur) next = "done";
      else if (cur === "done") next = "miss";
      else next = null;
    }
    setMark(habit.id, dateStr, next);
    return next;
  }

  function monthStats(habitId, year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const habit = state.habits.find((h) => h.id === habitId);
    let done = 0, miss = 0, bad = 0, streak = 0, scheduled = 0;
    const todayD = new Date();
    const limit = (year === todayD.getFullYear() && month === todayD.getMonth())
      ? todayD.getDate() : daysInMonth;

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = isoDate(new Date(year, month, d));
      if (!habit || !isHabitScheduled(habit, ds)) continue;
      scheduled++;
      const mark = getMark(habitId, ds);
      if (mark === "done") done++;
      if (mark === "miss") miss++;
      if (mark === "bad") bad++;
    }
    // streak: consecutive done/avoid from today backwards (solo días programados en periodo)
    if (habit) {
      let cursor = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
      let guard = 0;
      while (guard++ < 800) {
        const ds = isoDate(cursor);
        if (habit.startDate && ds < habit.startDate) break;
        if (habit.endDate && ds > habit.endDate) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        if (!isHabitScheduled(habit, ds)) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        const mark = getMark(habitId, ds);
        if (habit.type === "buen") {
          if (mark === "done") streak++;
          else break;
        } else {
          if (mark === "bad") break;
          if (ds > today()) break;
          if (ds === today() && !mark) break;
          streak++;
        }
        cursor.setDate(cursor.getDate() - 1);
        if (streak > 365) break;
      }
    }
    return { done, miss, bad, streak, limit, scheduled };
  }

  function renderHabitList() {
    const ul = document.getElementById("habit-list");
    const empty = document.getElementById("habit-empty");
    ul.innerHTML = "";
    if (!state.habits.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    const t = today();
    state.habits.forEach((h) => {
      const li = document.createElement("li");
      li.className = "habit-item" + (h.id === selectedHabitId ? " selected" : "");
      const mark = getMark(h.id, t);
      const scheduledToday = isHabitScheduled(h, t);
      let btnClass = "habit-today-btn";
      let btnLabel = "○";
      if (!scheduledToday) {
        btnClass += " muted-day";
        btnLabel = "·";
      } else if (h.type === "mal") {
        if (mark === "bad") { btnClass += " bad"; btnLabel = "!"; }
        else if (mark === "miss") { btnClass += " done"; btnLabel = "✓"; } // evitado
      } else {
        if (mark === "done") { btnClass += " done"; btnLabel = "✓"; }
        else if (mark === "miss") { btnClass += " miss"; btnLabel = "✕"; }
      }
      const metaBits = [
        h.type === "mal" ? "Mal hábito" : "Buen hábito",
        formatWeekdaysShort(h.weekdays),
        h.frequency ? escapeHtml(h.frequency) : null
      ].filter(Boolean);
      li.innerHTML = `
        <span class="habit-dot" style="background:${h.color}"></span>
        <div class="habit-item-info">
          <strong>${escapeHtml(h.name)}</strong>
          <span>${metaBits.join(" · ")}</span>
        </div>
        <button type="button" class="${btnClass}" title="${scheduledToday ? "Marcar hoy" : "Hoy no aplica"}" aria-label="Marcar hoy" ${scheduledToday ? "" : "disabled"}>${btnLabel}</button>
      `;
      li.addEventListener("click", (e) => {
        if (e.target.closest(".habit-today-btn")) return;
        selectedHabitId = h.id;
        renderHabitos();
      });
      li.querySelector(".habit-today-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        if (!scheduledToday) return;
        cycleMark(h, t);
        selectedHabitId = h.id;
        renderHabitos();
        toast("Hoy actualizado");
      });
      ul.appendChild(li);
    });
  }

  function renderCalendar() {
    const habit = state.habits.find((h) => h.id === selectedHabitId);
    const empty = document.getElementById("habit-detail-empty");
    const detail = document.getElementById("habit-detail");
    if (!habit) {
      empty.classList.remove("hidden");
      detail.classList.add("hidden");
      return;
    }
    empty.classList.add("hidden");
    detail.classList.remove("hidden");
    document.getElementById("habit-detail-name").textContent = habit.name;
    document.getElementById("habit-detail-meta").textContent =
      (habit.type === "mal" ? "Mal hábito" : "Buen hábito") +
      " · " + formatWeekdaysShort(habit.weekdays) +
      " · " + formatPeriodLabel(habit.startDate, habit.endDate) +
      (habit.frequency ? " · " + habit.frequency : "");

    const stats = monthStats(habit.id, calYear, calMonth);
    const statsEl = document.getElementById("habit-stats");
    if (habit.type === "mal") {
      statsEl.innerHTML = `
        <div class="stat-pill">Caídas <strong>${stats.bad}</strong></div>
        <div class="stat-pill">Evitado <strong>${stats.miss}</strong></div>
        <div class="stat-pill">Racha sin caer <strong>${stats.streak}</strong></div>
      `;
    } else {
      statsEl.innerHTML = `
        <div class="stat-pill">Hechos <strong>${stats.done}</strong></div>
        <div class="stat-pill">Incumplidos <strong>${stats.miss}</strong></div>
        <div class="stat-pill">Racha <strong>${stats.streak}</strong></div>
      `;
    }

    document.getElementById("cal-month-label").textContent =
      MONTHS_ES[calMonth] + " " + calYear;

    const cal = document.getElementById("habit-calendar");
    cal.innerHTML = "";
    DOW_ES.forEach((d) => {
      const el = document.createElement("div");
      el.className = "cal-dow";
      el.textContent = d;
      cal.appendChild(el);
    });

    const first = new Date(calYear, calMonth, 1);
    // Monday-based: getDay Sun=0 -> 6, Mon=1 -> 0
    let startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDays = new Date(calYear, calMonth, 0).getDate();
    const tStr = today();

    for (let i = 0; i < startPad; i++) {
      const dayNum = prevDays - startPad + 1 + i;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day outside";
      btn.textContent = dayNum;
      cal.appendChild(btn);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = isoDate(new Date(calYear, calMonth, d));
      const mark = getMark(habit.id, ds);
      const inPeriod = isInDateRange(ds, habit.startDate || null, habit.endDate || null);
      const scheduled = isHabitScheduled(habit, ds);
      const btn = document.createElement("button");
      btn.type = "button";
      let cls = "cal-day";
      if (ds === tStr) cls += " today";
      if (!inPeriod || !scheduled) cls += " na";
      if (habit.type === "mal") {
        if (mark === "bad") cls += " bad";
        else if (mark === "miss") cls += " done"; // evitado
      } else {
        if (mark === "done") cls += " done";
        else if (mark === "miss") cls += " miss"; // incumplido
      }
      btn.className = cls;
      let markSym = "";
      if (habit.type === "mal") {
        if (mark === "bad") markSym = "!";
        else if (mark === "miss") markSym = "✓";
      } else {
        if (mark === "done") markSym = "✓";
        else if (mark === "miss") markSym = "✕";
      }
      btn.title = !inPeriod ? "Fuera del periodo" : (!scheduled ? "No programado" : (
        habit.type === "mal"
          ? "Toca: Mal → Evitado → Vacío"
          : "Toca: Hecho → Incumplido → Vacío"
      ));
      btn.innerHTML = `<span>${d}</span>${markSym ? `<span class="mark">${markSym}</span>` : ""}`;
      if (scheduled) {
        btn.addEventListener("click", () => {
          cycleMark(habit, ds);
          renderHabitos();
        });
      } else {
        btn.disabled = true;
      }
      cal.appendChild(btn);
    }

    const totalCells = startPad + daysInMonth;
    const rem = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= rem; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day outside";
      btn.textContent = i;
      cal.appendChild(btn);
    }
  }

  function renderHabitos() {
    if (!selectedHabitId && state.habits.length) selectedHabitId = state.habits[0].id;
    if (selectedHabitId && !state.habits.find((h) => h.id === selectedHabitId)) {
      selectedHabitId = state.habits[0]?.id || null;
    }
    renderHabitList();
    renderCalendar();
  }

  function habitFormHtml(habit) {
    const colors = HABIT_COLORS.map((c) =>
      `<button type="button" class="color-swatch${habit && habit.color === c ? " selected" : (!habit && c === HABIT_COLORS[0] ? " selected" : "")}" data-color="${c}" style="background:${c}" aria-label="Color"></button>`
    ).join("");
    const indef = !habit || (!habit.startDate && !habit.endDate);
    const weekdays = habit ? habitWeekdays(habit) : ALL_WEEKDAYS.slice();
    return `
      <div class="form-grid">
        <div class="form-row">
          <label for="f-habit-name">Nombre</label>
          <input id="f-habit-name" name="name" required maxlength="80" value="${habit ? escapeAttr(habit.name) : ""}" placeholder="Ej. Leer 20 min" />
        </div>
        <div class="form-row">
          <label>Tipo</label>
          <div class="radio-group">
            <label class="radio-pill"><input type="radio" name="type" value="buen" ${!habit || habit.type === "buen" ? "checked" : ""} /> Buen hábito</label>
            <label class="radio-pill"><input type="radio" name="type" value="mal" ${habit && habit.type === "mal" ? "checked" : ""} /> Mal hábito</label>
          </div>
        </div>
        <div class="form-row">
          <label>Color</label>
          <div class="color-swatches" id="f-habit-colors">${colors}</div>
          <input type="hidden" name="color" id="f-habit-color" value="${habit ? habit.color : HABIT_COLORS[0]}" />
        </div>
        <div class="form-row">
          <label>Temporalidad / periodo</label>
          <label class="check-inline"><input type="checkbox" id="f-habit-indef" name="indefinido" ${indef ? "checked" : ""} /> Indefinido</label>
          <div class="form-row-inline" id="f-habit-period" ${indef ? 'style="display:none"' : ""}>
            <div class="form-row">
              <label for="f-habit-start">Inicio</label>
              <input id="f-habit-start" name="startDate" type="date" value="${habit && habit.startDate ? habit.startDate : ""}" />
            </div>
            <div class="form-row">
              <label for="f-habit-end">Fin (opcional)</label>
              <input id="f-habit-end" name="endDate" type="date" value="${habit && habit.endDate ? habit.endDate : ""}" />
            </div>
          </div>
        </div>
        <div class="form-row">
          <label>Días de la semana</label>
          ${weekdayPillsHtml("weekdays", weekdays)}
        </div>
        <div class="form-row">
          <label for="f-habit-freq">Nota de frecuencia (opcional)</label>
          <input id="f-habit-freq" name="frequency" maxlength="60" value="${habit ? escapeAttr(habit.frequency || "") : ""}" placeholder="Ej. Diario, 3× semana" />
        </div>
      </div>
    `;
  }

  function bindHabitFormColors() {
    document.querySelectorAll("#f-habit-colors .color-swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#f-habit-colors .color-swatch").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        document.getElementById("f-habit-color").value = btn.dataset.color;
      });
    });
    const indef = document.getElementById("f-habit-indef");
    const period = document.getElementById("f-habit-period");
    if (indef && period) {
      indef.addEventListener("change", () => {
        period.style.display = indef.checked ? "none" : "";
        if (indef.checked) {
          document.getElementById("f-habit-start").value = "";
          document.getElementById("f-habit-end").value = "";
        }
      });
    }
  }

  function openHabitModal(habit) {
    openModal(habit ? "Editar hábito" : "Nuevo hábito", habitFormHtml(habit), (fd) => {
      const name = fd.get("name").trim();
      if (!name) return false;
      const indefinido = fd.get("indefinido") === "on";
      let startDate = indefinido ? null : (fd.get("startDate") || "").trim() || null;
      let endDate = indefinido ? null : (fd.get("endDate") || "").trim() || null;
      if (startDate && endDate && endDate < startDate) {
        toast("La fecha fin debe ser ≥ inicio");
        return false;
      }
      const weekdays = readWeekdaysFromForm(fd, "weekdays");
      const data = {
        name,
        type: fd.get("type") || "buen",
        color: fd.get("color") || HABIT_COLORS[0],
        frequency: (fd.get("frequency") || "").trim(),
        startDate,
        endDate,
        weekdays
      };
      if (habit) {
        Object.assign(habit, data);
        toast("Hábito actualizado");
      } else {
        const h = { id: uid(), ...data };
        state.habits.push(h);
        selectedHabitId = h.id;
        toast("Hábito creado");
      }
      saveState();
      renderHabitos();
      return true;
    });
    bindHabitFormColors();
  }

  function initHabitos() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    document.getElementById("btn-new-habit").addEventListener("click", () => openHabitModal(null));
    document.getElementById("btn-edit-habit").addEventListener("click", () => {
      const h = state.habits.find((x) => x.id === selectedHabitId);
      if (h) openHabitModal(h);
    });
    document.getElementById("btn-delete-habit").addEventListener("click", () => {
      const h = state.habits.find((x) => x.id === selectedHabitId);
      if (!h) return;
      if (!confirm(`¿Eliminar el hábito «${h.name}» y sus marcas?`)) return;
      Object.keys(state.habitMarks).forEach((k) => {
        if (k.startsWith(h.id + ":")) delete state.habitMarks[k];
      });
      state.habits = state.habits.filter((x) => x.id !== h.id);
      selectedHabitId = state.habits[0]?.id || null;
      saveState();
      renderHabitos();
      toast("Hábito eliminado");
    });
    document.getElementById("cal-prev").addEventListener("click", () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });
    document.getElementById("cal-next").addEventListener("click", () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });
  }

  // ========== FINANZAS ==========
  function formatMXN(n) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
  }

  function finMonthValue() {
    return document.getElementById("fin-month").value; // YYYY-MM
  }

  function txsForMonth(ym) {
    return state.transactions.filter((t) => t.date.startsWith(ym));
  }

  function renderAccounts() {
    const chips = document.getElementById("accounts-chips");
    const totalEl = document.getElementById("accounts-total");
    if (!chips || !totalEl) return;
    const total = totalAccountsBalance();
    totalEl.innerHTML = `Total en cuentas: <strong>${formatMXN(total)}</strong>`;
    chips.innerHTML = "";
    if (!state.accounts.length) {
      chips.innerHTML = `<p class="empty-hint">Agrega tu primera cuenta.</p>`;
      renderPaymentAlerts();
      return;
    }
    state.accounts.forEach((a) => {
      const bal = accountBalance(a.id);
      const meta = accountTypeMeta(a.type);
      const isCredit = a.type === "credito";
      const debt = isCredit ? creditDebtAmount(a) : 0;
      const payInfo = isCredit ? creditPaymentInfo(a) : null;
      const balClass = isCredit ? "debt" : (bal < 0 ? "neg" : "");
      const balText = isCredit
        ? `Deuda: ${formatMXN(debt)}`
        : formatMXN(bal);
      let payHtml = "";
      if (payInfo) {
        const cls = payInfo.overdue ? "overdue" : (payInfo.daysLeft <= 7 ? "soon" : "");
        payHtml = `<span class="account-chip-pay ${cls}">${escapeHtml(creditPaymentLabel(payInfo))}</span>`;
      } else if (isCredit) {
        payHtml = `<span class="account-chip-pay muted">Sin fecha de pago</span>`;
      }
      const card = document.createElement("button");
      card.type = "button";
      card.className = "account-chip" + (isCredit ? " credit" : "");
      card.style.setProperty("--acc-color", a.color || HABIT_COLORS[0]);
      card.title = "Editar cuenta";
      card.innerHTML = `
        <span class="account-chip-icon" aria-hidden="true">${escapeHtml(a.icon || meta.icon)}</span>
        <span class="account-chip-body">
          <strong>${escapeHtml(a.name)}</strong>
          <span class="account-chip-meta">${escapeHtml(meta.label)}</span>
          <span class="account-chip-bal ${balClass}">${balText}</span>
          ${payHtml}
        </span>
      `;
      card.addEventListener("click", () => openAccountModal(a));
      chips.appendChild(card);
    });
    // refresh account filter options
    const filt = document.getElementById("fin-filter-account");
    if (filt) {
      const prev = filt.value || "all";
      filt.innerHTML = `<option value="all">Todas las cuentas</option>` +
        state.accounts.map((a) =>
          `<option value="${escapeAttr(a.id)}">${escapeHtml(a.name)}</option>`
        ).join("");
      if ([...filt.options].some((o) => o.value === prev)) filt.value = prev;
      else filt.value = "all";
    }
    renderPaymentAlerts();
  }

  function renderPaymentAlerts() {
    const strip = document.getElementById("payment-alerts");
    if (!strip) return;
    const alerts = [];
    state.accounts.forEach((a) => {
      if (a.type !== "credito") return;
      const info = creditPaymentInfo(a);
      if (!info) return;
      if (info.overdue || info.daysLeft <= 7) {
        alerts.push({ acc: a, info });
      }
    });
    if (!alerts.length) {
      strip.classList.add("hidden");
      strip.innerHTML = "";
      return;
    }
    strip.classList.remove("hidden");
    strip.innerHTML = alerts.map(({ acc, info }) => {
      const kind = info.overdue ? "overdue" : "soon";
      const label = info.overdue
        ? `⚠️ ${escapeHtml(acc.name)}: pago vencido (${escapeHtml(formatDayMonth(info.dueDate))}) · Deuda ${formatMXN(info.debt)}`
        : info.daysLeft === 0
          ? `⏰ ${escapeHtml(acc.name)}: pago hoy · Deuda ${formatMXN(info.debt)}`
          : `⏰ ${escapeHtml(acc.name)}: pago en ${info.daysLeft} día${info.daysLeft === 1 ? "" : "s"} (${escapeHtml(formatDayMonth(info.dueDate))}) · Deuda ${formatMXN(info.debt)}`;
      return `<div class="payment-alert ${kind}">${label}</div>`;
    }).join("");
  }

  function institutionPresetsHtml() {
    const banks = INSTITUTION_PRESETS.filter((p) => p.group === "Bancos");
    const cards = INSTITUTION_PRESETS.filter((p) => p.group === "Tarjetas");
    const chip = (p) =>
      `<button type="button" class="preset-chip" data-name="${escapeAttr(p.name)}" data-type="${escapeAttr(p.type)}" data-color="${escapeAttr(p.color)}" data-icon="${escapeAttr(p.icon || "")}">${escapeHtml(p.name)}</button>`;
    return `
      <div class="form-row">
        <label>Institución (atajos)</label>
        <div class="preset-chips" id="f-acc-presets">
          <span class="preset-group-label">Bancos</span>
          ${banks.map(chip).join("")}
          <span class="preset-group-label">Tarjetas</span>
          ${cards.map(chip).join("")}
        </div>
        <p class="field-hint">Elige un atajo o escribe un nombre personalizado abajo.</p>
      </div>`;
  }

  function accountFormHtml(acc) {
    const type = acc ? acc.type : "efectivo";
    const color = acc ? acc.color : HABIT_COLORS[0];
    const colors = HABIT_COLORS.map((c) =>
      `<button type="button" class="color-swatch${c === color ? " selected" : ""}" data-color="${c}" style="background:${c}" aria-label="Color"></button>`
    ).join("");
    const creditLimit = acc && acc.creditLimit != null ? acc.creditLimit : "";
    const cutoffDay = acc && acc.cutoffDay != null ? acc.cutoffDay : "";
    const paymentDueDay = acc && acc.paymentDueDay != null ? acc.paymentDueDay : "";
    const institution = acc && acc.institution ? acc.institution : "";
    return `
      <div class="form-grid">
        ${institutionPresetsHtml()}
        <div class="form-row">
          <label for="f-acc-name">Nombre</label>
          <input id="f-acc-name" name="name" required maxlength="60" value="${acc ? escapeAttr(acc.name) : ""}" placeholder="Ej. Santander, Amex, Like U" />
          <input type="hidden" name="institution" id="f-acc-institution" value="${escapeAttr(institution)}" />
        </div>
        <div class="form-row">
          <label for="f-acc-type">Tipo</label>
          <select id="f-acc-type" name="type">${accountTypeOptionsHtml(type)}</select>
        </div>
        <div class="form-row">
          <label for="f-acc-opening" id="f-acc-opening-label">Saldo inicial (MXN)</label>
          <input id="f-acc-opening" name="openingBalance" type="number" step="0.01" value="${acc ? acc.openingBalance : 0}" />
          <p class="field-hint" id="f-acc-opening-hint">Para tarjetas de crédito, 0 = sin deuda; usa negativo si ya debes (ej. -3500). Los gastos aumentan la deuda.</p>
        </div>
        <div id="f-acc-credit-fields" class="credit-fields${type === "credito" ? "" : " hidden"}">
          <div class="form-row">
            <label for="f-acc-limit">Límite de crédito (opcional)</label>
            <input id="f-acc-limit" name="creditLimit" type="number" step="0.01" min="0" value="${escapeAttr(String(creditLimit))}" placeholder="Ej. 25000" />
          </div>
          <div class="form-row form-row-2">
            <div>
              <label for="f-acc-cutoff">Día de corte (1–28)</label>
              <input id="f-acc-cutoff" name="cutoffDay" type="number" min="1" max="28" step="1" value="${escapeAttr(String(cutoffDay))}" placeholder="Ej. 15" />
            </div>
            <div>
              <label for="f-acc-due">Día de pago (1–28)</label>
              <input id="f-acc-due" name="paymentDueDay" type="number" min="1" max="28" step="1" value="${escapeAttr(String(paymentDueDay))}" placeholder="Ej. 3" />
            </div>
          </div>
          <p class="field-hint">Con el día de pago calculamos el próximo vencimiento a partir de hoy.</p>
        </div>
        <div class="form-row">
          <label>Color</label>
          <div class="color-swatches" id="f-acc-colors">${colors}</div>
          <input type="hidden" name="color" id="f-acc-color" value="${escapeAttr(color)}" />
          <input type="hidden" name="icon" id="f-acc-icon" value="${escapeAttr(acc && acc.icon ? acc.icon : accountTypeMeta(type).icon)}" />
        </div>
      </div>
    `;
  }

  function toggleCreditFields() {
    const form = document.getElementById("modal-form");
    if (!form) return;
    const type = form.querySelector("#f-acc-type")?.value;
    const box = form.querySelector("#f-acc-credit-fields");
    if (box) box.classList.toggle("hidden", type !== "credito");
  }

  function bindAccountForm() {
    const form = document.getElementById("modal-form");
    const typeSel = form.querySelector("#f-acc-type");
    document.querySelectorAll("#f-acc-colors .color-swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#f-acc-colors .color-swatch").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        form.querySelector("#f-acc-color").value = btn.dataset.color;
      });
    });
    typeSel.addEventListener("change", () => {
      const meta = accountTypeMeta(typeSel.value);
      const iconInput = form.querySelector("#f-acc-icon");
      if (iconInput && !form.dataset.presetIcon) iconInput.value = meta.icon;
      toggleCreditFields();
    });
    form.querySelectorAll("#f-acc-presets .preset-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        form.querySelector("#f-acc-name").value = btn.dataset.name || "";
        form.querySelector("#f-acc-institution").value = btn.dataset.name || "";
        typeSel.value = btn.dataset.type || "otro";
        form.querySelector("#f-acc-color").value = btn.dataset.color || HABIT_COLORS[0];
        form.querySelector("#f-acc-icon").value = btn.dataset.icon || accountTypeMeta(typeSel.value).icon;
        form.dataset.presetIcon = "1";
        document.querySelectorAll("#f-acc-colors .color-swatch").forEach((b) => {
          b.classList.toggle("selected", b.dataset.color === btn.dataset.color);
        });
        toggleCreditFields();
      });
    });
    toggleCreditFields();
  }

  function openAccountModal(acc) {
    openModal(acc ? "Editar cuenta" : "Nueva cuenta", accountFormHtml(acc), (fd) => {
      const name = (fd.get("name") || "").trim();
      if (!name) return false;
      const type = fd.get("type") || "otro";
      const openingBalance = parseFloat(fd.get("openingBalance"));
      const color = fd.get("color") || HABIT_COLORS[0];
      const icon = (fd.get("icon") || "").trim() || accountTypeMeta(type).icon;
      const institution = (fd.get("institution") || "").trim() || null;
      const data = {
        name,
        type,
        color,
        icon,
        institution,
        openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
        creditLimit: null,
        cutoffDay: null,
        paymentDueDay: null,
        nextStatementDate: acc && acc.nextStatementDate ? acc.nextStatementDate : null,
        nextPaymentDate: acc && acc.nextPaymentDate ? acc.nextPaymentDate : null
      };
      if (type === "credito") {
        const lim = parseFloat(fd.get("creditLimit"));
        data.creditLimit = Number.isFinite(lim) && lim >= 0 ? lim : null;
        data.cutoffDay = clampDayOfMonth(fd.get("cutoffDay"));
        data.paymentDueDay = clampDayOfMonth(fd.get("paymentDueDay"));
      }
      if (acc) {
        Object.assign(acc, data);
        toast("Cuenta actualizada");
      } else {
        state.accounts.push({ id: uid(), ...data });
        toast("Cuenta creada");
      }
      saveState();
      renderFinanzas();
      return true;
    });
    bindAccountForm();
    // Add delete button for existing accounts
    if (acc) {
      const form = document.getElementById("modal-form");
      const delWrap = document.createElement("div");
      delWrap.className = "form-row";
      delWrap.style.marginTop = "0.75rem";
      delWrap.innerHTML = `<button type="button" class="btn-danger btn-sm" id="btn-delete-account">Eliminar cuenta</button>`;
      form.appendChild(delWrap);
      delWrap.querySelector("#btn-delete-account").addEventListener("click", () => {
        if (state.accounts.length <= 1) {
          toast("Debes conservar al menos una cuenta");
          return;
        }
        if (!confirm(`¿Eliminar la cuenta «${acc.name}»? Sus movimientos pasarán a Efectivo.`)) return;
        const fallback = state.accounts.find((a) => a.id !== acc.id && a.type === "efectivo")
          || state.accounts.find((a) => a.id !== acc.id);
        state.transactions.forEach((t) => {
          if (t.accountId === acc.id) t.accountId = fallback.id;
        });
        state.accounts = state.accounts.filter((a) => a.id !== acc.id);
        saveState();
        closeModal();
        renderFinanzas();
        toast("Cuenta eliminada");
      });
    }
  }

  function renderFinanzas() {
    renderAccounts();
    renderLoans();
    const ym = finMonthValue();
    const typeFilter = document.getElementById("fin-filter-type").value;
    const accountFilter = document.getElementById("fin-filter-account")?.value || "all";
    let txs = txsForMonth(ym);
    if (accountFilter !== "all") {
      txs = txs.filter((t) => t.accountId === accountFilter);
    }
    let ingresos = 0, gastos = 0;
    txs.forEach((t) => {
      if (t.type === "ingreso") ingresos += Number(t.amount);
      else gastos += Number(t.amount);
    });
    // Month balance for filtered set; also show global accounts total in dashboard balance if no account filter
    document.getElementById("fin-balance").textContent = formatMXN(ingresos - gastos);
    document.getElementById("fin-ingresos").textContent = formatMXN(ingresos);
    document.getElementById("fin-gastos").textContent = formatMXN(gastos);
    const loansTotal = document.getElementById("fin-loans-total");
    if (loansTotal) loansTotal.textContent = formatMXN(totalLoanOutstanding());
    const balLabel = document.getElementById("fin-balance-label");
    if (balLabel) balLabel.textContent = accountFilter === "all" ? "Balance del mes" : "Balance (cuenta)";

    let listTxs = txs;
    if (typeFilter !== "all") listTxs = listTxs.filter((t) => t.type === typeFilter);
    listTxs = [...listTxs].sort((a, b) => {
      const byDate = String(b.date || "").localeCompare(String(a.date || ""));
      if (byDate) return byDate;
      return Number(b.amount) - Number(a.amount);
    });

    const ul = document.getElementById("tx-list");
    const empty = document.getElementById("tx-empty");
    ul.innerHTML = "";
    if (!listTxs.length) {
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      const grouped = new Map();
      listTxs.forEach((t) => {
        const dateKey = String(t.date || "");
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        grouped.get(dateKey).push(t);
      });

      [...grouped.entries()].forEach(([dateKey, dayTxs]) => {
        const dayIngresos = dayTxs.reduce((sum, t) => sum + (t.type === "ingreso" ? Number(t.amount) : 0), 0);
        const dayGastos = dayTxs.reduce((sum, t) => sum + (t.type === "gasto" ? Number(t.amount) : 0), 0);
        const dayNeto = dayIngresos - dayGastos;
        const group = document.createElement("li");
        group.className = "tx-day-group";
        group.innerHTML = `
          <div class="tx-day-header">
            <strong class="tx-day-title">${escapeHtml(formatTxDay(dateKey))}</strong>
            <div class="tx-day-totals" aria-label="Totales del día">
              <span class="tx-day-total ingreso"><small>Ingresos</small><b>${formatMXN(dayIngresos)}</b></span>
              <span class="tx-day-total gasto"><small>Gastos</small><b>${formatMXN(dayGastos)}</b></span>
              <span class="tx-day-total neto ${dayNeto < 0 ? "negative" : "positive"}"><small>Neto</small><b>${formatMXN(dayNeto)}</b></span>
            </div>
          </div>
        `;
        const dayList = document.createElement("ul");
        dayList.className = "tx-day-list";
        dayTxs.forEach((t) => {
          const li = document.createElement("li");
          li.className = "tx-item";
          const sign = t.type === "ingreso" ? "+" : "−";
          const acc = accountById(t.accountId);
          const accLabel = acc ? `${acc.icon || ""} ${acc.name}` : "Sin cuenta";
          const pm = t.paymentMethod ? ` · ${t.paymentMethod}` : "";
          li.innerHTML = `
            <div class="tx-icon ${t.type}">${t.type === "ingreso" ? "IN" : "GA"}</div>
            <div class="tx-info">
              <strong>${escapeHtml(t.category)}</strong>
              <span>${escapeHtml(accLabel)}${escapeHtml(pm)}${t.note ? " · " + escapeHtml(t.note) : ""}</span>
            </div>
            <div class="tx-amount ${t.type}">${sign}${formatMXN(t.amount)}</div>
            <div class="tx-actions">
              <button type="button" class="btn-ghost btn-sm" data-edit>Editar</button>
              <button type="button" class="btn-danger btn-sm" data-del>✕</button>
            </div>
          `;
          li.querySelector("[data-edit]").addEventListener("click", () => openTxModal(t));
          li.querySelector("[data-del]").addEventListener("click", () => {
            if (!confirm("¿Eliminar este movimiento?")) return;
            state.transactions = state.transactions.filter((x) => x.id !== t.id);
            saveState();
            renderFinanzas();
            toast("Movimiento eliminado");
          });
          dayList.appendChild(li);
        });
        group.appendChild(dayList);
        ul.appendChild(group);
      });
    }

    // Chart by category
    const allMonth = txsForMonth(ym).filter((t) =>
      accountFilter === "all" ? true : t.accountId === accountFilter
    );
    const byCat = {};
    allMonth.forEach((t) => {
      const key = t.type + ":" + t.category;
      byCat[key] = (byCat[key] || 0) + Number(t.amount);
    });
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const chart = document.getElementById("fin-chart");
    const chartEmpty = document.getElementById("chart-empty");
    chart.innerHTML = "";
    if (!entries.length) {
      chartEmpty.classList.remove("hidden");
    } else {
      chartEmpty.classList.add("hidden");
      const max = entries[0][1] || 1;
      entries.forEach(([key, amt]) => {
        const [type, cat] = key.split(":");
        const row = document.createElement("div");
        row.className = "chart-row";
        const pct = Math.max(4, (amt / max) * 100);
        row.innerHTML = `
          <span class="label" title="${escapeAttr(cat)}">${escapeHtml(cat)}</span>
          <div class="chart-bar-track"><div class="chart-bar-fill ${type === "gasto" ? "gasto-bar" : ""}" style="width:${pct}%"></div></div>
          <span class="amt">${formatMXN(amt)}</span>
        `;
        chart.appendChild(row);
      });
    }
  }

  function renderLoans() {
    const list = document.getElementById("loans-list");
    const empty = document.getElementById("loans-empty");
    if (!list || !empty) return;
    list.innerHTML = "";
    const loans = [...(state.loans || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    empty.classList.toggle("hidden", loans.length > 0);
    loans.forEach((loan) => {
      const outstanding = loanOutstanding(loan);
      const payments = [...(loan.payments || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const last = payments[0];
      const card = document.createElement("article");
      card.className = "loan-card" + (outstanding <= 0 ? " paid" : "");
      card.innerHTML = `
        <div class="loan-card-main">
          <div><strong>${escapeHtml(loan.person || "Sin nombre")}</strong><span class="loan-date">Prestado ${escapeHtml(loan.date || "")}</span></div>
          <div class="loan-due"><span>Te deben</span><strong>${formatMXN(outstanding)}</strong></div>
        </div>
        <div class="loan-meta">
          <span>Original: ${formatMXN(loan.amount)}</span>
          <span>${last ? `Último abono: ${escapeHtml(last.date)} · ${formatMXN(last.amount)}` : "Sin abonos"}</span>
          ${loan.note ? `<span>${escapeHtml(loan.note)}</span>` : ""}
        </div>
        <div class="loan-actions">
          <button type="button" class="btn-primary btn-sm" data-pay ${outstanding <= 0 ? "disabled" : ""}>Registrar cobro / abono</button>
          <button type="button" class="btn-danger btn-sm" data-delete>Eliminar</button>
        </div>`;
      card.querySelector("[data-pay]").addEventListener("click", () => openLoanPaymentModal(loan));
      card.querySelector("[data-delete]").addEventListener("click", () => {
        if (!confirm(`¿Eliminar el préstamo de ${loan.person}? Los movimientos bancarios ya registrados no se borrarán.`)) return;
        state.loans = state.loans.filter((x) => x.id !== loan.id);
        saveState(); renderFinanzas(); toast("Préstamo eliminado");
      });
      list.appendChild(card);
    });
  }

  function optionalAccountOptionsHtml(selectedId) {
    return `<option value="">No registrar movimiento en cuenta</option>` + accountOptionsHtml(selectedId || "");
  }

  function ensureFinanceCategory(type, name) {
    if (!state.categories[type].includes(name)) state.categories[type].push(name);
  }

  function openLoanModal() {
    openModal("Nuevo préstamo", `
      <div class="form-grid">
        <div class="form-row"><label for="f-loan-person">Persona</label><input id="f-loan-person" name="person" required maxlength="80" placeholder="Ej. Andy" /></div>
        <div class="form-row-inline">
          <div class="form-row"><label for="f-loan-amount">Monto original (MXN)</label><input id="f-loan-amount" name="amount" type="number" step="0.01" min="0.01" required /></div>
          <div class="form-row"><label for="f-loan-date">Fecha</label><input id="f-loan-date" name="date" type="date" required value="${today()}" /></div>
        </div>
        <div class="form-row"><label for="f-loan-account">¿De qué cuenta salió?</label><select id="f-loan-account" name="accountId">${optionalAccountOptionsHtml("")}</select><p class="field-hint">Si eliges una cuenta, también se registrará un gasto por el préstamo.</p></div>
        <div class="form-row"><label for="f-loan-note">Nota</label><input id="f-loan-note" name="note" maxlength="160" placeholder="Opcional" /></div>
      </div>`, (fd) => {
      const person = String(fd.get("person") || "").trim();
      const amount = parseFloat(fd.get("amount"));
      const date = String(fd.get("date") || "");
      const accountId = String(fd.get("accountId") || "");
      if (!person || !(amount > 0) || !date) return false;
      const loan = { id: uid(), person, amount, date, note: String(fd.get("note") || "").trim(), payments: [], accountId: accountId || null };
      state.loans.push(loan);
      if (accountId && accountById(accountId)) {
        ensureFinanceCategory("gasto", "Préstamos");
        state.transactions.push({ id: uid(), type: "gasto", amount, category: "Préstamos", date, note: `Préstamo a ${person}`, accountId, paymentMethod: "Transferencia", _loanId: loan.id });
      }
      saveState(); renderFinanzas(); toast("Préstamo registrado"); return true;
    });
  }

  function openLoanPaymentModal(loan) {
    const outstanding = loanOutstanding(loan);
    openModal(`Registrar abono de ${loan.person}`, `
      <div class="form-grid">
        <p class="muted">Pendiente: <strong>${formatMXN(outstanding)}</strong></p>
        <div class="form-row-inline">
          <div class="form-row"><label for="f-payment-amount">Monto (MXN)</label><input id="f-payment-amount" name="amount" type="number" step="0.01" min="0.01" max="${outstanding}" required /></div>
          <div class="form-row"><label for="f-payment-date">Fecha</label><input id="f-payment-date" name="date" type="date" required value="${today()}" /></div>
        </div>
        <div class="form-row"><label for="f-payment-account">Cuenta que recibió el dinero</label><select id="f-payment-account" name="accountId">${optionalAccountOptionsHtml("")}</select><p class="field-hint">Si eliges una cuenta, también se registrará el ingreso.</p></div>
        <div class="form-row"><label for="f-payment-note">Nota</label><input id="f-payment-note" name="note" maxlength="160" placeholder="Opcional" /></div>
      </div>`, (fd) => {
      const amount = parseFloat(fd.get("amount"));
      const date = String(fd.get("date") || "");
      const accountId = String(fd.get("accountId") || "");
      if (!(amount > 0) || amount > loanOutstanding(loan) + 0.001 || !date) return false;
      const payment = { id: uid(), amount, date, note: String(fd.get("note") || "").trim() };
      if (accountId) payment.accountId = accountId;
      if (!Array.isArray(loan.payments)) loan.payments = [];
      loan.payments.push(payment);
      if (accountId && accountById(accountId)) {
        ensureFinanceCategory("ingreso", "Cobro de préstamo");
        state.transactions.push({ id: uid(), type: "ingreso", amount, category: "Cobro de préstamo", date, note: `Abono de ${loan.person}`, accountId, paymentMethod: "Transferencia", _loanId: loan.id, _loanPaymentId: payment.id });
      }
      saveState(); renderFinanzas(); toast("Abono registrado"); return true;
    });
  }

  function categoryOptions(type, selected) {
    const cats = state.categories[type] || [];
    return cats.map((c) =>
      `<option value="${escapeAttr(c)}" ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`
    ).join("") + `<option value="__custom__">+ Nueva categoría…</option>`;
  }

  function txFormHtml(tx) {
    const type = tx ? tx.type : "gasto";
    const defaultAcc = defaultEfectivoAccount().id;
    const accId = tx ? (tx.accountId || defaultAcc) : defaultAcc;
    const pm = tx ? (tx.paymentMethod || "Efectivo") : "Efectivo";
    return `
      <div class="form-grid">
        <div class="form-row">
          <label>Tipo</label>
          <div class="radio-group">
            <label class="radio-pill"><input type="radio" name="type" value="ingreso" ${type === "ingreso" ? "checked" : ""} /> Ingreso</label>
            <label class="radio-pill"><input type="radio" name="type" value="gasto" ${type === "gasto" ? "checked" : ""} /> Gasto</label>
          </div>
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label for="f-tx-amount">Monto (MXN)</label>
            <input id="f-tx-amount" name="amount" type="number" step="0.01" min="0.01" required value="${tx ? tx.amount : ""}" placeholder="0.00" />
          </div>
          <div class="form-row">
            <label for="f-tx-date">Fecha</label>
            <input id="f-tx-date" name="date" type="date" required value="${tx ? tx.date : today()}" />
          </div>
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label for="f-tx-account">Cuenta</label>
            <select id="f-tx-account" name="accountId" required>${accountOptionsHtml(accId)}</select>
          </div>
          <div class="form-row">
            <label for="f-tx-pm">Método de pago</label>
            <select id="f-tx-pm" name="paymentMethod">${paymentMethodOptionsHtml(pm)}</select>
          </div>
        </div>
        <div class="form-row">
          <label for="f-tx-cat">Categoría</label>
          <select id="f-tx-cat" name="category">${categoryOptions(type, tx ? tx.category : "")}</select>
          <input id="f-tx-cat-custom" name="categoryCustom" class="hidden" placeholder="Nombre de categoría" style="margin-top:0.4rem" />
        </div>
        <div class="form-row">
          <label for="f-tx-note">Nota</label>
          <input id="f-tx-note" name="note" maxlength="120" value="${tx ? escapeAttr(tx.note || "") : ""}" placeholder="Opcional" />
        </div>
      </div>
    `;
  }

  function bindTxFormType() {
    const form = document.getElementById("modal-form");
    const cat = form.querySelector("#f-tx-cat");
    const custom = form.querySelector("#f-tx-cat-custom");
    const refreshCats = () => {
      const type = form.querySelector('input[name="type"]:checked')?.value || "gasto";
      const prev = cat.value;
      cat.innerHTML = categoryOptions(type, prev === "__custom__" ? "" : prev);
      custom.classList.add("hidden");
      custom.required = false;
    };
    form.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener("change", refreshCats));
    cat.addEventListener("change", () => {
      if (cat.value === "__custom__") {
        custom.classList.remove("hidden");
        custom.required = true;
        custom.focus();
      } else {
        custom.classList.add("hidden");
        custom.required = false;
      }
    });
  }

  function openTxModal(tx) {
    if (!state.accounts.length) {
      toast("Crea una cuenta primero");
      openAccountModal(null);
      return;
    }
    openModal(tx ? "Editar movimiento" : "Nuevo movimiento", txFormHtml(tx), (fd) => {
      const type = fd.get("type") || "gasto";
      let category = fd.get("category");
      if (category === "__custom__") {
        category = (fd.get("categoryCustom") || "").trim();
        if (!category) return false;
        if (!state.categories[type].includes(category)) {
          state.categories[type].push(category);
        }
      }
      const amount = parseFloat(fd.get("amount"));
      if (!(amount > 0)) return false;
      const accountId = fd.get("accountId");
      if (!accountId || !accountById(accountId)) {
        toast("Selecciona una cuenta");
        return false;
      }
      const data = {
        type,
        amount,
        category,
        date: fd.get("date"),
        note: (fd.get("note") || "").trim(),
        accountId,
        paymentMethod: fd.get("paymentMethod") || "Efectivo"
      };
      if (tx) {
        Object.assign(tx, data);
        toast("Movimiento actualizado");
      } else {
        state.transactions.push({ id: uid(), ...data });
        toast("Movimiento guardado");
      }
      saveState();
      const ym = data.date.slice(0, 7);
      document.getElementById("fin-month").value = ym;
      renderFinanzas();
      return true;
    });
    bindTxFormType();
  }

  function initFinanzas() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthInput = document.getElementById("fin-month");
    monthInput.value = ym;
    monthInput.addEventListener("change", renderFinanzas);
    document.getElementById("fin-filter-type").addEventListener("change", renderFinanzas);
    const accFilt = document.getElementById("fin-filter-account");
    if (accFilt) accFilt.addEventListener("change", renderFinanzas);
    document.getElementById("btn-new-tx").addEventListener("click", () => openTxModal(null));
    const btnAcc = document.getElementById("btn-new-account");
    if (btnAcc) btnAcc.addEventListener("click", () => openAccountModal(null));
    document.getElementById("btn-new-loan")?.addEventListener("click", openLoanModal);
    document.getElementById("btn-import-mm")?.addEventListener("click", importMoneyManager);
  }

  // ========== PROYECTOS ==========
  function renderProjectList() {
    const ul = document.getElementById("project-list");
    const empty = document.getElementById("project-empty");
    ul.innerHTML = "";
    if (!state.projects.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    state.projects.forEach((p) => {
      const li = document.createElement("li");
      li.className = "project-item" + (p.id === selectedProjectId ? " selected" : "");
      li.innerHTML = `
        <strong>${escapeHtml(p.name)}</strong>
        <span class="badge ${p.status}">${p.status}</span>
      `;
      li.addEventListener("click", () => {
        selectedProjectId = p.id;
        renderProyectos();
      });
      ul.appendChild(li);
    });
  }

  function getMissTargetEntity(project) {
    if (!project) return null;
    if (projMissTarget === "project" || !projMissTarget) return project;
    if (projMissTarget.startsWith("task:")) {
      const tid = projMissTarget.slice(5);
      return (project.tasks || []).find((t) => t.id === tid) || project;
    }
    return project;
  }

  function ensureMissBag(entity) {
    if (!entity.missedDays || typeof entity.missedDays !== "object") entity.missedDays = {};
    return entity.missedDays;
  }

  function renderProjectMissCalendar(project) {
    const wrap = document.getElementById("project-miss-wrap");
    if (!wrap) return;
    if (projMissYear == null) {
      const now = new Date();
      projMissYear = now.getFullYear();
      projMissMonth = now.getMonth();
    }
    const entity = getMissTargetEntity(project);
    const bag = ensureMissBag(entity);
    const missCount = countMissedInMonth(bag, projMissYear, projMissMonth);

    const opts = [`<option value="project"${projMissTarget === "project" ? " selected" : ""}>Proyecto</option>`];
    (project.tasks || []).forEach((t) => {
      const val = "task:" + t.id;
      opts.push(`<option value="${val}"${projMissTarget === val ? " selected" : ""}>${escapeHtml(t.name)}</option>`);
    });

    wrap.innerHTML = `
      <div class="card-head miss-head">
        <h4>Días incumplidos</h4>
        <span class="muted miss-count">${missCount} en el mes</span>
      </div>
      <p class="muted miss-hint">Toca un día programado para marcarlo como incumplido (no avanzaste como planeabas).</p>
      <div class="miss-target-row">
        <label for="miss-target">Marcar en</label>
        <select id="miss-target">${opts.join("")}</select>
      </div>
      <div class="cal-nav">
        <button type="button" id="proj-miss-prev" class="btn-icon" aria-label="Mes anterior">‹</button>
        <h4 id="proj-miss-label">${MONTHS_ES[projMissMonth]} ${projMissYear}</h4>
        <button type="button" id="proj-miss-next" class="btn-icon" aria-label="Mes siguiente">›</button>
      </div>
      <div class="calendar project-miss-cal" id="project-miss-calendar"></div>
    `;

    wrap.querySelector("#miss-target").addEventListener("change", (e) => {
      projMissTarget = e.target.value;
      renderProyectos();
    });
    wrap.querySelector("#proj-miss-prev").addEventListener("click", () => {
      projMissMonth--;
      if (projMissMonth < 0) { projMissMonth = 11; projMissYear--; }
      renderProyectos();
    });
    wrap.querySelector("#proj-miss-next").addEventListener("click", () => {
      projMissMonth++;
      if (projMissMonth > 11) { projMissMonth = 0; projMissYear++; }
      renderProyectos();
    });

    const cal = wrap.querySelector("#project-miss-calendar");
    DOW_ES.forEach((d) => {
      const el = document.createElement("div");
      el.className = "cal-dow";
      el.textContent = d;
      cal.appendChild(el);
    });
    const first = new Date(projMissYear, projMissMonth, 1);
    let startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(projMissYear, projMissMonth + 1, 0).getDate();
    const prevDays = new Date(projMissYear, projMissMonth, 0).getDate();
    const tStr = today();
    const rangeStart = entity.start || project.start;
    const rangeEnd = entity.end || project.end;

    for (let i = 0; i < startPad; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day outside";
      btn.textContent = prevDays - startPad + 1 + i;
      cal.appendChild(btn);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = isoDate(new Date(projMissYear, projMissMonth, d));
      const inRange = isInDateRange(ds, rangeStart, rangeEnd);
      const scheduled = inRange && workdaysOf(entity).includes(dowMon0(parseISO(ds)));
      const missed = !!bag[ds];
      const btn = document.createElement("button");
      btn.type = "button";
      let cls = "cal-day";
      if (ds === tStr) cls += " today";
      if (!scheduled) cls += " na";
      if (missed) cls += " miss";
      btn.className = cls;
      btn.title = !inRange ? "Fuera del periodo" : (!scheduled ? "No es día de trabajo" : (missed ? "Incumplido — tocar para quitar" : "Marcar incumplido"));
      btn.innerHTML = `<span>${d}</span>${missed ? '<span class="mark">✕</span>' : ""}`;
      if (scheduled) {
        btn.addEventListener("click", () => {
          toggleMissedDay(ensureMissBag(entity), ds);
          saveState();
          renderProyectos();
        });
      } else {
        btn.disabled = true;
      }
      cal.appendChild(btn);
    }
    const totalCells = startPad + daysInMonth;
    const rem = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= rem; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day outside";
      btn.textContent = i;
      cal.appendChild(btn);
    }
  }

  function renderProjectDetail() {
    const p = state.projects.find((x) => x.id === selectedProjectId);
    const empty = document.getElementById("project-detail-empty");
    const detail = document.getElementById("project-detail");
    if (!p) {
      empty.classList.remove("hidden");
      detail.classList.add("hidden");
      return;
    }
    empty.classList.add("hidden");
    detail.classList.remove("hidden");
    // reset miss target if task gone
    if (projMissTarget.startsWith("task:")) {
      const tid = projMissTarget.slice(5);
      if (!(p.tasks || []).some((t) => t.id === tid)) projMissTarget = "project";
    }
    document.getElementById("project-detail-name").textContent = p.name;
    document.getElementById("project-detail-meta").textContent =
      `${p.start} → ${p.end} · ${p.status} · ${formatWeekdaysShort(p.workdays)}`;
    document.getElementById("project-detail-desc").textContent = p.description || "";

    const ul = document.getElementById("task-list");
    ul.innerHTML = "";
    (p.tasks || []).forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-item";
      const missN = Object.keys(task.missedDays || {}).filter((k) => task.missedDays[k]).length;
      li.innerHTML = `
        <button type="button" class="task-check ${task.done ? "done" : ""}" aria-label="Marcar hecha">${task.done ? "✓" : ""}</button>
        <div class="task-info">
          <strong class="${task.done ? "done-text" : ""}">${escapeHtml(task.name)}</strong>
          <span>${task.start} → ${task.end} · ${formatWeekdaysShort(task.workdays)}${missN ? " · " + missN + " incumpl." : ""}</span>
        </div>
        <div class="task-actions">
          <button type="button" class="btn-ghost btn-sm" data-edit>Editar</button>
          <button type="button" class="btn-danger btn-sm" data-del>✕</button>
        </div>
      `;
      li.querySelector(".task-check").addEventListener("click", () => {
        task.done = !task.done;
        saveState();
        renderProyectos();
      });
      li.querySelector("[data-edit]").addEventListener("click", () => openTaskModal(p, task));
      li.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm("¿Eliminar esta tarea?")) return;
        p.tasks = p.tasks.filter((t) => t.id !== task.id);
        saveState();
        renderProyectos();
        toast("Tarea eliminada");
      });
      ul.appendChild(li);
    });
    if (!(p.tasks || []).length) {
      ul.innerHTML = `<li class="empty-hint">Sin tareas aún.</li>`;
    }
    renderProjectMissCalendar(p);
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function renderGantt() {
    const scale = ganttScale;
    const label = document.getElementById("gantt-label");
    const container = document.getElementById("gantt");

    let cols = [];
    let rangeStart, rangeEnd;

    if (scale === "week") {
      // 8 weeks from Monday of anchor week
      const anchor = new Date(ganttAnchor);
      const dow = (anchor.getDay() + 6) % 7;
      rangeStart = new Date(anchor);
      rangeStart.setDate(anchor.getDate() - dow);
      for (let i = 0; i < 8; i++) {
        const ws = new Date(rangeStart);
        ws.setDate(rangeStart.getDate() + i * 7);
        const we = new Date(ws);
        we.setDate(ws.getDate() + 6);
        cols.push({
          label: ws.getDate() + "/" + (ws.getMonth() + 1),
          start: ws,
          end: we
        });
      }
      rangeEnd = new Date(cols[cols.length - 1].end);
      label.textContent = MONTHS_ES[rangeStart.getMonth()] + " " + rangeStart.getFullYear();
    } else {
      // 6 months
      rangeStart = startOfMonth(ganttAnchor);
      for (let i = 0; i < 6; i++) {
        const ms = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
        const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0);
        cols.push({
          label: MONTHS_ES[ms.getMonth()].slice(0, 3),
          start: ms,
          end: me
        });
      }
      rangeEnd = cols[cols.length - 1].end;
      label.textContent = rangeStart.getFullYear() + (rangeStart.getFullYear() !== rangeEnd.getFullYear() ? "–" + rangeEnd.getFullYear() : "");
    }

    const n = cols.length;
    let html = `<div class="gantt-table" style="--cols:${n}">`;
    html += `<div class="gantt-header"><div class="gantt-corner">Proyecto</div>`;
    cols.forEach((c) => { html += `<div class="gantt-col-head">${c.label}</div>`; });
    html += `</div>`;

    const palette = HABIT_COLORS;

    state.projects.forEach((p, pi) => {
      const color = palette[pi % palette.length];
      html += ganttRowHtml(p.name, p.start, p.end, rangeStart, rangeEnd, n, color, true, false, "project-row", p.missedDays);
      (p.tasks || []).forEach((t) => {
        html += ganttRowHtml(t.name, t.start, t.end, rangeStart, rangeEnd, n, color, false, t.done, "task-row", t.missedDays);
      });
    });

    if (!state.projects.length) {
      html += `<p class="empty-hint">No hay proyectos para mostrar en el cronograma.</p>`;
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  function ganttMissedMarksHtml(missedDays, rangeStart, rangeEnd, totalDays) {
    if (!missedDays || typeof missedDays !== "object") return "";
    return Object.keys(missedDays).filter((k) => missedDays[k]).map((ds) => {
      const d = parseISO(ds);
      if (d < rangeStart || d > rangeEnd) return "";
      let leftPct = (daysBetween(rangeStart, d) / totalDays) * 100;
      let widthPct = (1 / totalDays) * 100;
      if (widthPct < 0.6) widthPct = 0.6;
      return `<div class="gantt-miss" style="left:${leftPct}%;width:${widthPct}%;" title="Incumplido ${ds}"></div>`;
    }).join("");
  }

  function ganttRowHtml(name, startStr, endStr, rangeStart, rangeEnd, nCols, color, isProject, done, rowClass, missedDays) {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
    let leftPct = (daysBetween(rangeStart, start) / totalDays) * 100;
    let widthPct = ((daysBetween(start, end) + 1) / totalDays) * 100;
    // clip
    const rightPct = leftPct + widthPct;
    if (rightPct < 0 || leftPct > 100) {
      leftPct = 0; widthPct = 0;
    } else {
      if (leftPct < 0) { widthPct += leftPct; leftPct = 0; }
      if (leftPct + widthPct > 100) widthPct = 100 - leftPct;
    }

    const barClass = `gantt-bar ${isProject ? "project-bar" : "task-bar"}${done ? " done-bar" : ""}`;
    const bar = widthPct > 0
      ? `<div class="${barClass}" style="left:${leftPct}%;width:${widthPct}%;background:${color};"></div>`
      : "";
    const misses = ganttMissedMarksHtml(missedDays, rangeStart, rangeEnd, totalDays);

    return `
      <div class="gantt-row ${rowClass}">
        <div class="gantt-label-cell" title="${escapeAttr(name)}">${escapeHtml(name)}</div>
        <div class="gantt-cell" style="grid-column: 2 / span ${nCols}; position:relative; border-left:1px solid var(--border);">
          ${bar}
          ${misses}
          <div style="display:grid;grid-template-columns:repeat(${nCols},1fr);position:absolute;inset:0;pointer-events:none;">
            ${Array.from({ length: nCols }, () => '<div style="border-left:1px solid rgba(45,58,77,0.4)"></div>').join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderProyectos() {
    if (!selectedProjectId && state.projects.length) selectedProjectId = state.projects[0].id;
    if (selectedProjectId && !state.projects.find((p) => p.id === selectedProjectId)) {
      selectedProjectId = state.projects[0]?.id || null;
    }
    renderProjectList();
    renderProjectDetail();
    renderGantt();
  }

  function projectFormHtml(p) {
    const workdays = p ? workdaysOf(p) : [0, 1, 2, 3, 4];
    return `
      <div class="form-grid">
        <div class="form-row">
          <label for="f-proj-name">Nombre</label>
          <input id="f-proj-name" name="name" required maxlength="80" value="${p ? escapeAttr(p.name) : ""}" />
        </div>
        <div class="form-row">
          <label for="f-proj-desc">Descripción</label>
          <textarea id="f-proj-desc" name="description" maxlength="400">${p ? escapeHtml(p.description || "") : ""}</textarea>
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label for="f-proj-start">Inicio (temporalidad)</label>
            <input id="f-proj-start" name="start" type="date" required value="${p ? p.start : today()}" />
          </div>
          <div class="form-row">
            <label for="f-proj-end">Fin</label>
            <input id="f-proj-end" name="end" type="date" required value="${p ? p.end : today()}" />
          </div>
        </div>
        <div class="form-row">
          <label>Días de trabajo</label>
          ${weekdayPillsHtml("workdays", workdays)}
        </div>
        <div class="form-row">
          <label for="f-proj-status">Estado</label>
          <select id="f-proj-status" name="status">
            <option value="activo" ${!p || p.status === "activo" ? "selected" : ""}>Activo</option>
            <option value="pausado" ${p && p.status === "pausado" ? "selected" : ""}>Pausado</option>
            <option value="terminado" ${p && p.status === "terminado" ? "selected" : ""}>Terminado</option>
          </select>
        </div>
      </div>
    `;
  }

  function openProjectModal(p) {
    openModal(p ? "Editar proyecto" : "Nuevo proyecto", projectFormHtml(p), (fd) => {
      const name = fd.get("name").trim();
      if (!name) return false;
      const start = fd.get("start");
      const end = fd.get("end");
      if (end < start) { toast("La fecha fin debe ser ≥ inicio"); return false; }
      const workdays = readWeekdaysFromForm(fd, "workdays");
      const data = {
        name,
        description: (fd.get("description") || "").trim(),
        start,
        end,
        status: fd.get("status") || "activo",
        workdays
      };
      if (p) {
        Object.assign(p, data);
        if (!p.missedDays) p.missedDays = {};
        toast("Proyecto actualizado");
      } else {
        const np = { id: uid(), ...data, tasks: [], missedDays: {} };
        state.projects.push(np);
        selectedProjectId = np.id;
        toast("Proyecto creado");
      }
      saveState();
      renderProyectos();
      return true;
    });
  }

  function taskFormHtml(task, project) {
    const workdays = task ? workdaysOf(task) : workdaysOf(project);
    return `
      <div class="form-grid">
        <div class="form-row">
          <label for="f-task-name">Nombre</label>
          <input id="f-task-name" name="name" required maxlength="80" value="${task ? escapeAttr(task.name) : ""}" />
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label for="f-task-start">Inicio</label>
            <input id="f-task-start" name="start" type="date" required value="${task ? task.start : (project ? project.start : today())}" />
          </div>
          <div class="form-row">
            <label for="f-task-end">Fin</label>
            <input id="f-task-end" name="end" type="date" required value="${task ? task.end : (project ? project.end : today())}" />
          </div>
        </div>
        <div class="form-row">
          <label>Días de trabajo (opcional)</label>
          ${weekdayPillsHtml("workdays", workdays)}
        </div>
      </div>
    `;
  }

  function openTaskModal(project, task) {
    openModal(task ? "Editar tarea" : "Nueva tarea", taskFormHtml(task, project), (fd) => {
      const name = fd.get("name").trim();
      if (!name) return false;
      const start = fd.get("start");
      const end = fd.get("end");
      if (end < start) { toast("La fecha fin debe ser ≥ inicio"); return false; }
      const workdays = readWeekdaysFromForm(fd, "workdays");
      if (task) {
        task.name = name; task.start = start; task.end = end; task.workdays = workdays;
        if (!task.missedDays) task.missedDays = {};
        toast("Tarea actualizada");
      } else {
        if (!project.tasks) project.tasks = [];
        project.tasks.push({ id: uid(), name, start, end, done: false, workdays, missedDays: {} });
        toast("Tarea creada");
      }
      saveState();
      renderProyectos();
      return true;
    });
  }

  function initProyectos() {
    document.getElementById("btn-new-project").addEventListener("click", () => openProjectModal(null));
    document.getElementById("btn-edit-project").addEventListener("click", () => {
      const p = state.projects.find((x) => x.id === selectedProjectId);
      if (p) openProjectModal(p);
    });
    document.getElementById("btn-delete-project").addEventListener("click", () => {
      const p = state.projects.find((x) => x.id === selectedProjectId);
      if (!p) return;
      if (!confirm(`¿Eliminar el proyecto «${p.name}»?`)) return;
      state.projects = state.projects.filter((x) => x.id !== p.id);
      selectedProjectId = state.projects[0]?.id || null;
      saveState();
      renderProyectos();
      toast("Proyecto eliminado");
    });
    document.getElementById("btn-new-task").addEventListener("click", () => {
      const p = state.projects.find((x) => x.id === selectedProjectId);
      if (p) openTaskModal(p, null);
    });
    document.getElementById("gantt-prev").addEventListener("click", () => {
      if (ganttScale === "week") ganttAnchor.setDate(ganttAnchor.getDate() - 28);
      else ganttAnchor = new Date(ganttAnchor.getFullYear(), ganttAnchor.getMonth() - 3, 1);
      renderGantt();
    });
    document.getElementById("gantt-next").addEventListener("click", () => {
      if (ganttScale === "week") ganttAnchor.setDate(ganttAnchor.getDate() + 28);
      else ganttAnchor = new Date(ganttAnchor.getFullYear(), ganttAnchor.getMonth() + 3, 1);
      renderGantt();
    });
    document.getElementById("gantt-scale").addEventListener("change", (e) => {
      ganttScale = e.target.value;
      renderGantt();
    });
  }


  // ========== SYNC (offline-first + MantleDB / local API) ==========
  function syncNamespace(id) {
    // MantleDB path-safe id
    return `${SYNC_NS_PREFIX}-${String(id).toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
  }

  function mantleUrl(id) {
    return `${MANTLE_BASE}/${syncNamespace(id)}/state`;
  }

  function localSyncUrl(id) {
    return syncApiOrigin() + "/api/sync/" + encodeURIComponent(id);
  }

  function setSyncStatus(status, detail) {
    syncStatus = status;
    if (detail) lastSyncError = detail;
    const banner = document.getElementById("sync-banner");
    const text = document.getElementById("sync-banner-text");
    const footer = document.getElementById("footer-storage");
    if (!banner || !text) return;
    banner.classList.remove("is-synced", "is-offline", "is-error", "is-pending");
    let msg = "Sin sincronización · toca aquí para emparejar iPhone y Mac";
    if (!syncId) {
      msg = "Sin sincronización · toca aquí para emparejar iPhone y Mac";
    } else if (!navigator.onLine) {
      banner.classList.add("is-offline");
      msg = "Sin conexión · cambios guardados aquí; se sincronizarán al volver";
    } else if (status === "pending") {
      banner.classList.add("is-pending");
      msg = "Sincronizando…";
    } else if (status === "synced") {
      banner.classList.add("is-synced");
      const t = new Date();
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      msg = `Sincronizado · ${hh}:${mm} · código activo`;
    } else if (status === "error") {
      banner.classList.add("is-error");
      msg = `Error de sincronización${detail ? ": " + detail : ""}`;
    } else if (syncId) {
      banner.classList.add("is-pending");
      msg = "Sincronización activa · esperando…";
    }
    text.textContent = msg;
    if (footer) {
      footer.textContent = syncId
        ? "Datos en este dispositivo + nube · respaldo descargable disponible"
        : "Datos en este dispositivo · respaldo descargable disponible";
    }
  }

  function exportStateBlob() {
    return {
      updatedAt: state.updatedAt || Date.now(),
      state: {
        seeded: !!state.seeded,
        habits: state.habits,
        habitMarks: state.habitMarks,
        categories: state.categories,
        accounts: state.accounts,
        transactions: state.transactions,
        projects: state.projects,
        loans: state.loans,
        updatedAt: state.updatedAt || Date.now()
      }
    };
  }

  function applyRemoteState(remote) {
    if (!remote || !remote.state) return false;
    const remoteAt = Number(remote.updatedAt || remote.state.updatedAt || 0);
    const localAt = Number(state.updatedAt || 0);
    if (remoteAt <= localAt) return false;
    applyRemoteLock = true;
    try {
      state = remote.state;
      if (typeof state.updatedAt !== "number") state.updatedAt = remoteAt;
      ensureState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      selectedHabitId = state.habits[0]?.id || null;
      selectedProjectId = state.projects[0]?.id || null;
      renderAll();
    } finally {
      applyRemoteLock = false;
    }
    return true;
  }

  async function pullFrom(url, headers) {
    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function pushTo(url, headers, blob) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(blob)
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j && (j.error || j.message)) msg = j.error || j.message;
      } catch (_) {}
      throw new Error(msg);
    }
    return true;
  }

  function syncApiOrigin() {
    if (SYNC_REMOTE_BASE) return SYNC_REMOTE_BASE.replace(/\/$/, "");
    return location.origin;
  }

  async function trySyncHealth() {
    try {
      const res = await fetch(syncApiOrigin() + "/api/health", { cache: "no-store" });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async function tryLocalHealth() {
    return trySyncHealth();
  }

  function normalizeMarkValue(v) {
    if (v == null || v === "") return null;
    if (typeof v === "string") {
      if (v === "done" || v === "miss" || v === "bad") return v;
      return null;
    }
    // Corrupted by old merge that spread a string into {0:"d",1:"o",...}
    if (typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
        const s = keys.sort((a, b) => Number(a) - Number(b)).map((k) => v[k]).join("");
        if (s === "done" || s === "miss" || s === "bad") return s;
      }
    }
    return null;
  }

  function repairHabitMarksIn(marks) {
    const src = marks || {};
    const out = {};
    Object.keys(src).forEach((k) => {
      const n = normalizeMarkValue(src[k]);
      if (n) out[k] = n;
    });
    return out;
  }

  function mergeHabitMarks(a, b) {
    // habitMarks are FLAT keys "habitId:YYYY-MM-DD" -> "done"|"miss"|"bad"
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((k) => {
      const bv = normalizeMarkValue(b && b[k]);
      const av = normalizeMarkValue(a && a[k]);
      const val = bv != null ? bv : av;
      if (val) out[k] = val;
    });
    return out;
  }

  function mergeById(listA, listB) {
    const map = new Map();
    (listA || []).forEach((item) => { if (item && item.id) map.set(item.id, item); });
    (listB || []).forEach((item) => {
      if (!item || !item.id) return;
      const prev = map.get(item.id);
      map.set(item.id, prev ? { ...prev, ...item } : item);
    });
    return Array.from(map.values());
  }

  /** Une datos de ambos equipos para que hábitos/proyectos no se pisen. */
  function mergeStates(local, remote) {
    const L = local || {};
    const R = remote || {};
    const merged = {
      seeded: !!(L.seeded || R.seeded),
      habits: mergeById(L.habits, R.habits),
      habitMarks: mergeHabitMarks(L.habitMarks, R.habitMarks),
      categories: {
        ingreso: Array.from(new Set([...(L.categories && L.categories.ingreso || []), ...(R.categories && R.categories.ingreso || [])])),
        gasto: Array.from(new Set([...(L.categories && L.categories.gasto || []), ...(R.categories && R.categories.gasto || [])]))
      },
      accounts: mergeById(L.accounts, R.accounts),
      transactions: mergeById(L.transactions, R.transactions),
      projects: mergeById(L.projects, R.projects).map((p) => {
        const other = (R.projects || []).find((x) => x.id === p.id) || (L.projects || []).find((x) => x.id === p.id);
        if (!other) return p;
        const base = { ...other, ...p };
        base.tasks = mergeById(other.tasks || [], p.tasks || []);
        base.missedDays = { ...(other.missedDays || {}), ...(p.missedDays || {}) };
        return base;
      }),
      loans: mergeById(L.loans, R.loans).map((loan) => {
        const left = (L.loans || []).find((x) => x.id === loan.id) || {};
        const right = (R.loans || []).find((x) => x.id === loan.id) || {};
        return { ...left, ...right, ...loan, payments: mergeById(left.payments, right.payments) };
      }),
      updatedAt: Math.max(Number(L.updatedAt || 0), Number(R.updatedAt || 0), Date.now())
    };
    // Once real MM finance exists, never resurrect demo finance from another device.
    if (merged.accounts.some((a) => a && a._fromMM)) {
      merged.accounts = merged.accounts.filter((a) => !a._seed);
      const validAccounts = new Set(merged.accounts.map((a) => a.id));
      merged.transactions = merged.transactions.filter((t) => !t._seed && validAccounts.has(t.accountId));
    }
    return merged;
  }

  async function pullRemote() {
    if (!syncId) return null;
    // Same-origin API (Cloudflare tunnel / vida-sync-server) — MantleDB is unreliable
    if (await tryLocalHealth()) {
      try {
        const data = await pullFrom(localSyncUrl(syncId), {});
        if (data) return { data, via: "local" };
      } catch (e) {
        lastSyncError = e.message || String(e);
      }
    }
    try {
      const data = await pullFrom(mantleUrl(syncId), {});
      if (data) return { data, via: "mantle" };
    } catch (e) {
      lastSyncError = e.message || String(e);
    }
    return null;
  }

  async function pushRemote(blob) {
    if (!syncId) return false;
    let err = null;
    if (await tryLocalHealth()) {
      try {
        await pushTo(localSyncUrl(syncId), {}, blob);
        return true;
      } catch (e) {
        err = e;
      }
    }
    try {
      await pushTo(mantleUrl(syncId), {}, blob);
      return true;
    } catch (e) {
      err = e;
    }
    throw err || new Error("No se pudo subir. Abre Vida con el enlace https (no archivo local).");
  }

  function schedulePush() {
    if (!syncId) return;
    clearTimeout(syncTimer);
    setSyncStatus("pending");
    syncTimer = setTimeout(() => {
      syncNow({ quiet: true }).catch(() => {});
    }, SYNC_DEBOUNCE_MS);
  }

  async function syncNow(opts) {
    const quiet = opts && opts.quiet;
    if (!syncId) return;
    if (syncInFlight) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }
    syncInFlight = true;
    setSyncStatus("pending");
    try {
      if (!(await trySyncHealth())) {
        throw new Error("Sync no disponible ahora. Tus datos están seguros en este dispositivo; usa Exportar respaldo.");
      }
      const remotePack = await pullRemote();
      const remote = remotePack && remotePack.data;
      const remoteState = remote && remote.state ? remote.state : null;
      if (remoteState) {
        const merged = mergeStates(state, remoteState);
        applyRemoteLock = true;
        try {
          state = merged;
          ensureState();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } finally {
          applyRemoteLock = false;
        }
        if (!selectedHabitId || !state.habits.some((h) => h.id === selectedHabitId)) {
          selectedHabitId = state.habits[0]?.id || null;
        }
        if (!selectedProjectId || !state.projects.some((p) => p.id === selectedProjectId)) {
          selectedProjectId = state.projects[0]?.id || null;
        }
        renderAll();
      } else {
        state.updatedAt = Date.now();
        saveState();
      }
      await pushRemote(exportStateBlob());
      setSyncStatus("synced");
      if (!quiet) toast("Hábitos y datos sincronizados");
    } catch (e) {
      setSyncStatus("error", e.message || String(e));
      if (!quiet) toast("Error al sincronizar: " + (e.message || e));
    } finally {
      syncInFlight = false;
    }
  }

  async function createSyncCode() {
    const id = shortSyncCode();
    syncId = id;
    localStorage.setItem(SYNC_ID_KEY, id);
    state.updatedAt = Date.now();
    saveState(); // will schedule push
    setSyncStatus("pending");
    updateSyncModal();
    try {
      await pushRemote(exportStateBlob());
      setSyncStatus("synced");
      toast("Código creado. Cópialo en tu otro dispositivo.");
    } catch (e) {
      setSyncStatus("error", e.message || String(e));
      toast("Código creado en este dispositivo, pero falló la subida a la nube");
    }
    updateSyncModal();
  }

  async function connectSyncCode(raw) {
    const id = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!/^[a-z0-9-]{6,80}$/.test(id)) {
      toast("Código inválido. Pega el código completo del otro equipo.");
      return false;
    }
    syncId = id;
    localStorage.setItem(SYNC_ID_KEY, id);
    setSyncStatus("pending");
    updateSyncModal();
    try {
      const remotePack = await pullRemote();
      if (remotePack && remotePack.data && remotePack.data.state) {
        const merged = mergeStates(state, remotePack.data.state);
        applyRemoteLock = true;
        try {
          state = merged;
          ensureState();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } finally {
          applyRemoteLock = false;
        }
        selectedHabitId = state.habits[0]?.id || null;
        selectedProjectId = state.projects[0]?.id || null;
        renderAll();
      }
      await pushRemote(exportStateBlob());
      setSyncStatus("synced");
      toast("Dispositivos conectados · hábitos unidos");
      updateSyncModal();
      return true;
    } catch (e) {
      setSyncStatus("error", e.message || String(e));
      toast("No se pudo conectar: " + (e.message || e));
      updateSyncModal();
      return false;
    }
  }

  function disconnectSync(opts) {
    const ask = !opts || opts.confirm !== false;
    if (ask && !confirm("¿Desconectar este código? Los datos de este equipo se quedan aquí; luego puedes pegar el código del otro.")) return;
    syncId = null;
    localStorage.removeItem(SYNC_ID_KEY);
    clearTimeout(syncTimer);
    setSyncStatus("idle");
    updateSyncModal();
    const input = document.getElementById("sync-code-input");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 50);
    }
    toast("Listo: ahora pega el código del otro equipo");
  }

  function updateSyncModal() {
    const noCode = document.getElementById("sync-no-code");
    const hasCode = document.getElementById("sync-has-code");
    if (!noCode || !hasCode) return;
    if (syncId) {
      noCode.classList.add("hidden");
      hasCode.classList.remove("hidden");
      const disp = document.getElementById("sync-code-display");
      if (disp) {
        disp.value = syncId;
        try { disp.focus(); disp.select(); } catch (_) {}
      }
    } else {
      hasCode.classList.add("hidden");
      noCode.classList.remove("hidden");
    }
  }

  function openSyncModal() {
    updateSyncModal();
    document.getElementById("sync-modal").classList.remove("hidden");
  }

  function closeSyncModal() {
    document.getElementById("sync-modal").classList.add("hidden");
  }

  function initSyncUI() {
    const btn = document.getElementById("btn-sync");
    if (btn) btn.addEventListener("click", openSyncModal);
    const banner = document.getElementById("sync-banner");
    if (banner) banner.addEventListener("click", openSyncModal);
    document.querySelectorAll("[data-sync-close]").forEach((el) => {
      el.addEventListener("click", closeSyncModal);
    });
    document.getElementById("btn-sync-create")?.addEventListener("click", () => {
      createSyncCode();
    });
    document.getElementById("btn-sync-connect")?.addEventListener("click", async () => {
      const v = document.getElementById("sync-code-input")?.value || "";
      await connectSyncCode(v);
    });
    document.getElementById("sync-code-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-sync-connect")?.click();
      }
    });
    document.getElementById("btn-sync-copy")?.addEventListener("click", async () => {
      if (!syncId) return;
      const disp = document.getElementById("sync-code-display");
      try {
        await navigator.clipboard.writeText(syncId);
        toast("Código copiado. En el otro equipo: pegar y Conectar");
      } catch (_) {
        if (disp) {
          disp.removeAttribute("readonly");
          disp.select();
          disp.setSelectionRange(0, syncId.length);
          document.execCommand("copy");
          disp.setAttribute("readonly", "readonly");
          toast("Código seleccionado: cópialo con Copiar del menú");
        }
      }
    });
    document.getElementById("sync-code-display")?.addEventListener("click", (e) => {
      e.target.select();
    });
    document.getElementById("btn-sync-now")?.addEventListener("click", () => syncNow({ quiet: false }));
    document.getElementById("btn-sync-disconnect")?.addEventListener("click", () => disconnectSync({ confirm: false }));

    window.addEventListener("online", () => {
      setSyncStatus(syncId ? "pending" : "idle");
      if (syncId) syncNow({ quiet: true });
    });
    window.addEventListener("offline", () => setSyncStatus("offline"));
    window.addEventListener("focus", () => {
      if (syncId && navigator.onLine) syncNow({ quiet: true });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && syncId && navigator.onLine) {
        syncNow({ quiet: true });
      }
    });

    if (syncId) {
      setSyncStatus(navigator.onLine ? "pending" : "offline");
      if (navigator.onLine) syncNow({ quiet: true });
    } else {
      setSyncStatus("idle");
    }
  }


  // ---------- Imports / backups ----------
  function mergeUniqueCategories(base, incoming) {
    return {
      ingreso: Array.from(new Set([...(base?.ingreso || []), ...(incoming?.ingreso || [])])),
      gasto: Array.from(new Set([...(base?.gasto || []), ...(incoming?.gasto || [])]))
    };
  }

  function applyMoneyManagerPayload(payload) {
    if (!payload || !Array.isArray(payload.accounts) || !Array.isArray(payload.transactions)) {
      throw new Error("El archivo de Money Manager no tiene el formato esperado");
    }
    // Idempotent: replace an earlier MM import and remove demo finance, keep user-created finance.
    state.accounts = state.accounts.filter((item) => !item._seed && !item._fromMM);
    state.transactions = state.transactions.filter((item) => !item._seed && !item._fromMM);
    state.loans = (state.loans || []).filter((item) => !item._fromMM);
    state.accounts = mergeById(state.accounts, payload.accounts);
    state.transactions = mergeById(state.transactions, payload.transactions);
    state.loans = mergeById(state.loans, payload.loans || []);
    const seedIng = new Set(DEFAULT_CATEGORIES.ingreso);
    const seedGas = new Set(DEFAULT_CATEGORIES.gasto);
    const mmCats = payload.categories || {};
    const kept = {
      ingreso: (state.categories?.ingreso || []).filter((c) => !seedIng.has(c) || (mmCats.ingreso || []).includes(c)),
      gasto: (state.categories?.gasto || []).filter((c) => !seedGas.has(c) || (mmCats.gasto || []).includes(c))
    };
    state.categories = mergeUniqueCategories(kept, mmCats);
    state.seeded = false;
    state.updatedAt = Date.now();
    saveState();
    localStorage.removeItem(SEED_FLAG);
    renderFinanzas();
  }

  async function importMoneyManager() {
    if (!confirm("¿Importar todas las cuentas, categorías y 91 movimientos de Money Manager? Se quitarán solo las finanzas de ejemplo y una importación MM anterior.")) return;
    const button = document.getElementById("btn-import-mm");
    if (button) button.disabled = true;
    try {
      const res = await fetch("./data/mm-import.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      applyMoneyManagerPayload(payload);
      toast(`${payload.accounts.length} cuentas y ${payload.transactions.length} movimientos importados`);
    } catch (error) {
      toast("No se pudo importar Money Manager: " + (error.message || error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function exportBackup() {
    const backup = {
      format: "vida-backup-v1",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      syncId: syncId || null,
      state: JSON.parse(JSON.stringify(state))
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vida-respaldo-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Respaldo completo descargado");
  }

  async function importBackupFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed && parsed.state ? parsed.state : parsed;
      if (!incoming || typeof incoming !== "object") throw new Error("JSON inválido");
      if (!confirm("¿Importar este respaldo y unirlo con los datos actuales? No se borrarán hábitos, movimientos ni proyectos existentes.")) return;
      const merged = mergeStates(state, incoming);
      merged.updatedAt = Date.now();
      state = merged;
      ensureState();
      if (!syncId && parsed.syncId && /^[a-z0-9-]{6,80}$/i.test(parsed.syncId)) {
        syncId = String(parsed.syncId).toLowerCase();
        localStorage.setItem(SYNC_ID_KEY, syncId);
      }
      saveState();
      selectedHabitId = state.habits[0]?.id || null;
      selectedProjectId = state.projects[0]?.id || null;
      renderAll();
      updateSyncModal();
      toast("Respaldo importado y unido correctamente");
    } catch (error) {
      toast("No se pudo importar el respaldo: " + (error.message || error));
    }
  }

  function initBackupUI() {
    document.getElementById("btn-export-backup")?.addEventListener("click", exportBackup);
    const input = document.getElementById("backup-file-input");
    document.getElementById("btn-import-backup")?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", async () => {
      await importBackupFile(input.files && input.files[0]);
      input.value = "";
    });
  }

  // ---------- Utils ----------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) { return escapeHtml(s); }


  async function importMoneyManagerBundle(opts) {
    const quiet = opts && opts.quiet;
    try {
      const res = await fetch("./data/mm-import.json?ts=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("No se encontró el respaldo importado");
      const pack = await res.json();
      const incoming = pack.state || pack;
      if (!incoming.accounts && !incoming.transactions) throw new Error("Archivo inválido");
      // Keep habits/projects; replace finance from MM
      state.accounts = (incoming.accounts || []).map((a) => ({ ...a, _fromMM: true }));
      state.transactions = (incoming.transactions || []).map((t) => ({ ...t, _fromMM: true }));
      if (incoming.categories) state.categories = incoming.categories;
      if (Array.isArray(incoming.loans)) state.loans = incoming.loans;
      state.updatedAt = Date.now();
      ensureState();
      saveState();
      renderAll();
      if (!quiet) toast("Cuentas y movimientos de Money Manager importados");
      return true;
    } catch (e) {
      if (!quiet) toast("No se pudo importar: " + (e.message || e));
      return false;
    }
  }

  function wipeSeed() {
    if (!confirm("¿Borrar solo los datos de ejemplo? Tus registros propios se conservan.")) return;
    state.habits = state.habits.filter((h) => !h._seed);
    state.transactions = state.transactions.filter((t) => !t._seed);
    state.projects = state.projects.filter((p) => !p._seed);
    const removedAccIds = new Set(state.accounts.filter((a) => a._seed).map((a) => a.id));
    state.accounts = state.accounts.filter((a) => !a._seed);
    if (!state.accounts.length) {
      defaultEfectivoAccount();
    }
    const fallbackId = defaultEfectivoAccount().id;
    state.transactions.forEach((t) => {
      if (removedAccIds.has(t.accountId) || !state.accounts.some((a) => a.id === t.accountId)) {
        t.accountId = fallbackId;
      }
    });
    // clean marks for removed habits
    const ids = new Set(state.habits.map((h) => h.id));
    Object.keys(state.habitMarks).forEach((k) => {
      const hid = k.split(":")[0];
      if (!ids.has(hid)) delete state.habitMarks[k];
    });
    state.seeded = false;
    saveState();
    localStorage.removeItem(SEED_FLAG);
    selectedHabitId = state.habits[0]?.id || null;
    selectedProjectId = state.projects[0]?.id || null;
    renderAll();
    toast("Datos de ejemplo eliminados");
  }

  function renderAll() {
    renderHabitos();
    renderFinanzas();
    renderProyectos();
  }

  // ---------- Install banner (Apple + general) ----------
  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    return { isIOS, isMac, isSafari, isStandalone };
  }

  function setupInstallBanner() {
    const plat = detectPlatform();
    if (plat.isStandalone) return;
    if (sessionStorage.getItem("vida-hide-install") === "1") return;

    const banner = document.createElement("div");
    banner.id = "install-banner";
    banner.className = "install-banner";
    let tip = "";
    if (plat.isIOS) {
      tip = `<strong>Instalar en iPhone / iPad:</strong> toca <strong>Compartir</strong> (□↑) → <strong>Agregar a pantalla de inicio</strong>. Funciona sin internet después.`;
    } else if (plat.isMac) {
      tip = `<strong>Instalar en Mac:</strong> en Safari usa <em>Archivo → Agregar al Dock</em>; en Chrome: menú <em>⋮ → Guardar e instalar aplicación</em> (o el ícono ⊕ en la barra).`;
    } else {
      tip = `<strong>Instalar Vida:</strong> usa el menú del navegador para «Instalar aplicación» o «Agregar a la pantalla de inicio». Requiere HTTPS (o localhost).`;
    }
    banner.innerHTML = `
      <p>${tip}</p>
      <div class="banner-actions">
        <button type="button" class="btn-primary btn-sm" id="btn-install-pwa" hidden>Instalar</button>
        <button type="button" class="btn-ghost btn-sm" id="btn-dismiss-install">Entendido</button>
      </div>
    `;
    const header = document.querySelector(".app-header");
    header.insertAdjacentElement("afterend", banner);

    document.getElementById("btn-dismiss-install").addEventListener("click", () => {
      sessionStorage.setItem("vida-hide-install", "1");
      banner.remove();
    });

    let deferredPrompt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = document.getElementById("btn-install-pwa");
      if (btn) {
        btn.hidden = false;
        btn.addEventListener("click", async () => {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          btn.hidden = true;
        });
      }
    });
  }

  // ---------- Service worker ----------

  async function clearAppCaches() {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  async function updateAppFromInside() {
    const btn = document.getElementById("btn-update-app");
    const btn2 = document.getElementById("btn-update-app-footer");
    const setBusy = (busy) => {
      [btn, btn2].forEach((b) => {
        if (!b) return;
        b.disabled = busy;
        b.textContent = busy ? "Actualizando…" : (b.id === "btn-update-app-footer" ? "Actualizar app" : "Actualizar app");
      });
    };
    setBusy(true);
    toast("Buscando actualización…");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          try { await reg.update(); } catch (_) {}
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          if (reg.active) {
            reg.active.postMessage({ type: "CLEAR_CACHE" });
          }
        }
      }
      await clearAppCaches();
      // Small delay so SW can claim
      await new Promise((r) => setTimeout(r, 400));
      toast("App actualizada. Recargando…");
      const url = new URL(location.href);
      url.searchParams.set("v", APP_VERSION + "-" + Date.now());
      location.replace(url.toString());
    } catch (e) {
      setBusy(false);
      toast("No se pudo actualizar: " + (e.message || e));
    }
  }

  async function checkForAppUpdate() {
    const label = document.getElementById("app-version-label");
    if (label) label.textContent = "v" + APP_VERSION;
    let banner = document.getElementById("update-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "update-banner";
      banner.className = "update-banner";
      banner.innerHTML = '<span>Hay una versión nueva de Vida.</span><button type="button" class="btn-primary btn-sm" id="btn-update-banner">Actualizar ahora</button>';
      const header = document.querySelector(".app-header");
      if (header && header.parentNode) {
        header.parentNode.insertBefore(banner, header.nextSibling);
      }
      banner.querySelector("#btn-update-banner")?.addEventListener("click", updateAppFromInside);
    }
    if (!navigator.onLine) return;
    try {
      const res = await fetch("./version.json?ts=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.version && data.version !== APP_VERSION) {
        banner.classList.add("is-visible");
      } else {
        banner.classList.remove("is-visible");
      }
    } catch (_) {}
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        /* new SW took over — optional soft hint */
      });
      navigator.serviceWorker.register("./sw.js").then((reg) => {
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              const banner = document.getElementById("update-banner");
              if (banner) banner.classList.add("is-visible");
            }
          });
        });
      }).catch((err) => {
        console.warn("SW no registrado:", err);
      });
    });
  }

  // ---------- Boot ----------
  function initModal() {
    const modal = document.getElementById("modal");
    modal.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });
    document.getElementById("modal-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!modalOnSubmit) return;
      const fd = new FormData(e.target);
      const ok = modalOnSubmit(fd);
      if (ok !== false) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
    });
  }

  function boot() {
    ensureState();
    initTabs();
    initModal();
    initHabitos();
    initFinanzas();
    initProyectos();
    initSyncUI();
    initBackupUI();
    document.getElementById("btn-wipe-seed").addEventListener("click", wipeSeed);
    document.getElementById("btn-import-mm")?.addEventListener("click", () => importMoneyManagerBundle({ quiet: false }));
    document.getElementById("btn-import-mm-footer")?.addEventListener("click", () => importMoneyManagerBundle({ quiet: false }));
    document.getElementById("btn-update-app")?.addEventListener("click", updateAppFromInside);
    document.getElementById("btn-update-app-footer")?.addEventListener("click", updateAppFromInside);
    checkForAppUpdate();
    setInterval(checkForAppUpdate, 5 * 60 * 1000);
    renderAll();
    setupInstallBanner();
    registerSW();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
