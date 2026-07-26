# Exoplanet Sonification

An interactive visualization of every known exoplanet — ~6,300 of them — rendered in
[WorldWide Telescope](https://worldwidetelescope.org/) in both a 2D all-sky view and a 3D Milky Way.
Each planet can be *sonified*: its orbital period maps to a guitar note, so a hot Jupiter on a
one-day orbit rings high and a long-period giant rings low.

**Live:** https://projects.cosmicds.cfa.harvard.edu/exoplanet-sonification/

Built by [CosmicDS](https://www.cosmicds.cfa.harvard.edu/).

## What you can do

- **Explore** the catalog in 2D sky or 3D galaxy view, colour-coded by discovery method.
- **Search** any planet by name and fly to it (works in both views).
- **Play the discovery timeline** from 1992 to today and hear each month's discoveries arrive.
- **Hover** (or use the mobile reticle) to identify a planet and hear its tone.
- **Calibrate your ear** with three tuning-fork demos — our solar system, TRAPPIST-1, and one
  popular exoplanet per note — all using the same period→pitch mapping as the catalog.

## Development

Requires Node 20+ and Python 3.11+. The package manager is **Yarn 4** via Corepack.

```bash
corepack enable
yarn install --immutable

npm run serve      # dev server
npm run build      # Python preprocessing + webpack production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

`npm run build` first runs `python modify_index.py`, which patches a zoom-clamping line out of
`node_modules/@wwtelescope/engine/src/index.js`. If that step fails, run it manually before
building.

### Updating the exoplanet catalog

Data comes from the [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) TAP API
(`pscomppars` table). `.github/workflows/update-exoplanet-data.yml` refreshes it every Monday and
redeploys if anything changed. To run it by hand:

```bash
pip install -r requirements_data.txt
python generate_exoplanet_data.py
```

This rewrites `src/exoplanetData.ts` **and** the planet count in the intro modal inside
`src/exo-sonification.vue`. Both files must be committed together.

## URL parameters

| Param | Effect |
|-------|--------|
| `?kiosk=1` | Kiosk mode — locks the browser down, routes external links to a QR modal, and starts an attract loop after 90 s idle |
| `?kioskIdle=<seconds>` | Override the kiosk idle timeout (for testing) |
| `?kioskStats=1` | Open the local usage-stats dashboard instead of the viewer |

Kiosk usage stats are anonymous, aggregated per day, and stored **only** in the browser's
`localStorage` — nothing is sent anywhere.

## Repository layout

The app is one large single-file component plus supporting modules:

| Path | Role |
|------|------|
| `src/exo-sonification.vue` | The app: WWT integration, audio, UI, layer management |
| `src/exoplanetData.ts` | Generated catalog data (CSV strings, one export per discovery method) |
| `src/exoplanet-renderer.ts` | Custom WebGL renderer for the exoplanet dots and ping rings |
| `src/wwt-hacks.ts` | Runtime patches to the WWT engine |
| `src/galaxy*.ts` | Procedural 3D Milky Way (volume slices + instanced sprite clouds) |
| `src/tuningForkData.ts` | Tuning-fork demo data and orbital mechanics |
| `src/kiosk*.ts`, `src/Kiosk*.vue` | Kiosk mode |

`CLAUDE.md` is the detailed architecture reference — including the WWT coordinate-convention
footguns that are easy to get wrong. Read it before changing anything that touches 3D positioning.

## Notes for local development

- `play_point_server.py` / `README_playback.md` document an abandoned FluidSynth experiment. The
  shipping app plays pre-rendered WAVs from `public/sounds/`; the server is not needed.
- `public/hips-surveys.wtml` is a local snapshot of WWT's HIPS survey collection with tile URLs
  rewritten to HTTPS. The upstream file uses `http://`, which is blocked as mixed content.
