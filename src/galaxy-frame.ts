// ── GalaxyFrame ──────────────────────────────────────────────────────────────
// Single source of truth for the Milky Way's 3D frame, derived from the 2D
// planar MW image quad in wwt-hacks.ts:_patchGalaxyVertexBuffer (see
// GALAXY3D_PLAN.md §2). Everything galactic — the image quad itself, the
// Galaxy3D volume slices, and (Phase B+) sprite clouds / star points — places
// geometry through this module, so alignment with the backdrop texture holds
// by construction.
//
// Frame facts:
//   • The image quad is built in a pre-rotation frame as
//       (lng·MW_UNIT_AU, height·MW_UNIT_AU, (lat − 28)·MW_UNIT_AU)
//     with lng/lat in "image units" about the image center, then rotated by
//     the fixed chain rotY(213°)·rotZ(−62.87175°)·rotY(−192.8595083°)·rotX(ε).
//   • Rotations fix the origin, so the world origin (= the Sun in WWT
//     solar-system mode) maps to image point (lng 0, lat 28): the texture's
//     galactic center sits 28 units from the Sun ≈ 8.25 kpc — within 1% of
//     the GRAVITY-measured R0. The image frame IS the physical frame.
//   • 1 image unit = MW_UNIT_AU = 6.08e7 AU ≈ 0.293 kpc (R0_KPC / 28).

import { Coordinates, SpaceTimeController, Vector3d } from "@wwtelescope/engine";

/** AU per image unit (the quad's per-"degree" scale factor). */
export const MW_UNIT_AU = 60800000;
/** Galactic-center offset of the image quad, in image units (= the Sun–GC distance). */
export const GC_OFFSET_UNITS = 28;
/** Extra angular footprint applied to the quad extents (HANDOFF: "make the galaxy image larger"). */
export const MW_ANGLE_SCALE = 1.05;
/** Physical Sun–GC distance assigned to the 28-unit offset (GRAVITY 2019/2021: 8.18–8.28). */
export const R0_KPC = 8.2;
/** Image units per kiloparsec (≈ 3.415). */
export const UNITS_PER_KPC = GC_OFFSET_UNITS / R0_KPC;

/** Mean obliquity of the ecliptic right now, in radians (the chain's final rotX). */
export function obliquityRad(): number {
  // meanObliquityOfEcliptic exists at runtime but isn't in the engine .d.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coords = Coordinates as any;
  return coords.meanObliquityOfEcliptic(SpaceTimeController.get_jNow()) / 180 * Math.PI;
}

/**
 * Image-unit galactic-plane coords → world AU, via the image quad's exact
 * transform chain. lng/lat are measured about the image center (= the GC);
 * the Sun sits at (lng 0, lat 28). height is the off-plane offset along the
 * quad normal (sign vs. galactic north unverified — symmetric uses are safe;
 * eyeball before relying on it for the Phase B warp).
 */
export function imageUnitsToWorld(lngUnits: number, latUnits: number, heightUnits: number, eclipticRad: number): Vector3d {
  const raw = Vector3d.create(
    lngUnits * MW_UNIT_AU,
    heightUnits * MW_UNIT_AU,
    (latUnits - GC_OFFSET_UNITS) * MW_UNIT_AU,
  );
  // Vector3d's rotate methods exist at runtime but aren't in the engine .d.ts
  // (same gap wwt-hacks.ts / marker-renderer.ts work around).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pt = raw as any;
  pt.rotateY(213 / 180 * Math.PI);
  pt.rotateZ(-62.87175 / 180 * Math.PI);
  pt.rotateY(-192.8595083 / 180 * Math.PI);
  pt.rotateX(eclipticRad);
  return pt as Vector3d;
}

/**
 * Galactocentric in-plane coords (kpc) + height (kpc) → world AU.
 * a is along the image's lng axis, b along its lat axis; the Sun is at
 * (a 0, b +R0_KPC).
 */
export function galaxyPlaneToWorld(aKpc: number, bKpc: number, hKpc: number, eclipticRad: number): Vector3d {
  return imageUnitsToWorld(aKpc * UNITS_PER_KPC, bKpc * UNITS_PER_KPC, hKpc * UNITS_PER_KPC, eclipticRad);
}
