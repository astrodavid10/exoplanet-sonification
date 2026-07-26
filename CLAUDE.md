# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run serve      # local dev server
npm run build      # Python preprocessing + webpack production build
npm run lint       # ESLint (no autofix)
npm run clean      # remove dist/
```

The build runs `python modify_index.py` before webpack. If the Python step fails, run it manually first.

Optional local audio server (SF2/SoundFont playback for development):
```bash
pip install -r requirements.txt
python play_point_server.py   # serves http://127.0.0.1:8000/play-point
```

Regenerate exoplanet data from NASA (also runs weekly via CI):
```bash
pip install -r requirements_data.txt
python generate_exoplanet_data.py   # writes src/exoplanetData.ts and updates planet count in the vue file
```

## Architecture

### What it does
An interactive visualization of ~6,000 known exoplanets rendered in WorldWide Telescope (WWT) in both 2D sky and 3D galaxy views. Each exoplanet can be sonified — its orbital period maps to a guitar note from a set of 19 pre-rendered WAV files in `public/sounds/`.

### Data flow
1. **`generate_exoplanet_data.py`** — Fetches the NASA Exoplanet Archive TAP API (`pscomppars` table), fills missing orbital periods via Kepler's 3rd law, and writes `src/exoplanetData.ts`. Also patches the planet count in the intro modal inside `exo-sonification.vue`.
2. **`src/exoplanetData.ts`** — All exoplanet data as raw CSV template-literal strings, one named export per discovery method (`transit`, `radialVelocity`, `timingVariations`, etc.).
3. **`src/exo-sonification.vue`** — Imports those strings, parses them with `d3-dsv` via `parseCsvTable()`, and creates one WWT `SpreadSheetLayer` per discovery method. The `CSVS` record maps catalog-name keys to the raw CSV strings; `DATA_TABLES` maps the same keys to parsed row arrays.
4. **WWT layers** are color-coded by discovery method (`discoveryTypeColors`), temporally filtered by a timeline slider (1992–present), and toggled on/off via checkboxes.

### Key files
| File | Role |
|------|------|
| `src/exo-sonification.vue` | Entire app: WWT integration, audio, UI, layer management (~3,500 lines) |
| `src/exoplanetData.ts` | CSV data as named string exports (~6,000+ lines) |
| `src/wwt-hacks.ts` | Runtime monkey-patches to the WWT engine (zoom clamping, sky overlays, spreadsheet layer drawing, Milky Way sizing, tile sharpness) |
| `src/galaxy3d.ts` | Procedural 3D point-cloud Milky Way for solar-system mode (replaces 2D bar in 3D) |
| `src/tuningForkData.ts` | Tuning-fork demo data + orbital math (solar-system Keplerian elements, TRAPPIST-1, one-popular-planet-per-note, Kepler solver, ecliptic-AU positions) |
| `src/main.ts` | App bootstrap — mounts the component, registers WWT pinia store, Vuetify, FontAwesome |
| `generate_exoplanet_data.py` | NASA data fetcher / `src/exoplanetData.ts` regenerator |
| `public/hips-surveys.wtml` | Local copy of the WWT HIPS survey collection with all tile URLs rewritten to HTTPS (required for production — the upstream file uses `http://` tile URLs blocked as mixed content on HTTPS hosts) |
| `.github/workflows/update-exoplanet-data.yml` | Weekly cron + manual dispatch: runs `generate_exoplanet_data.py`, auto-commits if data changed, builds and SCP-deploys |

### WWT integration
The component extends `MiniDSBase` from `@cosmicds/vue-toolkit`, which wraps the WWT engine pinia store (`@wwtelescope/engine-pinia`). WWT state (`wwtRARad`, `wwtZoomDeg`, etc.) flows through the store. Engine methods are accessed directly via `this.wwtSettings` and `this.applyTableLayerSettings`.

`wwt-hacks.ts` patches WWT internals at import time — don't remove those imports even if the symbols look unused.

**WWT solar-system Cartesian convention (footgun)**: `Coordinates.raDecTo3dAu(ra, dec, au)` returns `(cos α cos δ, sin δ, sin α cos δ)` — Y is the declination axis, **not** Z. Standard ICRS Cartesian uses Z for declination. Anything fed into the solar-system render path must match WWT's swapped convention before `rotateX(ecliptic)`. This is what `galaxy3d.ts:galacticToWorldAU` does (note the `Vector3d.create(xe, ze, ye)` reorder); without that swap a galactic-frame distribution renders rotated 90° around the X axis from the actual sky. Also note `Coordinates.RCRA = π/12`, i.e. the function expects RA in **hours**, not degrees.

HIPS sky surveys are loaded from `public/hips-surveys.wtml` (not from the upstream WWT asset server) using `new URL('hips-surveys.wtml', window.location.href).href`. If new HIPS surveys are added from CDS/Aladin, their tile `Url` attributes must use `https://alasky.cds.unistra.fr/` — not the old `http://alasky.u-strasbg.fr/` — to work on HTTPS-hosted deployments.

### Milky Way texture (wwt-hacks.ts)
Three tuning constants near the top of the Milky Way section:
- `MW_FADE_ZERO` (18.6) — log-zoom level at which the texture begins fading in; raise to fade in sooner when zooming out
- `MW_FADE_RANGE` (2.3) — width of the fade band; widen for a softer transition
- `MW_ANGLE_SCALE` (1.05) — expands the ±64° lat/lng quad extents by this factor, making the image physically larger

**Important**: Scaling the WWT world matrix does NOT change the apparent size of the galaxy image because the camera is at the origin — scaling all vertices from the origin preserves angular separations. `_patchGalaxyVertexBuffer` instead rebuilds the WebGL vertex buffer once (on first draw) with the lat/lng extents multiplied by `MW_ANGLE_SCALE`, using the same rotation transforms and UV layout as WWT's `_createGalaxyImage`. The lat iteration must run **-64 → +64** as y1 goes 0 → subdivs to match WWT's (counterintuitively-named) convention — reversing this flips the image 180°.

### Procedural 3D Milky Way (galaxy3d.ts)
In **solar-system (3D) mode only**, `installGalaxy3D()` overrides `Grids.drawGalaxyImage` with a procedural point-cloud renderer. The 2D edge-on bar from `wwt-hacks.ts` still runs in sky (2D) mode — the engine only calls `drawGalaxyImage` from the solar-system render path, so the two implementations don't conflict. To remove the feature, delete `src/galaxy3d.ts` and the two blocks marked `// === Galaxy3D ===` in `exo-sonification.vue`.

**Components**: thin disk + thick disk + bulge + tilted bar + four logarithmic spiral arms + halo, plus a 3D dust-cloud field (~320 desktop / ~140 mobile ellipsoids) that carves dark veins by attenuating or rejecting stars in the disk midplane along arm tangents. All structural numbers (R₀=8.2 kpc, scale heights/lengths, arm pitch 12°, bar PA −27° in our internal frame) are at the top of the file. Population fractions sum to 1.0 across `FRAC_THIN/THICK/BULGE/BAR/HALO`.

**Particle budget**: adaptive — desktop renders ~1.5M points, mobile ~100k, gated by `(pointer: coarse)`. The full PointList is built lazily on first 3D draw, takes a few seconds on desktop, then is cached. `rebuildGalaxy3D()` clears the cache (e.g. after a tier change).

**Coordinate convention** (matches `galaxy3d.ts:galacticToWorldAU`): galactocentric Cartesian with the **Sun at (−R₀, 0, 0)**, +X heliocentric pointing toward the GC, +Z toward the NGP. The bar PA is measured in this frame, so the sign convention is opposite the IAU heliocentric one — see comment on `BAR_PA_RAD`. The Y/Z swap before `rotateX(ecliptic)` is required to match WWT's non-standard ICRS Cartesian (see WWT integration footgun above); without it the disk renders 90° off and exoplanet fields like Kepler (Cygnus) fall off the galactic plane.

**Tuning**: `STAR_SIZE_AU` is the most likely visual knob; bump up to make individual points more luminous. `ARM_BOOST` (default 4) controls arm contrast vs. interarm density. `DUST_CLOUDS_DESKTOP` controls dust-lane density. `GALAXY3D_ENABLED = false` disables the feature without uninstalling.

### Tile sharpness (wwt-hacks.ts)
**`TILE_QUALITY_SCALE`** (module-level export):
WWT's `isTileBigEnough()` uses `fovScale` (arcsec/pixel) to decide when to stop recursing into finer tile levels. Patching `RenderContext.prototype.get_fovScale` to divide by `TILE_QUALITY_SCALE` makes WWT request deeper tiles on every screen. Value of 2 = one extra level; 4 = two extra levels. WWT silently caps at the deepest available server level, so over-requesting is harmless. This patch runs at module import time and requires no per-frame work.

**Pan sensitivity compensation**: `move()` in WWT also uses `get_fovScale() / 3600` to convert pixel deltas to sky angle, so the `get_fovScale` patch would reduce touch/mouse pan speed by `TILE_QUALITY_SCALE` without a fix. `WWTControl.prototype.move` is therefore also patched to multiply `x` and `y` by `TILE_QUALITY_SCALE` — but only in sky/2D mode. In solar system (3D) mode `move()` uses a hardcoded scale of `0.06` that bypasses `get_fovScale()`, so no compensation is needed there (the guard uses `get_solarSystemMode() || get_planetLike()`).

### Constellation overlay (wwt-hacks.ts)
The hamburger menu includes a **Constellations** toggle (`showConstellations` boolean data property, 2D-only via `v-if="modeReactive !== '3D'"`). Its watcher calls `setConstellationFiguresTarget(show ? 1 : 0)` from `wwt-hacks.ts`, which drives a 400 ms fade-in/out animation.

**Critical rendering path**: WWT's engine only calls `_drawSkyOverlays()` in sky (2D) mode when `get_showSolarSystem()` is true, which this app disables via `applySetting(["showSolarSystem", false])` in `set2DMode()`. The fix: `layerManagerDraw` in `wwt-hacks.ts` calls `WWTControl.singleton._drawSkyOverlays()` at its end guarded by `referenceFrame === 'Sky'`. The guard does **not** check `!nested` — WWT always passes `nested=true` in every `LayerManager._draw` call, so `!nested` would never fire. `_drawSkyOverlays` is patched onto the `wwtControl` instance (in `mounted()`) with the `drawSkyOverlays` export from `wwt-hacks.ts`.

**Fade animation**: `drawSkyOverlays` advances `_consFigAlpha` (0–1) via linear interpolation each frame using `performance.now()`. Labels fade via the `opacity` argument to `drawConstellationNames`. Lines require a deeper patch: `SimpleLineShader.use` is monkey-patched at module load to re-set the `lineColor` WebGL uniform with `_consFigAlpha` immediately after the original call (which hardcodes alpha=1). The `_inConsDraw` flag gates this override to constellation draws only.

**Color**: figure lines are medium-light blue (`'Color:255:100:180:255'` in WWT's `a:r:g:b` colon format), set via `Settings.get_globalSettings().set_constellationFigureColor(...)` at module load in `wwt-hacks.ts`. This call is in `wwt-hacks.ts` rather than `mounted()` because `Settings.get_globalSettings()` is absent from the engine's TypeScript types; the file's `@ts-nocheck` header suppresses the error. The stick-figure data is loaded lazily from `figures.txt` via `URLHelpers.singleton.engineAssetUrl('figures.txt')` on first enable.

### UI modes and tool state
`modeReactive` (`"2D"` | `"3D"`) drives which WWT mode is active; changing it triggers the `modeReactive` watcher which calls `set2DMode()` or `set3DMode()`. Features exclusive to 2D (search, sky survey crossfade) call `this.modeReactive = '2D'` before activating. Switching to 3D auto-closes the search bar.

`currentTool` (`"crossfade"` | `"sky-survey"` | `null`) controls which bottom panel is shown. `"sky-survey"` shows the HIPS crossfade slider and picker; `"crossfade"` shows the discovery timeline play/pause and date slider. Both are 2D-only and force `modeReactive = '2D'` when opened from the hamburger menu.

### Color scheme
`discoveryTypeColors` (module-level const) uses **exact catalog-name keys** matching `CSVS` — e.g. `"Radial Velocity"`, `"transit"`, `"Eclipse Timing Variations"`. Layer creation, the `colors` computed property, and the checkbox template all use these keys verbatim with no normalization. To change a category color, update `discoveryTypeColors` only.

`sortedCats` controls checkbox display order. Adjust the `order` array inside it to reorder.

### Hover identification and info popup
`updateLastClosePoint()` calls `closestInView()` which iterates WWT's `getTableDataInView()` for each visible layer and returns the nearest `PointData` within a pixel threshold. Setting `lastClosePt` to a non-null `PointData` shows `#circle-popover` (two-line layout: name on line 1, discovery method / distance / orbital period on line 2); setting it to `null` hides it. The popover is shown in both 2D and 3D modes; it is suppressed only while `showSkyPicker` is true (watcher clears `lastClosePt` on open). The `modeReactive` watcher also clears `lastClosePt` on every mode switch so a stale label from the previous mode doesn't persist.

**3D hover path** (`_closestInView3D`): `closestInView` cannot use `findRADecForScreenPoint` or `findRayForScreenPoint` in solar-system mode — the former interprets its (x,y) input as world coords, and the latter is unreliable. Instead, the 3D branch projects each point *to* screen pixels and compares against the pointer in pixel space. 3D-distance (`gdist`) deliberately does *not* factor into ranking — a far Kepler-field dot is as hittable as a close hot-Jupiter dot.

The projection mirrors `spawnPing3D` exactly: world vertex = `raDecTo3dAu(RA/15, Dec, distPc·206264.806).rotateX(ecliptic)`, then `getScreenPointForCoordinates(xR, zR, yR)` with the second and third args pre-swapped to invert the engine's internal `Vector3d(x, z, y)` swap. This matches the `point-testing-3d` reference harness.

**Perf-critical design**: the 3D path iterates `ALL_POINTS_3D` — a module-level cache built once at load. Each row pre-computes `sinDec`, `cosDec`, `sinRA`, `cosRA`, and the post-rotateX world vertex `(xR, yR, zR)`. The previous implementation re-split the CSV (`getTableDataInView()` → 6000+ string splits) on every pointermove and was the cause of pan stutter. The cache means a hit-test does only numeric reads + one `getScreenPointForCoordinates` call per surviving point. `wwtOnPointerMove` is additionally `requestAnimationFrame`-throttled (`pendingHoverEvent` / `hoverRafId` data fields) so identify runs at most once per frame even when high-Hz mice fire pointermove >120 times/sec.

**Anti-mirror guard**: `transformWorldPointToPickSpace` divides by depth without checking sign, so an antipodal point can mirror-project near the cursor. We guard with two things: a *relaxed* hemisphere cull (`cosSep > max(-0.35, cos(halfFovCone))`) — tighter when zoomed in to act as an early-out, looser when zoomed out — plus a screen-bounds sanity check (reject if the projected `(x, y)` is outside the window by more than one window-dimension margin). The earlier strict `dot > 0` cull was rejecting legit far points when the origin-vs-camera-position direction approximation diverged in solar-system mode.

Desktop 3D hover threshold is `12 px` (vs the 2D default of `4 px`). The resulting `closestPt.x/y` are the projected screen position of the dot, not the cursor, so the ping fires exactly on the dot.

`PointData` requires `{ x, y, ra, dec, name, gdist, cat, color, plOrbper, endDate }`. When showing the popup for a search result (no screen coords), use `window.innerWidth/2, window.innerHeight/2` for `x/y` (the popover is centered at a fixed `bottom` and these are unused for layout) and `{ toString: () => colorStr } as unknown as Color` for the color field.

`updateLastClosePoint` early-returns when `popupPinned` is true so a hover after a search result doesn't replace or clear the pinned planet — the pin is released by camera movement only (see **Search popup pinning** below).

### Search feature
`ALL_POINTS` (module-level flat array from `DATA_TABLES`) is the search corpus. `onSearchInput` filters it case-insensitively and limits results to 10. `selectSearchResult` slews the camera (2D: `gotoRADecZoom`; 3D: `gotoExoplanet3D` — see below), plays the tone, sets `lastClosePt` to show the info popup, fires a ping at the planet, and pins the popup so it stays visible. Search works in **both 2D and 3D modes** — `toggleSearch` no longer forces `modeReactive = '2D'`. Reopening the hamburger menu while search is active still closes it.

**3D slew (`gotoExoplanet3D`)**: WWT's stock `gotoRADecZoom` in solar-system mode leaves `viewCamera.viewTarget` at `(0,0,0)`. Because `setupMatricesSolarSystem` builds the camera at angular position (lat, lng) at `cameraDistance = 4*zoom/9` AU from the viewTarget and **looks at the viewTarget**, setting `lat = Dec, lng = rAtoViewLng(RA)` puts the camera *in the planet's direction from the Sun, looking back at the Sun* — the planet is behind the camera (or buried in the Sun glare) and "zooming in" moves the camera closer to the Sun, away from the planet. Confusing and wrong.

The fix: compute the planet's heliocentric world vertex `v_ecl = raDecTo3dAu(RA/15, Dec, distPc*206264.806).rotateX(ecliptic)` — the same layout `prepVertexBuffer` and `spawnPing3D` use — and set that as the viewTarget. Then solve for the `lat`/`lng` whose engine-side offset direction `(-sin lng, cos lng·sin lat, cos lng·cos lat)` equals `-v_ecl/|v_ecl|`, so the camera initially sits at the Sun (origin) looking at the planet. End-of-slew zoom puts the camera ~75% of the way from Sun to planet (`targetCamDistAU = max(13333, 0.25*|v_ecl|)`, clamped to `[minZoom, maxZoom]`) so zooming further advances along the Sun → planet ray.

`params.target = 20` (SolarSystemObjects.custom) is required so `setupMatricesSolarSystem` doesn't override the viewTarget — both `target === 20` and `target === 65536` skip the Planets.getPlanetTargetPoint override at engine line 47697. `CameraParameters.create` already defaults to `target = 20`, but `viewCamera.copy()` propagates whatever was there, so re-asserting it after `copy()` is the safe pattern. Call `WWTControl.singleton.gotoTargetFull(false, false, params, fg, bg, undefined)` directly — `gotoRADecZoom` would rebuild `CameraParameters.create(...)` and zero the viewTarget back out.

### Search popup pinning
After `selectSearchResult` the user expects the info popup + ping to remain on the searched planet until they pan/zoom the view themselves. Hover normally clears `lastClosePt` whenever the cursor leaves a dot, and the slew itself moves the camera through many intermediate `wwtRARad`/`wwtDecRad`/`wwtZoomDeg` values, so naive clearing-on-camera-change would unpin during the slew.

The pin state is three data fields:
- `popupPinned: boolean` — suppresses hover-driven clearing in `updateLastClosePoint` (early-return at the top).
- `popupPinSnapshot: { raRad, decRad, zoomDeg } | null` — the post-slew camera state to compare against.
- `popupPinTimer: setTimeout handle` — fires 3.5 s after `pinSearchPopup()` to capture the snapshot. The delay is a fixed budget (longer than typical ViewMoverSlew runs); until it fires, the snapshot is `null` and the watchers below do nothing.

Watchers on `wwtRARad` / `wwtDecRad` / `wwtZoomDeg` each call `checkUnpinOnCameraMove()`, which unpins (and clears `lastClosePt`) the moment any axis exceeds the threshold (`1e-3` rad ≈ 0.057° for RA/Dec, `5e-3` relative for zoom). The thresholds are deliberately small — the slew leaves the camera *exactly* at the target params, so the only changes after the timer fires are user gestures.

`unpinSearchPopup()` is called wherever `lastClosePt = null` is already set (mode switch, sky picker open, reticle off, playback start) so we never leave the pinned flag dangling.

### Ping animation
`spawnPing(raDeg, decDeg, color)` converts sky coords to screen pixels via `findScreenPointForRADec`, pushes a timed entry onto the `pings` array, and removes it after 450 ms. Pings render inside `.ping-layer` (which uses `position: absolute; inset: 0` to avoid the Vuetify `backface-visibility: hidden` containing-block issue that breaks `position: fixed` children). Pings fire during 2D manual hover (`updateLastClosePoint`) and during timeline playback (`handlePointTransitions`).

**Antipodal ghost ping fix**: `transformWorldPointToPickSpace` in the WWT engine does not check the sign of `vz` (depth in camera space). Points on the opposite hemisphere (angular separation > 90° from camera center) have `vz < 0`, which mirrors their projected coordinates through the screen center and can produce false in-bounds results. `spawnPing` guards against this with a dot-product check using `wwtRARad`/`wwtDecRad` — if `dot <= 0` the point is rejected before calling `findScreenPointForRADec`.

**3D mode**: `set3DMode()` uses WWT's Solar System imageset type, so `findRayForScreenPoint` (added in wwt-webgl-engine PR #378) is available and is what `closestInView` / `_rayToRADec` use for 3D hover identification. The hemisphere dot-product guard works in 3D via the same `wwtRARad`/`wwtDecRad` look direction. To revert to 2D-only pings during timeline playback, see the commented `modeReactive === '2D'` guard in `handlePointTransitions`.

**3D pings (`spawnPing3D`)**: `findScreenPointForRADec` does **not** work in solar-system mode — its pinia wrapper calls `getScreenPointForCoordinates(ra/15, dec)` (only 2 args), and in 3D the engine builds `Vector3d(ra/15, 0, dec)` from those, which is nonsense. So 3D pings must project the layer's actual world-space vertex by hand.

For a spherical, astronomical, Sky-frame `SpreadSheetLayer` (which is what every exoplanet catalog layer is), `prepVertexBuffer` builds each vertex as `geoTo3dRad(Dec, RA_deg, alt_AU).rotateX(ecliptic)` — equivalently `raDecTo3dAu(RA/15, Dec, alt_AU).rotateX(ecliptic)`. `alt_AU = distPc * 206264.806` to match the engine's `altUnit=parsecs` + `altType=distance` + `astronomical=true` path. `spawnPing3D` reproduces this exact computation.

**Footgun (the actual cause of the 3D ping offset)**: `WWTControl.getScreenPointForCoordinates(x, y, z)` is **not** a pass-through in solar-system mode. The engine (line 68315 of `@wwtelescope/engine/src/index.js`) reads `cartesian = Vector3d.create(x, z, y)` — it swaps the second and third arguments before projection, with the comment *"In 3D mode, points are displayed with (X, Z, Y) coordinates"*. So passing the rendered vertex `(xR, yR, zR)` straight in projects `Vector3d(xR, zR, yR)` instead and the ping lands at a Dec-dependent offset from the dot. The fix in `spawnPing3D` is to pre-swap the last two arguments — call `getScreenPointForCoordinates(xR, zR, yR)` so the engine's internal swap reconstructs the actual world vertex.

The `point-testing-3d` reference harness (rectangular layer with `set_xAxisColumn`/`set_yAxisColumn`/`set_zAxisColumn`) appears to work with its own y/z-swapped call because the rectangular path in `prepVertexBuffer` (engine line 39476) builds vertices as `Vector3d(Xc, Zc, Yc) * xyzScale` — its own y/z swap that the test's `{x, y: z, z: y}` argument swap inverts. That pattern does **not** apply to our spherical layers, which use no swap during vertex construction.

**Why no world-matrix compensation is needed**: `LayerManager._draw` only multiplies in `thisMap.frame.worldMatrix` when `thisMap.frame.reference === 18` (SkyJ2000). The `'Sky'` `LayerMap` is created with `reference = 0` (engine line 33168), so that branch is skipped and the world matrix at layer-draw time equals the world matrix at hover time. `transformWorldPointToPickSpace` uses the current world matrix, so projecting our recomputed vertex matches the rendered dot exactly without any extra frame transform.

**Debug knob**: setting `window.__pingDebug = true` in the browser console makes `spawnPing3D` log `{ra, dec, distPc, au, v, worldVertex, screen, camRA, camDec, winSize}` on each call. Useful for diagnosing future regressions; harmless when left in.

### Audio
- AudioContext is lazy-initialized on first pointer event via `_ensureAudio()`. The same method is called from `playPointTone` so creation/resume isn't duplicated; it returns the ready `AudioContext` or `null` if Web Audio is unavailable.
- Playback uses Web Audio API `BufferSource` with an exponential gain release (0.35 → 0.001 over 1.8 s) routed through a shared `DynamicsCompressorNode`. Each source is explicitly `source.stop(releaseEnd)`-ed so nodes don't outlive the envelope.
- Timeline playback fires up to 6 staggered notes (40 ms apart) for newly revealed exoplanets each month step.
- Hover audio (`updateLastClosePoint`) is suppressed while `isPlaying` is true.

**Pitch mapping (`pitchIndexForPeriod` + `NOTES_HIGH_TO_LOW` at module scope)**: orbital period (days) maps to one of 20 guitar samples, **short period → high pitch**, long period → low pitch. The mapping is **log-spaced** over `PERIOD_LO_DAYS` (1) to `PERIOD_HI_DAYS` (10000), because the catalog distribution is heavily skewed toward 1–30 d hot Jupiters / Kepler short-period planets — a linear mapping saturates the highest note and wastes the rest. `NOTES_HIGH_TO_LOW[0]` = `eguitar_GSharp6.wav`, `[19]` = `eguitar_E1.wav`. To rebalance, adjust `PERIOD_LO_DAYS` / `PERIOD_HI_DAYS`; to change the pitch direction, reverse the array.

**Hover/reticle is identify-only (no sonification)**: hovering/reticle-probing a planet shows the info popover but deliberately does **not** play a tone or fire a ping — `updateLastClosePoint` only sets `lastClosePt`. Sonification (tone + ping) is reserved for explicit actions: **search selection** (`selectSearchResult`) and **timeline playback** (`handlePointTransitions`), each of which calls `playPointTone(plOrbper)` + `spawnPing`/`spawnPing3D` itself. This applies to both desktop hover and the mobile reticle. (Historical note: hover used to sonify, and earlier still passed a synthetic `gdist`-derived value as `plOrbper`; both behaviors are gone.) `updateLastClosePoint` also early-returns while a tuning-fork demo is active so the demo owns the popover.

### Timeline playback
`ALL_POINTS_BY_DATE` is pre-sorted by `discPubdate` so `handlePointTransitions` only scans the current month's window (O(M) per tick, not O(N total)). The play loop (`startPlay` → `setInterval` at 200 ms) calls `onSliderInput` → `handlePointTransitions`.

**Play button click behavior**: `togglePlay` uses a 300 ms timer to distinguish single from double click. Single click plays from the current slider position (or resets to the beginning if already at the end). Double click always resets to the beginning before playing. Clicking while playing pauses immediately (no timer). `playClickTimer` is cleaned up in `stopPlay()` to prevent stale timeouts if the slider is dragged while the timer is pending.

**Stagger-timer cleanup**: `handlePointTransitions` schedules up to 6 `setTimeout`s per tick to stagger tones; their handles are tracked in `playStaggerTimers` and cleared in `stopPlay()`. Without this, pausing mid-burst would let queued tones fire after the user paused.

### Responsive dot sizing
`getDeviceScales(twoD)` (module-level helper) returns scale factors based on `window.matchMedia('(pointer: coarse)')` and `window.devicePixelRatio`. Called both at layer creation and in `updateLayerScales()` (triggered on every 2D/3D mode switch). Keep both call sites in sync when changing scale values.

### Mobile reticle
On touch devices, a reticle overlay triggers `updateLastClosePoint` for whatever planet is under it. The toggle button is `position: absolute; bottom: 20%; right: 1rem` inside `#main-content` (moved out of the hamburger container to avoid layout conflicts). The reticle is available in **both 2D and 3D modes** — `wwtOnPointerMove` calls `updateLastClosePoint` with a screen-position override when `mobile && reticleEnabled`, regardless of mode, and `closestInView` handles the per-point projection in 3D. In 3D the ping is fired via `spawnPing3D` and the popover label appears at the same fixed bottom-center position used in 2D.

**Reticle position differs by mode**: in 2D the reticle sits at screen center (`top: 50%`). In 3D the camera rotates *about* the screen center, so a dead-center reticle is unreachable — points orbit around it instead of crossing it. The 3D reticle is offset to `top: 66%` (CSS class `.reticle-3d`) and the identify probe coordinates passed to `updateLastClosePoint` use `window.innerHeight * RETICLE_3D_Y_FRAC` (= 0.66) for `y`. Keep `RETICLE_3D_Y_FRAC` in `exo-sonification.vue` and the `.reticle-3d { top }` rule in sync if either is changed.

Mobile hover via direct tap (without the reticle) is not yet implemented — Option A (tap-to-reveal via `pointerup` with `pointerType === 'touch'`) is recommended when adding it.

### Tuning Fork demos (`tuningForkData.ts` + `exo-sonification.vue`)
Three "calibrate your ear" demos reached from a second splash-screen button (**Solar System Tuning Fork**, beside *Start Exploring*) and a matching hamburger item; both call `startTuningFork()`. Each plays orbital-period tones inside-out for bodies orbiting the Sun, using the **same** `pitchIndexForPeriod` mapping as the exoplanets (so it's a true reference). After any demo a next-steps menu (`tfMenuOpen`) offers: **Explore the Exoplanets** (`exitTuningFork`), replay **Solar System**, **TRAPPIST-1**, **One Planet Per Note**.

- **Three datasets** (`tuningForkData.ts`): `SOLAR_SYSTEM_BODIES` (8 planets + 5 IAU dwarf planets, **real** Keplerian elements / real scale); `TRAPPIST_BODIES` (7 planets, all `transit`); `ONE_PER_NOTE_BODIES` (20 curated popular exoplanets, one per guitar sample, real periods + discovery methods verified against `exoplanetData.ts`). TRAPPIST + per-note use **stylized nested circular rings** (`a` = display radius spaced by index so every ring stays visible) while the real `periodDays` still drives spin rate and pitch; the solar demo uses true orbits.
- **Activation colours**: orbits/dots start **white** and flip on sonify — to `TUNING_FORK_BLUE` (`#2a7adb`, the CTA blue) for the solar demo, or to the body's `colorForCat()` discovery-method colour for the exoplanet demos. The central star is drawn on our canvas (yellow `#ffe08a`, or red `#ff5a32` for the ultracool dwarf TRAPPIST-1A); WWT's own Sun/planet sprites are hidden via `applySetting(["solarSystemPlanets", false])` during a demo and restored on exit.
- **Coordinate footgun (the key one)**: positions are heliocentric **ecliptic** J2000 Cartesian AU. `_tfProject` calls a plain `WWTControl.singleton.getScreenPointForCoordinates(xe, ye, ze)` — **no** RA/Dec round-trip and **no** `rotateX(ecliptic)`. **In the installed engine version, `getScreenPointForCoordinates` does NOT swap its args in solar-system mode** — it builds `Vector3d.create(x, y, z)` (engine `index.js:68289`), so the world vertex is exactly `(xe, ye, ze)` and the orbital plane is the world **XY plane** (z≈0), with the ecliptic pole = world **+Z** axis. (An older engine build swapped args 2/3 — `Vector3d(x, z, y)` — which is what the now-corrected historical notes elsewhere in this file describe; verify the engine source if projections ever land off.)
- **Top-down view (footgun)**: `setupMatricesSolarSystem` places the camera at `viewAdjust·(0,0,camDist)` where `viewAdjust = rotX(-lat)·rotY(-lng)`. Because the orbits lie in the world XY plane (above), a **top-down** view (camera on the world +Z axis, looking straight down the ecliptic pole) is `lat = 0, lng = 0` — *not* `lat = 90`, which puts the camera on the world Y axis and renders the rings **edge-on**. `_tfEnterView` sets `lat=0, lng=0, rotation=0, angle=0` for all three demos.
- **Zoom clamp + smooth pull-back**: the app pins solar-system `minZoom = 30000` (≈13,333 AU min camera distance) to keep exoplanets navigable — far too far to see tens-of-AU orbits. `_tfEnterView` temporarily calls `setSolarSystemMinZoom(1)`, hides WWT's sprites, and slews (`gotoTargetFullHacked`, `viewTarget = origin`, `target = 20`) to a **close** start zoom framing the inner orbits (`tfStartZoom = (9/4)·maxR·TF_START_FRACTION·TF_FRAME_FACTOR`). Then `_tfTick` performs the pull-back as **one smooth continuous motion**: `viewCamera.zoom` is set each frame as a pure function of elapsed time across the reveal window — `zoom = tfStartZoom + (tfTargetZoom − tfStartZoom)·smootherstep(t)` where `t = (now − tfRevealBaseMs) / ((bodies−1)·TF_REVEAL_INTERVAL_MS)` clamped to [0,1] and `tfTargetZoom = (9/4)·maxR·TF_FRAME_FACTOR` (all orbits framed). This deliberately does **not** track per-reveal radii (an earlier version stepped the zoom out each time a body revealed, which read as little increments instead of a glide). `_tfHardStop` restores `minZoom`. Note: the render loop reads `viewCamera.zoom` directly with no clamp, so per-frame assignment is safe.
- **Render/animation**: a full-screen `<canvas ref="tfCanvas">` (z-index 18, just under `.ping-layer`) redrawn each rAF frame in `_tfDraw`. `_tfTick` advances a sim clock from the current date at `TF_TIME_SCALE_DAYS_PER_SEC` (Earth ≈ 6 s/orbit) and reveals bodies every `TF_REVEAL_INTERVAL_MS` after a `TF_SLEW_MS` camera-arrival delay; each `_tfActivate` fires a ping (reusing the `pings` array) on the body and `playPointTone(periodDays)`. `_tfHardStop` (called by `exitTuningFork` and the `modeReactive` watcher guard for any switch to 2D mid-demo) cancels the loop, removes the resize listener, and restores engine state.
- **Demo UI / chrome**: the body name appears in `#tf-popover` — styled identically to the hover identify popup (`#circle-popover`): fixed bottom-centre, `--current-color` = the body's activation colour, two lines (name + discovery-method/period detail). It does **not** track the body on screen. `_beginDemo` collapses the Discovery Types chrome (`showCatalog = showCatalogButton = false`); `_tfHardStop` restores it. The **Exit** button (`.tf-exit-btn`) sits top-**left** (the catalog slot, now free) styled like `.catalog-button`, so it never overlaps the hamburger (top-right). The title (`.tf-title`) is a centred top-row chip styled like the app chrome.
- **Tuning knobs**: `TUNING_FORK_BLUE`, `TF_REVEAL_INTERVAL_MS`, `TF_TIME_SCALE_DAYS_PER_SEC`, `TF_SLEW_SEC`, plus the zoom-framing pair `TF_FRAME_FACTOR` / `TF_START_FRACTION` (larger `TF_START_FRACTION` = start further out / less zoomed in) in `exo-sonification.vue`; ring spacing (`inner`/`step` in `stylizedRing`) and the curated planet list in `tuningForkData.ts`. Note: under the shared exoplanet pitch mapping (cap 10,000 d) Saturn→Eris all play the lowest note (only 2.56% of exoplanets exceed 10,000 d, so this is faithful); to give outer bodies distinct pitches, widen `PERIOD_HI_DAYS`.

---

## Suggested improvements

- **Mobile tap-to-identify (Option A)**: Use `pointerup` with `pointerType === 'touch'` to trigger `updateLastClosePoint`. The groundwork is there; the remaining work is disambiguating identify taps from WWT navigation swipes (check that `isPointerMoving` is false).

- **URL deep-linking**: Encode the current RA/Dec/zoom, mode (2D/3D), and optionally a searched planet name in the URL hash so a specific view can be bookmarked or shared. The `position2D` / `position3D` objects already hold the needed state.

- **Search result count / year context**: The search dropdown currently shows name + discovery method. Adding the discovery year (already in `discPubdate`) would help disambiguate similarly-named planets.

- **`hips-surveys.wtml` auto-refresh**: The local WTML is a manual snapshot. A script (similar to `generate_exoplanet_data.py`) could fetch the upstream WTML and rewrite HTTP→HTTPS URLs automatically, keeping the survey list current as WWT adds new datasets.

- **`layerManagerDraw` implicit `Matrix3d`**: `layerManagerDraw` in `wwt-hacks.ts` references `Matrix3d` without importing it. This works today because WWT exposes it globally at runtime, but making the import explicit would prevent silent breakage if WWT's bundling changes.

- **Crossfade opacity state on return**: When a user opens Sky Survey, adjusts the slider, then switches to 3D and back to 2D, `fg2DOpacity` is restored but the first-open animation guard (`skySurveySelectedCount`) prevents re-animating. This is correct behavior but worth noting if the intro animation ever needs resetting.

- **Mobile tap-to-identify in 3D (no reticle)**: The reticle now works in 3D, but mobile users without the reticle still have no way to identify a 3D dot via a single tap. Same Option A as the 2D version (`pointerup` with `pointerType === 'touch'`, guarded by `!isPointerMoving`) would slot in cleanly since `closestInView` already handles 3D.

