'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { LngLatBounds, Map as MLMap, Marker as MLMarker, Popup, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { formatTomanShort } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { Decision, HubPick, ShopPick } from '@/lib/agent/decide';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.9 } }],
};

type Poly = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'Polygon'; coordinates: number[][][] } };
function circle(lat: number, lon: number, r: number, props: Record<string, unknown> = {}): Poly {
  const pts: number[][] = [];
  const dLat = r / 111_320;
  const dLon = r / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [pts] } };
}
const fc = (features: unknown[]) => ({ type: 'FeatureCollection' as const, features }) as Parameters<GeoJSONSource['setData']>[0];

export type DecisionMapProps = {
  decision: Decision;
  center: { lat: number; lon: number };
  /** the shop or hub the recommended tier points at */
  target: { lat: number; lon: number; eta: string } | null;
  onShop?: (p: ShopPick) => void;
  onHub?: (h: HubPick) => void;
};

function el(html: string, cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Map-first answer: user, radius, open shops with prices, hubs as shaded areas, closed shops as faint dots, a route. */
export default function DecisionMapView({ decision, center, target, onShop, onHub }: DecisionMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<MLMarker[]>([]);
  const ready = useRef(false);
  const latest = useRef({ decision, center, target, onShop, onHub });
  latest.current = { decision, center, target, onShop, onHub };

  useEffect(() => {
    if (!box.current) return;
    const m = new MLMap({ container: box.current, style: STYLE, center: [center.lon, center.lat], zoom: 13, attributionControl: { compact: true }, cooperativeGestures: false });
    map.current = m;
    m.once('style.load', () => {
      m.addSource('radius', { type: 'geojson', data: fc([]) });
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.06 } });
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#0f766e', 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
      m.addSource('hubs', { type: 'geojson', data: fc([]) });
      m.addLayer({ id: 'hubs-fill', type: 'fill', source: 'hubs', paint: { 'fill-color': '#6d28d9', 'fill-opacity': ['case', ['get', 'top'], 0.16, 0.08] } });
      m.addLayer({ id: 'hubs-ring', type: 'line', source: 'hubs', paint: { 'line-color': ['case', ['get', 'typical'], '#d97706', '#6d28d9'], 'line-width': ['case', ['get', 'typical'], 2.5, 1.5], 'line-dasharray': [1, 0] } });
      m.addSource('closed', { type: 'geojson', data: fc([]) });
      m.addLayer({ id: 'closed-dots', type: 'circle', source: 'closed', paint: { 'circle-radius': 4, 'circle-color': '#94a3b8', 'circle-opacity': 0.55, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
      m.addSource('route', { type: 'geojson', data: fc([]) });
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-dasharray': [1.5, 1.5] } });
      m.on('click', 'closed-dots', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        new Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat).setHTML(`<div dir="rtl" style="font:12px var(--font-vazirmatn),sans-serif">${esc(String(f.properties?.name))}<br><span style="color:#64748b">${esc(String(f.properties?.label))}</span></div>`).addTo(m);
      });
      m.on('mouseenter', 'closed-dots', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'closed-dots', () => (m.getCanvas().style.cursor = ''));
      ready.current = true;
      draw();
    });
    return () => {
      ready.current = false;
      markers.current.forEach((x) => x.remove());
      m.remove();
      map.current = null;
    };
    // the map is created once; data changes go through draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready.current) draw();
  }, [decision, target]);

  function draw() {
    const m = map.current;
    if (!m) return;
    const { decision: d, center: c, target: t } = latest.current;
    (m.getSource('radius') as GeoJSONSource).setData(fc([circle(c.lat, c.lon, d.radius_m)]));
    const hubTier = d.tiers.find((x) => x.key === 'hub_nearby');
    const hubs = hubTier?.hubs ?? [];
    (m.getSource('hubs') as GeoJSONSource).setData(fc(hubs.map((h, i) => circle(h.lat, h.lon, Math.max(h.radius_m, 200), { top: i === 0, typical: h.typical_only }))));
    (m.getSource('closed') as GeoJSONSource).setData(
      fc(d.closed_near.map((s) => ({ type: 'Feature', properties: { name: s.name, label: s.label }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } }))),
    );
    (m.getSource('route') as GeoJSONSource).setData(fc(t ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[c.lon, c.lat], [t.lon, t.lat]] } }] : []));

    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const add = (lat: number, lon: number, node: HTMLElement, anchor: 'center' | 'bottom' = 'center') => {
      const mk = new MLMarker({ element: node, anchor }).setLngLat([lon, lat]).addTo(m);
      markers.current.push(mk);
      requestAnimationFrame(() => node.classList.add('hk-in'));
      return mk;
    };
    const rec = d.recommended;
    const recShop = rec && rec !== 'hub_nearby' ? d.tiers.find((x) => x.key === rec)?.shops[0] : undefined;
    // hubs: a label pill at the centre
    hubs.forEach((h, i) => {
      const node = el(`<span>${esc(toFaDigits(h.pill))}</span>`, `hk-dm hk-dm-hub${i === 0 && rec === 'hub_nearby' ? ' hk-dm-rec' : ''}${h.typical_only ? ' hk-dm-typical' : ''}`);
      node.addEventListener('click', () => latest.current.onHub?.(h));
      add(h.lat, h.lon, node);
    });
    // unknown hours: dashed pins
    for (const s of d.tiers.find((x) => x.key === 'unknown_hours_near')?.shops.slice(0, 5) ?? []) {
      const node = el('<span>؟</span>', 'hk-dm hk-dm-unknown');
      node.title = `${s.name} · ساعت کاری ثبت نشده`;
      node.addEventListener('click', () => latest.current.onShop?.(s));
      add(s.lat, s.lon, node);
    }
    // open shops (near + far) with a price label; shops in one building share a pill; the recommended one highlighted
    const open = [...(d.tiers.find((x) => x.key === 'open_listed_near')?.shops ?? []), ...(d.tiers.find((x) => x.key === 'open_listed_far')?.shops ?? [])].slice(0, 12);
    const groups = new Map<string, ShopPick[]>();
    for (const s of open) {
      // ~130 m buckets: the shops of one complex or block share one pill
      const k = `${Math.round(s.lat / 0.0012)}:${Math.round(s.lon / 0.0014)}`;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    for (const g of groups.values()) {
      const s = g[0];
      const isRec = g.some((x) => x.shop_id === recShop?.shop_id);
      const prices = g.map((x) => x.price).filter((p): p is number => p !== null);
      const price = prices.length ? `${g.length > 1 ? 'از ' : ''}${formatTomanShort(Math.min(...prices))}` : 'باز';
      const node = el(`<span>${esc(price)}${g.length > 1 ? ` · ${toFaDigits(g.length)} مغازه` : ''}${g.some((x) => x.hurry) ? ' · ⏳' : ''}</span>`, `hk-dm hk-dm-open${isRec ? ' hk-dm-rec' : ''}${g.every((x) => x.hurry) ? ' hk-dm-hurry' : ''}`);
      node.title = g.map((x) => `${x.name} · ${x.open.label}`).join('\n');
      node.addEventListener('click', () => latest.current.onShop?.(g.find((x) => x.shop_id === recShop?.shop_id) ?? s));
      add(s.lat, s.lon, node, 'bottom');
    }
    // earliest opening (when it is the answer)
    if (rec === 'opens_soonest' && recShop) add(recShop.lat, recShop.lon, el(`<span>${esc(recShop.opens?.label ?? '')}</span>`, 'hk-dm hk-dm-open hk-dm-rec'), 'bottom');
    add(c.lat, c.lon, el('', 'hk-dm-user'));
    if (t) {
      const mid = { lat: (c.lat + t.lat) / 2, lon: (c.lon + t.lon) / 2 };
      add(mid.lat, mid.lon, el(`<span>${esc(t.eta)}</span>`, 'hk-dm hk-dm-eta'));
    }
    // frame: user, radius, the target and the hubs
    const b = new LngLatBounds([c.lon, c.lat], [c.lon, c.lat]);
    const dLat = d.radius_m / 111_320;
    b.extend([c.lon, c.lat + dLat]).extend([c.lon, c.lat - dLat]);
    if (t) b.extend([t.lon, t.lat]);
    for (const h of hubs.slice(0, 1)) b.extend([h.lon, h.lat]);
    for (const s of open.slice(0, 3)) b.extend([s.lon, s.lat]);
    m.fitBounds(b, { padding: 48, maxZoom: 16, duration: 600 });
  }

  return <div ref={box} className="size-full" data-decision-map />;
}
