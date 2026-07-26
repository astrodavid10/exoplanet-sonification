# Exoplanet custom WebGL renderer — migration plan

> **STATUS: COMPLETE — this is a historical document, not a task list.**
>
> All six steps shipped; `src/exoplanet-renderer.ts` is live and hooked in via
> `exo-sonification.vue` (`installExoplanetCloud`) and `wwt-hacks.ts`
> (`drawExoplanetCloud`, `isExoplanetLayerName`).
>
> Everything below the "Remaining steps" heading is retained **design
> rationale for work already done**, not instructions to carry out. Read it to
> understand *why* the renderer is shaped the way it is — in particular the
> vertex layout, the days-since-1990 date encoding, and the footgun list at the
> end, which are all still accurate. Do not follow its imperative steps.

Self-contained handoff doc for the migration from WWT's `SpreadSheetLayer`
point rendering to a custom WebGL renderer (`src/exoplanet-renderer.ts`).

## Why we're doing this

WWT's default exoplanet dots are bilinear-filtered RGBA texture sprites that
look fuzzy. The current CSS-overlay ping animation runs in screen space, so
it doesn't track the dots when the WWT camera moves. We're replacing both
with a single custom WebGL renderer that owns the dot pass AND the ping pass,
in world space, in both 2D and 3D.

The hover ping stays as CSS — it follows the cursor anyway and the existing
animation is well-tuned.

## What's done (steps 1–6)

### Step 1–2: dot pass renderer + integration

- `src/exoplanet-renderer.ts` — WebGL program with smoothstep disc /
  annular ring fragment shader. Static vertex layout with both 3D-AU and
  2D-unit-sphere positions per row; switches which one feeds `aPos` based on
  `WWTControl.singleton.get_solarSystemMode()`.
- `src/wwt-hacks.ts:layerManagerDraw` — calls `drawExoplanetCloud()` after
  WWT's layer loop, gated by `referenceFrame === 'Sky'` (same gate as the
  existing `_drawSkyOverlays` invocation). World matrix has been restored to
  its pre-LayerMap value at that point, which is identity for the Sky
  LayerMap (reference=0).
- `src/exo-sonification.vue` — calls `installExoplanetCloud(ALL_POINTS_3D,
  colorForCat)` right after the `SpreadSheetLayer.prototype.draw` patch in
  `mounted()`. The renderer stages rows and uploads to GPU lazily on first
  draw.

### Step 3: filtering + cut-over

- Vertex layout extended 28 → 40 bytes. New per-vertex attribs `aCatBit`,
  `aStartDays`, `aEndDays`. Dates are encoded as **days since 1990-01-01**
  (raw ms-since-epoch would lose float32 precision at ~1.7e12).
- New shader uniforms `uNowDays` (slider position) and `uCatMask` (single
  float, bit i = category i enabled — WebGL1-safe via
  `mod(floor(uCatMask / pow(2.0, aCatBit)), 2.0)`).
  Vertex shader sets `gl_PointSize = 0` (clipped) when the row's category bit
  is off or `startDays > uNowDays > endDays`.
- New module exports:
  - `setCategoryEnabled(layerKey, on)` — called from the existing
    `layersOn[cat]` watcher in `exo-sonification.vue`.
  - `setTimeWindow(nowDays)` — called from `onSliderInput` with
    `daysSince1990(getSliderDate())`.
  - `daysSince1990(d)` — helper.
  - `isExoplanetLayerName(name)` — predicate used by the WWT cut-over gate.
- `src/wwt-hacks.ts:drawSpreadSheetLayer` — early-returns for known exoplanet
  layer names when `window.__cloudAuthoritative` is true. Non-exoplanet
  spreadsheet layers (pulsar background, etc.) fall through unaffected.
- Category-bit map is built at install time from the distinct `layerKey`
  values in `ALL_POINTS_3D`. Insertion order is stable across runs.

### Step 4: 2D hit-test parity

- 2D branch of `closestInView` now iterates `ALL_POINTS_3D` instead of
  WWT's `getTableDataInView()`. The WWT path went stale once
  `__cloudAuthoritative=true` stopped re-drawing those layers.
- Mirrors `_closestInView3D` in shape: layersOn / time filter, hemisphere
  pre-cull via `cosSep < cullCos`, screen-bounds rejection, squared-pixel
  ranking. Differs only in projection function
  (`findScreenPointForRADec({ra, dec})`) and pixel threshold (4 px default
  vs 12 px in 3D).
- Returned `PointData.color` uses `{ toString: () => colorForCat(cat) }`
  cast to `Color` — matches the 3D path; previously the 2D path used
  `layer.get_color()`.

### Current debug flags (browser console)

As of step 5/6 the renderer is the **default** dot and ping path; WWT's
spreadsheet draw for exoplanet layers is suppressed by default. To fall
back to WWT's textured points for debugging, set BOTH:

```js
window.__cloudDots = false              // disable our dot/ring draw
window.__cloudAuthoritative = false     // un-suppress WWT's spreadsheet draw
window.__cloudDotSize2D = 5             // px diameter, 2D mode  (default 5)
window.__cloudDotSize3D = 3             // px diameter, 3D mode  (default 3)
window.__cloudDotSize = N               // global override (both modes)
window.__cloudHollow2D = true           // hollow rings in 2D    (default true)
window.__cloudHollow3D = false          // hollow rings in 3D    (default false)
window.__cloudBlend = 'normal' | 'additive'   // default 'normal'
```

### Visual state confirmed by user

- 3D alignment: perfect.
- 2D alignment: perfect (after the bufferIsFlat fix — see
  `index.js:39403–39449`; 2D vertices are unit-sphere, no ecliptic rotation).
- Style: 2D = hollow rings size 5, 3D = filled discs size 3. Blend normal.

### Step 5 — Ring pass for pings (DONE)

Implemented: separate program + dynamic VBO in `exoplanet-renderer.ts`,
exported as `startPing(rowIndex, t0Ms?, opts?)`, `setSearchRing(rowIndex,
opts?)`, `clearSearchRing()`. Vertex inlines both 3D AU and 2D unit-sphere
positions; the dot pass's mode-aware attrib-pointer offset is reused.
Additive blend for ring glow. Drawn at the tail end of
`drawExoplanetCloud` inside the existing save/restore window.

`ROW_INDEX_OF: Map<ALL_POINTS row, number>` in `exo-sonification.vue`
translates timeline / search rows to renderer row indices.

Timeline + search pings are renderer-owned; the persistent search ring
lives in the ring pass with `aDur = -1` (no fade, fixed size). The old
`<div class="search-ping-marker">` + `updateSearchPingPos` reproject loop
are deleted. Hover ring stays CSS (`.ping-circle`) because it's tied to
the cursor anyway and the existing 350 ms animation is well-tuned.

### Step 6 — Audio: pitch-summed gain, no stagger (DONE)

Implemented in `handlePointTransitions`:

1. Filter `newThisMonth` by layersOn (unchanged).
2. Bin into `Map<pitchIndex, count>` via `pitchIndexForPeriod`.
3. For each bin, fire one `BufferSource` at gain `BASE_TONE_GAIN *
   sqrt(count)` through the shared compressor, scheduled at
   `ctx.currentTime` (sample-accurate, no setTimeout stagger).
4. Ping every row through `cloudStartPing` with a shared `t0Ms`.

`MAX_TONES_DESKTOP`, `MAX_TONES_MOBILE`, and the `playStaggerTimers`
data field + stopPlay cleanup are removed. `playPointTone` now delegates
to a shared `_playPitchSample(pitchIdx, gain)` helper that the timeline
path also uses directly.

---

## Remaining steps (in order)

_(none — steps 1–6 complete)_

### Step 5 — Ring pass for pings (historical notes)

Add a second draw pass for active pings. Replaces `spawnPing`,
`spawnPing3D`, and the entire `<div class="ping-layer">` CSS overlay
machinery in `exo-sonification.vue` (lines ~251–266 in template, ~1915–2006
in script — line numbers may have drifted; grep for `spawnPing`).

#### Renderer changes

- New dynamic VBO: per-active-ping vertex carrying `(xR, yR, zR, color
  rgba, t0_ms)`. Max capacity e.g. 1024 — month bursts in the timeline
  rarely exceed a few hundred.
- New ring shader. Vertex computes age from `(now - t0) / durMs`,
  outputs `gl_PointSize = mix(startPx, endPx, easeOut(age))` (FOV-aware
  in 2D; constant in 3D for now). Fragment is the existing hollow-ring
  shader with an additional age-driven alpha fade.
- New API: `cloud.startPing(rowIndex, t0Ms, colorOverride?)`. Pushes onto
  a CPU-side active-pings list. Each frame, walk the list, expire ones
  past `durMs`, write survivors to the dynamic VBO via `bufferSubData`,
  draw.
- Use additive blending (`SRC_ALPHA, ONE`) for the ring pass regardless
  of the dot pass's blend mode — overlapping rings glow.

#### Mode-aware vertex selection

Same as the dot pass: rings should use the unit-sphere position in 2D
and the AU position in 3D. The `aPos` attrib pointer switch by mode
applies. Reuse the rowIndex into the existing static buffer (don't
duplicate position data on the ping VBO — store the rowIndex instead and
sample positions via a uniform-bound texture, OR just inline the position
on the ping vertex since pings are short-lived and few).

Simpler v1: inline position on the ping vertex. `startPing(rowIndex)`
looks up `ALL_POINTS_3D[rowIndex]` and packs both pos3D and pos2D into
the ping vertex.

#### Search ping marker

The persistent search-result ring becomes a special active-pings entry
with `t0 = -1` (or a separate "search ring" slot). The shader clamps age
to a non-fading constant when `t0 < 0`. Camera-watcher unpin logic in
`exo-sonification.vue` (`checkUnpinOnCameraMove`, `unpinSearchPopup`)
calls `cloud.clearSearchRing()` instead of clearing screen-coord state.

#### Wire from `handlePointTransitions`

Replace the existing `this.spawnPing(...)` and `this.spawnPing3D(...)`
calls in `exo-sonification.vue:handlePointTransitions` with
`this.cloud.startPing(rowIndex, performance.now())`.

For `selectSearchResult`, also call `cloud.setSearchRing(rowIndex)`.

A `rowIndex` is needed at the point of pinging. `ALL_POINTS_BY_DATE` is a
**sorted view** of `ALL_POINTS` — not the same indexing as
`ALL_POINTS_3D`. Options:

1. Add an `idx3D` field to each `ALL_POINTS_BY_DATE` row that points back
   into `ALL_POINTS_3D`. Set it at module load by name-matching (or by
   building both arrays from the same source and recording the original
   index).
2. Make the renderer index by `(ra, dec)` or by name. Slower per lookup
   but no cross-array coupling.

Recommendation: option 1, set up at module load.

#### Cleanup

Delete:
- `pings`, `pingId`, `searchPing` data fields in `exo-sonification.vue`.
- `spawnPing`, `spawnPing3D` methods.
- The `<div class="ping-layer">` block in the template.
- CSS rules for `.ping-layer`, `.ping-circle`, `.search-ping-marker`,
  `@keyframes ping-expand`, `@keyframes search-ping-fade-in`.
- The antipodal hemisphere dot-product cull and window-bounds check
  inside the (now deleted) `spawnPing`/`spawnPing3D`.

Keep:
- The hover CSS popover (`#circle-popover`).
- The hover ping (single CSS ring fired by `updateLastClosePoint`) — leave
  it CSS for now; cheap, screen-space, well-tuned.

### Step 6 — Audio: pitch-summed gain, no stagger within a month

User requirement: don't stagger pings or audio within a discovery month.
The renderer can handle all dots in a month firing at once (visual budget
is trivial). Audio is the real ceiling.

Key insight: there are only 20 distinct pitches (`NOTES_HIGH_TO_LOW` at
module scope in `exo-sonification.vue`). A month with 500 planets has at
most 20 simultaneous voices, not 500. Bin planets by pitch, sum to a
single voice per pitch, scale that voice's gain by the count.

Note: there is *already* a `BASE_TONE_GAIN / Math.sqrt(nAudio)` gain
reduction in the current `handlePointTransitions` (line ~1709), and a
stagger-timer loop. Step 6 is to:

1. Remove the stagger inside a single month tick.
2. Bin by pitch instead of by row, so identical-pitch planets fire as
   one voice with `gain = baseGain * sqrt(count)`.
3. Delete `playStaggerTimers` and the `setTimeout`-based stagger.

#### Sub-linear gain rule (footgun)

Summing N identical samples in phase gives +20·log10(N) dB. For 20
planets at the same pitch that's +26 dB — guaranteed to clip the
compressor. Use a sub-linear rule:

- `gain = baseGain * sqrt(N)` (acoustic-power perceptually flat) — start
  here.
- Alternative: `gain = baseGain * log2(N + 1) * scaleFactor` if sqrt is
  still too hot.

Tune `baseGain` so a single-planet note matches the current hover-ping
volume.

#### Implementation

In `handlePointTransitions`, replace the existing per-row sequential
stagger loop:

1. Collect all planets crossing the slider window this tick into an
   array (already done as `newThisMonth`).
2. Bin by `pitchIndexForPeriod(plOrbper)` into a Map<pitch, count>.
3. For each bin, schedule one `BufferSource` with the pitch's sample,
   gain set to `baseGain * sqrt(count)`, routed through the existing
   shared `DynamicsCompressorNode`. Use `AudioContext.currentTime` for
   sample-accurate scheduling.
4. Call `cloud.startPing(rowIdx, performance.now())` for every planet in
   the tick (no stagger).

#### Validation

- Scrub through 2014–2015 (Kepler discovery peak). Should hear one
  louder C# (or whichever pitch dominates) instead of 200 individual
  notes.
- Single-planet ticks should sound identical to the current behavior.
- Verify the compressor doesn't pump audibly.

## Per-step risks to remember

- **2D vs 3D vertex layouts** (already handled in step 1, but if you add
  a third vertex variant don't forget to also update the offset switch).
- **WWT GL state leaks** — always save/restore around our draws (see
  current `drawExoplanetCloud` for the pattern).
- **Antipodal projection** — `transformWorldPointToPickSpace` doesn't
  check the sign of `vz`. The WebGL clip stage handles vertex-shader
  output correctly, but any code that projects manually (search, hover)
  still needs the hemisphere guard. The new 2D `_closestInView2D` uses
  the same `cosSep < cullCos` guard as 3D.
- **Days-since-1990 encoding** — apply uniformly; don't mix raw ms and
  days anywhere. `daysSince1990()` is exported from
  `exoplanet-renderer.ts`.
- **rowIndex stability** — `ALL_POINTS_3D` order is the source of truth
  for the renderer (vertex i corresponds to row i). Anything addressing
  the GPU buffer must use that index, not e.g. `ALL_POINTS_BY_DATE` order.

## Validation checklist (each step)

- `npm run lint` clean.
- 2D and 3D both render correctly with `__cloudDots = true` and
  `__cloudAuthoritative = true`.
- Toggle every category checkbox at least once.
- Scrub the timeline through 2014 (Kepler burst).
- Search for a planet, verify ping/popover work in both modes.
- Switch 2D↔3D mid-burst to confirm no stale state.

## File map (quick reference)

| File | Role |
|------|------|
| `src/exoplanet-renderer.ts` | Custom renderer module — dot pass + filtering. Step 5 adds the ring pass here. |
| `src/wwt-hacks.ts` | `layerManagerDraw` hook calls `drawExoplanetCloud`; `drawSpreadSheetLayer` gated by `window.__cloudAuthoritative` + `isExoplanetLayerName` |
| `src/exo-sonification.vue` | `installExoplanetCloud` call in `mounted`, `ALL_POINTS_3D` cache, `closestInView` / `_closestInView2D` / `_closestInView3D` hit-tests, `onSliderInput` drives `setTimeWindow`, `layersOn[cat]` watcher drives `setCategoryEnabled`, `handlePointTransitions` audio + pings |
| `CLAUDE.md` | Project context — read first for footguns |

## Resume point after compact

If picking this up cold:

1. Read `CLAUDE.md` first, then this file, then `src/exoplanet-renderer.ts`.
   The renderer's file header has the vertex layout spec; the rest of the
   module is short enough to fully read.
2. Verify Step 4 still works: turn on `window.__cloudDots = true;
   window.__cloudAuthoritative = true;` in the browser console, then
   hover dots in 2D and 3D, scrub the timeline, toggle category
   checkboxes. All should behave correctly.
3. Begin Step 5 (ring pass for pings). The renderer already owns the dot
   pass — the ring pass slots in as a second `drawArrays(POINTS, ...)`
   call inside `drawExoplanetCloud` using a separate dynamic VBO.
