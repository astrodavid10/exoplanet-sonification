// ── GalaxyAtlas ──────────────────────────────────────────────────────────────
// Procedural sprite atlas for the Galaxy3D Phase B sprite clouds (GALAXY3D_PLAN
// §6). Generated on an offscreen 2D canvas at startup — NO shipped asset, in the
// zero-asset spirit of the Phase A texture slices.
//
// One canvas holds a grid of square cells (COLS × ROWS of CELL_PX). Each cell is
// a soft, alpha-shaped sprite authored white (rgb is tinted per-instance in the
// shader); the glow cells carry fbm-ish speckle so puffs don't read as plain
// gaussians, the dust cells are clumpy alpha used purely for multiplicative
// darkening, and the HII/STAR cells are tighter bright cores.
//
// Cell indices are shared with galaxy-structure.ts (which tags each sprite with
// a cell) and consumed by the renderer in galaxy3d.ts (UV offset/scale per
// instance, exactly like cosmosweb-field.ts's atlas math).

/** Atlas cell indices (shared with galaxy-structure.ts). */
export const CELL = {
  glowSoft: 0,   // broad smooth glow (inter-arm / thick disk / OB haze)
  glowPuffA: 1,  // speckled nebula puffs (arm + bulge body)
  glowPuffB: 2,
  glowPuffC: 3,
  dustA: 4,      // clumpy dark attenuation sprite
  dustB: 5,
  hii: 6,        // tight saturated knot (HII region / OB association)
  star: 7,       // very tight core (Phase C star sparkle; defined now for reuse)
} as const;

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;

export interface GalaxyAtlas {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
  cellPx: number;
  atlasW: number;
  atlasH: number;
}

// ── Tiny deterministic value noise (for the fbm speckle) ───────────────────────
function hash2(ix: number, iy: number, seed: number): number {
  let h = ix * 374761393 + iy * 668265263 + seed * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const u = smooth(fx);
  const v = smooth(fy);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 17);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

// ── Cell painters ──────────────────────────────────────────────────────────────
// Each writes a CELL_PX square of premultiply-free RGBA into `img` at (ox, oy):
// white rgb, alpha = the sprite profile. The shader tints rgb per instance.

function paintProfile(
  img: ImageData, ox: number, oy: number, n: number,
  // returns alpha 0..1 given normalized radius rn (0 center .. 1 edge) and
  // angle-independent fbm value f (0..1) at this pixel
  profile: (rn: number, f: number) => number,
  seed: number, noiseScale: number, octaves: number,
): void {
  const data = img.data;
  const imgW = img.width;
  const half = (n - 1) / 2;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const dx = (px - half) / half;
      const dy = (py - half) / half;
      const rn = Math.min(1, Math.hypot(dx, dy));
      const f = octaves > 0 ? fbm(px / n * noiseScale, py / n * noiseScale, seed, octaves) : 1;
      const a = Math.max(0, Math.min(1, profile(rn, f)));
      const idx = ((oy + py) * imgW + (ox + px)) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(a * 255);
    }
  }
}

/**
 * Build the procedural atlas. cellPx defaults to 256 (desktop) / 128 (mobile);
 * atlas is COLS×ROWS cells → 1024×512 / 512×256.
 */
export function buildGalaxyAtlas(cellPx: number): GalaxyAtlas {
  const cols = ATLAS_COLS;
  const rows = ATLAS_ROWS;
  const atlasW = cols * cellPx;
  const atlasH = rows * cellPx;
  const canvas = document.createElement("canvas");
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) { return { canvas, cols, rows, cellPx, atlasW, atlasH }; }
  const img = ctx.createImageData(atlasW, atlasH);

  const cellOf = (index: number): [number, number] => [
    (index % cols) * cellPx,
    Math.floor(index / cols) * cellPx,
  ];

  // Soft smooth glow: gaussian-ish, faint speckle.
  let [ox, oy] = cellOf(CELL.glowSoft);
  paintProfile(img, ox, oy, cellPx, (rn, f) => {
    const base = Math.exp(-rn * rn * 3.2);
    return base * (0.85 + 0.15 * f);
  }, 11, 3, 2);

  // Three speckled puff variants: gaussian core modulated by fbm so clumps read.
  for (const [cell, seed, ns] of [
    [CELL.glowPuffA, 101, 4], [CELL.glowPuffB, 211, 5], [CELL.glowPuffC, 307, 6],
  ] as [number, number, number][]) {
    [ox, oy] = cellOf(cell);
    paintProfile(img, ox, oy, cellPx, (rn, f) => {
      const core = Math.exp(-rn * rn * 2.6);
      const clump = 0.45 + 0.55 * f;          // fbm texture
      const edge = Math.max(0, 1 - rn);        // hard cutoff to the cell edge
      return core * clump * edge;
    }, seed, ns, 4);
  }

  // Two dust variants: clumpier, harder-edged alpha (used multiplicatively).
  for (const [cell, seed] of [[CELL.dustA, 401], [CELL.dustB, 523]] as [number, number][]) {
    [ox, oy] = cellOf(cell);
    paintProfile(img, ox, oy, cellPx, (rn, f) => {
      const core = Math.exp(-rn * rn * 2.0);
      const clump = 0.25 + 0.75 * f * f;       // stronger contrast clumps
      const edge = Math.max(0, 1 - rn);
      return core * clump * edge;
    }, seed, 5, 4);
  }

  // HII / OB knot: tight bright core + small halo, minimal speckle.
  [ox, oy] = cellOf(CELL.hii);
  paintProfile(img, ox, oy, cellPx, (rn) => {
    const core = Math.exp(-rn * rn * 9.0);
    const halo = 0.30 * Math.exp(-rn * rn * 2.2);
    return Math.min(1, core + halo);
  }, 0, 0, 0);

  // Star sparkle: very tight (Phase C; harmless to author now).
  [ox, oy] = cellOf(CELL.star);
  paintProfile(img, ox, oy, cellPx, (rn) => Math.exp(-rn * rn * 16.0), 0, 0, 0);

  ctx.putImageData(img, 0, 0);
  return { canvas, cols, rows, cellPx, atlasW, atlasH };
}
