/* Vida — hábitos, finanzas y proyectos (es-MX) */
(function () {
  "use strict";

  const APP_VERSION = "1.12.52";
  // Remote sync API (used when the app is on GitHub Pages / static host)
  const _savedSyncBase = localStorage.getItem("vida-sync-base");
  const SYNC_REMOTE_BASE = (
    _savedSyncBase && /trycloudflare\.com/i.test(_savedSyncBase)
      ? (localStorage.removeItem("vida-sync-base"), "https://vida-sync.khb2jtkgtz.workers.dev")
      : (_savedSyncBase || "https://vida-sync.khb2jtkgtz.workers.dev")
  );

  const STORAGE_KEY = "vida-app-v1";
  const SEED_FLAG = "vida-seed-present";
  const SYNC_ID_KEY = "vida-sync-id";
  const SYNC_NS_PREFIX = "vida"; // MantleDB namespace: vida-<syncId>
  const MANTLE_BASE = "https://mantledb.sh/v2";
  const SYNC_DEBOUNCE_MS = 1500;


  const THEME_KEY = "vida-theme";

  function getTheme() {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : "dark";
    } catch (_) {
      return "dark";
    }
  }

  function applyTheme(t) {
    const theme = t === "light" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#000000");
    const btn = document.getElementById("btn-theme");
    if (btn) {
      btn.textContent = theme === "light" ? "☀ Claro" : "☾ Oscuro";
      btn.title = theme === "light" ? "Cambiar a fondo negro" : "Cambiar a fondo blanco";
    }
    const more = document.getElementById("btn-theme-more");
    if (more) {
      more.textContent = theme === "light" ? "Fondo: Blanco ↔ Negro" : "Fondo: Negro ↔ Blanco";
    }
  }

  function toggleTheme() {
    const next = getTheme() === "light" ? "dark" : "light";
    applyTheme(next);
    toast(next === "light" ? "Fondo blanco" : "Fondo negro");
  }


  const HABIT_COLORS = [
    "#f5f5f5", "#d4d4d4", "#a3a3a3", "#737373",
    "#525252", "#404040", "#262626", "#ffffff"
  ];
  const DEFAULT_GRAY = "#a3a3a3";

  const DEFAULT_CATEGORIES = {
    ingreso: ["Salario", "Freelance", "Ventas", "Inversiones", "Otros ingresos"],
    gasto: ["Comida", "Transporte", "Renta", "Servicios", "Salud", "Entretenimiento", "Educación", "Compras", "Otros gastos"]
  };

  const ACCOUNT_TYPES = [
    { id: "efectivo", label: "Efectivo", icon: "💵" },
    { id: "debito", label: "Débito/Banco", icon: "🏦" },
    { id: "credito", label: "Crédito", icon: "💳" },
    { id: "deuda", label: "Préstamo / debo", icon: "🤝" },
    { id: "ahorros", label: "Ahorros", icon: "🐷" },
    { id: "inversion", label: "Inversión", icon: "📈" },
    { id: "otro", label: "Otro", icon: "📁" }
  ];

  const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Débito", "Crédito", "SPEI", "Otro"];

  const MONTHS_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  /** Presets MX para chips al crear/editar cuenta (llenan nombre + tipo + color). */
  const INSTITUTION_PRESETS = [
    { group: "Efectivo", name: "Efectivo", type: "efectivo", color: "#3ecf8e", icon: "💵" },
    { group: "Bancos", name: "Santander", type: "debito", color: "#f5f5f5", icon: "🏦" },
    { group: "Bancos", name: "BBVA", type: "debito", color: "#004481", icon: "🏦" },
    { group: "Bancos", name: "Banorte", type: "debito", color: "#a3a3a3", icon: "🏦" },
    { group: "Bancos", name: "HSBC", type: "debito", color: "#db0011", icon: "🏦" },
    { group: "Bancos", name: "Scotiabank", type: "debito", color: "#ec111a", icon: "🏦" },
    { group: "Bancos", name: "Citibanamex", type: "debito", color: "#056dae", icon: "🏦" },
    { group: "Bancos", name: "Nu", type: "debito", color: "#a3a3a3", icon: "💜" },
    { group: "Bancos", name: "Hey Banco", type: "debito", color: "#d4d4d4", icon: "🏦" },
    { group: "Tarjetas", name: "Amex", type: "credito", color: "#e5e5e5", icon: "💳" },
    { group: "Tarjetas", name: "Like U", type: "credito", color: "#737373", icon: "💳" },
    { group: "Tarjetas", name: "Hey Banco", type: "credito", color: "#d4d4d4", icon: "💳" },
    { group: "Tarjetas", name: "Santander Free", type: "credito", color: "#f5f5f5", icon: "💳" },
    { group: "Tarjetas", name: "BBVA Aqua", type: "credito", color: "#d4d4d4", icon: "💳" },
    { group: "Tarjetas", name: "Nu tarjeta", type: "credito", color: "#a3a3a3", icon: "💳" },
    { group: "Tarjetas", name: "Banorte Clásica", type: "credito", color: "#a3a3a3", icon: "💳" },
    { group: "Préstamos que debo", name: "Préstamo en efectivo", type: "deuda", color: "#f59e0b", icon: "🤝" },
    { group: "Préstamos que debo", name: "Préstamo bancario", type: "deuda", color: "#ea580c", icon: "🏦" },
    { group: "Préstamos que debo", name: "Santander préstamo", type: "deuda", color: "#f5f5f5", icon: "🏦" },
    { group: "Préstamos que debo", name: "BBVA préstamo", type: "deuda", color: "#004481", icon: "🏦" },
    { group: "Préstamos que debo", name: "Hey préstamo", type: "deuda", color: "#d4d4d4", icon: "🏦" },
    { group: "Préstamos que debo", name: "Nu préstamo", type: "deuda", color: "#a3a3a3", icon: "💜" }
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
        { id: aSantander, name: "Santander", type: "debito", color: "#f5f5f5", icon: "🏦", openingBalance: 12000, institution: "Santander", _seed: true },
        { id: aAmex, name: "Amex", type: "credito", color: "#e5e5e5", icon: "💳", openingBalance: 0, institution: "Amex", creditLimit: 25000, cutoffDay: seedCutoffDay, paymentDueDay: seedPayDay, _seed: true }
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
    if (!state.deleted || typeof state.deleted !== "object") state.deleted = {};
    ["habits", "projects", "accounts", "transactions", "loans", "tasks"].forEach((k) => {
      if (!state.deleted[k] || typeof state.deleted[k] !== "object") state.deleted[k] = {};
    });
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


  function toGrayscaleHex(hex) {
    if (!hex || typeof hex !== "string") return "#a3a3a3";
    let h = hex.trim();
    if (h[0] === "#") h = h.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return "#a3a3a3";
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // Perceived luminance — if already near gray keep; else map to gray ladder
    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const ladder = [245, 212, 163, 115, 82, 64, 38, 255];
    let best = ladder[0];
    let bestD = 999;
    ladder.forEach((v) => {
      const d = Math.abs(v - lum);
      if (d < bestD) { bestD = d; best = v; }
    });
    const hx = best.toString(16).padStart(2, "0");
    return "#" + hx + hx + hx;
  }

  function migrateColorsToMono() {
    let changed = false;
    (state.accounts || []).forEach((a) => {
      if (!a.color) return;
      const mono = toGrayscaleHex(a.color);
      if (mono.toLowerCase() !== String(a.color).toLowerCase()) {
        a.color = mono;
        changed = true;
      }
    });
    (state.habits || []).forEach((h) => {
      if (!h.color) return;
      const mono = toGrayscaleHex(h.color);
      if (mono.toLowerCase() !== String(h.color).toLowerCase()) {
        h.color = mono;
        changed = true;
      }
    });
    if (changed && !applyRemoteLock) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    }
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
      if (!a.color) { a.color = DEFAULT_GRAY; changed = true; }
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
      if (a.amountDue === undefined) { a.amountDue = null; changed = true; }
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


  /** Lunes–domingo containing date (Mexico week). Returns ISO {start, end}. */
  function weekRangeContaining(date) {
    const d = date instanceof Date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : parseISO(String(date).slice(0, 10));
    const mon0 = dowMon0(d);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mon0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: isoDate(start), end: isoDate(end) };
  }


  /** Progress over the habit's period (start→end), not the week.
   *  Meta % = días cumplidos / días programados en todo el periodo.
   *  If no endDate, uses Dec 31 of the start year (or current year). */
  function habitPeriodProgress(habit) {
    if (!habit) return { done: 0, miss: 0, bad: 0, scheduled: 0, pct: 0, met: false, start: null, end: null };
    const tStr = today();
    let start = habit.startDate || null;
    let end = habit.endDate || null;
    if (!start && !end) {
      // Indefinido: use current year Jan 1 → Dec 31
      const y = new Date().getFullYear();
      start = y + "-01-01";
      end = y + "-12-31";
    } else if (!start) {
      start = tStr;
    } else if (!end) {
      const y = Number(String(start).slice(0, 4)) || new Date().getFullYear();
      end = y + "-12-31";
    }
    let done = 0, miss = 0, bad = 0, scheduled = 0;
    const cursor = parseISO(start);
    const endD = parseISO(end);
    let guard = 0;
    while (cursor.getTime() <= endD.getTime() && guard++ < 800) {
      const ds = isoDate(cursor);
      if (isHabitScheduled(habit, ds)) {
        scheduled++;
        const mark = getMark(habit.id, ds);
        if (mark === "done") done++;
        else if (mark === "miss") miss++;
        else if (mark === "bad") bad++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const success = habit.type === "mal" ? miss : done;
    const fail = habit.type === "mal" ? bad : miss;
    const pct = scheduled > 0 ? Math.min(100, Math.round((success / scheduled) * 100)) : 0;
    const met = scheduled > 0 && success >= scheduled;
    return { done: success, miss: fail, bad, scheduled, pct, met, start, end, rawDone: done, rawMiss: miss };
  }

  /** Progress toward weekly goal (or weekday count) in current week. */
  function habitWeekProgress(habit, refDate) {
    const ref = refDate ? (refDate instanceof Date ? refDate : parseISO(String(refDate).slice(0, 10))) : new Date();
    const { start, end } = weekRangeContaining(ref);
    const wd = habitWeekdays(habit);
    let goal = Number(habit && habit.weeklyGoal);
    if (!Number.isFinite(goal) || goal < 1) goal = 0;
    let scheduledInWeek = 0;
    let done = 0;
    const cursor = parseISO(start);
    const endD = parseISO(end);
    while (cursor.getTime() <= endD.getTime()) {
      const ds = isoDate(cursor);
      if (isHabitScheduled(habit, ds)) {
        scheduledInWeek++;
        const mark = getMark(habit.id, ds);
        if (isStreakSuccess(habit, mark)) done++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (!goal) goal = scheduledInWeek || wd.length;
    const met = goal > 0 && done >= goal;
    return { done, goal, met, start, end };
  }

  function normalizeWeeklyGoal(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(7, Math.max(1, Math.round(n)));
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

  function missedTombKey(entityId, dateStr) {
    return String(entityId || "") + ":" + String(dateStr || "");
  }

  function toggleMissedDay(bag, dateStr, entityId) {
    if (!bag || typeof bag !== "object") return;
    const tomb = missedTombKey(entityId, dateStr);
    if (bag[dateStr]) {
      delete bag[dateStr];
      if (entityId) markDeleted("missedDays", tomb);
    } else {
      bag[dateStr] = true;
      if (entityId && state.deleted && state.deleted.missedDays && state.deleted.missedDays[tomb]) {
        delete state.deleted.missedDays[tomb];
      }
    }
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

  function accountTxNet(accountId) {
    let net = 0;
    state.transactions.forEach((tx) => {
      if (tx.accountId !== accountId) return;
      const amt = Number(tx.amount) || 0;
      if (tx.type === "ingreso") net += amt;
      else net -= amt;
    });
    return net;
  }

  /** Para crédito: openingBalance tal que la deuda (abs bal si neg) = desiredDebt. */
  function openingBalanceForCreditDebt(accountId, desiredDebt) {
    const want = Math.max(0, Number(desiredDebt) || 0);
    const txNet = accountId ? accountTxNet(accountId) : 0;
    return Math.round((-want - txNet) * 100) / 100;
  }

  /** Saldo deseado en cuenta normal (efectivo/banco): opening + txNet = desired. */
  function openingBalanceForTarget(accountId, desiredBalance) {
    const want = Number(desiredBalance) || 0;
    const txNet = accountId ? accountTxNet(accountId) : 0;
    return Math.round((want - txNet) * 100) / 100;
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

  /** Efectivo, bancos, ahorros, etc. (sin tarjetas ni préstamos que debes). */
  function totalAvailableMoney() {
    return state.accounts.reduce((sum, a) => {
      if (isOwedAccountType(a)) return sum;
      return sum + accountBalance(a.id);
    }, 0);
  }

  function owedAccountsSorted() {
    return state.accounts
      .filter((a) => isOwedAccountType(a) && creditDebtAmount(a) > 0)
      .map((a) => ({ acc: a, debt: creditDebtAmount(a), due: a.type === "credito" ? creditAmountDue(a) : null }))
      .sort((x, y) => y.debt - x.debt);
  }

  /**
   * Neto real: dinero en cuentas + lo que te deben − lo que debes
   * (tarjetas y préstamos). Los abonos bajan deuda; los cobros bajan
   * "te deben" y suben la cuenta destino.
   */
  /** Patrimonio sin deuda = (cuentas + te deben) − tarjetas − préstamos que debo. */
  function netWorth() {
    return totalAvailableMoney() + totalLoanOutstanding() - totalCreditDebt();
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

  /** Tarjeta de crédito o préstamo/deuda que tú debes. */
  function isOwedAccountType(typeOrAcc) {
    const t = typeof typeOrAcc === "string" ? typeOrAcc : (typeOrAcc && typeOrAcc.type);
    return t === "credito" || t === "deuda";
  }

  /** Deuda de tarjeta o préstamo: gastos bajan el saldo; saldo negativo = debe. */

  /** Monto a pagar indicado en la tarjeta (corte/vencido); si no hay, null. */
  function creditAmountDue(accOrId) {
    const acc = typeof accOrId === "string" ? accountById(accOrId) : accOrId;
    if (!acc || acc.type !== "credito") return null;
    const n = Number(acc.amountDue);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
    return null;
  }

  function creditDebtAmount(accOrId) {
    const acc = typeof accOrId === "string" ? accountById(accOrId) : accOrId;
    if (!acc || !isOwedAccountType(acc)) return 0;
    const bal = accountBalance(acc.id);
    return bal < 0 ? Math.abs(bal) : 0;
  }

  /** Suma de lo que debes: tarjetas + préstamos/préstamos. */
  function totalCreditDebt() {
    return state.accounts.reduce((sum, a) => {
      if (!isOwedAccountType(a)) return sum;
      return sum + creditDebtAmount(a);
    }, 0);
  }


  /**
   * Fecha de pago del estado abierto: último corte ≤ hoy, luego el primer
   * día de pago estrictamente posterior al corte.
   * Ej. corte 11 + pago 2 → tras el 11 sep, vence el 2 oct (no el 2 sep).
   */
  function creditCycleDueDate(from, cutDay, payDay) {
    const today = startOfLocalDay(from);
    let cut = new Date(today.getFullYear(), today.getMonth(), cutDay);
    if (cut.getTime() > today.getTime()) {
      cut = new Date(today.getFullYear(), today.getMonth() - 1, cutDay);
    }
    let due = new Date(cut.getFullYear(), cut.getMonth(), payDay);
    if (due.getTime() <= cut.getTime()) {
      due = new Date(cut.getFullYear(), cut.getMonth() + 1, payDay);
    }
    return startOfLocalDay(due);
  }

  /**
   * Fecha de pago / vencimiento.
   * - "Cantidad a pagar" > 0 → hay corte pendiente: puede ir vencido o pronto.
   * - Cantidad vacía/0 → este corte ya está saldado: solo muestra el próximo
   *   ciclo (sin urgencia), aunque siga habiendo deuda revolvente.
   * - Con día de corte + día de pago: ciclo real (corte 11 → pago 2 oct).
   * - Sin corte: próxima fecha futura del día de pago (no marca vencido el
   *   día pasado de este mes; hace falta el corte para eso).
   */
  function creditPaymentInfo(acc, from = new Date()) {
    if (!acc || acc.type !== "credito") return null;
    const today = startOfLocalDay(from);
    const dueDay = clampDayOfMonth(acc.paymentDueDay);
    const cutDay = clampDayOfMonth(acc.cutoffDay);
    const debt = creditDebtAmount(acc);
    const amountDue = Number(acc.amountDue) || 0;
    const statementPending = amountDue > 0;
    let dueDate = null;
    let overdue = false;

    if (dueDay != null && cutDay != null) {
      const cycleDue = creditCycleDueDate(today, cutDay, dueDay);
      if (statementPending) {
        dueDate = cycleDue;
        overdue = today.getTime() > cycleDue.getTime();
      } else {
        // Corte saldado: si la fecha del ciclo aún no llega, esa es la referencia;
        // si ya pasó, el siguiente ciclo (pago tras el próximo corte).
        if (today.getTime() <= cycleDue.getTime()) {
          dueDate = cycleDue;
        } else {
          let nextCut = new Date(today.getFullYear(), today.getMonth(), cutDay);
          if (nextCut.getTime() <= today.getTime()) {
            nextCut = new Date(today.getFullYear(), today.getMonth() + 1, cutDay);
          }
          let due = new Date(nextCut.getFullYear(), nextCut.getMonth(), dueDay);
          if (due.getTime() <= nextCut.getTime()) {
            due = new Date(nextCut.getFullYear(), nextCut.getMonth() + 1, dueDay);
          }
          dueDate = startOfLocalDay(due);
        }
        overdue = false;
      }
    } else if (dueDay != null) {
      // Sin corte: no inventar "vencido el 2 sep"; ir a la próxima fecha futura.
      let candidate = new Date(today.getFullYear(), today.getMonth(), dueDay);
      if (candidate.getTime() < today.getTime()) {
        candidate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
      }
      dueDate = startOfLocalDay(candidate);
      overdue = false;
    } else if (acc.nextPaymentDate) {
      const parsed = parseISO(String(acc.nextPaymentDate));
      if (!isNaN(parsed.getTime())) {
        dueDate = startOfLocalDay(parsed);
        if (dueDate.getTime() < today.getTime()) {
          if (statementPending) {
            overdue = true;
          } else {
            const d = Math.min(28, dueDate.getDate());
            const rolled = new Date(today.getFullYear(), today.getMonth(), d);
            dueDate = rolled.getTime() >= today.getTime()
              ? rolled
              : new Date(today.getFullYear(), today.getMonth() + 1, d);
            overdue = false;
          }
        }
      }
    }

    if (!dueDate) return null;
    const daysLeft = daysBetween(today, dueDate);
    return { dueDate, daysLeft, overdue, debt, statementPending };
  }


  function normalizePayUrl(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    return "https://" + s;
  }

  /** Enlace para pagar: el de la cuenta, o uno típico según el banco/tarjeta. */
  function accountPayUrl(acc) {
    if (!acc) return null;
    const custom = normalizePayUrl(acc.payUrl);
    if (custom) return custom;
    const key = ((acc.institution || "") + " " + (acc.name || "")).toLowerCase();
    const presets = [
      { re: /amex|american\s*express/, url: "https://www.americanexpress.com.mx/" },
      { re: /like\s*u|liverpool/, url: "https://www.liverpool.com.mx/tienda/home" },
      { re: /hey/, url: "https://www.hey.inc/" },
      { re: /santander/, url: "https://www.santander.com.mx/" },
      { re: /\bbbva\b|aqua/, url: "https://www.bbva.mx/" },
      { re: /\bnu\b/, url: "https://nu.com.mx/" },
      { re: /banorte/, url: "https://www.banorte.com/" },
      { re: /banregio/, url: "https://www.banregio.com/" },
      { re: /citibanamex|banamex/, url: "https://www.banamex.com/" },
      { re: /hsbc/, url: "https://www.hsbc.com.mx/" }
    ];
    for (const p of presets) {
      if (p.re.test(key)) return p.url;
    }
    return null;
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
    if (!info.statementPending) {
      if (info.daysLeft <= 0) return `Corte saldado · próximo ${when}`;
      if (info.daysLeft === 1) return `Corte saldado · próximo ${when} (mañana)`;
      return `Corte saldado · próximo ${when}`;
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

  /** Restore Guardar/Cancelar footer (confirmAction used to leave display:none stuck). */
  function resetModalChrome() {
    const modal = document.getElementById("modal");
    if (!modal) return;
    modal.classList.remove("modal--confirm");
    const footer = modal.querySelector(".modal-footer");
    if (footer) {
      footer.style.removeProperty("display");
      footer.hidden = false;
    }
  }

  function openModal(title, html, onSubmit, opts) {
    resetModalChrome();
    document.getElementById("modal-title").textContent = title;
    const form = document.getElementById("modal-form");
    form.innerHTML = html;
    modalOnSubmit = onSubmit;
    const submitBtn = document.getElementById("modal-submit") || document.querySelector("#modal button[type=\"submit\"]");
    if (submitBtn) {
      submitBtn.className = "btn-primary";
      submitBtn.textContent = (opts && opts.submitLabel) || "Guardar";
    }
    document.getElementById("modal").classList.remove("hidden");
    const first = form.querySelector("input, select, textarea");
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal() {
    resetModalChrome();
    document.getElementById("modal").classList.add("hidden");
    modalOnSubmit = null;
  }


  /** Confirmación dentro de la app (botones propios; no depende de confirm() nativo). */
  function confirmAction(title, message, confirmLabel) {
    return new Promise((resolve) => {
      const modal = document.getElementById("modal");
      const submitBtn = document.getElementById("modal-submit");
      const footer = modal ? modal.querySelector(".modal-footer") : null;
      const prevLabel = submitBtn ? submitBtn.textContent : "Guardar";
      const prevClass = submitBtn ? submitBtn.className : "btn-primary";
      // Hide footer via class/hidden (not sticky inline display:none)
      if (modal) modal.classList.add("modal--confirm");
      if (footer) {
        footer.style.removeProperty("display");
        footer.hidden = true;
      }
      let settled = false;
      let obs = null;
      const onCloseClick = (e) => {
        if (e.target.closest("[data-close]")) finish(false);
      };
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (obs) obs.disconnect();
        if (modal) modal.removeEventListener("click", onCloseClick);
        if (submitBtn) {
          submitBtn.textContent = prevLabel;
          submitBtn.className = prevClass;
        }
        if (modal) modal.classList.remove("modal--confirm");
        if (footer) {
          footer.hidden = false;
          footer.style.removeProperty("display");
        }
        modalOnSubmit = null;
        if (modal) modal.classList.add("hidden");
        resolve(!!ok);
      };
      const label = confirmLabel || "Eliminar";
      const html = `
        <p style="margin:0 0 1rem;line-height:1.45">${message}</p>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="btn-ghost" id="confirm-no">Cancelar</button>
          <button type="button" class="btn-danger" id="confirm-yes">${label}</button>
        </div>`;
      document.getElementById("modal-title").textContent = title || "Confirmar";
      document.getElementById("modal-form").innerHTML = html;
      modalOnSubmit = null;
      modal.classList.remove("hidden");
      const yes = document.getElementById("confirm-yes");
      const no = document.getElementById("confirm-no");
      if (yes) yes.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); finish(true); });
      if (no) no.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); finish(false); });
      modal.addEventListener("click", onCloseClick);
      obs = new MutationObserver(() => {
        if (settled) {
          obs.disconnect();
          modal.removeEventListener("click", onCloseClick);
          return;
        }
        if (modal.classList.contains("hidden")) finish(false);
      });
      obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    });
  }

  function forceCloseAllModals() {
    resetModalChrome();
    document.getElementById("modal")?.classList.add("hidden");
    document.getElementById("sync-modal")?.classList.add("hidden");
    document.getElementById("more-sheet")?.classList.add("hidden");
    modalOnSubmit = null;
  }

  function openMoreSheet() {
    document.getElementById("more-sheet")?.classList.remove("hidden");
  }
  function closeMoreSheet() {
    document.getElementById("more-sheet")?.classList.add("hidden");
  }
  function initMoreMenu() {
    const sheet = document.getElementById("more-sheet");
    if (!sheet) return;
    document.getElementById("btn-more")?.addEventListener("click", openMoreSheet);
    sheet.querySelectorAll("[data-more-close]").forEach((el) => {
      el.addEventListener("click", closeMoreSheet);
    });
    ["btn-update-app", "btn-export-backup", "btn-import-backup", "btn-wipe-seed", "btn-wipe-all"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => {
        // keep import flow open until file picked; others close sheet
        if (id !== "btn-import-backup") closeMoreSheet();
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sheet && !sheet.classList.contains("hidden")) closeMoreSheet();
    });
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
    if (!status) {
      delete state.habitMarks[k];
      markDeleted("habitMarks", k);
    } else {
      state.habitMarks[k] = status;
      if (state.deleted && state.deleted.habitMarks && state.deleted.habitMarks[k]) {
        delete state.deleted.habitMarks[k];
      }
    }
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
    // Racha actual: desde hoy hacia atrás, solo días programados.
    // Buen: solo cuenta "done". Mal ("sin caer"): solo cuenta "miss" (evitado).
    // Hoy sin marca aún no rompe ni suma (gracia del día en curso).
    let bestStreak = 0;
    if (habit) {
      streak = currentHabitStreak(habit);
      bestStreak = bestHabitStreak(habit);
    }
    return { done, miss, bad, streak, bestStreak, limit, scheduled };
  }

  function isStreakSuccess(habit, mark) {
    if (habit.type === "mal") return mark === "miss";
    return mark === "done";
  }

  function currentHabitStreak(habit) {
    if (!habit) return 0;
    let streak = 0;
    const todayD = new Date();
    let cursor = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
    const todayStr = isoDate(cursor);
    for (let guard = 0; guard < 800; guard++) {
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
      const mark = getMark(habit.id, ds);
      const isToday = ds === todayStr;
      if (isToday && !mark) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      if (isStreakSuccess(habit, mark)) streak++;
      else break;
      cursor.setDate(cursor.getDate() - 1);
      if (streak >= 365) break;
    }
    return streak;
  }

  /** Mejor racha histórica: la secuencia más larga de éxitos en días programados. */
  function bestHabitStreak(habit) {
    if (!habit) return 0;
    const todayD = new Date();
    const todayStr = isoDate(new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate()));
    let start;
    if (habit.startDate) {
      start = parseISO(habit.startDate);
    } else {
      // desde la marca más antigua o 400 días atrás
      let earliest = null;
      const prefix = habit.id + ":";
      Object.keys(state.habitMarks || {}).forEach((k) => {
        if (!k.startsWith(prefix)) return;
        const ds = k.slice(prefix.length);
        if (!earliest || ds < earliest) earliest = ds;
      });
      if (earliest) start = parseISO(earliest);
      else {
        start = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
        start.setDate(start.getDate() - 60);
      }
    }
    if (habit.endDate) {
      const endCap = parseISO(habit.endDate);
      // walk only to min(today, end)
    }
    let end = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
    if (habit.endDate) {
      const e = parseISO(habit.endDate);
      if (e < end) end = e;
    }
    let best = 0;
    let run = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard++ < 2000) {
      const ds = isoDate(cursor);
      if (isHabitScheduled(habit, ds)) {
        const mark = getMark(habit.id, ds);
        // Hoy vacío: no corta ni alarga la mejor (aún se puede completar)
        if (ds === todayStr && !mark) {
          /* ignore */
        } else if (isStreakSuccess(habit, mark)) {
          run++;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return best;
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
      const weekProg = habitWeekProgress(h);
      const goalLabel = h.weeklyGoal
        ? `Meta ${Number(h.weeklyGoal)}/sem · ${weekProg.done}/${weekProg.goal}`
        : null;
      const metaBits = [
        h.type === "mal" ? "Mal hábito" : "Buen hábito",
        formatWeekdaysShort(h.weekdays),
        goalLabel,
        h.frequency ? escapeHtml(h.frequency) : null
      ].filter(Boolean);
      li.innerHTML = `
        <span class="habit-dot" style="background:${h.color || DEFAULT_GRAY}"></span>
        <div class="habit-item-info">
          <strong>${escapeHtml(h.name)}</strong>
          <span>${metaBits.join(" · ")}</span>
        </div>
        <button type="button" class="btn-icon habit-edit-btn" title="Editar hábito" aria-label="Editar hábito">✎</button>
        <button type="button" class="${btnClass}" title="${scheduledToday ? "Marcar hoy" : "Hoy no aplica"}" aria-label="Marcar hoy" ${scheduledToday ? "" : "disabled"}>${btnLabel}</button>
      `;
      li.addEventListener("click", (e) => {
        if (e.target.closest(".habit-today-btn") || e.target.closest(".habit-edit-btn")) return;
        selectedHabitId = h.id;
        renderHabitos();
      });
      li.querySelector(".habit-edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        selectedHabitId = h.id;
        openHabitModal(h);
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

    const statsEl = document.getElementById("habit-stats");
    const period = habitPeriodProgress(habit);
    // % = cumplidos / días programados del periodo (inicio → fin o 31 dic)
    statsEl.innerHTML = `
      <div class="stat-pill${period.met ? " week-met" : ""}" title="${escapeAttr((period.start || "") + " → " + (period.end || "") + " · " + period.done + "/" + period.scheduled)}">Meta <strong>${period.pct}%</strong></div>
      <div class="stat-pill">Hechos <strong>${period.done}</strong></div>
      <div class="stat-pill">Fallados <strong>${period.miss}</strong></div>
    `;

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
      btn.dataset.date = ds;
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
    const indef = !habit || (!habit.startDate && !habit.endDate);
    const weekdays = habit ? habitWeekdays(habit) : ALL_WEEKDAYS.slice();
    const startVal = habit && habit.startDate ? habit.startDate : "";
    const endVal = habit && habit.endDate ? habit.endDate : "";
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
        <input type="hidden" name="color" id="f-habit-color" value="${habit && habit.color ? escapeAttr(habit.color) : DEFAULT_GRAY}" />
        <div class="form-row">
          <label>Temporalidad / periodo</label>
          <label class="check-inline"><input type="checkbox" id="f-habit-indef" name="indefinido" ${indef ? "checked" : ""} /> Sin fechas (indefinido)</label>
          <div class="form-row-inline" id="f-habit-period">
            <div class="form-row">
              <label for="f-habit-start">Inicio</label>
              <input id="f-habit-start" name="startDate" type="date" value="${escapeAttr(startVal)}" ${indef ? "disabled" : ""} />
            </div>
            <div class="form-row">
              <label for="f-habit-end">Fin (opcional)</label>
              <input id="f-habit-end" name="endDate" type="date" value="${escapeAttr(endVal)}" ${indef ? "disabled" : ""} />
            </div>
          </div>
          <p class="field-hint">Desmarca “Sin fechas”, elige inicio (y fin si quieres) y Guarda. El calendario solo cuenta días dentro de ese periodo.</p>
        </div>
        <div class="form-row">
          <label>Días de la semana</label>
          ${weekdayPillsHtml("weekdays", weekdays)}
        </div>
        <div class="form-row">
          <label for="f-habit-weekly-goal">Meta semanal</label>
          <select id="f-habit-weekly-goal" name="weeklyGoal">
            ${(() => {
              const cur = habit && habit.weeklyGoal ? Number(habit.weeklyGoal) : 0;
              let opts = `<option value=""${ !cur ? " selected" : ""}>Sin meta numérica</option>`;
              for (let n = 1; n <= 7; n++) {
                opts += `<option value="${n}"${cur === n ? " selected" : ""}>${n} día${n === 1 ? "" : "s"} por semana</option>`;
              }
              return opts;
            })()}
          </select>
          <p class="field-hint">Ej. 3 días por semana: cuenta cuántos días cumpliste esta semana (lun–dom).</p>
        </div>
        <div class="form-row">
          <label for="f-habit-freq">Nota de frecuencia (opcional)</label>
          <input id="f-habit-freq" name="frequency" maxlength="60" value="${habit ? escapeAttr(habit.frequency || "") : ""}" placeholder="Ej. Meta semanal, mañanas, etc." />
        </div>
      </div>
    `;
  }

  function bindHabitForm() {
    const indef = document.getElementById("f-habit-indef");
    const startEl = document.getElementById("f-habit-start");
    const endEl = document.getElementById("f-habit-end");
    if (!indef || !startEl || !endEl) return;
    const syncPeriodFields = () => {
      const off = indef.checked;
      startEl.disabled = off;
      endEl.disabled = off;
      if (off) {
        startEl.value = "";
        endEl.value = "";
      } else if (!startEl.value) {
        startEl.value = today();
      }
    };
    indef.addEventListener("change", syncPeriodFields);
    syncPeriodFields();
  }

  function openHabitModal(habit) {
    openModal(habit ? "Editar hábito" : "Nuevo hábito", habitFormHtml(habit), (fd) => {
      const name = (fd.get("name") || "").trim();
      if (!name) return false;
      const indefEl = document.getElementById("f-habit-indef");
      const startEl = document.getElementById("f-habit-start");
      const endEl = document.getElementById("f-habit-end");
      // Read from DOM (disabled date inputs are omitted from FormData)
      const indefinido = !!(indefEl && indefEl.checked);
      let startDate = null;
      let endDate = null;
      if (!indefinido) {
        startDate = ((startEl && startEl.value) || fd.get("startDate") || "").trim() || null;
        endDate = ((endEl && endEl.value) || fd.get("endDate") || "").trim() || null;
        if (!startDate && !endDate) {
          toast("Pon una fecha de inicio, o marca Sin fechas");
          return false;
        }
        if (!startDate && endDate) {
          toast("Pon también la fecha de inicio");
          return false;
        }
        if (startDate && endDate && endDate < startDate) {
          toast("La fecha fin debe ser ≥ inicio");
          return false;
        }
      }
      const weekdays = readWeekdaysFromForm(fd, "weekdays");
      const data = {
        name,
        type: fd.get("type") || "buen",
        color: fd.get("color") || DEFAULT_GRAY,
        frequency: (fd.get("frequency") || "").trim(),
        startDate,
        endDate,
        weekdays,
        weeklyGoal: normalizeWeeklyGoal(fd.get("weeklyGoal"))
      };
      data.updatedAt = Date.now();
      if (habit) {
        habit.startDate = startDate;
        habit.endDate = endDate;
        Object.assign(habit, data);
        toast(indefinido
          ? "Hábito actualizado · sin fechas"
          : ("Hábito actualizado · " + formatPeriodLabel(startDate, endDate)));
      } else {
        const h = { id: uid(), ...data };
        state.habits.push(h);
        selectedHabitId = h.id;
        toast(indefinido
          ? "Hábito creado · sin fechas"
          : ("Hábito creado · " + formatPeriodLabel(startDate, endDate)));
      }
      saveState();
      renderHabitos();
      return true;
    });
    bindHabitForm();
  }

  function initHabitos() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    document.getElementById("btn-new-habit").addEventListener("click", () => openHabitModal(null));
    document.getElementById("btn-edit-habit").addEventListener("click", () => {
      const h = state.habits.find((x) => x.id === selectedHabitId);
      if (!h) { toast("Selecciona un hábito primero"); return; }
      openHabitModal(h);
    });
    document.getElementById("btn-delete-habit").addEventListener("click", async () => {
      const h = state.habits.find((x) => x.id === selectedHabitId);
      if (!h) {
        toast("Selecciona un hábito primero");
        return;
      }
      const ok = await confirmAction("Eliminar hábito", `¿Eliminar el hábito «${escapeHtml(h.name)}» y sus marcas?`, "Eliminar");
      if (!ok) return;
      markDeleted("habits", h.id);
      Object.keys(state.habitMarks).forEach((k) => {
        if (k.startsWith(h.id + ":")) delete state.habitMarks[k];
      });
      state.habits = state.habits.filter((x) => x.id !== h.id);
      selectedHabitId = state.habits[0]?.id || null;
      saveState();
      renderHabitos();
      toast("Hábito eliminado");
      if (syncId) {
        try { await syncNow({ quiet: true }); } catch (_) {}
      }
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
  /** Acepta 2500, 2,500.00, 2500.50, 2.500,50, $2,500 */
  function parseMoneyInput(raw) {
    let s = String(raw ?? "").trim();
    if (!s) return null;
    s = s.replace(/[$\s]|MXN/gi, "");
    if (!s) return null;
    // europeo/MX: 1.234.567,89
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",") && s.includes(".")) {
      // 1,234.56 (US) → quitar comas
      if (s.lastIndexOf(".") > s.lastIndexOf(",")) s = s.replace(/,/g, "");
      // 1.234,56 already handled; 1,234,56 rare
      else s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }

  function formatMXN(n) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
  }

  function finMonthValue() {
    return document.getElementById("fin-month").value; // YYYY-MM
  }

  function txsForMonth(ym) {
    return state.transactions.filter((t) => t.date.startsWith(ym));
  }

  function accountGroupId(a) {
    if (a.type === "efectivo") return "efectivo";
    if (a.type === "debito") return "banco";
    if (a.type === "credito") return "credito";
    if (a.type === "deuda") return "deuda";
    if (a.type === "ahorros" || a.type === "inversion") return "ahorro";
    return "otro";
  }

  function accountGroupMeta(gid) {
    const map = {
      efectivo: { title: "Efectivo", order: 1 },
      banco: { title: "Banco", order: 2 },
      ahorro: { title: "Ahorro", order: 3 },
      credito: { title: "Tarjetas de crédito", order: 4 },
      deuda: { title: "Préstamos que debo", order: 5 },
      otro: { title: "Otras", order: 6 }
    };
    return map[gid] || map.otro;
  }

  /** Saldo a pagar (corte) y saldo restante (deuda − corte). */
  function creditPaySplit(acc) {
    const debt = creditDebtAmount(acc);
    const due = creditAmountDue(acc);
    const aPagar = due != null ? due : 0;
    const restante = Math.max(0, Math.round((debt - aPagar) * 100) / 100);
    return { debt, aPagar, restante };
  }

  function renderAccounts() {
    const chips = document.getElementById("accounts-chips");
    const totalEl = document.getElementById("accounts-total");
    if (!chips) return;
    const assetsOnly = totalAvailableMoney();
    const owedToMe = totalLoanOutstanding();
    const debt = totalCreditDebt();
    const patrimonio = assetsOnly + owedToMe;
    const sinDeuda = patrimonio - debt;
    if (totalEl) {
      totalEl.textContent = `Patrimonio ${formatMXN(patrimonio)} · Disponible ${formatMXN(assetsOnly)} · Debes ${formatMXN(debt)} · Sin deuda ${formatMXN(sinDeuda)}`;
    }
    chips.innerHTML = "";
    if (!state.accounts.length) {
      chips.innerHTML = `<p class="empty-hint">Agrega tu primera cuenta con + Cuenta.</p>`;
      renderPaymentAlerts();
      return;
    }

    const groups = new Map();
    state.accounts.forEach((a) => {
      const gid = accountGroupId(a);
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid).push(a);
    });
    const ordered = [...groups.keys()].sort(
      (a, b) => accountGroupMeta(a).order - accountGroupMeta(b).order
    );

    ordered.forEach((gid) => {
      const list = groups.get(gid);
      const metaG = accountGroupMeta(gid);
      const section = document.createElement("div");
      section.className = "account-group";

      let groupTotalHtml = "";
      if (gid === "credito") {
        let sumPagar = 0, sumRest = 0;
        list.forEach((a) => {
          const s = creditPaySplit(a);
          sumPagar += s.aPagar;
          sumRest += s.restante;
        });
        groupTotalHtml = `
          <div class="account-group-credit-heads">
            <span>Saldo a pagar <strong>${formatMXN(sumPagar)}</strong></span>
            <span>Saldo restante <strong>${formatMXN(sumRest)}</strong></span>
          </div>`;
      } else if (gid === "deuda") {
        const sum = list.reduce((s, a) => s + creditDebtAmount(a), 0);
        groupTotalHtml = `<span class="account-group-sum debt">${formatMXN(sum)}</span>`;
      } else {
        const sum = list.reduce((s, a) => s + accountBalance(a.id), 0);
        groupTotalHtml = `<span class="account-group-sum">${formatMXN(sum)}</span>`;
      }

      section.innerHTML = `
        <div class="account-group-head">
          <h4>${escapeHtml(metaG.title)}</h4>
          ${groupTotalHtml}
        </div>
        <div class="account-group-list"></div>`;
      const listEl = section.querySelector(".account-group-list");

      list.forEach((a) => {
        const bal = accountBalance(a.id);
        const meta = accountTypeMeta(a.type);
        const isOwed = isOwedAccountType(a);
        const isCredit = a.type === "credito";
        const debtAmt = isOwed ? creditDebtAmount(a) : 0;
        const canPay = isOwed && debtAmt > 0;
        const filtSel = document.getElementById("fin-filter-account");
        const isSelected = !!(filtSel && filtSel.value === a.id);
        const card = document.createElement("div");
        card.className = "account-chip" + (isOwed ? " credit" : "") + (isSelected ? " selected" : "");
        card.style.setProperty("--acc-color", "#ffffff");
        card.dataset.accountId = a.id;

        let amountsHtml = "";
        if (isCredit) {
          const split = creditPaySplit(a);
          amountsHtml = `
            <span class="account-chip-dual">
              <span class="dual-pagar"><small>A pagar</small><b>${formatMXN(split.aPagar)}</b></span>
              <span class="dual-rest"><small>Restante</small><b>${formatMXN(split.restante)}</b></span>
            </span>`;
        } else if (a.type === "deuda") {
          amountsHtml = `<span class="account-chip-amt debt">${formatMXN(debtAmt)}</span>`;
        } else {
          amountsHtml = `<span class="account-chip-amt ${bal < 0 ? "neg" : ""}">${formatMXN(bal)}</span>`;
        }

        const payInfo = isCredit ? creditPaymentInfo(a) : null;
        let payHtml = "";
        if (payInfo) {
          const urgent = payInfo.statementPending && (payInfo.overdue || payInfo.daysLeft <= 7);
          const cls = payInfo.overdue ? "overdue" : (urgent ? "soon" : "muted");
          payHtml = `<span class="account-chip-payline ${cls}">${escapeHtml(creditPaymentLabel(payInfo))}</span>`;
        }

        card.innerHTML = `
          <button type="button" class="account-chip-main" title="${isSelected ? "Quitar filtro" : "Ver movimientos"}">
            <span class="account-chip-icon" aria-hidden="true">${escapeHtml(a.icon || meta.icon)}</span>
            <span class="account-chip-stack">
              <span class="account-chip-top">
                <span class="account-chip-left">
                  <strong>${escapeHtml(a.name)}</strong>
                  <span class="account-chip-meta">${escapeHtml(meta.label)}</span>
                </span>
                ${amountsHtml}
              </span>
              ${payHtml}
            </span>
          </button>
          <div class="account-chip-actions">
            <button type="button" class="account-chip-edit-btn" title="Editar" aria-label="Editar cuenta">✎</button>
            ${canPay ? `<button type="button" class="account-chip-pay-btn" title="Pagar">Pagar</button>` : ""}
          </div>`;
        const openEdit = (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          openAccountModal(a);
        };
        card.querySelector(".account-chip-main").addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const filt = document.getElementById("fin-filter-account");
          if (!filt) return;
          if (filt.value === a.id) filt.value = "all";
          else filt.value = a.id;
          renderFinanzas();
          const mov = document.getElementById("tx-list")?.closest(".card") || document.getElementById("tx-list");
          if (mov) mov.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        card.querySelector(".account-chip-edit-btn").addEventListener("click", openEdit);
        const payBtn = card.querySelector(".account-chip-pay-btn");
        if (payBtn) {
          payBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCreditPayModal(a);
          });
        }
        listEl.appendChild(card);
      });
      chips.appendChild(section);
    });

    const filt = document.getElementById("fin-filter-account");
    if (filt) {
      const prev = filt.value || "all";
      filt.innerHTML = `<option value="all">Todas las cuentas</option>` +
        state.accounts.map((a) =>
          `<option value="${escapeAttr(a.id)}">${escapeHtml(a.name)}</option>`
        ).join("");
      if ([...filt.options].some((o) => o.value === prev)) filt.value = prev;
      else filt.value = "all";
      const sel = filt.value;
      chips.querySelectorAll(".account-chip").forEach((el) => {
        el.classList.toggle("selected", sel !== "all" && el.dataset.accountId === sel);
      });
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
      if (!info || !info.statementPending) return;
      if (info.overdue || info.daysLeft <= 7) {
        alerts.push({ acc: a, info });
      }
    });
    if (!alerts.length) {
      strip.classList.add("hidden");
      strip.innerHTML = "";
      strip.onclick = null;
      return;
    }
    strip.classList.remove("hidden");
    strip.innerHTML = alerts.map(({ acc, info }) => {
      const kind = info.overdue ? "overdue" : "soon";
      const duePay = creditAmountDue(acc);
      const moneyBit = duePay != null
        ? `Pagar ${formatMXN(duePay)}` + (info.debt > 0 ? ` · Deuda total ${formatMXN(info.debt)}` : "")
        : `Deuda ${formatMXN(info.debt)}`;
      const label = info.overdue
        ? `⚠️ ${escapeHtml(acc.name)}: pago vencido (${escapeHtml(formatDayMonth(info.dueDate))}) · ${moneyBit}`
        : info.daysLeft === 0
          ? `⏰ ${escapeHtml(acc.name)}: pago hoy · ${moneyBit}`
          : `⏰ ${escapeHtml(acc.name)}: pago en ${info.daysLeft} día${info.daysLeft === 1 ? "" : "s"} (${escapeHtml(formatDayMonth(info.dueDate))}) · ${moneyBit}`;
      return `<button type="button" class="payment-alert ${kind} has-pay-link" data-account-id="${escapeAttr(acc.id)}">
        <span class="payment-alert-text">${label}</span>
        <span class="payment-alert-cta">Pagar →</span>
      </button>`;
    }).join("");
    strip.onclick = (e) => {
      const btn = e.target.closest(".payment-alert");
      if (!btn || !strip.contains(btn)) return;
      const acc = state.accounts.find((a) => a.id === btn.dataset.accountId);
      if (acc) openCreditPayModal(acc);
    };
  }

  function fundingAccountsForPay(excludeId) {
    return state.accounts.filter((a) => a.id !== excludeId && !isOwedAccountType(a));
  }

  function ensurePayCategories() {
    if (!state.categories.gasto.includes("Pago de tarjeta")) {
      state.categories.gasto.push("Pago de tarjeta");
    }
    if (!state.categories.ingreso.includes("Abono a tarjeta")) {
      state.categories.ingreso.push("Abono a tarjeta");
    }
  }

  function openCreditPayModal(acc) {
    if (!acc || !isOwedAccountType(acc)) return;
    const debt = creditDebtAmount(acc);
    const indicated = acc.type === "credito" ? creditAmountDue(acc) : null;
    if (!(debt > 0) && !(indicated > 0)) {
      toast(acc.type === "deuda" ? "Este préstamo no tiene saldo pendiente" : "Esta tarjeta no tiene deuda ni cantidad a pagar");
      return;
    }
    const funders = fundingAccountsForPay(acc.id);
    if (!funders.length) {
      toast("Necesitas una cuenta de débito o efectivo para pagar desde ella");
      openAccountModal(null);
      return;
    }
    ensurePayCategories();
    const fullDebt = Math.round((debt || 0) * 100) / 100;
    const defaultAmt = indicated != null ? indicated : fullDebt;
    const opts = funders.map((a) => {
      const bal = accountBalance(a.id);
      return `<option value="${escapeAttr(a.id)}">${escapeHtml((a.icon || "") + " " + a.name)} · ${formatMXN(bal)}</option>`;
    }).join("");
    const html = `
      <div class="form-grid">
        <p class="field-hint">${acc.type === "deuda" ? "Abonar préstamo" : "Pagar tarjeta"} <strong>${escapeHtml(acc.name)}</strong>: eliges de qué cuenta sale el dinero; baja lo que debes y queda registrado.</p>
        <div class="form-row">
          <label>Deuda total</label>
          <strong class="stat-value" style="font-size:1.25rem;color:var(--gasto)">${formatMXN(fullDebt)}</strong>
        </div>
        ${indicated != null ? `<div class="form-row"><label>Cantidad a pagar (del corte)</label><strong style="color:var(--warn)">${formatMXN(indicated)}</strong></div>` : `<p class="field-hint">Puedes pagar un abono o toda la deuda. Si editas la tarjeta y pones <strong>cantidad a pagar</strong> del corte, ese monto aparece aquí.</p>`}
        <div class="form-row">
          <label for="f-pay-amount">Monto a pagar (MXN)</label>
          <input id="f-pay-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" required value="${escapeAttr(String(defaultAmt))}" />
          <div class="toolbar-right" style="margin-top:0.35rem;gap:0.35rem">
            ${indicated != null ? `<button type="button" class="btn-ghost btn-sm" id="f-pay-indicated">Del corte</button>` : ""}
            <button type="button" class="btn-ghost btn-sm" id="f-pay-full">Toda la deuda</button>
          </div>
        </div>
        <div class="form-row">
          <label for="f-pay-from">¿De qué cuenta sale el dinero?</label>
          <select id="f-pay-from" name="fromAccountId" required>${opts}</select>
          <p class="field-hint">Efectivo, débito u otra cuenta (no otra tarjeta de crédito).</p>
        </div>
        <div class="form-row">
          <label for="f-pay-date">Fecha</label>
          <input id="f-pay-date" name="date" type="date" required value="${escapeAttr(isoDate(new Date()))}" />
        </div>
        <div class="form-row">
          <label for="f-pay-note">Nota (opcional)</label>
          <input id="f-pay-note" name="note" maxlength="120" placeholder="Ej. pago quincena" />
        </div>
      </div>`;
    openModal((acc.type === "deuda" ? "Abonar préstamo · " : "Pagar tarjeta · ") + acc.name, html, (fd) => {
      const amount = parseMoneyInput(fd.get("amount") ?? document.getElementById("f-pay-amount")?.value);
      if (!(amount > 0)) {
        toast("Monto inválido");
        return false;
      }
      const fromId = fd.get("fromAccountId");
      if (!fromId || !accountById(fromId) || fromId === acc.id) {
        toast("Elige la cuenta de origen");
        return false;
      }
      const date = fd.get("date") || isoDate(new Date());
      const note = (fd.get("note") || "").trim();
      const pairId = uid();
      const noteGasto = note ? `Pago ${acc.name}: ${note}` : `Pago ${acc.name}`;
      const noteIngreso = note ? `Abono: ${note}` : `Abono desde ${accountById(fromId).name}`;
      state.transactions.push({
        id: uid(),
        type: "gasto",
        amount,
        category: "Pago de tarjeta",
        date,
        note: noteGasto,
        accountId: fromId,
        paymentMethod: "Transferencia",
        _creditPayPair: pairId,
        _creditPayRole: "from"
      });
      state.transactions.push({
        id: uid(),
        type: "ingreso",
        amount,
        category: "Abono a tarjeta",
        date,
        note: noteIngreso,
        accountId: acc.id,
        paymentMethod: "Transferencia",
        _creditPayPair: pairId,
        _creditPayRole: "to"
      });
      // Baja la cantidad a pagar indicada (no fuerza liquidar toda la deuda)
      if (acc.amountDue != null) {
        const left = Math.round((Number(acc.amountDue) - amount) * 100) / 100;
        acc.amountDue = left > 0 ? left : null;
        acc.updatedAt = Date.now();
      }
      saveState();
      const ym = date.slice(0, 7);
      const monthEl = document.getElementById("fin-month");
      if (monthEl) monthEl.value = ym;
      renderFinanzas();
      toast(`Pago de ${formatMXN(amount)} a ${acc.name}`);
      return true;
    }, { submitLabel: "Registrar pago" });
    document.getElementById("f-pay-full")?.addEventListener("click", () => {
      const inp = document.getElementById("f-pay-amount");
      if (inp) inp.value = String(fullDebt > 0 ? fullDebt : defaultAmt);
    });
    document.getElementById("f-pay-indicated")?.addEventListener("click", () => {
      const inp = document.getElementById("f-pay-amount");
      if (inp && indicated != null) inp.value = String(indicated);
    });
  }

  function institutionPresetsHtml() {
    const cash = INSTITUTION_PRESETS.filter((p) => p.group === "Efectivo");
    const banks = INSTITUTION_PRESETS.filter((p) => p.group === "Bancos");
    const cards = INSTITUTION_PRESETS.filter((p) => p.group === "Tarjetas");
    const debts = INSTITUTION_PRESETS.filter((p) => p.group === "Préstamos que debo");
    const chip = (p) =>
      `<button type="button" class="preset-chip" data-name="${escapeAttr(p.name)}" data-type="${escapeAttr(p.type)}" data-color="${escapeAttr(p.color)}" data-icon="${escapeAttr(p.icon || "")}">${escapeHtml(p.name)}</button>`;
    return `
      <div class="form-row">
        <label>Atajos</label>
        <div class="preset-chips" id="f-acc-presets">
          <span class="preset-group-label">Efectivo</span>
          ${cash.map(chip).join("")}
          <span class="preset-group-label">Bancos</span>
          ${banks.map(chip).join("")}
          <span class="preset-group-label">Tarjetas</span>
          ${cards.map(chip).join("")}
          <span class="preset-group-label">Préstamos que debo</span>
          ${debts.map(chip).join("")}
        </div>
        <p class="field-hint">Elige Efectivo, un banco, tarjeta o préstamo, o escribe el nombre abajo.</p>
      </div>`;
  }

  function accountFormHtml(acc) {
    const type = acc ? acc.type : "efectivo";
    const color = acc && acc.color ? acc.color : DEFAULT_GRAY;
    const creditLimit = acc && acc.creditLimit != null ? acc.creditLimit : "";
    const cutoffDay = acc && acc.cutoffDay != null ? acc.cutoffDay : "";
    const paymentDueDay = acc && acc.paymentDueDay != null ? acc.paymentDueDay : "";
    const amountDue = acc && acc.amountDue != null ? acc.amountDue : "";
    const institution = acc && acc.institution ? acc.institution : "";
    const isCreditForm = type === "credito";
    const isDebtForm = type === "deuda";
    const isOwedForm = isCreditForm || isDebtForm;
    const debtShown = isOwedForm && acc ? creditDebtAmount(acc) : null;
    const openingShown = isOwedForm
      ? (debtShown != null && debtShown > 0 ? debtShown : "")
      : (acc ? accountBalance(acc.id) : 0);
    return `
      <div class="form-grid">
        ${institutionPresetsHtml()}
        <div class="form-row">
          <label for="f-acc-name">Nombre</label>
          <input id="f-acc-name" name="name" required maxlength="60" value="${acc ? escapeAttr(acc.name) : ""}" placeholder="Ej. Like U, préstamo Andy, Santander préstamo" />
          <input type="hidden" name="institution" id="f-acc-institution" value="${escapeAttr(institution)}" />
        </div>
        <div class="form-row">
          <label for="f-acc-type">Tipo</label>
          <select id="f-acc-type" name="type">${accountTypeOptionsHtml(type)}</select>
        </div>
        <div class="form-row">
          <label for="f-acc-opening" id="f-acc-opening-label">${isOwedForm ? "Deuda total (MXN)" : "Saldo actual (MXN)"}</label>
          <input id="f-acc-opening" name="openingBalance" type="text" inputmode="decimal" autocomplete="off" value="${escapeAttr(String(openingShown))}" placeholder="${isOwedForm ? "Ej. 5000" : "0"}" />
          <p class="field-hint" id="f-acc-opening-hint">${isDebtForm ? "Lo que debes (banco o persona). Ponlo en positivo. Nombre: quién te prestó (ej. Andy, Santander préstamo)." : (isCreditForm ? "Pon el saldo que debes en positivo (ej. 7196.19). Vida lo guarda como deuda." : "Cuánto hay en esta cuenta ahora (ej. efectivo en la cartera).")}</p>
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
          <div class="form-row">
            <label for="f-acc-amountdue">Cantidad a pagar (vencida / del corte)</label>
            <input id="f-acc-amountdue" name="amountDue" type="text" inputmode="decimal" autocomplete="off" value="${escapeAttr(amountDue === "" || amountDue == null ? "" : String(amountDue))}" placeholder="Ej. 2500.50" />
            <p class="field-hint">Monto del corte / vencido. Déjalo vacío si ya saldaste este periodo (aunque quede deuda). Al tocar Pagar se usa este monto.</p>
          </div>
          <p class="field-hint">Si el día de pago es anterior al de corte (ej. corte 11, pago 2), el vencimiento es el 2 del mes siguiente al corte.</p>
        </div>
        <input type="hidden" name="color" id="f-acc-color" value="${escapeAttr(color)}" />
        <input type="hidden" name="icon" id="f-acc-icon" value="${escapeAttr(acc && acc.icon ? acc.icon : accountTypeMeta(type).icon)}" />
      </div>
    `;
  }

  function toggleCreditFields() {
    const form = document.getElementById("modal-form");
    if (!form) return;
    const type = form.querySelector("#f-acc-type")?.value;
    const box = form.querySelector("#f-acc-credit-fields");
    if (box) box.classList.toggle("hidden", type !== "credito");
    const isCredit = type === "credito";
    const isDebt = type === "deuda";
    const isOwed = isCredit || isDebt;
    const lab = form.querySelector("#f-acc-opening-label");
    const hint = form.querySelector("#f-acc-opening-hint");
    const opening = form.querySelector("#f-acc-opening");
    if (lab) lab.textContent = isOwed ? "Deuda total (MXN)" : "Saldo actual (MXN)";
    if (hint) {
      hint.textContent = isDebt
        ? "Lo que debes (banco o persona). Ponlo en positivo. Nombre: quién te prestó."
        : (isCredit
          ? "Pon el saldo que debes en positivo (ej. 7196.19). Vida lo guarda como deuda."
          : "Saldo con el que empieza la cuenta.");
    }
    if (opening) {
      opening.placeholder = isOwed ? "Ej. 5000" : "0";
      if (isOwed) {
        const n = parseMoneyInput(opening.value);
        if (n != null && n < 0) opening.value = String(Math.abs(n));
      }
    }
  }

  function bindAccountForm() {
    const form = document.getElementById("modal-form");
    const typeSel = form.querySelector("#f-acc-type");
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
        form.querySelector("#f-acc-color").value = DEFAULT_GRAY;
        form.querySelector("#f-acc-icon").value = btn.dataset.icon || accountTypeMeta(typeSel.value).icon;
        form.dataset.presetIcon = "1";
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
      const openingBalance = parseMoneyInput(fd.get("openingBalance") ?? document.getElementById("f-acc-opening")?.value);
      const color = DEFAULT_GRAY;
      const icon = (fd.get("icon") || "").trim() || accountTypeMeta(type).icon;
      const institution = (fd.get("institution") || "").trim() || null;
      const data = {
        name,
        type,
        color,
        icon,
        institution,
        openingBalance: openingBalance != null ? openingBalance : 0,
        creditLimit: null,
        cutoffDay: null,
        paymentDueDay: null,
        amountDue: null,
        payUrl: null,
        nextStatementDate: acc && acc.nextStatementDate ? acc.nextStatementDate : null,
        nextPaymentDate: acc && acc.nextPaymentDate ? acc.nextPaymentDate : null
      };
      if (type === "credito") {
        const lim = parseMoneyInput(fd.get("creditLimit") ?? document.getElementById("f-acc-limit")?.value);
        data.creditLimit = lim != null && lim >= 0 ? lim : null;
        data.cutoffDay = clampDayOfMonth(fd.get("cutoffDay") ?? document.getElementById("f-acc-cutoff")?.value);
        data.paymentDueDay = clampDayOfMonth(fd.get("paymentDueDay") ?? document.getElementById("f-acc-due")?.value);
        const dueRaw = fd.get("amountDue");
        const dueDom = document.getElementById("f-acc-amountdue")?.value;
        const dueAmt = parseMoneyInput(dueRaw != null && String(dueRaw).trim() !== "" ? dueRaw : dueDom);
        data.amountDue = dueAmt != null && dueAmt > 0 ? dueAmt : null;
        data.payUrl = normalizePayUrl(fd.get("payUrl"));
        data.nextPaymentDate = null; // el ciclo corte+pago manda
        let debtPos = openingBalance != null ? Math.abs(openingBalance) : 0;
        data.openingBalance = openingBalanceForCreditDebt(acc && acc.id, debtPos);
      } else if (type === "deuda") {
        data.creditLimit = null;
        data.cutoffDay = null;
        data.paymentDueDay = null;
        data.amountDue = null;
        data.payUrl = null;
        data.nextPaymentDate = null;
        let debtPos = openingBalance != null ? Math.abs(openingBalance) : 0;
        data.openingBalance = openingBalanceForCreditDebt(acc && acc.id, debtPos);
      } else {
        // El campo muestra el saldo actual; lo convertimos a openingBalance real
        const target = openingBalance != null ? openingBalance : 0;
        data.openingBalance = openingBalanceForTarget(acc && acc.id, target);
      }
      data.updatedAt = Date.now();
      if (acc) {
        Object.assign(acc, data);
        const debtNow = isOwedAccountType(acc) ? creditDebtAmount(acc) : 0;
        toast(debtNow > 0
          ? `Cuenta actualizada · deuda ${formatMXN(debtNow)}` + (data.amountDue != null ? ` · pagar ${formatMXN(data.amountDue)}` : "")
          : (data.amountDue != null ? `Cuenta actualizada · pagar ${formatMXN(data.amountDue)}` : "Cuenta actualizada"));
      } else {
        const created = { id: uid(), ...data };
        if (type === "credito" || type === "deuda") {
          const debtPos = openingBalance != null ? Math.abs(openingBalance) : 0;
          created.openingBalance = openingBalanceForCreditDebt(created.id, debtPos);
        }
        state.accounts.push(created);
        toast(type === "deuda" ? "Préstamo / deuda creada" : "Cuenta creada");
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
      delWrap.querySelector("#btn-delete-account").addEventListener("click", async () => {
        if (state.accounts.length <= 1) {
          toast("Debes conservar al menos una cuenta");
          return;
        }
        const okDel = await confirmAction("Eliminar cuenta", `¿Eliminar la cuenta «${escapeHtml(acc.name)}»? Sus movimientos pasarán a Efectivo.`, "Eliminar");
        if (!okDel) return;
        const fallback = state.accounts.find((a) => a.id !== acc.id && a.type === "efectivo")
          || state.accounts.find((a) => a.id !== acc.id);
        state.transactions.forEach((t) => {
          if (t.accountId === acc.id) t.accountId = fallback.id;
        });
        markDeleted("accounts", acc.id);
        state.accounts = state.accounts.filter((a) => a.id !== acc.id);
        saveState();
        closeModal();
        renderFinanzas();
        toast("Cuenta eliminada");
      });
    }
  }


  function activeMsiTransactions() {
    return (state.transactions || []).filter((t) => {
      if (t.type !== "gasto") return false;
      const months = Number(t.msiMonths) || 0;
      if (months < 1) return false;
      const paid = Number(t.msiPaidMonths) || 0;
      return paid < months;
    }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function renderMsiActive() {
    const list = document.getElementById("msi-active-list");
    const empty = document.getElementById("msi-active-empty");
    const wrap = document.getElementById("msi-active-card");
    if (!list || !empty) return;
    const rows = activeMsiTransactions();
    if (wrap) wrap.classList.toggle("hidden", rows.length === 0);
    list.innerHTML = "";
    empty.classList.toggle("hidden", rows.length > 0);
    if (!rows.length) return;
    rows.forEach((t) => {
      const acc = accountById(t.accountId);
      const paid = Number(t.msiPaidMonths) || 0;
      const months = Number(t.msiMonths) || 0;
      const left = Math.max(0, months - paid);
      const li = document.createElement("li");
      li.className = "msi-row";
      li.innerHTML = `
        <div class="msi-row-main">
          <strong>${escapeHtml(t.category)}${t.note ? " · " + escapeHtml(t.note) : ""}</strong>
          <span class="muted">${escapeHtml(acc ? acc.name : "Tarjeta")} · ${escapeHtml(t.date || "")}</span>
        </div>
        <div class="msi-row-meta">
          <span>${paid}/${months} · quedan ${left}</span>
          <strong>${formatMXN(t.msiMonthly)}/mes</strong>
        </div>
        <div class="msi-row-actions">
          <button type="button" class="btn-ghost btn-sm" data-edit>Editar</button>
          <button type="button" class="btn-ghost btn-sm" data-mark ${paid >= months - 1 ? "" : ""}>Marcar mes</button>
        </div>`;
      li.querySelector("[data-edit]").addEventListener("click", () => openEditMovement(t));
      li.querySelector("[data-mark]").addEventListener("click", () => {
        t.msiPaidMonths = Math.min(months, paid + 1);
        t.updatedAt = Date.now();
        saveState();
        renderFinanzas();
        toast(t.msiPaidMonths >= months ? "MSI liquidado" : `MSI ${t.msiPaidMonths}/${months}`);
      });
      list.appendChild(li);
    });
  }

  function renderDebtBreakdown() {
    const list = document.getElementById("fin-debt-breakdown");
    const empty = document.getElementById("fin-debt-empty");
    if (!list || !empty) return;
    const rows = owedAccountsSorted();
    list.innerHTML = "";
    empty.classList.toggle("hidden", rows.length > 0);
    rows.forEach(({ acc, debt, due }) => {
      const meta = accountTypeMeta(acc.type);
      const li = document.createElement("li");
      li.className = "fin-debt-row";
      const dueBit = due != null ? `<span class="fin-debt-due">A pagar: ${formatMXN(due)}</span>` : "";
      li.innerHTML = `
        <button type="button" class="fin-debt-main" data-edit>
          <span class="fin-debt-icon" aria-hidden="true">${escapeHtml(acc.icon || meta.icon)}</span>
          <span class="fin-debt-info">
            <strong>${escapeHtml(acc.name)}</strong>
            <span class="muted">${escapeHtml(meta.label)}</span>
            ${dueBit}
          </span>
          <strong class="fin-debt-amt">${formatMXN(debt)}</strong>
        </button>
        <button type="button" class="account-chip-pay-btn" data-pay>Pagar</button>
      `;
      li.querySelector("[data-edit]").addEventListener("click", () => openAccountModal(acc));
      li.querySelector("[data-pay]").addEventListener("click", () => openCreditPayModal(acc));
      list.appendChild(li);
    });
  }


  function liquidAccountsSorted() {
    return (state.accounts || [])
      .filter((a) => !isOwedAccountType(a))
      .map((a) => ({ acc: a, bal: accountBalance(a.id) }))
      .sort((a, b) => b.bal - a.bal);
  }

  function summaryRowHtml(icon, name, meta, amount, amountClass) {
    return `<li class="summary-detail-row">
      <span class="summary-detail-icon" aria-hidden="true">${escapeHtml(icon || "")}</span>
      <span class="summary-detail-info">
        <strong>${escapeHtml(name)}</strong>
        ${meta ? `<span class="muted">${escapeHtml(meta)}</span>` : ""}
      </span>
      <strong class="summary-detail-amt ${amountClass || ""}">${formatMXN(amount)}</strong>
    </li>`;
  }

  function openSummaryDetail(kind) {
    const liquid = liquidAccountsSorted();
    const debts = owedAccountsSorted();
    const loans = [...(state.loans || [])]
      .map((loan) => ({ loan, out: loanOutstanding(loan) }))
      .filter((x) => x.out > 0)
      .sort((a, b) => b.out - a.out);
    const assets = totalAvailableMoney();
    const owedToMe = totalLoanOutstanding();
    const debtTotal = totalCreditDebt();
    const patrimonio = assets + owedToMe;
    const sinDeuda = patrimonio - debtTotal;

    let title = "";
    let body = "";

    if (kind === "disponible") {
      title = "Disponible a la mano";
      const rows = liquid.length
        ? liquid.map(({ acc, bal }) => {
            const meta = accountTypeMeta(acc.type);
            return summaryRowHtml(acc.icon || meta.icon, acc.name, meta.label, bal, bal < 0 ? "neg" : "");
          }).join("")
        : `<li class="empty-hint">No hay cuentas de efectivo/banco.</li>`;
      body = `<p class="muted summary-detail-lead">Solo lo que está en tus cuentas (sin lo que te deben).</p>
        <ul class="summary-detail-list">${rows}</ul>
        <p class="summary-detail-total">Total <strong>${formatMXN(assets)}</strong></p>`;
    } else if (kind === "cobrar") {
      title = "Por cobrar";
      const rows = loans.length
        ? loans.map(({ loan, out }) => summaryRowHtml("👤", loan.person || "Sin nombre", "Te debe", out, "")).join("")
        : `<li class="empty-hint">Nadie te debe.</li>`;
      body = `<p class="muted summary-detail-lead">Lo que te deben y falta cobrar.</p>
        <ul class="summary-detail-list">${rows}</ul>
        <p class="summary-detail-total">Total <strong>${formatMXN(owedToMe)}</strong></p>`;
    } else if (kind === "debes") {
      title = "Lo que debes";
      const rows = debts.length
        ? debts.map(({ acc, debt, due }) => {
            const meta = accountTypeMeta(acc.type);
            const dueBit = due != null ? `A pagar ${formatMXN(due)}` : meta.label;
            return summaryRowHtml(acc.icon || meta.icon, acc.name, dueBit, debt, "debt");
          }).join("")
        : `<li class="empty-hint">No tienes deudas registradas.</li>`;
      body = `<p class="muted summary-detail-lead">Tarjetas y préstamos que tú debes.</p>
        <ul class="summary-detail-list">${rows}</ul>
        <p class="summary-detail-total">Total <strong class="debt">${formatMXN(debtTotal)}</strong></p>`;
    } else if (kind === "patrimonio") {
      title = "Patrimonio";
      const accRows = liquid.map(({ acc, bal }) => {
        const meta = accountTypeMeta(acc.type);
        return summaryRowHtml(acc.icon || meta.icon, acc.name, meta.label, bal, "");
      }).join("");
      const loanRows = loans.map(({ loan, out }) =>
        summaryRowHtml("👤", loan.person || "Sin nombre", "Te deben", out, "")
      ).join("");
      const empty = !liquid.length && !loans.length
        ? `<li class="empty-hint">Sin patrimonio registrado.</li>`
        : "";
      body = `<p class="muted summary-detail-lead">Cuentas + lo que te deben.</p>
        ${liquid.length ? `<h4 class="summary-detail-h">Cuentas</h4><ul class="summary-detail-list">${accRows}</ul>` : ""}
        ${loans.length ? `<h4 class="summary-detail-h">Te deben</h4><ul class="summary-detail-list">${loanRows}</ul>` : ""}
        ${empty ? `<ul class="summary-detail-list">${empty}</ul>` : ""}
        <p class="summary-detail-total">Total <strong>${formatMXN(patrimonio)}</strong></p>`;
    } else {
      title = "Patrimonio sin deuda";
      body = `<p class="muted summary-detail-lead">Patrimonio menos lo que debes.</p>
        <ul class="summary-detail-list">
          ${summaryRowHtml("◆", "Patrimonio", "Cuentas + te deben", patrimonio, "")}
          ${summaryRowHtml("−", "Lo que debes", "Tarjetas + préstamos", debtTotal, "debt")}
        </ul>
        <p class="summary-detail-total">Sin deuda <strong class="${sinDeuda < 0 ? "debt" : ""}">${formatMXN(sinDeuda)}</strong></p>
        <p class="muted" style="margin-top:0.75rem;font-size:0.85rem">Toca Patrimonio, Disponible, Por cobrar o Lo que debes para ver el detalle de cada cuenta.</p>`;
    }

    openModal(title, `<div class="summary-detail">${body}</div>`, () => true, { submitLabel: "Cerrar" });
  }

  function renderFinanzas() {
    renderAccounts();
    renderMsiActive();
    renderLoans();
    const ym = finMonthValue();
    const typeFilter = document.getElementById("fin-filter-type").value;
    const accountFilter = document.getElementById("fin-filter-account")?.value || "all";
    let txs = txsForMonth(ym);
    if (accountFilter !== "all") {
      const pairIds = new Set();
      txs.forEach((t) => {
        if (t.accountId === accountFilter && t._transferPair) pairIds.add(t._transferPair);
      });
      txs = txs.filter((t) =>
        t.accountId === accountFilter ||
        (t._transferPair && pairIds.has(t._transferPair)) ||
        (t.category === "Transferencia" && t.accountId === accountFilter)
      );
    }
    let ingresos = 0, gastos = 0;
    txs.forEach((t) => {
      // Las transferencias entre cuentas no cuentan como ingreso/gasto del mes
      if (t.category === "Transferencia" || t._transferPair) return;
      if (t.type === "ingreso") ingresos += Number(t.amount);
      else gastos += Number(t.amount);
    });
    const assets = totalAvailableMoney();
    const owedToMe = totalLoanOutstanding();
    const debtTotal = totalCreditDebt();
    // Patrimonio = cuentas + te deben; Disponible = solo cuentas; Sin deuda = patrimonio − debes
    const patrimonio = assets + owedToMe;
    const sinDeuda = patrimonio - debtTotal;
    const patEl = document.getElementById("fin-patrimonio");
    if (patEl) patEl.textContent = formatMXN(patrimonio);
    const patHint = document.getElementById("fin-patrimonio-hint");
    if (patHint) {
      patHint.textContent = owedToMe > 0
        ? `Cuentas ${formatMXN(assets)} + te deben ${formatMXN(owedToMe)}`
        : "Cuentas (nada te deben)";
    }
    const assetsEl = document.getElementById("fin-assets");
    if (assetsEl) assetsEl.textContent = formatMXN(assets);
    const assetsHint = document.getElementById("fin-assets-hint");
    if (assetsHint) assetsHint.textContent = "A la mano · solo cuentas";
    const recvEl = document.getElementById("fin-receivable");
    if (recvEl) recvEl.textContent = formatMXN(owedToMe);
    const recvHint = document.getElementById("fin-receivable-hint");
    if (recvHint) {
      const n = (state.loans || []).filter((l) => loanOutstanding(l) > 0).length;
      recvHint.textContent = n ? `${n} ${n === 1 ? "persona" : "personas"} · te deben` : "Nadie te debe";
    }
    const creditDebtEl = document.getElementById("fin-credit-debt");
    if (creditDebtEl) creditDebtEl.textContent = formatMXN(debtTotal);
    const balEl = document.getElementById("fin-balance");
    if (balEl) {
      balEl.textContent = formatMXN(sinDeuda);
      balEl.classList.toggle("neg-net", sinDeuda < 0);
    }
    const balHint = document.getElementById("fin-balance-hint");
    if (balHint) balHint.textContent = "Patrimonio − debes";
    const ingEl = document.getElementById("fin-ingresos");
    if (ingEl) ingEl.textContent = formatMXN(ingresos);
    const gasEl = document.getElementById("fin-gastos");
    if (gasEl) gasEl.textContent = formatMXN(gastos);
    const loansTotal = document.getElementById("fin-loans-total");
    if (loansTotal) loansTotal.textContent = formatMXN(owedToMe);
    const balLabel = document.getElementById("fin-balance-label");
    if (balLabel) balLabel.textContent = "Sin deuda";
    // breakdown list removed from UI; keep no-op safe
    if (typeof renderDebtBreakdown === "function") {
      const list = document.getElementById("fin-debt-breakdown");
      if (list && !list.classList.contains("hidden")) renderDebtBreakdown();
    }

    let listTxs = txs;
    if (typeFilter !== "all") listTxs = listTxs.filter((t) => t.type === typeFilter);
    listTxs = [...listTxs].sort((a, b) => {
      const byDate = String(b.date || "").localeCompare(String(a.date || ""));
      if (byDate) return byDate;
      return Number(b.amount) - Number(a.amount);
    });

    const ul = document.getElementById("tx-list");
    const empty = document.getElementById("tx-empty");
    const filterBanner = document.getElementById("tx-account-filter-banner");
    const filteredAcc = accountFilter !== "all" ? accountById(accountFilter) : null;
    if (filterBanner) {
      if (filteredAcc) {
        filterBanner.classList.remove("hidden");
        filterBanner.innerHTML = `<span>Cuenta: <strong>${escapeHtml(filteredAcc.name)}</strong></span>
          <button type="button" class="btn-ghost btn-sm" id="tx-filter-clear">Ver todas</button>`;
        filterBanner.querySelector("#tx-filter-clear")?.addEventListener("click", () => {
          const f = document.getElementById("fin-filter-account");
          if (f) f.value = "all";
          renderFinanzas();
        });
      } else {
        filterBanner.classList.add("hidden");
        filterBanner.innerHTML = "";
      }
    }
    ul.innerHTML = "";
    if (!listTxs.length) {
      empty.classList.remove("hidden");
      empty.textContent = filteredAcc
        ? "No hay movimientos de esta cuenta en este mes."
        : "No hay movimientos este mes. Usa + Ingreso, + Gasto o ↔ Transferencia.";
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
          const isMsi = t.type === "gasto" && Number(t.msiMonths) >= 1;
          const msiPaid = Number(t.msiPaidMonths) || 0;
          const msiBadge = isMsi
            ? `<span class="tx-msi-badge">MSI ${msiPaid}/${t.msiMonths} · ${formatMXN(t.msiMonthly)}/mes</span>`
            : "";
          li.className = "tx-item" + (isMsi ? " has-msi" : "");
          const isTransfer = !!(t._transferPair || t.category === "Transferencia");
          const iconLabel = isTransfer ? "TR" : (isMsi ? "MSI" : (t.type === "ingreso" ? "IN" : "GA"));
          li.innerHTML = `
            <div class="tx-icon ${t.type}${isMsi ? " msi" : ""}${isTransfer ? " transfer" : ""}">${iconLabel}</div>
            <div class="tx-info">
              <strong>${escapeHtml(t.category)}</strong>
              ${msiBadge}
              <span>${escapeHtml(accLabel)}${escapeHtml(pm)}${t.note ? " · " + escapeHtml(t.note) : ""}</span>
            </div>
            <div class="tx-amount ${t.type}">${sign}${formatMXN(t.amount)}</div>
            <div class="tx-actions">
              <button type="button" class="btn-icon" data-edit title="Editar" aria-label="Editar">✎</button>
              <button type="button" class="btn-danger btn-sm" data-del title="Eliminar" aria-label="Eliminar">✕</button>
            </div>
          `;
          li.classList.add("tx-item-editable");
          li.addEventListener("click", (e) => {
            if (e.target.closest("[data-del]") || e.target.closest("[data-edit]")) return;
            openEditMovement(t);
          });
          li.querySelector("[data-edit]").addEventListener("click", (e) => {
            e.stopPropagation();
            openEditMovement(t);
          });
          li.querySelector("[data-del]").addEventListener("click", async (e) => {
            e.stopPropagation();
            const pair = findTransferPair(t);
            const msg = pair
              ? "¿Eliminar esta transferencia (ambos lados)?"
              : "¿Eliminar este movimiento?";
            const okDel = await confirmAction("Eliminar movimiento", msg, "Eliminar");
            if (!okDel) return;
            if (pair) {
              markDeleted("transactions", pair.from.id);
              markDeleted("transactions", pair.to.id);
              state.transactions = state.transactions.filter((x) => x._transferPair !== pair.pairId);
            } else {
              markDeleted("transactions", t.id);
              state.transactions = state.transactions.filter((x) => x.id !== t.id);
            }
            saveState();
            renderFinanzas();
            toast(pair ? "Transferencia eliminada" : "Movimiento eliminado");
          });
          dayList.appendChild(li);
        });
        group.appendChild(dayList);
        ul.appendChild(group);
      });
    }

    // Chart by category
    const allMonth = txs; // already account-filtered (incl. transfer mates)
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
          <div><strong>${escapeHtml(loan.person || "Sin nombre")}</strong><span class="loan-date">${escapeHtml(loan.date || "")}</span></div>
          <div class="loan-due"><span>Te deben</span><strong>${formatMXN(outstanding)}</strong></div>
        </div>
        <div class="loan-actions">
          <button type="button" class="btn-primary btn-sm" data-pay ${outstanding <= 0 ? "disabled" : ""}>Registrar abono</button>
          <button type="button" class="btn-ghost btn-sm" data-delete>Eliminar</button>
        </div>`;
      card.querySelector("[data-pay]").addEventListener("click", () => openLoanPaymentModal(loan));
      card.querySelector("[data-delete]").addEventListener("click", async () => {
        const okDel = await confirmAction("Eliminar préstamo", `¿Eliminar el préstamo de ${escapeHtml(loan.person)}? Los movimientos bancarios ya registrados no se borrarán.`, "Eliminar");
        if (!okDel) return;
        markDeleted("loans", loan.id);
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
    openModal("Registrar abono", `
      <div class="form-grid">
        <p class="muted">${escapeHtml(loan.person || "")} te debe <strong>${formatMXN(outstanding)}</strong></p>
        <div class="form-row-inline">
          <div class="form-row"><label for="f-payment-amount">Monto del abono (MXN)</label><input id="f-payment-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" required placeholder="Ej. 500" /></div>
          <div class="form-row"><label for="f-payment-date">Fecha</label><input id="f-payment-date" name="date" type="date" required value="${today()}" /></div>
        </div>
        <div class="form-row"><label for="f-payment-account">¿A qué cuenta entra?</label><select id="f-payment-account" name="accountId">${optionalAccountOptionsHtml("")}</select></div>
        <div class="form-row"><label for="f-payment-note">Nota</label><input id="f-payment-note" name="note" maxlength="160" placeholder="Opcional" /></div>
      </div>`, (fd) => {
      const amount = parseMoneyInput(fd.get("amount") ?? document.getElementById("f-payment-amount")?.value);
      const date = String(fd.get("date") || "");
      const accountId = String(fd.get("accountId") || "");
      if (!(amount > 0) || amount > loanOutstanding(loan) + 0.001 || !date) {
        toast("Revisa el monto del abono");
        return false;
      }
      const payment = { id: uid(), amount, date, note: String(fd.get("note") || "").trim(), accountId: accountId || null };
      if (!Array.isArray(loan.payments)) loan.payments = [];
      loan.payments.push(payment);
      if (accountId && accountById(accountId)) {
        ensureFinanceCategory("ingreso", "Abono");
        state.transactions.push({ id: uid(), type: "ingreso", amount, category: "Abono", date, note: `Abono de ${loan.person}`, accountId, paymentMethod: "Transferencia", _loanId: loan.id, _loanPaymentId: payment.id });
      }
      saveState(); renderFinanzas();
      toast(loanOutstanding(loan) <= 0 ? "Abono registrado · saldado" : "Abono registrado");
      return true;
    }, { submitLabel: "Registrar abono" });
  }

  function categoryOptions(type, selected) {
    const cats = state.categories[type] || [];
    return cats.map((c) =>
      `<option value="${escapeAttr(c)}" ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`
    ).join("") + `<option value="__custom__">+ Nueva categoría…</option>`;
  }

  const MSI_MONTH_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);

  function txFormHtml(tx, presetType) {
    const type = tx ? tx.type : (presetType === "ingreso" || presetType === "gasto" ? presetType : "gasto");
    const defaultAcc = defaultEfectivoAccount().id;
    const accId = tx ? (tx.accountId || defaultAcc) : defaultAcc;
    const pm = tx ? (tx.paymentMethod || "Efectivo") : "Efectivo";
    const acc = accountById(accId);
    const showMsi = type === "gasto";
    const msiOn = tx && Number(tx.msiMonths) >= 1;
    const msiMonths = msiOn ? Number(tx.msiMonths) : 6;
    const msiOpts = MSI_MONTH_OPTIONS.map((n) =>
      `<option value="${n}" ${n === msiMonths ? "selected" : ""}>${n} ${n === 1 ? "mes" : "meses"}</option>`
    ).join("");
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
            <label for="f-tx-amount">Monto total (MXN)</label>
            <input id="f-tx-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" required value="${tx ? escapeAttr(String(tx.amount)) : ""}" placeholder="Ej. 5999" />
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
        <div id="f-tx-msi-wrap" class="msi-form-block${showMsi ? "" : " hidden"}">
          <div class="form-row">
            <label>¿Cómo pagas?</label>
            <div class="radio-group msi-mode-group">
              <label class="radio-pill"><input type="radio" name="msiMode" id="f-tx-msi-off" value="contado" ${msiOn ? "" : "checked"} /> Contado</label>
              <label class="radio-pill"><input type="radio" name="msiMode" id="f-tx-msi" value="msi" ${msiOn ? "checked" : ""} /> MSI</label>
            </div>
          </div>
          <p id="f-tx-msi-hint" class="field-hint hidden">MSI solo con tarjeta de crédito: elige la tarjeta en Cuenta.</p>
          <div id="f-tx-msi-fields" class="form-row-inline${msiOn ? "" : " hidden"}">
            <div class="form-row">
              <label for="f-tx-msi-months">Meses</label>
              <select id="f-tx-msi-months" name="msiMonths">${msiOpts}</select>
            </div>
            <div class="form-row">
              <label>Mensualidad</label>
              <strong id="f-tx-msi-monthly" class="stat-value" style="font-size:1.05rem">$0.00</strong>
            </div>
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
    if (!form) return;
    const cat = form.querySelector("#f-tx-cat");
    const custom = form.querySelector("#f-tx-cat-custom");
    const msiWrap = form.querySelector("#f-tx-msi-wrap");
    const msiCheck = form.querySelector("#f-tx-msi");
    const msiFields = form.querySelector("#f-tx-msi-fields");
    const msiMonths = form.querySelector("#f-tx-msi-months");
    const msiMonthly = form.querySelector("#f-tx-msi-monthly");
    const amountInp = form.querySelector("#f-tx-amount");
    const accSel = form.querySelector("#f-tx-account");

    const refreshCats = () => {
      const type = form.querySelector('input[name="type"]:checked')?.value || "gasto";
      const prev = cat.value;
      cat.innerHTML = categoryOptions(type, prev === "__custom__" ? "" : prev);
      custom.classList.add("hidden");
      custom.required = false;
      refreshMsi();
    };

    const refreshMsiMonthly = () => {
      if (!msiMonthly) return;
      const amt = parseMoneyInput(amountInp?.value);
      const months = parseInt(msiMonths?.value, 10) || 0;
      if (!(amt > 0) || months < 1) {
        msiMonthly.textContent = formatMXN(0);
        return;
      }
      msiMonthly.textContent = formatMXN(Math.round((amt / months) * 100) / 100);
    };

    const msiModeOn = () => form.querySelector('input[name="msiMode"]:checked')?.value === "msi";
    const refreshMsi = (ev) => {
      const type = form.querySelector('input[name="type"]:checked')?.value || "gasto";
      let acc = accountById(accSel?.value);
      const isGasto = type === "gasto";
      if (msiWrap) msiWrap.classList.toggle("hidden", !isGasto);
      if (!isGasto) {
        const off = form.querySelector("#f-tx-msi-off");
        if (off) off.checked = true;
      }
      // Al elegir MSI con una cuenta que no es tarjeta, cambia a la primera tarjeta
      if (isGasto && msiModeOn() && (!acc || acc.type !== "credito") && ev && ev.target && ev.target.name === "msiMode") {
        const card = (state.accounts || []).find((a) => a.type === "credito" && !a.archived);
        if (card && accSel) { accSel.value = card.id; acc = card; }
      }
      const isCard = !!(acc && acc.type === "credito");
      const hint = form.querySelector("#f-tx-msi-hint");
      if (hint) hint.classList.toggle("hidden", !(isGasto && msiModeOn() && !isCard));
      const on = isGasto && isCard && msiModeOn();
      if (msiFields) msiFields.classList.toggle("hidden", !on);
      if (on) {
        const pmSel = form.querySelector("#f-tx-pm");
        if (pmSel && (pmSel.value === "Efectivo" || pmSel.value === "Débito")) {
          const opt = [...pmSel.options].find((o) => /cr[eé]dito/i.test(o.value));
          if (opt) pmSel.value = opt.value;
        }
      }
      refreshMsiMonthly();
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
    accSel?.addEventListener("change", refreshMsi);
    form.querySelectorAll('input[name="msiMode"]').forEach((r) => r.addEventListener("change", refreshMsi));
    msiMonths?.addEventListener("change", refreshMsiMonthly);
    amountInp?.addEventListener("input", refreshMsiMonthly);
    refreshMsi();
  }


  function ensureTransferCategories() {
    if (!state.categories.gasto.includes("Transferencia")) {
      state.categories.gasto.push("Transferencia");
    }
    if (!state.categories.ingreso.includes("Transferencia")) {
      state.categories.ingreso.push("Transferencia");
    }
  }

  /** Cuentas de dinero (no tarjetas ni préstamos que debes). */
  function transferableAccounts() {
    return state.accounts.filter((a) => !isOwedAccountType(a));
  }

  function openTransferModal() {
    const accs = transferableAccounts();
    if (accs.length < 2) {
      toast("Necesitas al menos 2 cuentas (efectivo/banco) para transferir");
      openAccountModal(null);
      return;
    }
    ensureTransferCategories();
    const opts = (selectedId) => accs.map((a) => {
      const bal = accountBalance(a.id);
      return `<option value="${escapeAttr(a.id)}" ${a.id === selectedId ? "selected" : ""}>${escapeHtml((a.icon || "") + " " + a.name)} · ${formatMXN(bal)}</option>`;
    }).join("");
    const fromDefault = accs[0].id;
    const toDefault = accs[1].id;
    const html = `
      <div class="form-grid">
        <p class="field-hint">Mueve dinero de una cuenta a otra. No cambia tu “Me queda”; solo cambia en qué cuenta está.</p>
        <div class="form-row">
          <label for="f-tr-from">Desde</label>
          <select id="f-tr-from" name="fromAccountId" required>${opts(fromDefault)}</select>
        </div>
        <div class="form-row">
          <label for="f-tr-to">Hacia</label>
          <select id="f-tr-to" name="toAccountId" required>${opts(toDefault)}</select>
        </div>
        <div class="form-row">
          <label for="f-tr-amount">Monto (MXN)</label>
          <input id="f-tr-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" required placeholder="Ej. 500" />
        </div>
        <div class="form-row">
          <label for="f-tr-date">Fecha</label>
          <input id="f-tr-date" name="date" type="date" required value="${escapeAttr(isoDate(new Date()))}" />
        </div>
        <div class="form-row">
          <label for="f-tr-note">Nota (opcional)</label>
          <input id="f-tr-note" name="note" maxlength="120" placeholder="Ej. sacar efectivo" />
        </div>
      </div>`;
    openModal("Transferencia entre cuentas", html, (fd) => {
      const amount = parseMoneyInput(fd.get("amount") ?? document.getElementById("f-tr-amount")?.value);
      if (!(amount > 0)) {
        toast("Monto inválido");
        return false;
      }
      const fromId = fd.get("fromAccountId");
      const toId = fd.get("toAccountId");
      if (!fromId || !toId || fromId === toId) {
        toast("Elige dos cuentas distintas");
        return false;
      }
      if (!accountById(fromId) || !accountById(toId)) {
        toast("Cuenta no válida");
        return false;
      }
      if (isOwedAccountType(accountById(fromId)) || isOwedAccountType(accountById(toId))) {
        toast("Para pagar una tarjeta usa el botón Pagar");
        return false;
      }
      const date = fd.get("date") || isoDate(new Date());
      const note = (fd.get("note") || "").trim();
      const fromName = accountById(fromId).name;
      const toName = accountById(toId).name;
      const pairId = uid();
      state.transactions.push({
        id: uid(),
        type: "gasto",
        amount,
        category: "Transferencia",
        date,
        note: note || `A ${toName}`,
        accountId: fromId,
        paymentMethod: "Transferencia",
        _transferPair: pairId,
        _transferRole: "from"
      });
      state.transactions.push({
        id: uid(),
        type: "ingreso",
        amount,
        category: "Transferencia",
        date,
        note: note || `Desde ${fromName}`,
        accountId: toId,
        paymentMethod: "Transferencia",
        _transferPair: pairId,
        _transferRole: "to"
      });
      saveState();
      const ym = date.slice(0, 7);
      const monthEl = document.getElementById("fin-month");
      if (monthEl) monthEl.value = ym;
      renderFinanzas();
      toast(`Transferiste ${formatMXN(amount)} · ${fromName} → ${toName}`);
      return true;
    }, { submitLabel: "Transferir" });
  }


  function findTransferPair(tx) {
    if (!tx || !tx._transferPair) return null;
    const legs = (state.transactions || []).filter((x) => x._transferPair === tx._transferPair);
    if (legs.length < 2) return null;
    const from = legs.find((x) => x._transferRole === "from") || legs.find((x) => x.type === "gasto") || legs[0];
    const to = legs.find((x) => x._transferRole === "to") || legs.find((x) => x.type === "ingreso") || legs[1];
    return { from, to, pairId: tx._transferPair };
  }

  function openTransferEditModal(tx) {
    const pair = findTransferPair(tx);
    if (!pair) {
      openTxModal(tx);
      return;
    }
    const accs = transferableAccounts();
    if (accs.length < 2) {
      toast("Necesitas al menos 2 cuentas para editar la transferencia");
      return;
    }
    ensureTransferCategories();
    const opts = (selectedId) => accs.map((a) => {
      const bal = accountBalance(a.id);
      return `<option value="${escapeAttr(a.id)}" ${a.id === selectedId ? "selected" : ""}>${escapeHtml((a.icon || "") + " " + a.name)} · ${formatMXN(bal)}</option>`;
    }).join("");
    const html = `
      <div class="form-grid">
        <p class="field-hint">Corrige la transferencia. Se actualizan ambos lados (salida y entrada).</p>
        <div class="form-row">
          <label for="f-tr-from">Desde</label>
          <select id="f-tr-from" name="fromAccountId" required>${opts(pair.from.accountId)}</select>
        </div>
        <div class="form-row">
          <label for="f-tr-to">Hacia</label>
          <select id="f-tr-to" name="toAccountId" required>${opts(pair.to.accountId)}</select>
        </div>
        <div class="form-row">
          <label for="f-tr-amount">Monto (MXN)</label>
          <input id="f-tr-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" required value="${escapeAttr(String(pair.from.amount ?? ""))}" />
        </div>
        <div class="form-row">
          <label for="f-tr-date">Fecha</label>
          <input id="f-tr-date" name="date" type="date" required value="${escapeAttr(pair.from.date || today())}" />
        </div>
        <div class="form-row">
          <label for="f-tr-note">Nota (opcional)</label>
          <input id="f-tr-note" name="note" maxlength="120" value="${escapeAttr((pair.from.note || "").replace(/^A .+/, "").trim() || pair.from.note || "")}" />
        </div>
      </div>`;
    openModal("Editar transferencia", html, (fd) => {
      const amount = parseMoneyInput(fd.get("amount") ?? document.getElementById("f-tr-amount")?.value);
      if (!(amount > 0)) {
        toast("Monto inválido");
        return false;
      }
      const fromId = fd.get("fromAccountId");
      const toId = fd.get("toAccountId");
      if (!fromId || !toId || fromId === toId) {
        toast("Elige dos cuentas distintas");
        return false;
      }
      if (!accountById(fromId) || !accountById(toId)) {
        toast("Cuenta no válida");
        return false;
      }
      if (isOwedAccountType(accountById(fromId)) || isOwedAccountType(accountById(toId))) {
        toast("Para pagar una tarjeta usa el botón Pagar");
        return false;
      }
      const date = fd.get("date") || today();
      const note = (fd.get("note") || "").trim();
      const fromName = accountById(fromId).name;
      const toName = accountById(toId).name;
      const nowTs = Date.now();
      Object.assign(pair.from, {
        type: "gasto",
        amount,
        category: "Transferencia",
        date,
        note: note || `A ${toName}`,
        accountId: fromId,
        paymentMethod: "Transferencia",
        updatedAt: nowTs
      });
      Object.assign(pair.to, {
        type: "ingreso",
        amount,
        category: "Transferencia",
        date,
        note: note || `Desde ${fromName}`,
        accountId: toId,
        paymentMethod: "Transferencia",
        updatedAt: nowTs
      });
      saveState();
      const ym = date.slice(0, 7);
      const monthEl = document.getElementById("fin-month");
      if (monthEl) monthEl.value = ym;
      renderFinanzas();
      toast(`Transferencia actualizada · ${formatMXN(amount)}`);
      return true;
    }, { submitLabel: "Guardar" });
  }

  function openEditMovement(tx) {
    if (!tx) return;
    if (tx._transferPair || tx.category === "Transferencia") {
      openTransferEditModal(tx);
      return;
    }
    if (tx._creditPayPair) {
      toast("Los pagos de tarjeta se corrigen eliminando y registrando de nuevo con Pagar");
      return;
    }
    openTxModal(tx);
  }

  function openTxModal(tx, presetType) {
    if (!state.accounts.length) {
      toast("Crea una cuenta primero");
      openAccountModal(null);
      return;
    }
    const title = tx
      ? "Editar movimiento"
      : (presetType === "ingreso" ? "Nuevo ingreso" : (presetType === "gasto" ? "Nuevo gasto" : "Nuevo movimiento"));
    openModal(title, txFormHtml(tx, presetType), (fd) => {
      const type = fd.get("type") || "gasto";
      let category = fd.get("category");
      if (category === "__custom__") {
        category = (fd.get("categoryCustom") || "").trim();
        if (!category) return false;
        if (!state.categories[type].includes(category)) {
          state.categories[type].push(category);
        }
      }
      const amount = parseMoneyInput(fd.get("amount") ?? document.getElementById("f-tx-amount")?.value);
      if (!(amount > 0)) {
        toast("Monto inválido");
        return false;
      }
      const accountId = fd.get("accountId");
      if (!accountId || !accountById(accountId)) {
        toast("Selecciona una cuenta");
        return false;
      }
      const accObj = accountById(accountId);
      let msiMonths = null;
      let msiMonthly = null;
      const msiChecked = document.querySelector('input[name="msiMode"]:checked')?.value === "msi"
        || document.getElementById("f-tx-msi")?.checked;
      if (type === "gasto" && accObj && accObj.type === "credito" && msiChecked) {
        const months = parseInt(fd.get("msiMonths") ?? document.getElementById("f-tx-msi-months")?.value, 10);
        if (months >= 1) {
          msiMonths = months;
          msiMonthly = Math.round((amount / months) * 100) / 100;
        }
      }
      const data = {
        type,
        amount,
        category,
        date: fd.get("date"),
        note: (fd.get("note") || "").trim(),
        accountId,
        paymentMethod: fd.get("paymentMethod") || "Efectivo",
        msiMonths,
        msiMonthly,
        msiPaidMonths: tx && Number(tx.msiPaidMonths) > 0 ? Number(tx.msiPaidMonths) : 0
      };
      data.updatedAt = Date.now();
      if (tx) {
        const idx = (state.transactions || []).findIndex((t) => t.id === tx.id);
        if (idx >= 0) {
          state.transactions[idx] = { ...state.transactions[idx], ...data };
        } else {
          Object.assign(tx, data);
        }
        toast(data.msiMonths
          ? `Actualizado · MSI ${data.msiMonths} × ${formatMXN(data.msiMonthly)}`
          : "Movimiento actualizado");
      } else {
        state.transactions.push({ id: uid(), ...data });
        toast(data.msiMonths
          ? `Gasto MSI ${data.msiMonths} meses · ${formatMXN(data.msiMonthly)}/mes`
          : "Movimiento guardado");
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
    document.getElementById("btn-new-ingreso")?.addEventListener("click", () => openTxModal(null, "ingreso"));
    document.getElementById("btn-new-gasto")?.addEventListener("click", () => openTxModal(null, "gasto"));
    document.getElementById("btn-new-transfer")?.addEventListener("click", () => openTransferModal());
    const btnAcc = document.getElementById("btn-new-account");
    if (btnAcc) btnAcc.addEventListener("click", () => openAccountModal(null));
    document.getElementById("btn-new-loan")?.addEventListener("click", openLoanModal);
    document.getElementById("fin-summary-cards")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-summary]");
      if (!btn) return;
      openSummaryDetail(btn.dataset.summary);
    });
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
        <div class="project-item-main">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="badge ${p.status}">${p.status}</span>
        </div>
        <button type="button" class="btn-icon project-edit-btn" title="Editar proyecto" aria-label="Editar proyecto">✎</button>
      `;
      li.addEventListener("click", (e) => {
        if (e.target.closest(".project-edit-btn")) return;
        selectedProjectId = p.id;
        renderProyectos();
      });
      li.querySelector(".project-edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        selectedProjectId = p.id;
        openProjectModal(p);
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
      btn.dataset.date = ds;
      let cls = "cal-day";
      if (ds === tStr) cls += " today";
      if (!scheduled) cls += " na";
      if (missed) cls += " miss";
      btn.className = cls;
      btn.title = !inRange ? "Fuera del periodo" : (!scheduled ? "No es día de trabajo" : (missed ? "Incumplido — tocar para quitar" : "Marcar incumplido"));
      btn.innerHTML = `<span>${d}</span>${missed ? '<span class="mark">✕</span>' : ""}`;
      if (scheduled) {
        btn.addEventListener("click", () => {
          toggleMissedDay(ensureMissBag(entity), ds, entity.id);
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
      li.querySelector("[data-del]").addEventListener("click", async () => {
        const okDel = await confirmAction("Eliminar tarea", "¿Eliminar esta tarea?", "Eliminar");
        if (!okDel) return;
        markDeleted("tasks", task.id);
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

    const palette = ["#d4d4d4", "#a3a3a3", "#737373", "#525252", "#404040", "#262626"];

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
      data.updatedAt = Date.now();
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
      const nowTs = Date.now();
      if (task) {
        task.name = name; task.start = start; task.end = end; task.workdays = workdays;
        task.updatedAt = nowTs;
        if (!task.missedDays) task.missedDays = {};
        toast("Tarea actualizada");
      } else {
        if (!project.tasks) project.tasks = [];
        project.tasks.push({ id: uid(), name, start, end, done: false, workdays, missedDays: {}, updatedAt: nowTs });
        toast("Tarea creada");
      }
      project.updatedAt = nowTs;
      saveState();
      renderProyectos();
      return true;
    });
  }

  function initProyectos() {
    document.getElementById("btn-new-project").addEventListener("click", () => openProjectModal(null));
    document.getElementById("btn-edit-project").addEventListener("click", () => {
      const p = state.projects.find((x) => x.id === selectedProjectId);
      if (!p) { toast("Selecciona un proyecto primero"); return; }
      openProjectModal(p);
    });
    document.getElementById("btn-delete-project").addEventListener("click", async () => {
      const p = state.projects.find((x) => x.id === selectedProjectId);
      if (!p) {
        toast("Selecciona un proyecto primero");
        return;
      }
      const ok = await confirmAction("Eliminar proyecto", `¿Eliminar el proyecto «${escapeHtml(p.name)}»?`, "Eliminar");
      if (!ok) return;
      markDeleted("projects", p.id);
      state.projects = state.projects.filter((x) => x.id !== p.id);
      selectedProjectId = state.projects[0]?.id || null;
      saveState();
      renderProyectos();
      toast("Proyecto eliminado");
      if (syncId) {
        try { await syncNow({ quiet: true }); } catch (_) {}
      }
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
        deleted: state.deleted || {},
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


  function markDeleted(kind, id) {
    if (!id) return;
    if (!state.deleted || typeof state.deleted !== "object") state.deleted = {};
    if (!state.deleted[kind] || typeof state.deleted[kind] !== "object") state.deleted[kind] = {};
    state.deleted[kind][id] = Date.now();
  }

  function mergeDeletedMaps(a, b) {
    const kinds = ["habits", "projects", "accounts", "transactions", "loans", "tasks", "habitMarks", "missedDays"];
    const out = {};
    kinds.forEach((k) => {
      out[k] = {};
      const left = (a && a[k]) || {};
      const right = (b && b[k]) || {};
      new Set([...Object.keys(left), ...Object.keys(right)]).forEach((id) => {
        out[k][id] = Math.max(Number(left[id] || 0), Number(right[id] || 0));
      });
    });
    return out;
  }

  function mergeHabitMarks(a, b, tombstones) {
    // habitMarks are FLAT keys "habitId:YYYY-MM-DD" -> "done"|"miss"|"bad"
    // Tombstones keep cleared marks from resurrecting via sync.
    const dead = tombstones || {};
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((k) => {
      if (dead[k]) return;
      const av = normalizeMarkValue(a && a[k]);
      const bv = normalizeMarkValue(b && b[k]);
      // Prefer local when set (this device just edited); otherwise take remote.
      const val = av != null ? av : bv;
      if (val) out[k] = val;
    });
    return out;
  }

  function mergeMissedDays(a, b, entityId, tombstones) {
    const dead = tombstones || {};
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((ds) => {
      if (!ds) return;
      if (dead[missedTombKey(entityId, ds)]) return;
      if ((a && a[ds]) || (b && b[ds])) out[ds] = true;
    });
    return out;
  }

  function mergeById(listA, listB, tombstones) {
    const map = new Map();
    const dead = tombstones || {};
    function put(item) {
      if (!item || !item.id || dead[item.id]) return;
      const prev = map.get(item.id);
      if (!prev) {
        map.set(item.id, item);
        return;
      }
      const ta = Number(prev.updatedAt || 0);
      const tb = Number(item.updatedAt || 0);
      // Newer updatedAt wins field conflicts; missing timestamps keep a stable merge.
      if (tb > ta) map.set(item.id, { ...prev, ...item });
      else if (ta > tb) map.set(item.id, { ...item, ...prev });
      else map.set(item.id, { ...item, ...prev }); // tie: prefer first-seen (local if local listed first)
    }
    (listA || []).forEach(put);
    (listB || []).forEach(put);
    return Array.from(map.values()).filter((item) => !dead[item.id]);
  }

  /** Une datos de ambos equipos para que hábitos/proyectos no se pisen. */
  function mergeStates(local, remote) {
    const L = local || {};
    const R = remote || {};
    const deleted = mergeDeletedMaps(L.deleted, R.deleted);
    const merged = {
      seeded: !!(L.seeded || R.seeded),
      deleted,
      habits: mergeById(L.habits, R.habits, deleted.habits),
      habitMarks: mergeHabitMarks(L.habitMarks, R.habitMarks, deleted.habitMarks),
      categories: {
        ingreso: Array.from(new Set([...(L.categories && L.categories.ingreso || []), ...(R.categories && R.categories.ingreso || [])])),
        gasto: Array.from(new Set([...(L.categories && L.categories.gasto || []), ...(R.categories && R.categories.gasto || [])]))
      },
      accounts: mergeById(L.accounts, R.accounts, deleted.accounts),
      transactions: mergeById(L.transactions, R.transactions, deleted.transactions),
      projects: mergeById(L.projects, R.projects, deleted.projects).map((p) => {
        const left = (L.projects || []).find((x) => x.id === p.id) || {};
        const right = (R.projects || []).find((x) => x.id === p.id) || {};
        const base = { ...p };
        const leftTasks = left.tasks || [];
        const rightTasks = right.tasks || [];
        base.tasks = mergeById(leftTasks, rightTasks, deleted.tasks).map((task) => {
          const lt = leftTasks.find((x) => x.id === task.id) || {};
          const rt = rightTasks.find((x) => x.id === task.id) || {};
          return {
            ...task,
            missedDays: mergeMissedDays(lt.missedDays, rt.missedDays, task.id, deleted.missedDays)
          };
        });
        base.missedDays = mergeMissedDays(left.missedDays, right.missedDays, p.id, deleted.missedDays);
        return base;
      }),
      loans: mergeById(L.loans, R.loans, deleted.loans).map((loan) => {
        const left = (L.loans || []).find((x) => x.id === loan.id) || {};
        const right = (R.loans || []).find((x) => x.id === loan.id) || {};
        return { ...left, ...right, ...loan, payments: mergeById(left.payments, right.payments) };
      }),
      updatedAt: Math.max(Number(L.updatedAt || 0), Number(R.updatedAt || 0), Date.now())
    };
    // Drop marks for deleted habits
    Object.keys(merged.habitMarks || {}).forEach((k) => {
      const hid = k.split(":")[0];
      if (deleted.habits[hid]) delete merged.habitMarks[k];
    });
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
      if (!quiet) toast("Datos sincronizados. Guarda tu código por si reinstalas.");
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
    startLiveSync();
    state.updatedAt = Date.now();
    saveState(); // will schedule push
    setSyncStatus("pending");
    updateSyncModal();
    try {
      await pushRemote(exportStateBlob());
      setSyncStatus("synced");
      toast("Código creado. Guárdalo: con él recuperas todo si reinstalas.");
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
    startLiveSync();
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

  async function disconnectSync(opts) {
    const ask = !opts || opts.confirm !== false;
    if (ask) {
      const ok = await confirmAction(
        "Desconectar sincronización",
        "¿Desconectar este código? Los datos de este equipo se quedan aquí; luego puedes pegar el código del otro.",
        "Desconectar"
      );
      if (!ok) return;
    }
    syncId = null;
    localStorage.removeItem(SYNC_ID_KEY);
    clearTimeout(syncTimer);
    stopLiveSync();
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

  let liveSyncTimer = null;
  function pullIfLive() {
    if (!syncId || !navigator.onLine) return;
    if (document.visibilityState !== "visible") return;
    syncNow({ quiet: true }).catch(() => {});
  }
  function stopLiveSync() {
    if (liveSyncTimer) {
      clearInterval(liveSyncTimer);
      liveSyncTimer = null;
    }
  }
  function startLiveSync() {
    stopLiveSync();
    if (!syncId || !navigator.onLine) return;
    pullIfLive();
    // Mac often deja la pestaña abierta: bajar cambios cada 20s mientras esté visible
    liveSyncTimer = setInterval(pullIfLive, 20000);
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
    document.getElementById("btn-sync-disconnect")?.addEventListener("click", () => disconnectSync());

    window.addEventListener("online", () => {
      setSyncStatus(syncId ? "pending" : "idle");
      startLiveSync();
    });
    window.addEventListener("offline", () => {
      setSyncStatus("offline");
      stopLiveSync();
    });
    window.addEventListener("focus", pullIfLive);
    window.addEventListener("pageshow", pullIfLive);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") startLiveSync();
      else stopLiveSync();
    });

    if (syncId) {
      setSyncStatus(navigator.onLine ? "pending" : "offline");
      startLiveSync();
    } else {
      setSyncStatus("idle");
      stopLiveSync();
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
    const okMm = await confirmAction(
      "Importar Money Manager",
      "¿Importar todas las cuentas, categorías y 91 movimientos de Money Manager? Se quitarán solo las finanzas de ejemplo y una importación MM anterior.",
      "Importar"
    );
    if (!okMm) return;
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
      const okBk = await confirmAction(
        "Importar respaldo",
        "¿Importar este respaldo y unirlo con los datos actuales? No se borrarán hábitos, movimientos ni proyectos existentes.",
        "Importar"
      );
      if (!okBk) return;
      const merged = mergeStates(state, incoming);
      merged.updatedAt = Date.now();
      state = merged;
      ensureState();
      if (!syncId && parsed.syncId && /^[a-z0-9-]{6,80}$/i.test(parsed.syncId)) {
        syncId = String(parsed.syncId).toLowerCase();
        localStorage.setItem(SYNC_ID_KEY, syncId);
    startLiveSync();
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
      closeMoreSheet();
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

  function hasSeedData() {
    return !!(
      (state.habits || []).some((h) => h && h._seed) ||
      (state.projects || []).some((p) => p && p._seed) ||
      (state.accounts || []).some((a) => a && a._seed) ||
      (state.transactions || []).some((t) => t && t._seed)
    );
  }

  function updateWipeSeedVisibility() {
    const show = hasSeedData();
    ["btn-wipe-seed", "btn-wipe-seed-footer"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = !show;
    });
  }


  function emptyFreshState() {
    const now = Date.now();
    const efectivoId = uid();
    return {
      seeded: false,
      deleted: state.deleted || { habits: {}, projects: {}, accounts: {}, transactions: {}, loans: {}, tasks: {}, habitMarks: {}, missedDays: {} },
      habits: [],
      habitMarks: {},
      categories: {
        ingreso: [...DEFAULT_CATEGORIES.ingreso],
        gasto: [...DEFAULT_CATEGORIES.gasto, "Pago de tarjeta"]
      },
      accounts: [{
        id: efectivoId,
        name: "Efectivo",
        type: "efectivo",
        color: "#34C759",
        icon: "💵",
        openingBalance: 0,
        institution: null,
        creditLimit: null,
        cutoffDay: null,
        paymentDueDay: null,
        updatedAt: now
      }],
      transactions: [],
      projects: [],
      loans: [],
      updatedAt: now
    };
  }

  async function wipeAllData() {
    const ok = await confirmAction(
      "Empezar de cero",
      "¿Borrar TODOS los hábitos, finanzas y proyectos de este dispositivo y de la nube (código de sync)? No se puede deshacer. Guarda un respaldo antes si lo necesitas.",
      "Borrar todo"
    );
    if (!ok) return;
    const now = Date.now();
    if (!state.deleted || typeof state.deleted !== "object") state.deleted = {};
    ["habits", "projects", "accounts", "transactions", "loans", "tasks", "habitMarks", "missedDays"].forEach((k) => {
      if (!state.deleted[k] || typeof state.deleted[k] !== "object") state.deleted[k] = {};
    });
    (state.habits || []).forEach((h) => { if (h && h.id) markDeleted("habits", h.id); });
    (state.accounts || []).forEach((a) => { if (a && a.id) markDeleted("accounts", a.id); });
    (state.transactions || []).forEach((tx) => { if (tx && tx.id) markDeleted("transactions", tx.id); });
    (state.loans || []).forEach((l) => { if (l && l.id) markDeleted("loans", l.id); });
    (state.projects || []).forEach((p) => {
      if (!p) return;
      if (p.id) markDeleted("projects", p.id);
      (p.tasks || []).forEach((task) => {
        if (task && task.id) markDeleted("tasks", task.id);
        Object.keys(task && task.missedDays || {}).forEach((ds) => markDeleted("missedDays", task.id + ":" + ds));
      });
      Object.keys(p.missedDays || {}).forEach((ds) => markDeleted("missedDays", p.id + ":" + ds));
    });
    Object.keys(state.habitMarks || {}).forEach((k) => markDeleted("habitMarks", k));

    const keptDeleted = state.deleted;
    state = emptyFreshState();
    state.deleted = keptDeleted;
    state.updatedAt = now;
    // bump all tombstone times
    Object.keys(state.deleted).forEach((kind) => {
      Object.keys(state.deleted[kind] || {}).forEach((id) => {
        state.deleted[kind][id] = Math.max(Number(state.deleted[kind][id] || 0), now);
      });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem(SEED_FLAG);
    selectedHabitId = null;
    selectedProjectId = null;
    renderAll();
    updateWipeSeedVisibility();
    toast("Todo borrado · empezando de cero");
    if (syncId) {
      try {
        await pushRemote(exportStateBlob());
        setSyncStatus("synced");
        toast("Nube vaciada · listo para cargar estados de cuenta");
      } catch (e) {
        setSyncStatus("error", e.message || String(e));
        toast("Borrado local OK, pero falló subir a la nube: " + (e.message || e));
      }
    }
  }

  async function wipeSeed() {
    if (!hasSeedData()) {
      toast("No hay datos de ejemplo que borrar");
      updateWipeSeedVisibility();
      return;
    }
    const ok = await confirmAction(
      "Borrar datos de ejemplo",
      "¿Borrar solo los datos de ejemplo? Tus registros propios se conservan.",
      "Borrar ejemplos"
    );
    if (!ok) return;
    (state.habits || []).filter((h) => h && h._seed).forEach((h) => markDeleted("habits", h.id));
    (state.projects || []).filter((p) => p && p._seed).forEach((p) => {
      markDeleted("projects", p.id);
      (p.tasks || []).forEach((task) => markDeleted("tasks", task.id));
    });
    (state.accounts || []).filter((a) => a && a._seed).forEach((a) => markDeleted("accounts", a.id));
    (state.transactions || []).filter((t) => t && t._seed).forEach((t) => markDeleted("transactions", t.id));
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
    updateWipeSeedVisibility();
    toast("Datos de ejemplo eliminados");
    if (syncId) {
      try { await syncNow({ quiet: true }); } catch (_) {}
    }
  }

  function renderAll() {
    updateWipeSeedVisibility();
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

  function freshAppUrl() {
    const url = new URL(location.href);
    url.searchParams.set("v", Date.now().toString());
    url.searchParams.delete("utm_source");
    return url.origin + url.pathname + "?" + url.searchParams.toString() + url.hash;
  }

  async function updateAppFromInside(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const btn = document.getElementById("btn-update-app");
    const btn2 = document.getElementById("btn-update-app-footer");
    const btn3 = document.getElementById("btn-update-banner");
    const setBusy = (busy) => {
      [btn, btn2, btn3].forEach((b) => {
        if (!b) return;
        b.disabled = busy;
        if (b.tagName === "BUTTON" || b.tagName === "A") {
          if (busy) b.setAttribute("aria-busy", "true");
          else b.removeAttribute("aria-busy");
        }
        if (b.tagName === "BUTTON") {
          const id = b.id || "";
          b.textContent = busy ? "Actualizando…" : (id === "btn-update-banner" ? "Actualizar ahora" : "Actualizar app");
        }
      });
    };
    setBusy(true);
    toast("Actualizando…");
    const go = () => {
      const next = freshAppUrl();
      try { location.replace(next); } catch (_) {}
      setTimeout(() => { location.href = next; }, 50);
    };
    const withTimeout = (p, ms) => Promise.race([
      p.catch(() => {}),
      new Promise((r) => setTimeout(r, ms))
    ]);
    try {
      await withTimeout(clearAppCaches(), 1500);
      if ("serviceWorker" in navigator) {
        const regs = await withTimeout(navigator.serviceWorker.getRegistrations(), 1500) || [];
        for (const reg of regs) {
          try { if (reg.active) reg.active.postMessage({ type: "CLEAR_CACHE" }); } catch (_) {}
          try { await withTimeout(reg.unregister(), 800); } catch (_) {}
        }
      }
      await withTimeout(clearAppCaches(), 800);
    } catch (_) {}
    go();
    // If navigation is blocked (some iOS PWAs), unlock UI after a moment
    setTimeout(() => setBusy(false), 2500);
  }

  async function checkForAppUpdate() {
    const label = document.getElementById("app-version-label");
    if (label) label.textContent = "v" + APP_VERSION;
    let banner = document.getElementById("update-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "update-banner";
      banner.className = "update-banner";
      banner.innerHTML = '<span>Hay una versión nueva de Vida.</span><a class="btn-primary btn-sm" id="btn-update-banner" href="./?v=update">Actualizar ahora</a>';
      const header = document.querySelector(".app-header");
      if (header && header.parentNode) {
        header.parentNode.insertBefore(banner, header.nextSibling);
      }
      const bump = banner.querySelector("#btn-update-banner");
      if (bump) {
        bump.setAttribute("href", freshAppUrl());
        bump.addEventListener("click", updateAppFromInside);
      }
    }
    if (!navigator.onLine) return;
    try {
      const res = await fetch("./version.json?ts=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.version && data.version !== APP_VERSION) {
        banner.classList.add("is-visible");
        const bump = document.getElementById("btn-update-banner");
        if (bump) bump.setAttribute("href", freshAppUrl());
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
    forceCloseAllModals();
    ensureState();
    applyTheme(getTheme());
    document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
    document.getElementById("btn-theme-more")?.addEventListener("click", () => {
      toggleTheme();
    });
    initTabs();
    initModal();
    initMoreMenu();
    initHabitos();
    initFinanzas();
    initProyectos();
    initSyncUI();
    initBackupUI();
    document.getElementById("btn-wipe-seed")?.addEventListener("click", () => { wipeSeed(); });
    document.getElementById("btn-wipe-seed-footer")?.addEventListener("click", () => { wipeSeed(); });
    document.getElementById("btn-wipe-all")?.addEventListener("click", () => { wipeAllData(); });
    updateWipeSeedVisibility();
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
