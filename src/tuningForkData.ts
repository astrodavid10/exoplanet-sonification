// =====================================================================
// Tuning-fork demos — orbital data + math
// =====================================================================
//
// Three "tuning fork" demonstrations that play orbital-period tones for a
// curated set of bodies orbiting (a stand-in for) our Sun, so the listener
// can calibrate their ear before exploring the ~6000 exoplanets:
//
//   1. SOLAR_SYSTEM_BODIES — the 8 major planets + 5 official IAU dwarf
//      planets, rendered with their REAL Keplerian orbits and real scale.
//   2. TRAPPIST_BODIES — the 7 TRAPPIST-1 planets, shown as stylized nested
//      rings around a reddened Sun (TRAPPIST-1A is an ultracool red dwarf).
//   3. ONE_PER_NOTE_BODIES — one popular, recognizable exoplanet for each of
//      the 20 guitar samples, shown as stylized nested rings colored by
//      discovery technique.
//
// COORDINATE CONVENTION (the important bit):
//   Every body position is computed as a HELIOCENTRIC ECLIPTIC (J2000)
//   Cartesian vector in AU — x toward the vernal equinox, z toward the
//   ecliptic north pole. WWT's solar-system world frame is already
//   ecliptic-aligned, so such a vector projects to the screen with a plain
//       WWTControl.singleton.getScreenPointForCoordinates(xe, ye, ze)
//   No RA/Dec round-trip and no rotateX(ecliptic) is needed: for an
//   ecliptic-frame point the equatorial->world rotateX the exoplanet markers
//   apply (see exo-sonification.vue spawnPing3D / ALL_POINTS_3D) exactly
//   cancels the ecliptic->equatorial rotation, leaving world = (xe, ze, ye).
//   The engine's internal Vector3d(arg1, arg3, arg2) swap then turns the
//   call getScreenPointForCoordinates(xe, ye, ze) back into (xe, ze, ye).
//
// The orbital geometry uses each body's semi-major axis `a`; the body's
// ANGULAR rate and its sonified tone both use `periodDays`. For the real
// solar-system bodies the two are consistent (period derived from a); for
// the stylized exoplanet rings `a` is a display radius decoupled from the
// real `periodDays` so all rings stay visible and evenly nested while the
// pitch + spin still reflect the true orbital period.

const D2R = Math.PI / 180;
const J2000 = 2451545.0; // Julian date of the J2000.0 epoch

export interface TFBody {
  name: string;
  a: number;        // semi-major axis (AU) — real for planets, display radius for stylized rings
  e: number;        // eccentricity
  iDeg: number;     // inclination to the ecliptic (deg)
  omDeg: number;    // longitude of ascending node Ω (deg)
  wDeg: number;     // argument of perihelion ω (deg)
  m0Deg: number;    // mean anomaly at J2000 (deg)
  periodDays: number; // orbital period — drives angular rate AND the sonified pitch
  cat: string;      // discovery method / colour key ("transit", "Radial Velocity", ...) or "" for solar bodies
}

// ---------------------------------------------------------------------
// Julian date helpers
// ---------------------------------------------------------------------
export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}
export function julianDateNow(): number {
  return julianDate(new Date());
}

// ---------------------------------------------------------------------
// Kepler solver + ecliptic position
// ---------------------------------------------------------------------
function solveKepler(meanAnomRad: number, e: number): number {
  let meanAnom = meanAnomRad % (2 * Math.PI);
  if (meanAnom < 0) meanAnom += 2 * Math.PI;
  let eccAnom = e < 0.8 ? meanAnom : Math.PI;
  for (let it = 0; it < 60; it++) {
    const d = (eccAnom - e * Math.sin(eccAnom) - meanAnom) / (1 - e * Math.cos(eccAnom));
    eccAnom -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  return eccAnom;
}

// Heliocentric ecliptic (J2000) Cartesian position in AU at Julian date `jd`.
export function eclipticPositionAU(b: TFBody, jd: number): [number, number, number] {
  const n = 360 / b.periodDays;                       // deg/day mean motion
  const meanAnom = (b.m0Deg + n * (jd - J2000)) * D2R; // mean anomaly (rad)
  const eccAnom = solveKepler(meanAnom, b.e);
  // Position in the orbital plane
  const xo = b.a * (Math.cos(eccAnom) - b.e);
  const yo = b.a * Math.sqrt(1 - b.e * b.e) * Math.sin(eccAnom);
  return rotateToEcliptic(xo, yo, b);
}

function rotateToEcliptic(xo: number, yo: number, b: TFBody): [number, number, number] {
  const cO = Math.cos(b.omDeg * D2R), sO = Math.sin(b.omDeg * D2R);
  const cI = Math.cos(b.iDeg * D2R),  sI = Math.sin(b.iDeg * D2R);
  const cW = Math.cos(b.wDeg * D2R),  sW = Math.sin(b.wDeg * D2R);
  const x = (cO * cW - sO * sW * cI) * xo + (-cO * sW - sO * cW * cI) * yo;
  const y = (sO * cW + cO * sW * cI) * xo + (-sO * sW + cO * cW * cI) * yo;
  const z = (sW * sI) * xo + (cW * sI) * yo;
  return [x, y, z];
}

// Static orbit path (one full revolution) sampled as ecliptic-AU vertices.
// Independent of time, so a demo computes this once per body.
export function orbitSampleVerticesAU(b: TFBody, segments = 160): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let k = 0; k <= segments; k++) {
    const eccAnom = (k / segments) * 2 * Math.PI;
    const xo = b.a * (Math.cos(eccAnom) - b.e);
    const yo = b.a * Math.sqrt(1 - b.e * b.e) * Math.sin(eccAnom);
    out.push(rotateToEcliptic(xo, yo, b));
  }
  return out;
}

// ---------------------------------------------------------------------
// 1. Real solar-system bodies (8 planets + 5 IAU dwarf planets)
// ---------------------------------------------------------------------
// Planet elements: JPL "Keplerian elements for approximate positions"
// (J2000, valid 1800-2050), converted to ω = ϖ − Ω and M0 = L − ϖ.
// Period derived from a via P = 365.25·a^1.5 d. Dwarf-planet elements are
// representative osculating values — exact phase is immaterial to the demo.
function planet(name: string, a: number, e: number, iDeg: number, omDeg: number, varpiDeg: number, lonDeg: number): TFBody {
  return {
    name, a, e, iDeg, omDeg,
    wDeg: varpiDeg - omDeg,
    m0Deg: lonDeg - varpiDeg,
    periodDays: 365.25 * Math.pow(a, 1.5),
    cat: "",
  };
}
function dwarf(name: string, a: number, e: number, iDeg: number, omDeg: number, wDeg: number, m0Deg: number): TFBody {
  return { name, a, e, iDeg, omDeg, wDeg, m0Deg, periodDays: 365.25 * Math.pow(a, 1.5), cat: "" };
}

export const SOLAR_SYSTEM_BODIES: TFBody[] = [
  planet("Mercury", 0.38709927, 0.20563593,  7.00497902,  48.33076593,  77.45779628, 252.25032350),
  planet("Venus",   0.72333566, 0.00677672,  3.39467605,  76.67984255, 131.60246718, 181.97909950),
  planet("Earth",   1.00000261, 0.01671123, -0.00001531,   0.0,        102.93768193, 100.46457166),
  planet("Mars",    1.52371034, 0.09339410,  1.84969142,  49.55953891, -23.94362959,  -4.55343205),
  dwarf ("Ceres",   2.7691,     0.0760,     10.594,        80.33,        73.92,         95.99),
  planet("Jupiter", 5.20288700, 0.04838624,  1.30439695, 100.47390909,  14.72847983,  34.39644051),
  planet("Saturn",  9.53667594, 0.05386179,  2.48599187, 113.66242448,  92.59887831,  49.95424423),
  planet("Uranus", 19.18916464, 0.04725744,  0.77263783,  74.01692503, 170.95427630, 313.23810451),
  planet("Neptune",30.06992276, 0.00859048,  1.77004347, 131.78422574,  44.96476227, -55.12002969),
  dwarf ("Pluto",  39.48211675, 0.24882730, 17.14001206, 110.30393684, 113.76,        14.86),
  dwarf ("Haumea", 43.13,       0.195,      28.21,       121.9,        239.0,        217.8),
  dwarf ("Makemake",45.79,      0.159,      29.0,         79.4,        296.4,        153.0),
  dwarf ("Eris",   67.78,       0.436,      44.04,        35.95,       151.6,        204.0),
];

// ---------------------------------------------------------------------
// Stylized nested rings (exoplanet demos)
// ---------------------------------------------------------------------
// `a` is a DISPLAY radius spaced evenly by index so every ring stays legible
// regardless of the body's true (vastly differing) orbital size; the real
// `periodDays` still drives the spin rate and the sonified pitch. A spread of
// node/inclination/phase keeps the rings from overlapping into a flat disc.
function stylizedRing(name: string, periodDays: number, cat: string, index: number, inner: number, step: number): TFBody {
  return {
    name,
    a: inner + index * step,
    e: 0,
    iDeg: ((index % 5) - 2) * 3.5,   // gentle ±7° spread for 3D depth
    omDeg: (index * 47) % 360,        // spread ascending nodes
    wDeg: 0,
    m0Deg: (index * 73) % 360,        // spread starting phases
    periodDays,
    cat,
  };
}

// 7 TRAPPIST-1 planets (all transit-discovered). Real periods (days).
const TRAPPIST_RAW: [string, number][] = [
  ["TRAPPIST-1 b", 1.5109],
  ["TRAPPIST-1 c", 2.4218],
  ["TRAPPIST-1 d", 4.0496],
  ["TRAPPIST-1 e", 6.0997],
  ["TRAPPIST-1 f", 9.2068],
  ["TRAPPIST-1 g", 12.3527],
  ["TRAPPIST-1 h", 18.7673],
];
export const TRAPPIST_BODIES: TFBody[] = TRAPPIST_RAW.map(([name, p], i) =>
  stylizedRing(name, p, "transit", i, 0.9, 0.62));

// One popular exoplanet per guitar sample (note index 0 = highest pitch /
// shortest period, 19 = lowest / longest). Periods + discovery methods are the
// real catalogue values (verified against src/exoplanetData.ts). cat strings
// match discoveryTypeColors keys for colouring.
const ONE_PER_NOTE_RAW: [string, number, string][] = [
  ["WASP-12 b",     1.091,  "transit"],          // note 0
  ["HD 189733 b",   2.219,  "Radial Velocity"],  // note 1
  ["HD 209458 b",   3.525,  "Radial Velocity"],  // note 2
  ["51 Peg b",      4.231,  "Radial Velocity"],  // note 3 — first exoplanet round a Sun-like star
  ["Ross 128 b",    9.866,  "Radial Velocity"],  // note 4
  ["Proxima Cen b", 11.185, "Radial Velocity"],  // note 5 — nearest exoplanet
  ["LHS 1140 b",    24.737, "transit"],          // note 6
  ["K2-18 b",       32.940, "transit"],          // note 7
  ["GJ 876 b",      61.117, "Radial Velocity"],  // note 8
  ["HD 219134 g",   94.200, "Radial Velocity"],  // note 9
  ["Kepler-186 f",  129.944,"transit"],          // note 10 — first Earth-size HZ planet
  ["Kepler-16 b",   228.776,"transit"],          // note 11 — circumbinary "Tatooine"
  ["Kepler-452 b",  384.843,"transit"],          // note 12 — "Earth's cousin"
  ["Kepler-1636 b", 425.478,"transit"],          // note 13
  ["tau Cet f",     636.130,"Radial Velocity"],  // note 14
  ["Kepler-1647 b", 1107.592,"transit"],         // note 15 — largest circumbinary planet
  ["HD 219134 h",   2247.0, "Radial Velocity"],  // note 16
  ["HAT-P-11 c",    3361.0, "Radial Velocity"],  // note 17
  ["55 Cnc d",      4799.0, "Radial Velocity"],  // note 18
  ["51 Eri b",      9100.0, "imaging"],           // note 19 — directly imaged
];
export const ONE_PER_NOTE_BODIES: TFBody[] = ONE_PER_NOTE_RAW.map(([name, p, cat], i) =>
  stylizedRing(name, p as number, cat as string, i, 1.2, 0.85));

// Outermost orbital radius in a body list — used by the camera to frame the
// whole demo (real aphelion for eccentric solar bodies, display radius else).
export function maxOrbitRadiusAU(bodies: TFBody[]): number {
  return bodies.reduce((m, b) => Math.max(m, b.a * (1 + b.e)), 0);
}
