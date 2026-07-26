// ── GalaxyDebug ──────────────────────────────────────────────────────────────
// §5 calibration overlay (GALAXY3D_PLAN.md): draws the structure model's arm
// centerlines + bar outline + Sun marker as bright line segments in the galactic
// plane, via galaxy-structure.ts::galToWorld (the SAME calib map the sprites
// use). Toggle with window.__gxDebugArms = true; then face the galaxy on and
// nudge window.__gxArmPhase / __gxArmFlip until the centerlines track the Gaia
// texture's arms, and bake the values into galaxy-structure.ts.
//
// Tiny self-contained gl.LINES renderer (no instancing, rebuilt each frame it's
// on — debug only, cost irrelevant). Saves/restores the GL state it touches.

import * as Engine from "@wwtelescope/engine";
import { armCenterlines, barOutline, galToWorld, sunMarker } from "./galaxy-structure";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prog: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vbo: any = null;
let aPos = -1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uMV: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uProj: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uColor: any = null;
let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGl: any = null; // context this renderer initialized against

const VERT_SRC = `\
attribute vec3 aPos;
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
void main() { gl_Position = uPMatrix * uMVMatrix * vec4(aPos, 1.0); }
`;
const FRAG_SRC = `\
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(ctx: any): void {
  const v = ctx.createShader(ctx.VERTEX_SHADER);
  ctx.shaderSource(v, VERT_SRC); ctx.compileShader(v);
  const f = ctx.createShader(ctx.FRAGMENT_SHADER);
  ctx.shaderSource(f, FRAG_SRC); ctx.compileShader(f);
  const p = ctx.createProgram();
  ctx.attachShader(p, v); ctx.attachShader(p, f); ctx.linkProgram(p);
  prog = p;
  aPos = ctx.getAttribLocation(p, "aPos");
  uMV = ctx.getUniformLocation(p, "uMVMatrix");
  uProj = ctx.getUniformLocation(p, "uPMatrix");
  uColor = ctx.getUniformLocation(p, "uColor");
  vbo = ctx.createBuffer();
  initialized = true;
  cachedGl = ctx;
}

// Build a flat Float32Array of LINE segment endpoints (world AU) from the
// galactocentric polylines, h=0 plane.
function buildSegments(): Float32Array {
  const segs: number[] = [];
  const pushLine = (pts: number[][]): void => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = galToWorld(pts[i][0], pts[i][1], 0);
      const b = galToWorld(pts[i + 1][0], pts[i + 1][1], 0);
      segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  };
  for (const arm of armCenterlines()) { pushLine(arm); }
  pushLine(barOutline());
  // Sun marker: a small plane cross at (-R0, 0).
  const s = sunMarker();
  const d = 0.6;
  pushLine([[s[0] - d, s[1]], [s[0] + d, s[1]]]);
  pushLine([[s[0], s[1] - d], [s[0], s[1] + d]]);
  return new Float32Array(segs);
}

/** Draw the calibration overlay when window.__gxDebugArms is truthy. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawGalaxyDebugArms(renderContext: any, opacity: number): void {
  if (typeof window === "undefined") { return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (!w.__gxDebugArms) { return; }
  if (!renderContext || !renderContext.gl) { return; }
  const ctx = renderContext.gl;
  // Cheap context-loss guard — see footprints.ts's drawFootprints for the
  // rationale (full recovery is out of scope). No secondary cache to reset
  // here: buildSegments()/bufferData() both run fresh every draw already.
  if (!initialized || cachedGl !== ctx) { init(ctx); }
  if (!prog) { return; }

  const data = buildSegments();
  const vertCount = data.length / 3;
  if (vertCount === 0) { return; }

  const oldProg = ctx.getParameter(ctx.CURRENT_PROGRAM);
  const oldArrBuf = ctx.getParameter(ctx.ARRAY_BUFFER_BINDING);
  const oldBlend = ctx.isEnabled(ctx.BLEND);
  const oldBlendSrc = ctx.getParameter(ctx.BLEND_SRC_RGB);
  const oldBlendDst = ctx.getParameter(ctx.BLEND_DST_RGB);
  const oldDepth = ctx.isEnabled(ctx.DEPTH_TEST);

  ctx.useProgram(prog);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mv = (Engine as any).Matrix3d.multiplyMatrix(renderContext.get_world(), renderContext.get_view());
  ctx.uniformMatrix4fv(uMV, false, mv.floatArray());
  ctx.uniformMatrix4fv(uProj, false, renderContext.get_projection().floatArray());
  ctx.uniform4f(uColor, 0.2, 1.0, 0.4, Math.max(0.3, Math.min(1, opacity)));

  ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
  ctx.bufferData(ctx.ARRAY_BUFFER, data, ctx.DYNAMIC_DRAW);
  ctx.disableVertexAttribArray(0);
  ctx.disableVertexAttribArray(1);
  ctx.disableVertexAttribArray(2);
  ctx.disableVertexAttribArray(3);
  if (aPos >= 0) {
    ctx.enableVertexAttribArray(aPos);
    ctx.vertexAttribPointer(aPos, 3, ctx.FLOAT, false, 12, 0);
  }
  ctx.disable(ctx.DEPTH_TEST);
  ctx.enable(ctx.BLEND);
  ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);
  ctx.drawArrays(ctx.LINES, 0, vertCount);
  if (aPos >= 0) { ctx.disableVertexAttribArray(aPos); }

  if (oldBlend) { ctx.enable(ctx.BLEND); } else { ctx.disable(ctx.BLEND); }
  ctx.blendFunc(oldBlendSrc, oldBlendDst);
  if (oldDepth) { ctx.enable(ctx.DEPTH_TEST); } else { ctx.disable(ctx.DEPTH_TEST); }
  ctx.bindBuffer(ctx.ARRAY_BUFFER, oldArrBuf);
  ctx.useProgram(oldProg);
}
