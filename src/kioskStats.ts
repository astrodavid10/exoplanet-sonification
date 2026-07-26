// Anonymous, local-only kiosk usage stats — app-agnostic. Copy verbatim into a
// sibling data-story repo (see KIOSK_MODE.md).
//
// Privacy model (no PII, no network): a "user" is a SESSION — the span from a
// guest's first touch (after load or after the attract loop resets) to the idle
// reset. Only guest-initiated activity is counted (the caller must NOT track
// attract-loop selections). Data lives entirely in localStorage as per-day
// rollups (no raw event log). View/export via the ?kioskStats=1 panel.

const STORAGE_KEY = "kioskStats:v1";
const MAX_DAYS = 90;         // cap stored history; oldest days drop on write
const FLUSH_INTERVAL_MS = 60_000;

export interface DayRollup {
  sessions: number;
  totalDwellMs: number;
  taps: number;
  selects: number;
  hourly: number[];                // length 24, session STARTS per hour
  planets: Record<string, number>; // select counts by exoplanet name
  qr: Record<string, number>;      // QR opens by URL
  mode3d: number;                  // switches into 3D galaxy view
  tuningFork: number;              // tuning-fork demo starts (solar/TRAPPIST/per-note)
  takeHome: number;
}

export type StatsMap = Record<string, DayRollup>;

// ── Module state (viewer app only; the stats panel reads localStorage directly) ─
let enabled = false;
let store: StatsMap = {};
let dirty = false;

let sessionOpen = false;
let sessionStartTs = 0;
let sessionDay = "";

function emptyDay(): DayRollup {
  return {
    sessions: 0, totalDwellMs: 0, taps: 0, selects: 0,
    hourly: new Array(24).fill(0),
    planets: {}, qr: {}, mode3d: 0, tuningFork: 0, takeHome: 0,
  };
}

// Local calendar date as YYYY-MM-DD.
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readStore(): StatsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return {}; }
    const parsed = JSON.parse(raw) as StatsMap;
    // Repair any missing hourly arrays so callers can index safely.
    for (const k of Object.keys(parsed)) {
      const r = parsed[k];
      if (!Array.isArray(r.hourly) || r.hourly.length !== 24) {
        r.hourly = new Array(24).fill(0);
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function ensureDay(key: string): DayRollup {
  if (!store[key]) { store[key] = emptyDay(); }
  return store[key];
}

function flush(): void {
  if (!enabled || !dirty) { return; }
  try {
    // Cap history: keep the newest MAX_DAYS date keys.
    const keys = Object.keys(store).sort();
    if (keys.length > MAX_DAYS) {
      for (const k of keys.slice(0, keys.length - MAX_DAYS)) { delete store[k]; }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    dirty = false;
  } catch {
    // Quota / private-mode: never let stats crash the viewer.
  }
}

/** Enable stats and load persisted data. All other calls no-op while disabled. */
export function statsInit(en: boolean): void {
  enabled = en;
  if (!enabled) { return; }
  store = readStore();
  // Runs for the app lifetime (kiosk never unmounts); no handle to clear.
  window.setInterval(flush, FLUSH_INTERVAL_MS);
  // Best-effort flush when the page is hidden/closed (e.g. nightly reload).
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { flush(); }
  });
}

/** Begin a session. Idempotent while a session is already open. */
export function statsSessionStart(): void {
  if (!enabled || sessionOpen) { return; }
  sessionOpen = true;
  sessionStartTs = Date.now();
  const now = new Date();
  sessionDay = dayKey(now);
  const r = ensureDay(sessionDay);
  r.sessions += 1;
  r.hourly[now.getHours()] += 1;
  dirty = true;
}

/** End the current session, crediting dwell up to the LAST activity timestamp. */
export function statsSessionEnd(lastActivityTs: number): void {
  if (!enabled || !sessionOpen) { return; }
  const dwell = Math.max(0, lastActivityTs - sessionStartTs);
  ensureDay(sessionDay).totalDwellMs += dwell;
  sessionOpen = false;
  dirty = true;
  flush(); // persist at the natural session boundary
}

/**
 * Record a guest event. Events: "tap", "select" (+exoplanet name), "qr"
 * (+url), "takeHome", "mode3d" (2D → 3D switch), "tuningFork" (demo start).
 * Only counts while a session is open, so non-guest activity — the automatic
 * launch (fires before the first touch) and the attract loop (session already
 * ended) — is never tracked. The caller's attractMode guard on selects is
 * belt-and-braces on top of this.
 */
export function statsTrack(event: string, detail?: string): void {
  if (!enabled || !sessionOpen) { return; }
  const r = ensureDay(dayKey(new Date()));
  switch (event) {
  case "tap": r.taps += 1; break;
  case "select":
    r.selects += 1;
    if (detail) { r.planets[detail] = (r.planets[detail] ?? 0) + 1; }
    break;
  case "qr":
    if (detail) { r.qr[detail] = (r.qr[detail] ?? 0) + 1; }
    break;
  case "takeHome": r.takeHome += 1; break;
  case "mode3d": r.mode3d += 1; break;
  case "tuningFork": r.tuningFork += 1; break;
  default: return;
  }
  dirty = true;
}

// ── Exports for the stats panel (read localStorage fresh so they work in a
// standalone panel app where statsInit was never called) ────────────────────
export function statsExportJson(): string {
  return JSON.stringify(readStore(), null, 2);
}

export function statsExportCsv(): string {
  const data = readStore();
  const cols = ["date", "sessions", "totalDwellMs", "avgDwellMs", "taps", "selects", "mode3d", "tuningFork", "takeHome"];
  const rows = [cols.join(",")];
  for (const date of Object.keys(data).sort()) {
    const r = data[date];
    const avg = r.sessions > 0 ? Math.round(r.totalDwellMs / r.sessions) : 0;
    rows.push([date, r.sessions, r.totalDwellMs, avg, r.taps, r.selects, r.mode3d, r.tuningFork, r.takeHome].join(","));
  }
  return rows.join("\r\n");
}

export function statsClear(): void {
  store = {};
  sessionOpen = false;
  dirty = false;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
