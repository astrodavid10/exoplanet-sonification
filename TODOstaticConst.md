# TODO: ship constellation figures as a static precomputed asset

## Background

Today, constellation figures are computed at runtime in two places:

1. **2D mode** — `src/wwt-hacks.ts` `drawSkyOverlays()` calls WWT's stock
   `Constellations.drawConstellationNames` and `constellationsFigures.draw()`.
   WWT loads `figures.txt` lazily on first draw (`Constellations.create(...,
   URLHelpers.singleton.engineAssetUrl('figures.txt'), ...)`).
2. **3D mode** — `_buildFigures3D()` in `src/wwt-hacks.ts` matches each
   `figures.txt` endpoint to its nearest naked-eye Hipparcos star (≤ 2.5°,
   mag < 6.5), then emits absolute-AU line vertices using the matched star's
   `position`. Falls back to a 150-pc sphere projection if nothing matches.

In a previous session I added `prebuildFigures3D()` as a runtime warm-up:
on mount we poll every 250 ms until figures.txt + Hipparcos are loaded and
the GL vertex buffer is built. This solves the *first-toggle pops in at
full alpha mid-fade* problem but still depends on two async fetches at
runtime.

## Goal

Ship a single static binary in `public/` containing the precomputed 3D
constellation line endpoints, and load it instead of running the matching
algorithm at runtime. Benefits:

- No dependency on WWT's `figures.txt` asset host being reachable.
- No dependency on the WWT Hipparcos star file having loaded by the time
  constellations are toggled on.
- No matching loop at runtime → instant ready state, smaller code path.
- Deterministic output across browsers / WWT engine versions.

## Output format

Suggested: `public/constellation-figures-3d.bin` — a packed Float32Array
of `[x0, y0, z0, x1, y1, z1, x0', y0', z0', x1', y1', z1', ...]` line
segment endpoints in the **same coordinate frame** that `star.position`
ends up in after `Coordinates.raDecTo3dAu(...)` + `rotateX(ecliptic)`
inside WWT's `initStarVertexBuffer`. Units: AU.

Optionally a tiny JSON sidecar `constellation-figures-3d.json` with
metadata: `{ "vertexCount": N, "generatedAt": "...", "ecliptic": "..." }`.
The ecliptic obliquity used at generation time should be recorded so we
can warn (or regenerate) if it drifts noticeably from the runtime value
(it shouldn't — the precession over decades is sub-arcsecond at this
scale).

## Implementation

### Step 1 — write `generate_constellation_figures_3d.py`

Mirrors the style of `generate_exoplanet_data.py`. Inputs:

1. **`figures.txt`** — fetch from
   `https://web.wwtassets.org/engine/assets/figures.txt` (verify this is
   still the path WWT uses; the runtime URL is built by
   `URLHelpers.singleton.engineAssetUrl('figures.txt')`).
   Each line is a constellation polyline. Format reference: WWT engine
   source (`Constellations.create` / `Lineset` / `Linepoint`). Each
   linepoint has RA (hours), Dec (deg), and a `pointType`:
   `3=start, 0=move, 1=line, 2=dash`. Emit a segment only for type 1 or 2.

2. **Hipparcos main catalog** — VizieR I/239/hip_main. Fetch via
   `astroquery.vizier`:

   ```python
   from astroquery.vizier import Vizier
   v = Vizier(columns=["HIP", "RAhms", "DEdms", "Vmag", "Plx"], row_limit=-1)
   t = v.get_catalogs("I/239/hip_main")[0]
   ```

   Filter: `Vmag < 6.5` and `Plx > 0` (non-positive parallax → unusable
   distance). Distance (pc) = `1000 / Plx_mas`.

### Step 2 — replicate WWT's `star.position` transform in Python

`_buildFigures3D` comment says "Same transform pipeline as `star.position`
so frames match." That pipeline is, equivalently:

```python
# WWT's swapped Cartesian convention (see CLAUDE.md "WWT solar-system
# Cartesian convention (footgun)"):
#   Coordinates.raDecTo3dAu(ra_hours, dec_deg, au) returns
#   (cos α cos δ, sin δ, sin α cos δ)
# where α is in radians (RA hours × π/12) and δ is in radians.
# Then rotateX(ecliptic).

import numpy as np

AU_PER_PC = 206264.806

def wwt_star_position(ra_hours, dec_deg, dist_pc, ecliptic_rad):
    alpha = ra_hours * np.pi / 12.0
    delta = np.deg2rad(dec_deg)
    d = dist_pc * AU_PER_PC
    x = d * np.cos(alpha) * np.cos(delta)
    y = d * np.sin(delta)
    z = d * np.sin(alpha) * np.cos(delta)
    # rotateX(theta) per WWT: y' = y cos θ - z sin θ;  z' = y sin θ + z cos θ
    c, s = np.cos(ecliptic_rad), np.sin(ecliptic_rad)
    y2 = y * c - z * s
    z2 = y * s + z * c
    return x, y2, z2
```

**Validation step before trusting this**: read the actual WWT engine
source for `initStarVertexBuffer` and `raDecTo3dAu` (in `@wwtelescope/
engine` — check `node_modules/@wwtelescope/engine/esm/` or upstream
GitHub `wwt-webgl-engine`). Confirm the sign of the `rotateX` rotation
and that no additional precession / proper-motion correction is applied.
If WWT applies proper motion to the J2000 → current-epoch position, we
need to do the same here (Hipparcos catalog has `pmRA` and `pmDE`).

Use a fixed ecliptic obliquity at J2000 (`ε = 23.4392911°`) for
reproducibility, or compute for the SpaceTimeController epoch the engine
uses — the difference is sub-arcsecond and visually irrelevant.

### Step 3 — matching algorithm

Per-endpoint nearest neighbor on the unit sphere, matching the runtime
algorithm in `_buildFigures3D`:

- Build candidate list: Hipparcos with `Vmag < 6.5` and valid `Plx`.
- For each endpoint, brute-force `argmax(dot)` against all candidates
  (~6000 candidates × ~5000 endpoints = 30M dot products → trivial).
  Could use a k-d tree on unit vectors but brute is fast enough.
- If `bestDot >= cos(2.5°)`, use that star's WWT-frame position.
- Else: fall back to sphere projection at `FIG3D_FALLBACK_DIST_PC = 150`,
  same transform pipeline.
- Emit `(prev, curr)` vertex pair for `pointType in (1, 2)`.

Log the matched-vs-total endpoint count — should be ~95%+ matched.

### Step 4 — wire up the static load

In `src/wwt-hacks.ts`:

- Replace `_buildFigures3D` with `_loadFigures3D(renderContext)` that
  `fetch(new URL('constellation-figures-3d.bin', window.location.href))`
  → `arrayBuffer()` → `new Float32Array(buf)` → uploads via
  `gl.bufferData`.
- Remove `_starsReadyForFigures3D` and the `initStarVertexBuffer`
  dependency — neither is needed once vertices are precomputed.
- `prebuildFigures3D` should kick the fetch on first call and resolve
  the GL upload as soon as the bytes arrive. Single attempt, no poll.
- Drop the polling interval in `exo-sonification.vue`'s `mounted()` and
  replace with a single `prebuildFigures3D(this.wwtRenderContext)` call
  once the renderContext exists.

### Step 5 — build pipeline

Add to `requirements_data.txt`: `astroquery`, `astropy`, `numpy`.

Consider adding the generator to the weekly cron in
`.github/workflows/update-exoplanet-data.yml` so the figures file is
regenerated periodically (catches WWT-side figures.txt edits and any
Hipparcos catalog corrections), though realistically it almost never
changes — running it once at adoption and forgetting it is fine.

Document in `CLAUDE.md` under "Procedural 3D Milky Way" or a new
"Constellation figures" subsection: the static file, the generator
script, and the coordinate transform invariants.

## Acceptance

- App loads with no fetch of `figures.txt` for 3D figure construction
  (the 2D draw still uses WWT's stock load — separate concern below).
- Toggling constellations in 3D fades in smoothly within ~100 ms of the
  first-ever load (just the .bin fetch), not seconds.
- 3D figures visually match the current runtime-built output (visual
  diff: walk through Orion, Ursa Major, Crux — all should look identical
  to the pre-static-asset build).

---

## Related: 2D constellation pop-in when panning

**Problem**: In 2D mode, WWT's `constellationsFigures.draw()` and
`Constellations.drawConstellationNames()` cull constellations whose
on-screen footprint is outside the viewport. As the user pans, newly
visible constellations appear instantly at full `_consFigAlpha` instead
of fading in — visually jarring against the smooth toggle fade.

**Two viable fixes** 

### Option A — per-constellation fade-in on first visibility

Track which constellations have been drawn at least once this view
session. On first draw of a new constellation, ramp its alpha from 0 to
the current `_consFigAlpha` over ~400 ms. Implementation: hook into
`SimpleLineShader.use` (already patched for figure alpha) and look up
the per-constellation fade state from a `Map<string, { start: number }>`
keyed by constellation abbreviation.

The hard part: WWT's `constellationsFigures.draw()` doesn't expose a
per-figure callback, and the `SimpleLineShader.use` patch only sees the
GL buffer, not which constellation it belongs to. Solutions:

- Reimplement the draw loop ourselves (iterate `lines`, draw each
  `Lineset` separately, set the alpha per constellation in the shader
  uniform). This duplicates WWT logic but gives us full control.
- Or: patch `Constellations.draw` (the per-figure draw call inside the
  collection) and read the figure name from `this.name` or similar.

### Option B — disable culling by widening the draw range

Force WWT to draw all 88 constellations every frame regardless of
viewport. The figures collection is already loaded in full; the culling
is purely a render optimization. At 2D zoom levels this is ~5000 line
segments per frame — negligible cost on any GPU.

Investigate where the culling happens — likely inside `Lineset.draw`
checking against `renderContext.viewCamera` bounds or a per-lineset
bounding box. If it's a simple early-return on a frustum test, monkey-
patch that method to skip the test. Or patch `constellationsFigures.draw`
to pass a `forceAll = true` flag.

**Recommendation**: try Option B first — much simpler, no per-figure
state tracking, and removes the pop-in entirely instead of softening it.
Option A only helps if Option B has unacceptable perf or render-order
side effects (e.g. labels colliding because more centroids are now
on-screen at once).

### Acceptance for the 2D fix

- Pan slowly across the sky in 2D with constellations on. No instant
  full-alpha pops; either every constellation is already drawn (Option B)
  or new constellations fade in over ~400 ms (Option A).
- No measurable frame-rate regression on the slowest target device
  (mobile, `pointer: coarse`).
