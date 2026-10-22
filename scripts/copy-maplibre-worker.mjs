// MapLibre v6 loads its web worker from a URL next to the bundle; serve it from /public instead.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist', 'maplibre-gl-worker.mjs');
const dest = path.join(process.cwd(), 'public', 'maplibre', 'maplibre-gl-worker.mjs');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[maplibre] worker → ${path.relative(process.cwd(), dest)}`);
