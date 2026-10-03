# personal-website

A spinnable low-poly planet where each island is a part of my life.

Built with [Three.js](https://threejs.org) + [Vite](https://vite.dev). The terrain, props, and clouds are generated procedurally from a fixed seed, so there are no 3D model files to manage.

## Run it

```sh
npm install
npm run dev      # local dev server with hot reload
npm run build    # production build → dist/
```

## Editing content

Everything lives in **`src/content.js`**:

- `profile`: name, tagline, header links
- `sections`: one island each, with `title`, `place` (fictional place name), `intro`, `items`, and placement:
  - `lat` / `lon`: where on the globe (keep islands roughly 70°+ apart)
  - `size`: island radius in radians (~0.35–0.6)
  - `theme`: `'village'`, `'music'`, `'code'`, or `'summit'`

Each section's `id` doubles as a shareable URL: `…/#music` opens straight to that island.

## Changing the look

| File | What it controls |
| --- | --- |
| `src/themes.js` | Island palettes, terrain style (`hills`, `terraces`, `mesas`, `peaks`), and ocean colors |
| `src/terrain.js` | Terrain shape functions (`STYLES`), globe resolution (`DETAIL`) |
| `src/props.js` | Trees, houses, landmarks; `KITS` decides which props go on which theme |
| `src/sky.js` | Stars, clouds, moon, atmosphere glow |
| `src/style.css` | All 2D UI (labels, chips, the content panel) |

To change the overall layout of the world, change the `seed` passed to `new Terrain(sections, seed)` in `main.js`.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.
One-time setup: **repo Settings → Pages → Source: GitHub Actions**.
