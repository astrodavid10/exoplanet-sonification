// ── GalaxySprites ────────────────────────────────────────────────────────────
// Galaxy3D Phase B sprite clouds: a few thousand textured, camera-facing
// billboards that turn the Phase A slice stack into a structured galaxy — dust
// lanes, warm bulge, blue-crested arms, HII/OB knots (GALAXY3D_PLAN.md §3,
// Layer 2). Self-contained like marker-renderer.ts / cosmosweb-field.ts; drawn
// by galaxy3d.ts::drawGalaxyEnsemble AFTER the slices, in two order-independent
// passes:
//   • dust  — blendFunc(ZERO, ONE_MINUS_SRC_ALPHA): multiplicative darkening of
//             what's already drawn (commutative → no sorting). Real dark
//             geometry, not the v2 invisible per-star extinction.
//   • glow  — blendFunc(ONE, ONE_MINUS_SRC_COLOR): screen-composited luminance
//             (premultiplied in-shader), keys itself for free like additive but
//             compresses toward white instead of clipping (see galaxy3d.ts).
// Both share one program and a static unit quad; per-instance pos/size/color/UV
// come through ANGLE_instanced_arrays (avoids gl.POINTS' 64px mobile clamp — the
// puffs are large; GALAXY3D_PLAN §3 "Sprite geometry decision").
//
// Geometry + palettes are built by galaxy-structure.ts (image-anchored frame),
// the atlas by galaxy-atlas.ts (procedural canvas, no shipped asset). Build is
// lazy on first 3D draw; rebuildGalaxySprites() re-runs it after a tier /
// calibration knob change.
//
// Live knobs: window.__gxSprites (count scale, in galaxy-structure),
//   __gxDust (dust strength ×), __gxExposure (glow ×, shared with slices),
//   __gxSpriteSize (global size ×).

import * as Engine from "@wwtelescope/engine";
import { buildGalaxyAtlas, GalaxyAtlas } from "./galaxy-atlas";
import { buildGalaxySprites, GalaxySprite } from "./galaxy-structure";

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

// iPos vec3 (12) + iSize f32 (4) + iColor rgba8 (4) + iUV vec4 (16) = 36 bytes.
const INST_STRIDE = 36;
const INST_FLOATS = INST_STRIDE / 4;
const COLOR_OFFSET = 16;

const VERT_SRC = `\
attribute vec2 aCorner;
attribute vec2 aBaseUV;
attribute vec3 iPos;
attribute float iSize;
attribute vec4 iColor;
attribute vec4 iUV;
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
varying vec2 vUV;
varying vec4 vColor;
void main() {
  vec4 eye = uMVMatrix * vec4(iPos, 1.0);
  eye.xy += aCorner * iSize;      // screen-aligned billboard, size in world AU
  gl_Position = uPMatrix * eye;
  vUV = iUV.xy + aBaseUV * iUV.zw;
  vColor = iColor;
}
`;

// Premultiplied output so ONE,ONE (glow) and ZERO,ONE_MINUS_SRC_ALPHA (dust)
// both work from one shader. The atlas stores the profile in alpha (rgb white).
const FRAG_SRC = `\
precision mediump float;
varying vec2 vUV;
varying vec4 vColor;
uniform sampler2D uAtlas;
uniform float uOpacity;
void main() {
  float t = texture2D(uAtlas, vUV).a;
  float a = t * vColor.a * uOpacity;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(vColor.rgb * a, a);
}
`;

// Static unit quad (triangle strip): corner.xy in [-1,1], baseUV.xy in [0,1].
// UV authored top-down (v=0 at +y) to match the atlas canvas orientation.
const QUAD = new Float32Array([
  -1, -1, 0, 1,
  1, -1, 1, 1,
  -1, 1, 0, 0,
  1, 1, 1, 0,
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ext: any = null; // ANGLE_instanced_arrays (WebGL1 only; null on WebGL2)
let isGl2 = false; // WWT may hand us a WebGL2 context, where instancing is core
// Instancing shim: WebGL2 core methods, or the ANGLE extension on WebGL1.
let setDivisor: (loc: number, d: number) => void = () => { /* set in init */ };
let drawInstanced: (mode: number, first: number, count: number, primCount: number) => void =
  () => { /* set in init */ };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prog: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let quadVbo: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dustVbo: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let glowVbo: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tex: any = null;
let dustCount = 0;
let glowCount = 0;
let initialized = false;
let built = false;
let buildFailed = false;
let unsupported = false; // no ANGLE_instanced_arrays on this GL context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGl: any = null; // context this renderer initialized against

let aCorner = -1;
let aBaseUV = -1;
let iPos = -1;
let iSize = -1;
let iColor = -1;
let iUV = -1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uMV: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uProj: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uAtlas: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uOpacity: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compile(ctx: any, type: number, src: string): any {
  const s = ctx.createShader(type);
  ctx.shaderSource(s, src);
  ctx.compileShader(s);
  if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
    // eslint-disable-next-line no-console
    console.error("[GalaxySprites] shader compile error:", ctx.getShaderInfoLog(s));
  }
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(ctx: any): void {
  // Install the diagnostic hook FIRST so __gxSpriteInfo() is always queryable —
  // even on the unsupported path below (where it previously was never defined,
  // making the very failure it reports invisible).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__gxSpriteInfo = (): unknown => ({
    initialized, unsupported, buildFailed, built, dustCount, glowCount,
    isGl2, extPresent: !!ext, progOk: !!prog,
    locs: { aCorner, aBaseUV, iPos, iSize, iColor, iUV },
  });

  // Instancing is core in WebGL2 (ANGLE_instanced_arrays is NOT exposed there —
  // getExtension returns null); only WebGL1 needs the extension.
  isGl2 = typeof WebGL2RenderingContext !== "undefined" && ctx instanceof WebGL2RenderingContext;
  if (isGl2) {
    setDivisor = (loc, d): void => ctx.vertexAttribDivisor(loc, d);
    drawInstanced = (mode, first, count, primCount): void =>
      ctx.drawArraysInstanced(mode, first, count, primCount);
  } else {
    ext = ctx.getExtension("ANGLE_instanced_arrays");
    if (!ext) {
      unsupported = true;
      initialized = true;
      cachedGl = ctx;
      return;
    }
    setDivisor = (loc, d): void => ext.vertexAttribDivisorANGLE(loc, d);
    drawInstanced = (mode, first, count, primCount): void =>
      ext.drawArraysInstancedANGLE(mode, first, count, primCount);
  }
  const v = compile(ctx, ctx.VERTEX_SHADER, VERT_SRC);
  const f = compile(ctx, ctx.FRAGMENT_SHADER, FRAG_SRC);
  const p = ctx.createProgram();
  ctx.attachShader(p, v);
  ctx.attachShader(p, f);
  ctx.linkProgram(p);
  if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) {
    // eslint-disable-next-line no-console
    console.error("[GalaxySprites] program link error:", ctx.getProgramInfoLog(p));
    buildFailed = true;
  }
  prog = p;
  aCorner = ctx.getAttribLocation(p, "aCorner");
  aBaseUV = ctx.getAttribLocation(p, "aBaseUV");
  iPos = ctx.getAttribLocation(p, "iPos");
  iSize = ctx.getAttribLocation(p, "iSize");
  iColor = ctx.getAttribLocation(p, "iColor");
  iUV = ctx.getAttribLocation(p, "iUV");
  uMV = ctx.getUniformLocation(p, "uMVMatrix");
  uProj = ctx.getUniformLocation(p, "uPMatrix");
  uAtlas = ctx.getUniformLocation(p, "uAtlas");
  uOpacity = ctx.getUniformLocation(p, "uOpacity");
  quadVbo = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, quadVbo);
  ctx.bufferData(ctx.ARRAY_BUFFER, QUAD, ctx.STATIC_DRAW);
  dustVbo = ctx.createBuffer();
  glowVbo = ctx.createBuffer();
  tex = ctx.createTexture();
  initialized = true;
  cachedGl = ctx;
  // The dust/glow/atlas geometry itself is cached in JS (computeGeometry's
  // cachedAtlas/cachedDustBuf/cachedGlowBuf), so it survives a context
  // change — just force the next draw to re-upload it into the fresh
  // dustVbo/glowVbo/tex created above.
  built = false;
}

function buildInstanceBuffer(sprites: GalaxySprite[], atlas: GalaxyAtlas): ArrayBuffer {
  const du = atlas.cellPx / atlas.atlasW;
  const dv = atlas.cellPx / atlas.atlasH;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const sizeMul = typeof w.__gxSpriteSize === "number" ? Math.max(0.05, w.__gxSpriteSize) : 1;
  const buf = new ArrayBuffer(sprites.length * INST_STRIDE);
  const f32 = new Float32Array(buf);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < sprites.length; i++) {
    const sp = sprites[i];
    const fo = i * INST_FLOATS;
    const bo = i * INST_STRIDE;
    f32[fo + 0] = sp.x;
    f32[fo + 1] = sp.y;
    f32[fo + 2] = sp.z;
    f32[fo + 3] = sp.size * sizeMul;
    u8[bo + COLOR_OFFSET + 0] = Math.max(0, Math.min(255, Math.round(sp.r * 255)));
    u8[bo + COLOR_OFFSET + 1] = Math.max(0, Math.min(255, Math.round(sp.g * 255)));
    u8[bo + COLOR_OFFSET + 2] = Math.max(0, Math.min(255, Math.round(sp.b * 255)));
    u8[bo + COLOR_OFFSET + 3] = Math.max(0, Math.min(255, Math.round(sp.a * 255)));
    const col = sp.cell % atlas.cols;
    const row = Math.floor(sp.cell / atlas.cols);
    f32[fo + 5] = col * du;
    f32[fo + 6] = row * dv;
    f32[fo + 7] = du;
    f32[fo + 8] = dv;
  }
  return buf;
}

// Cached results of the pure (no-GL) part of the build: atlas canvas paint +
// structure/instance-buffer math. Populated either lazily inside build() or
// ahead of time by prewarmGalaxySprites() during 2D idle, so the first 3D
// draw only has to do GL buffer/texture uploads.
let cachedAtlas: GalaxyAtlas | null = null;
let cachedDustBuf: ArrayBuffer | null = null;
let cachedGlowBuf: ArrayBuffer | null = null;
let cachedDustCount = 0;
let cachedGlowCount = 0;

function computeGeometry(): void {
  const mobile = isMobileTier();
  const atlas = buildGalaxyAtlas(mobile ? 128 : 256);
  const set = buildGalaxySprites(mobile);
  cachedAtlas = atlas;
  cachedDustBuf = buildInstanceBuffer(set.dust, atlas);
  cachedGlowBuf = buildInstanceBuffer(set.glow, atlas);
  cachedDustCount = set.dust.length;
  cachedGlowCount = set.glow.length;
}

/**
 * Run the atlas paint + structure/instance-buffer build ahead of the first 3D
 * draw. Pure canvas + math work, no GL — safe to call during 2D idle time.
 * No-op if already cached (or already uploaded to GL by build()).
 */
export function prewarmGalaxySprites(): void {
  if (cachedAtlas) { return; }
  computeGeometry();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function build(ctx: any): void {
  if (!cachedAtlas) { computeGeometry(); }
  const atlas = cachedAtlas as GalaxyAtlas;

  ctx.bindBuffer(ctx.ARRAY_BUFFER, dustVbo);
  ctx.bufferData(ctx.ARRAY_BUFFER, cachedDustBuf, ctx.STATIC_DRAW);
  dustCount = cachedDustCount;
  ctx.bindBuffer(ctx.ARRAY_BUFFER, glowVbo);
  ctx.bufferData(ctx.ARRAY_BUFFER, cachedGlowBuf, ctx.STATIC_DRAW);
  glowCount = cachedGlowCount;

  ctx.bindTexture(ctx.TEXTURE_2D, tex);
  ctx.pixelStorei(ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, atlas.canvas);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
  built = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bindInstanceAttribs(ctx: any, vbo: any): void {
  ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
  if (iPos >= 0) {
    ctx.enableVertexAttribArray(iPos);
    ctx.vertexAttribPointer(iPos, 3, ctx.FLOAT, false, INST_STRIDE, 0);
    setDivisor(iPos, 1);
  }
  if (iSize >= 0) {
    ctx.enableVertexAttribArray(iSize);
    ctx.vertexAttribPointer(iSize, 1, ctx.FLOAT, false, INST_STRIDE, 12);
    setDivisor(iSize, 1);
  }
  if (iColor >= 0) {
    ctx.enableVertexAttribArray(iColor);
    ctx.vertexAttribPointer(iColor, 4, ctx.UNSIGNED_BYTE, true, INST_STRIDE, COLOR_OFFSET);
    setDivisor(iColor, 1);
  }
  if (iUV >= 0) {
    ctx.enableVertexAttribArray(iUV);
    ctx.vertexAttribPointer(iUV, 4, ctx.FLOAT, false, INST_STRIDE, 20);
    setDivisor(iUV, 1);
  }
}

/**
 * Draw the dust + glow sprite passes. Called by galaxy3d.ts::drawGalaxyEnsemble
 * after the slice stack, sharing its zoom-fade `opacity`. `exposure` multiplies
 * the glow pass only (dust darkening tracks the raw fade). 3D-only is already
 * guaranteed by the caller (Grids.drawGalaxyImage runs in solar-system mode).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawGalaxySprites(renderContext: any, opacity: number, exposure: number): void {
  if (typeof window === "undefined") { return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__gxSpritesOff === true) { return; }
  if (opacity <= 0 || !renderContext || !renderContext.gl) { return; }
  const ctx = renderContext.gl;
  // Cheap context-loss guard — see footprints.ts's drawFootprints for the
  // rationale. This module recovers fully: the JS-side geometry cache
  // survives, `built = false` (set in init()) forces a re-upload into it.
  if (!initialized || cachedGl !== ctx) { init(ctx); }
  if (unsupported || buildFailed || !prog) { return; }
  if (!built) { build(ctx); }
  if (dustCount === 0 && glowCount === 0) { return; }

  // Save the GL state we touch.
  const oldProg = ctx.getParameter(ctx.CURRENT_PROGRAM);
  const oldArrBuf = ctx.getParameter(ctx.ARRAY_BUFFER_BINDING);
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
  ctx.activeTexture(ctx.TEXTURE0);
  ctx.bindTexture(ctx.TEXTURE_2D, tex);
  ctx.uniform1i(uAtlas, 0);

  // Per-vertex quad attribs (divisor 0).
  ctx.bindBuffer(ctx.ARRAY_BUFFER, quadVbo);
  ctx.disableVertexAttribArray(0);
  ctx.disableVertexAttribArray(1);
  ctx.disableVertexAttribArray(2);
  ctx.disableVertexAttribArray(3);
  if (aCorner >= 0) {
    ctx.enableVertexAttribArray(aCorner);
    ctx.vertexAttribPointer(aCorner, 2, ctx.FLOAT, false, 16, 0);
    setDivisor(aCorner, 0);
  }
  if (aBaseUV >= 0) {
    ctx.enableVertexAttribArray(aBaseUV);
    ctx.vertexAttribPointer(aBaseUV, 2, ctx.FLOAT, false, 16, 8);
    setDivisor(aBaseUV, 0);
  }

  ctx.disable(ctx.DEPTH_TEST);
  ctx.depthMask(false);
  ctx.disable(ctx.CULL_FACE);
  ctx.enable(ctx.BLEND);

  // Dust pass: multiplicative darkening, tracks the raw zoom fade (no exposure).
  const dustMul = typeof w.__gxDust === "number" ? Math.max(0, w.__gxDust) : 1;
  if (dustCount > 0 && dustMul > 0) {
    ctx.uniform1f(uOpacity, opacity * dustMul);
    ctx.blendFunc(ctx.ZERO, ctx.ONE_MINUS_SRC_ALPHA);
    bindInstanceAttribs(ctx, dustVbo);
    drawInstanced(ctx.TRIANGLE_STRIP, 0, 4, dustCount);
  }

  // Glow pass: screen compositing (see galaxy3d.ts — order-independent like
  // additive, but compresses toward white instead of clipping over the bright
  // slice stack), scaled by the shared exposure.
  if (glowCount > 0) {
    ctx.uniform1f(uOpacity, opacity * exposure);
    ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_COLOR);
    bindInstanceAttribs(ctx, glowVbo);
    drawInstanced(ctx.TRIANGLE_STRIP, 0, 4, glowCount);
  }

  // Reset divisors + disable our arrays (divisors are global GL state — leaving
  // one set would corrupt WWT's later non-instanced draws on the same index).
  for (const loc of [iPos, iSize, iColor, iUV]) {
    if (loc >= 0) { setDivisor(loc, 0); ctx.disableVertexAttribArray(loc); }
  }
  if (aCorner >= 0) { ctx.disableVertexAttribArray(aCorner); }
  if (aBaseUV >= 0) { ctx.disableVertexAttribArray(aBaseUV); }

  // Restore GL state.
  if (oldBlend) { ctx.enable(ctx.BLEND); } else { ctx.disable(ctx.BLEND); }
  ctx.blendFunc(oldBlendSrc, oldBlendDst);
  if (oldDepth) { ctx.enable(ctx.DEPTH_TEST); } else { ctx.disable(ctx.DEPTH_TEST); }
  ctx.depthMask(oldDepthMask);
  if (oldCull) { ctx.enable(ctx.CULL_FACE); }
  ctx.bindTexture(ctx.TEXTURE_2D, oldTex0);
  ctx.activeTexture(oldActiveTex);
  ctx.bindBuffer(ctx.ARRAY_BUFFER, oldArrBuf);
  ctx.useProgram(oldProg);
}

/** Re-run the structure + atlas build (after a tier / calibration knob change). */
export function rebuildGalaxySprites(): void {
  built = false;
  cachedAtlas = null;
  cachedDustBuf = null;
  cachedGlowBuf = null;
}
