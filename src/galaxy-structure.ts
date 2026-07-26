// ── GalaxyStructure ──────────────────────────────────────────────────────────
// Build-time placement model for the Galaxy3D Phase B sprite clouds
// (GALAXY3D_PLAN.md §4). Ports the v2 point-cloud's structure tables
// (_reference/galaxy3d-v2-pointcloud.ts) — 5-arm log-spiral table, boxy/peanut
// bulge, dust lanes (arm-edge + bar + molecular ring), HII/OB knots — but emits
// a few thousand TEXTURED SPRITE INSTANCES (not millions of points), placed in
// the image-anchored frame so they sit on the Gaia backdrop by construction.
//
// Every position goes through galaxy-frame.ts::galaxyPlaneToWorld, after a
// single calibratable azimuth + handedness map from the v2 galactocentric frame
// (Sun at (-R0,0)) into the plane frame (Sun at (a 0, b +R0)). The azimuth/flip
// are tuned by eye against the texture via the §5 __gxDebugArms overlay, then
// baked here.
//
// NOT a dynamical density-wave simulation (no pattern speed / co-rotation /
// orbits). It reproduces the density-wave MORPHOLOGY: log-spiral arms, dust
// lanes on the inner/compression edge, young blue knots on the crests, PLUS an
// explicit cross-arm age/color gradient (blue young near the dust lane →
// redder old on the trailing edge), the most recognizable density-wave
// fingerprint. Gradient strength is the __gxArmGradient knob.

import { CELL } from "./galaxy-atlas";
import {
  MW_UNIT_AU, UNITS_PER_KPC, galaxyPlaneToWorld, obliquityRad,
} from "./galaxy-frame";

/** One billboard instance: world-AU center, world-AU half-extent, rgba 0..1, atlas cell. */
export interface GalaxySprite {
  x: number; y: number; z: number;
  size: number;
  r: number; g: number; b: number; a: number;
  cell: number;
}

export interface GalaxySpriteSet {
  /** Dark attenuation sprites (drawn ZERO, ONE_MINUS_SRC_ALPHA). */
  dust: GalaxySprite[];
  /** Additive luminous sprites (bulge / arms / inter-arm / knots). */
  glow: GalaxySprite[];
}

// World AU per kiloparsec (slices & sprites share the same scale).
const KPC_TO_AU = UNITS_PER_KPC * MW_UNIT_AU;

// ── Deterministic RNG (mulberry32) — reproducible placement for calibration ────
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Galactic structure constants (kpc unless noted; ported from v2) ────────────
const R0_KPC = 8.2;
const BAR_HALF_LEN = 5.0;
const BAR_HALF_WID = 1.0;
const BULGE_SCALE = 0.7;
// Bar PA to the Sun–GC line (v2: near end at l≈+27°).
const BAR_PA_RAD = -27 * Math.PI / 180;

// Disk warp & flare (v2).
const WARP_R0_KPC = 8.5;
const WARP_AMP = 0.07;
const WARP_PHI_RAD = Math.PI / 2;
const FLARE_START_KPC = 6.0;
const FLARE_RATE = 0.5 / 4.0;

interface ArmDef {
  phi0Rad: number; r0: number; rMin: number; rMax: number;
  pitchRad: number; weight: number; sigma: number; // sigma = arm half-width (kpc)
}

// Reid+ 2019 maser-parallax-informed log-spiral arms (v2 table, kpc).
const ARMS: ArmDef[] = [
  { phi0Rad: BAR_PA_RAD,               r0: 3.2, rMin: 2.8, rMax: 16, pitchRad: 12 * Math.PI / 180, weight: 1.00, sigma: 0.60 },
  { phi0Rad: BAR_PA_RAD + Math.PI,     r0: 3.5, rMin: 2.8, rMax: 16, pitchRad: 13 * Math.PI / 180, weight: 1.00, sigma: 0.60 },
  { phi0Rad: BAR_PA_RAD + Math.PI / 2, r0: 3.5, rMin: 3.0, rMax: 14, pitchRad: 11 * Math.PI / 180, weight: 0.55, sigma: 0.50 },
  { phi0Rad: BAR_PA_RAD - Math.PI / 2, r0: 3.5, rMin: 3.0, rMax: 14, pitchRad:  9 * Math.PI / 180, weight: 0.55, sigma: 0.50 },
  { phi0Rad: Math.PI,                  r0: 7.8, rMin: 6.5, rMax: 9.5, pitchRad: 12 * Math.PI / 180, weight: 0.45, sigma: 0.35 },
];

// Dust lane sits ~220 pc inward of (concave/compression side of) the stellar ridge.
const DUST_LANE_INWARD_KPC = 0.22;
const DUST_LANE_SIGN = -1;

function phiOfArm(arm: ArmDef, r: number): number {
  return arm.phi0Rad + Math.log(r / arm.r0) / Math.tan(arm.pitchRad);
}

// Shared galactocentric (kpc, Sun at (-R0,0)) → world AU map (calib azimuth +
// handedness already resolved by the caller). Both the sprite placement and the
// §5 debug overlay go through this so the overlay tracks the sprites exactly.
function mapCore(
  xk: number, yk: number, hk: number, flip: boolean, cosP: number, sinP: number, ecl: number,
): import("@wwtelescope/engine").Vector3d {
  const yy = flip ? -yk : yk;
  const aa = xk * cosP - yy * sinP;
  const bb = xk * sinP + yy * cosP;
  return galaxyPlaneToWorld(aa, bb, hk, ecl);
}

// ── Frame map: v2 galactocentric (kpc, Sun at (-R0,0)) → plane (a,b along the
// image lng/lat axes, Sun at (a 0, b +R0)). Default azimuth −90° maps the Sun
// correctly; __gxArmPhase/__gxArmFlip refine it against the texture (§5). ────────
const ARM_PHASE_DEFAULT = -Math.PI / 2;

function calib(): { phase: number; flip: boolean; grad: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (typeof window !== "undefined" ? window : {}) as any;
  return {
    phase: ARM_PHASE_DEFAULT + (typeof w.__gxArmPhase === "number" ? w.__gxArmPhase : 0),
    flip: w.__gxArmFlip === true,
    grad: typeof w.__gxArmGradient === "number" ? Math.max(0, Math.min(1, w.__gxArmGradient)) : 0.8,
  };
}

// ── Color palettes (0..1; ported, density-wave cross-arm endpoints added) ──────
type RGB = [number, number, number];
const c255 = (r: number, g: number, b: number): RGB => [r / 255, g / 255, b / 255];
const COL_BULGE_HOT: RGB = c255(255, 205, 155);
const COL_BULGE_COOL: RGB = c255(255, 160, 105);
// B1 (2026-07-13): only consumer was the now-removed bar leading-edge dust
// lanes below; commented out (not deleted, no git) to keep it available if
// that placement is ever restored, and to keep ESLint's no-unused-vars clean.
// const COL_BAR: RGB = c255(255, 195, 135);
const COL_INTERARM: RGB = c255(255, 235, 200);
const COL_THICK: RGB = c255(255, 205, 160);
const COL_HII: RGB = c255(255, 130, 145);
const COL_OB: RGB = c255(185, 220, 255);
// Cross-arm age gradient endpoints: young (blue, leading/compression edge) →
// old (warm, trailing edge).
const COL_ARM_YOUNG: RGB = c255(170, 205, 255);
const COL_ARM_OLD: RGB = c255(255, 210, 165);

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ── Disk warp/flare helpers (v2) ───────────────────────────────────────────────
function diskZScaleAt(r: number): number {
  return r <= FLARE_START_KPC ? 1 : 1 + (r - FLARE_START_KPC) * FLARE_RATE;
}
function warpOffsetAt(r: number, phi: number): number {
  return r <= WARP_R0_KPC ? 0 : WARP_AMP * (r - WARP_R0_KPC) * Math.sin(phi - WARP_PHI_RAD);
}

// ── Build ──────────────────────────────────────────────────────────────────────
interface Counts {
  bulge: number; arm: number; interArm: number; knots: number;
  dustArm: number; dustRing: number; dustBarPerSide: number;
}
const DESKTOP: Counts = { bulge: 320, arm: 1800, interArm: 420, knots: 300, dustArm: 700, dustRing: 150, dustBarPerSide: 80 };
const MOBILE: Counts = { bulge: 130, arm: 640, interArm: 160, knots: 110, dustArm: 280, dustRing: 60, dustBarPerSide: 32 };

// B1 (2026-07-13): the ~3.5-5 kpc molecular-ring dust band is a real MW
// feature well outside the boxy/peanut bulge (BULGE_SCALE=0.7 kpc), BUT it
// is a full 0..2pi annulus while the bar's half-length is 5 kpc — the part
// of the ring nearest the bar's PA sits right at/over the bar's outer tips,
// which reads as dust smeared across part of the central bar region. Per
// the B1 task ("keep only if it reads as a ring well outside the bulge; if
// in doubt, gate it"), gated off by default. Flip true only after an
// eyeball check confirms it doesn't reintroduce dust mottling near the bar.
const INCLUDE_MOLECULAR_RING = false;

export function buildGalaxySprites(mobile: boolean): GalaxySpriteSet {
  const counts = mobile ? MOBILE : DESKTOP;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (typeof window !== "undefined" ? window : {}) as any;
  const spriteScale = typeof w.__gxSprites === "number" ? Math.max(0.05, w.__gxSprites) : 1;
  const rnd = mulberry32(typeof w.__gxSeed === "number" ? w.__gxSeed : 0x1a2b3c);
  const { phase, flip, grad } = calib();
  const ecl = obliquityRad();
  const cosP = Math.cos(phase);
  const sinP = Math.sin(phase);

  function rndGauss(): number {
    let u = 0; let v = 0;
    while (u === 0) { u = rnd(); }
    while (v === 0) { v = rnd(); }
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Galactocentric (kpc, Sun at (-R0,0)) + height → world AU sprite center.
  function place(xk: number, yk: number, hk: number, size: number, col: RGB, a: number, cell: number): GalaxySprite {
    const p = mapCore(xk, yk, hk, flip, cosP, sinP, ecl);
    return { x: p.x, y: p.y, z: p.z, size: size * KPC_TO_AU, r: col[0], g: col[1], b: col[2], a, cell };
  }

  const glow: GalaxySprite[] = [];
  const dust: GalaxySprite[] = [];
  const puffCell = (): number => [CELL.glowPuffA, CELL.glowPuffB, CELL.glowPuffC][Math.floor(rnd() * 3)];
  const dustCell = (): number => (rnd() < 0.5 ? CELL.dustA : CELL.dustB);

  // ── Bulge: boxy/peanut body, warm, additive (v2 sampleBulge) ──
  const nBulge = Math.round(counts.bulge * spriteScale);
  for (let i = 0; i < nBulge; i++) {
    const r = BULGE_SCALE * Math.pow(-Math.log(1 - rnd()), 1 / 4);
    const u = rnd() * 2 - 1;
    const t = rnd() * 2 * Math.PI;
    const sx = Math.sqrt(1 - u * u) * Math.cos(t);
    const sy = Math.sqrt(1 - u * u) * Math.sin(t);
    const c = Math.cos(BAR_PA_RAD); const s = Math.sin(BAR_PA_RAD);
    let ax = c * (r * sx) + s * (r * sy);
    const ay = -s * (r * sx) + c * (r * sy);
    let az = r * 0.6 * u;
    az *= 1 + 0.35 * Math.min(1, Math.abs(ax) / (BULGE_SCALE * 1.2)); // peanut
    ax *= 1.3;
    const x = c * ax - s * ay;
    const y = s * ax + c * ay;
    const col = lerpRGB(COL_BULGE_HOT, COL_BULGE_COOL, rnd());
    const size = 0.35 + 0.45 * rnd();
    glow.push(place(x, y, az, size, col, 0.10 + 0.10 * rnd(), puffCell()));
  }

  // ── Arms: per-arm placement with a cross-arm age gradient ──
  const totalWeight = ARMS.reduce((acc, arm) => acc + arm.weight, 0);
  const nArm = Math.round(counts.arm * spriteScale);
  for (const arm of ARMS) {
    const nThis = Math.round(nArm * (arm.weight / totalWeight));
    for (let i = 0; i < nThis; i++) {
      // radius biased to the inner/middle disk (more star formation)
      const r = arm.rMin + Math.pow(rnd(), 0.85) * (arm.rMax - arm.rMin);
      const phiArm = phiOfArm(arm, r);
      const sigmaRad = arm.sigma / r;
      const cross = rndGauss() * sigmaRad;      // signed offset across the arm
      const phi = phiArm + cross;
      let z = rndGauss() * 0.06 * diskZScaleAt(r);
      z += warpOffsetAt(r, phi);
      const x = r * Math.cos(phi);
      const y = r * Math.sin(phi);
      // Cross-arm age gradient: +toward the dust lane = leading/compression =
      // young/blue; trailing = old/red. s normalized in arm-widths.
      const s = (DUST_LANE_SIGN * cross) / sigmaRad;
      const blueness = smoothstep(-1.3, 1.1, s);
      const tint = lerpRGB(COL_ARM_OLD, COL_ARM_YOUNG, 0.5 + grad * (blueness - 0.5));
      const size = 0.22 + 0.32 * rnd();
      glow.push(place(x, y, z, size, tint, 0.07 + 0.08 * rnd(), puffCell()));
    }
  }

  // ── Inter-arm / thick-disk diffuse haze: broad, faint, warm ──
  const nInter = Math.round(counts.interArm * spriteScale);
  for (let i = 0; i < nInter; i++) {
    const r = 1.0 + Math.pow(rnd(), 0.6) * 13.0;
    const phi = rnd() * 2 * Math.PI;
    let z = rndGauss() * 0.18 * diskZScaleAt(r);
    z += warpOffsetAt(r, phi);
    const col = lerpRGB(COL_THICK, COL_INTERARM, rnd() * 0.5);
    const size = 0.5 + 0.7 * rnd();
    glow.push(place(r * Math.cos(phi), r * Math.sin(phi), z, size, col, 0.035 + 0.04 * rnd(), CELL.glowSoft));
  }

  // ── HII / OB knots: bright, saturated, on arm centerlines ──
  const nKnots = Math.round(counts.knots * spriteScale);
  for (let i = 0; i < nKnots; i++) {
    const arm = ARMS[Math.floor(rnd() * ARMS.length)];
    const r = arm.rMin + Math.pow(rnd(), 0.7) * (arm.rMax - arm.rMin);
    const phi = phiOfArm(arm, r) + rndGauss() * (0.2 / r);
    let z = rndGauss() * 0.06;
    z += warpOffsetAt(r, phi);
    const hii = rnd() < 0.6;
    const col = hii ? COL_HII : COL_OB;
    const size = 0.07 + 0.12 * rnd();
    glow.push(place(r * Math.cos(phi), r * Math.sin(phi), z, size, col, 0.30 + 0.30 * rnd(), CELL.hii));
  }

  // ── Dust: arm-edge lanes (inner/concave side), additive-inverse darkening ──
  const nDustArm = Math.round(counts.dustArm * spriteScale);
  for (let i = 0; i < nDustArm; i++) {
    const arm = ARMS[Math.floor(rnd() * (ARMS.length - 1))]; // skip Local Arm
    const rLo = Math.max(arm.rMin, 3.0);
    const rHi = Math.min(arm.rMax, 13.5);
    const r = rLo + Math.pow(rnd(), 0.5) * (rHi - rLo);
    const phi = phiOfArm(arm, r) + DUST_LANE_SIGN * (DUST_LANE_INWARD_KPC / r) + (rnd() - 0.5) * 0.06;
    const z = (rnd() - 0.5) * 0.09;
    const size = 0.18 + 0.32 * rnd();
    dust.push(place(r * Math.cos(phi), r * Math.sin(phi), z, size, COL_INTERARM, 0.18 + 0.22 * rnd(), dustCell()));
  }

  // ── Dust: molecular ring (~3.5–5 kpc) ──
  // B1 (2026-07-13): gated behind INCLUDE_MOLECULAR_RING (default false) —
  // see the const's note above. Left the placement code intact for later
  // re-enable, just skipped when the flag is off.
  if (INCLUDE_MOLECULAR_RING) {
    const nRing = Math.round(counts.dustRing * spriteScale);
    for (let i = 0; i < nRing; i++) {
      const r = 3.5 + rnd() * 1.5;
      const phi = rnd() * 2 * Math.PI;
      const z = (rnd() - 0.5) * 0.07;
      const size = 0.25 + 0.3 * rnd();
      dust.push(place(r * Math.cos(phi), r * Math.sin(phi), z, size, COL_INTERARM, 0.12 + 0.16 * rnd(), dustCell()));
    }
  }

  // ── Dust: two straight bar leading-edge lanes ──
  // B1 (2026-07-13): REMOVED per user request — no dust over the central
  // bar/bulge region. Commented out (repo has no git; not deleted) rather
  // than pruning the now-unused `dustBarPerSide` counts/consts so the
  // placement can be restored easily if the look is reconsidered later.
  // const nBar = Math.round(counts.dustBarPerSide * spriteScale);
  // const cBar = Math.cos(BAR_PA_RAD); const sBar = Math.sin(BAR_PA_RAD);
  // for (let side = -1; side <= 1; side += 2) {
  //   for (let i = 0; i < nBar; i++) {
  //     const t = (rnd() * 2 - 1) * BAR_HALF_LEN * 0.95;
  //     const offset = side * (BAR_HALF_WID * 0.55 + (rnd() - 0.5) * 0.09);
  //     const x = t * cBar - offset * sBar;
  //     const y = t * sBar + offset * cBar;
  //     const z = (rnd() - 0.5) * 0.06;
  //     const size = 0.18 + 0.18 * rnd();
  //     dust.push(place(x, y, z, size, COL_BAR, 0.20 + 0.20 * rnd(), dustCell()));
  //   }
  // }

  return { dust, glow };
}

// ── §5 calibration overlay data (galactocentric kpc polylines) ─────────────────
/** Galactocentric (kpc) → world AU via the live calibration (debug overlay). */
export function galToWorld(xk: number, yk: number, hk: number): import("@wwtelescope/engine").Vector3d {
  const { phase, flip } = calib();
  return mapCore(xk, yk, hk, flip, Math.cos(phase), Math.sin(phase), obliquityRad());
}

/** Arm centerlines as galactocentric (kpc) polylines, for the __gxDebugArms overlay. */
export function armCenterlines(): number[][][] {
  const out: number[][][] = [];
  for (const arm of ARMS) {
    const line: number[][] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const r = arm.rMin + (arm.rMax - arm.rMin) * (i / steps);
      const phi = phiOfArm(arm, r);
      line.push([r * Math.cos(phi), r * Math.sin(phi)]);
    }
    out.push(line);
  }
  return out;
}

/** Bar outline (closed rectangle) as a galactocentric (kpc) polyline. */
export function barOutline(): number[][] {
  const c = Math.cos(BAR_PA_RAD); const s = Math.sin(BAR_PA_RAD);
  const corners: number[][] = [
    [BAR_HALF_LEN, BAR_HALF_WID], [-BAR_HALF_LEN, BAR_HALF_WID],
    [-BAR_HALF_LEN, -BAR_HALF_WID], [BAR_HALF_LEN, -BAR_HALF_WID],
    [BAR_HALF_LEN, BAR_HALF_WID],
  ];
  return corners.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

/** Sun marker position (galactocentric kpc): the Sun sits at (-R0, 0). */
export function sunMarker(): number[] {
  return [-R0_KPC, 0];
}
