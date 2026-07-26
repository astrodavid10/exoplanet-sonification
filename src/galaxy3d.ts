// ── Galaxy3D v3 — hybrid Milky Way (Phase A: texture volume slices) ──────────
// Design doc: GALAXY3D_PLAN.md. The v2 procedural point cloud this replaces is
// preserved at _reference/galaxy3d-v2-pointcloud.ts (Phase B cribs its arm /
// bar / dust placement tables).
//
// Phase A draws the planar MW as a stack of quads: an h=0 base slice that
// REPLACES WWT's own galaxy-image quad, plus N volume slices above/below the
// plane, all reusing the already-loaded Gaia texture (Grids._milkyWayImage —
// no new assets). A per-fragment vertical envelope sech²(h / hz(r)) — with
// hz(r) bulge-thickened near the center and flared in the outer disk — shapes
// the stack into a lens-with-central-bulge body. A circular vignette
// (15.5→19 kpc) + black-floor subtraction hide the texture's square footprint.
// Screen compositing (ONE, ONE_MINUS_SRC_COLOR) keys luminance for free like
// additive (black pixels add nothing; still order-independent, no sorting) but
// compresses toward white instead of clipping, so the stacked bulge keeps
// structure rather than blowing out. Dead corners cost one discard.
//
// All geometry goes through galaxy-frame.ts (the image quad's exact transform
// chain), so the slices sit on the backdrop by construction.
//
// Hook: wwt-hacks.ts:drawGalaxyImage calls drawGalaxyEnsemble() right after
// the base quad, under the same zoom-fade opacity — the whole ensemble fades
// together (and is gone by fly-in arrival, HANDOFF §1c).
//
// Live console tuning (all optional):
//   window.__gx          = false              // kill switch (slices + sprites)
//   window.__gxExposure  = 1.0                // slice + glow-sprite brightness ×
//   window.__gxThickness = 1.0                // slice vertical envelope scale
//   window.__gxTier      = 'mobile'|'desktop' // force tier…
//   window.__gxRebuild()                      // …then rebuild slices + sprites
//   — Phase B sprite knobs (galaxy-sprites.ts / galaxy-structure.ts):
//   window.__gxSpritesOff = true              // hide the sprite passes only
//   window.__gxDust       = 1.0               // dust darkening strength ×
//   window.__gxSprites    = 1.0               // sprite COUNT scale (needs rebuild)
//   window.__gxSpriteSize = 1.0               // sprite size × (needs rebuild)
//   window.__gxArmGradient= 0.8               // cross-arm age/color gradient 0..1
//   — §5 calibration (galaxy-debug.ts):
//   window.__gxDebugArms  = true              // arm centerline + bar overlay
//   window.__gxArmPhase   = 0                 // azimuth nudge rad (needs rebuild)
//   window.__gxArmFlip    = true              // mirror handedness (needs rebuild)

// Namespace import: Grids._milkyWayImage and Matrix3d live outside the engine
// .d.ts (the gap marker-renderer.ts / cosmosweb-field.ts work around), so
// engine internals are reached via `(Engine as any)`.
import * as Engine from "@wwtelescope/engine";
import { MW_ANGLE_SCALE, UNITS_PER_KPC, imageUnitsToWorld, obliquityRad } from "./galaxy-frame";
import { drawGalaxySprites, rebuildGalaxySprites } from "./galaxy-sprites";
import { drawGalaxyDebugArms } from "./galaxy-debug";

// Master switch (kept from v2; jwst-viewer's install path is unconditional).
export const GALAXY3D_ENABLED = true;

// ── Slice configuration ───────────────────────────────────────────────────────
// Heights in kpc, mirrored ±. The fragment envelope handles vertical/radial
// falloff, so the top slices only survive over the (thick) bulge — which is
// exactly what gives the stack its 3D bulge. Grid subdivision is flat-quad
// cheap; it exists so the Phase B warp can displace outer-ring vertices.
const SLICE_HEIGHTS_DESKTOP_KPC = [0.12, 0.28, 0.5, 0.85, 1.5];
const SLICE_HEIGHTS_MOBILE_KPC = [0.2, 0.7];
const GRID_SUBDIVS_DESKTOP = 24;
const GRID_SUBDIVS_MOBILE = 16;
// Total additive strength of the whole stack relative to the base quad.
// Calibrated in a headed GPU browser 2026-06-12: the envelope eats most of each
// slice's weight, so the raw stack needs this much gain to read as a volume
// (0.55 was invisible). Per-tier because the mobile stack's low-sitting slices
// pass ~2× more light through the vertical envelope per unit weight than the
// desktop stack — same gain reads twice as bright on a phone (user-confirmed
// too hot); 1.5 matched the desktop 3.0 look but the user still found mobile
// a little bright on-device (2026-06-12), so it sits lower deliberately.
const SLICE_GAIN_DESKTOP = 3.0;
const SLICE_GAIN_MOBILE = 1.1;

const IS_COARSE_POINTER = (typeof window !== "undefined")
  && typeof window.matchMedia === "function"
  && window.matchMedia("(pointer: coarse)").matches;

function isMobileTier(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__gxTier === "mobile") { return true; }
  if (w.__gxTier === "desktop") { return false; }
  return IS_COARSE_POINTER;
}

// ── Shaders ───────────────────────────────────────────────────────────────────
// vCamFade: fragments near the camera fade out (computed per-vertex, highp),
// so sitting inside the disk doesn't fill the screen with slice fog — while
// the far side of the galaxy, tens of kly away, still glows. Fade runs over
// camera distances ~10 → ~32 kly (6e8 → 2e9 AU); from any outside vantage
// every fragment is beyond it. The h=0 base plane (aMeta.x == 0) is exempt —
// it replaces WWT's own galaxy-image quad, which was always visible from
// inside (the familiar entry view), so it keeps that legacy behavior.
const VERT_SRC = `\
attribute vec3 aPos;
attribute vec2 aUV;
attribute vec2 aPlane;
attribute vec2 aMeta;
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
varying vec2 vUV;
varying vec2 vPlane;
varying vec2 vMeta;
varying float vCamFade;
void main() {
  vec4 eye = uMVMatrix * vec4(aPos, 1.0);
  gl_Position = uPMatrix * eye;
  float fade = smoothstep(600000000.0, 2000000000.0, length(eye.xyz));
  vCamFade = mix(1.0, fade, step(0.0001, aMeta.x));
  vUV = aUV;
  vPlane = aPlane;
  vMeta = aMeta;
}
`;

// vPlane: in-plane kpc from the GC. vMeta: (|slice height| kpc, slice weight).
// sech² is written in the exp(-2|x|) ≤ 1 form so it can never overflow
// mediump's minimum float range on mobile GPUs.
const FRAG_SRC = `\
precision mediump float;
varying vec2 vUV;
varying vec2 vPlane;
varying vec2 vMeta;
varying float vCamFade;
uniform sampler2D uTex;
uniform float uOpacity;
uniform float uThickness;
float sech2(float x) {
  float e = exp(-2.0 * abs(x));
  float s = 1.0 + e;
  return 4.0 * e / (s * s);
}
void main() {
  float r = length(vPlane);
  float hz = 0.30 + 0.35 * max(0.0, r - 6.0) / 9.0; // thin disk + outer flare
  hz += 1.10 * exp(-(r * r) / (1.4 * 1.4));         // bulge thickening
  float env = sech2(vMeta.x / (hz * uThickness));
  // Circular vignette: the texture is square (corners reach ~28 kpc from the
  // GC); fade everything out over 15.5 → 19 kpc so no square edge can show.
  float vig = smoothstep(19.0, 15.5, r);
  float a = env * vMeta.y * uOpacity * vCamFade * vig;
  if (a <= 0.002) discard;
  // Black-floor subtraction: the image's faint noise floor otherwise
  // accumulates additively across the stack into a visible square slab.
  vec3 c = max(texture2D(uTex, vUV).rgb - 0.02, 0.0);
  gl_FragColor = vec4(c * a, 1.0);
}
`;

// ── Mesh build (CPU, lazy, ~ms) ───────────────────────────────────────────────
const FLOATS_PER_VERT = 9; // pos3 + uv2 + plane2 + meta2
const STRIDE_BYTES = FLOATS_PER_VERT * 4;

interface SliceMesh {
  verts: Float32Array;
  indices: Uint16Array;
  indexCount: number;
}

// Slab thickness each slice represents (half-distance to its neighbours; the
// innermost slab starts at the mid-plane, which the base quad owns), normalized
// so the per-slice weights sum to 1 per side.
function sliceWeights(heights: number[]): number[] {
  const w: number[] = [];
  for (let i = 0; i < heights.length; i++) {
    const lo = i === 0 ? 0 : (heights[i - 1] + heights[i]) / 2;
    const hi = i === heights.length - 1
      ? heights[i] + (heights[i] - lo)
      : (heights[i] + heights[i + 1]) / 2;
    w.push(hi - lo);
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

function buildSliceMesh(): SliceMesh {
  const mobile = isMobileTier();
  const heights = mobile ? SLICE_HEIGHTS_MOBILE_KPC : SLICE_HEIGHTS_DESKTOP_KPC;
  const subdivs = mobile ? GRID_SUBDIVS_MOBILE : GRID_SUBDIVS_DESKTOP;
  const sliceGain = mobile ? SLICE_GAIN_MOBILE : SLICE_GAIN_DESKTOP;
  const weights = sliceWeights(heights);
  const ecliptic = obliquityRad();

  const sliceCount = heights.length * 2 + 1; // + the h=0 base plane
  const vertsPerSlice = (subdivs + 1) * (subdivs + 1);
  const verts = new Float32Array(sliceCount * vertsPerSlice * FLOATS_PER_VERT);
  const indices = new Uint16Array(sliceCount * subdivs * subdivs * 6);

  let vi = 0;
  let ii = 0;
  let base = 0;
  for (let s = 0; s < sliceCount; s++) {
    // s=0 is the mid-plane base slice replacing WWT's own galaxy-image quad:
    // full weight, no tier gain (and no camera fade — see VERT_SRC).
    const isBase = s === 0;
    const hKpc = isBase ? 0 : heights[(s - 1) >> 1] * ((s - 1) % 2 === 0 ? 1 : -1);
    const weight = isBase ? 1.0 : weights[(s - 1) >> 1] * sliceGain;
    const hUnits = hKpc * UNITS_PER_KPC;
    for (let iy = 0; iy <= subdivs; iy++) {
      // lat runs −64 → +64 about the image center (= the GC), scaled — the
      // exact extents/UV mapping of the base quad in _patchGalaxyVertexBuffer.
      const latU = (-64 + 128 * (iy / subdivs)) * MW_ANGLE_SCALE;
      for (let ix = 0; ix <= subdivs; ix++) {
        const lngU = (-64 + 128 * (ix / subdivs)) * MW_ANGLE_SCALE;
        const pt = imageUnitsToWorld(lngU, latU, hUnits, ecliptic);
        verts[vi++] = pt.x;
        verts[vi++] = pt.y;
        verts[vi++] = pt.z;
        verts[vi++] = 1 - ix / subdivs; // u — matches the base quad
        verts[vi++] = iy / subdivs;     // v
        verts[vi++] = lngU / UNITS_PER_KPC; // in-plane kpc from the GC
        verts[vi++] = latU / UNITS_PER_KPC;
        verts[vi++] = Math.abs(hKpc);
        verts[vi++] = weight;
      }
    }
    for (let iy = 0; iy < subdivs; iy++) {
      for (let ix = 0; ix < subdivs; ix++) {
        const a = base + iy * (subdivs + 1) + ix;
        const b = a + 1;
        const c = a + (subdivs + 1);
        const d = c + 1;
        indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
        indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
      }
    }
    base += vertsPerSlice;
  }
  return { verts, indices, indexCount: ii };
}

// ── GL state (module-level, marker-renderer pattern) ──────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gl: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prog: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vbo: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ibo: any = null;
let indexCount = 0;
let initialized = false;
let meshDirty = true;
let linkFailed = false; // shader didn't link → wwt-hacks falls back to WWT's quad

let aPos = -1;
let aUV = -1;
let aPlane = -1;
let aMeta = -1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uMV: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uProj: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uTex: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uOpacity: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uThickness: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compile(ctx: any, type: number, src: string): any {
  const s = ctx.createShader(type);
  ctx.shaderSource(s, src);
  ctx.compileShader(s);
  if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
    // eslint-disable-next-line no-console
    console.error("[Galaxy3D] shader compile error:", ctx.getShaderInfoLog(s));
  }
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(ctx: any): void {
  const v = compile(ctx, ctx.VERTEX_SHADER, VERT_SRC);
  const f = compile(ctx, ctx.FRAGMENT_SHADER, FRAG_SRC);
  const p = ctx.createProgram();
  ctx.attachShader(p, v);
  ctx.attachShader(p, f);
  ctx.linkProgram(p);
  if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) {
    // eslint-disable-next-line no-console
    console.error("[Galaxy3D] program link error:", ctx.getProgramInfoLog(p));
    linkFailed = true;
  }
  prog = p;
  aPos = ctx.getAttribLocation(p, "aPos");
  aUV = ctx.getAttribLocation(p, "aUV");
  aPlane = ctx.getAttribLocation(p, "aPlane");
  aMeta = ctx.getAttribLocation(p, "aMeta");
  uMV = ctx.getUniformLocation(p, "uMVMatrix");
  uProj = ctx.getUniformLocation(p, "uPMatrix");
  uTex = ctx.getUniformLocation(p, "uTex");
  uOpacity = ctx.getUniformLocation(p, "uOpacity");
  uThickness = ctx.getUniformLocation(p, "uThickness");
  vbo = ctx.createBuffer();
  ibo = ctx.createBuffer();
  gl = ctx;
  initialized = true;
  // buildSliceMesh() regenerates fresh geometry from module state (not staged
  // external data), so re-initializing after a context change fully recovers —
  // just force the next draw to re-upload into the new vbo/ibo.
  meshDirty = true;
  // Console handle for live tier switching (__gxTier then __gxRebuild()).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__gxRebuild = rebuildGalaxy3D;
}

function uploadMesh(): void {
  if (!gl || !vbo || !ibo) { return; }
  const mesh = buildSliceMesh();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  indexCount = mesh.indexCount;
  meshDirty = false;
}

/**
 * True when the ensemble replaces WWT's own galaxy-image quad (the h=0 base
 * slice draws the texture, vignetted circular). wwt-hacks.ts:drawGalaxyImage
 * falls back to the original quad when this is false (disabled via the __gx
 * kill switch, or the shader failed to link on this GPU).
 */
export function ensembleHandlesBasePlane(): boolean {
  if (!GALAXY3D_ENABLED || linkFailed || typeof window === "undefined") { return false; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__gx !== false;
}

// ── Per-frame draw ────────────────────────────────────────────────────────────
/**
 * Draw the slice stack (h=0 base plane + volume slices). Called by
 * wwt-hacks.ts:drawGalaxyImage in place of the original quad, with the same
 * zoom-fade opacity — only ever in 3D (the engine gates Grids.drawGalaxyImage
 * on solar-system mode).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawGalaxyEnsemble(renderContext: any, opacity: number): void {
  if (!GALAXY3D_ENABLED || typeof window === "undefined") { return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__gx === false) { return; }
  if (opacity <= 0 || !renderContext || !renderContext.gl) { return; }

  // The Gaia texture is created by the base quad's first draw; until it has
  // streamed in there is nothing to sample.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mwImage = (Engine as any).Grids._milkyWayImage;
  const texHandle = mwImage && mwImage.texture2d;
  if (!texHandle) { return; }

  const ctx = renderContext.gl;
  // Cheap context-loss guard — see footprints.ts's drawFootprints for the
  // rationale. This module recovers fully: meshDirty forces a re-upload.
  if (!initialized || gl !== ctx) { init(ctx); }
  if (meshDirty) { uploadMesh(); }
  if (indexCount === 0 || !prog || !vbo || !ibo) { return; }

  // Save the GL state we touch.
  const oldProg = ctx.getParameter(ctx.CURRENT_PROGRAM);
  const oldArrBuf = ctx.getParameter(ctx.ARRAY_BUFFER_BINDING);
  const oldElemBuf = ctx.getParameter(ctx.ELEMENT_ARRAY_BUFFER_BINDING);
  const oldActiveTex = ctx.getParameter(ctx.ACTIVE_TEXTURE);
  ctx.activeTexture(ctx.TEXTURE0);
  const oldTex0 = ctx.getParameter(ctx.TEXTURE_BINDING_2D);
  const oldBlend = ctx.isEnabled(ctx.BLEND);
  const oldBlendSrc = ctx.getParameter(ctx.BLEND_SRC_RGB);
  const oldBlendDst = ctx.getParameter(ctx.BLEND_DST_RGB);
  const oldDepth = ctx.isEnabled(ctx.DEPTH_TEST);
  const oldDepthMask = ctx.getParameter(ctx.DEPTH_WRITEMASK);
  const oldCull = ctx.isEnabled(ctx.CULL_FACE);

  ctx.useProgram(prog);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mv = (Engine as any).Matrix3d.multiplyMatrix(renderContext.get_world(), renderContext.get_view());
  ctx.uniformMatrix4fv(uMV, false, mv.floatArray());
  ctx.uniformMatrix4fv(uProj, false, renderContext.get_projection().floatArray());
  const exposure = typeof w.__gxExposure === "number" ? w.__gxExposure : 1;
  ctx.uniform1f(uOpacity, opacity * exposure);
  const thickness = typeof w.__gxThickness === "number" ? Math.max(0.05, w.__gxThickness) : 1;
  ctx.uniform1f(uThickness, thickness);
  ctx.bindTexture(ctx.TEXTURE_2D, texHandle);
  ctx.uniform1i(uTex, 0);

  ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
  ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, ibo);
  // WWT's shaders leave attribs 0–3 enabled; disable defensively.
  ctx.disableVertexAttribArray(0);
  ctx.disableVertexAttribArray(1);
  ctx.disableVertexAttribArray(2);
  ctx.disableVertexAttribArray(3);

  if (aPos >= 0) {
    ctx.enableVertexAttribArray(aPos);
    ctx.vertexAttribPointer(aPos, 3, ctx.FLOAT, false, STRIDE_BYTES, 0);
  }
  if (aUV >= 0) {
    ctx.enableVertexAttribArray(aUV);
    ctx.vertexAttribPointer(aUV, 2, ctx.FLOAT, false, STRIDE_BYTES, 12);
  }
  if (aPlane >= 0) {
    ctx.enableVertexAttribArray(aPlane);
    ctx.vertexAttribPointer(aPlane, 2, ctx.FLOAT, false, STRIDE_BYTES, 20);
  }
  if (aMeta >= 0) {
    ctx.enableVertexAttribArray(aMeta);
    ctx.vertexAttribPointer(aMeta, 2, ctx.FLOAT, false, STRIDE_BYTES, 28);
  }

  // Screen compositing (ONE, ONE_MINUS_SRC_COLOR): commutative like additive
  // (order-independent, black still keys itself), but each slice's light is
  // scaled by the headroom left below white, so the stack saturates smoothly
  // toward 1.0 instead of clipping — the bulge/core keeps structure at the
  // desktop gain rather than blowing out to a white slab. Faint regions are
  // unchanged (dst ≈ 0 ⇒ screen ≈ additive). Slices are visible from both
  // sides, so no face culling.
  ctx.enable(ctx.BLEND);
  ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_COLOR);
  ctx.disable(ctx.DEPTH_TEST);
  ctx.depthMask(false);
  ctx.disable(ctx.CULL_FACE);

  ctx.drawElements(ctx.TRIANGLES, indexCount, ctx.UNSIGNED_SHORT, 0);

  if (aPos >= 0) { ctx.disableVertexAttribArray(aPos); }
  if (aUV >= 0) { ctx.disableVertexAttribArray(aUV); }
  if (aPlane >= 0) { ctx.disableVertexAttribArray(aPlane); }
  if (aMeta >= 0) { ctx.disableVertexAttribArray(aMeta); }

  // Restore GL state.
  if (oldBlend) { ctx.enable(ctx.BLEND); } else { ctx.disable(ctx.BLEND); }
  ctx.blendFunc(oldBlendSrc, oldBlendDst);
  if (oldDepth) { ctx.enable(ctx.DEPTH_TEST); } else { ctx.disable(ctx.DEPTH_TEST); }
  ctx.depthMask(oldDepthMask);
  if (oldCull) { ctx.enable(ctx.CULL_FACE); }
  ctx.bindTexture(ctx.TEXTURE_2D, oldTex0);
  ctx.activeTexture(oldActiveTex);
  ctx.bindBuffer(ctx.ARRAY_BUFFER, oldArrBuf);
  ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, oldElemBuf);
  ctx.useProgram(oldProg);

  // Phase B: dust + glow sprite clouds over the slice stack (each saves/restores
  // its own GL state). Glow shares the slice exposure; dust tracks the raw fade.
  drawGalaxySprites(renderContext, opacity, exposure);
  // §5 calibration overlay — only when window.__gxDebugArms is set.
  drawGalaxyDebugArms(renderContext, opacity);
}

// ── Public API (kept from v2 so jwst-viewer.vue needs no flow changes) ────────
export function installGalaxy3D(): void {
  // v3 needs no engine monkey-patch of its own: wwt-hacks.ts:drawGalaxyImage
  // invokes drawGalaxyEnsemble() after drawing the base quad. Kept for API
  // compatibility with jwst-viewer.vue's install3DHacks().
}

/** Drop the slice mesh + sprite buffers; both rebuild (current tier) next draw. */
export function rebuildGalaxy3D(): void {
  meshDirty = true;
  rebuildGalaxySprites();
}
