'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MLMap,
  Marker as MLMarker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type ExpressionSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { toFaDigits } from '@/lib/fa/digits';
import { shopTypeLabel, type ShopType } from '@/lib/data/shop-types';
import { clusterImage, loadMapIconKit, shopIconImage, type MapIconKit } from './map-icons';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/** A shop drawn in the WebGL layer: `type` picks the icon, `kind` the colour. */
export type ShopPoint = { id: string; lat: number; lon: number; name: string; kind: 'offers' | 'maybe' | 'none'; type: ShopType; mall: string | null };

export type MapMarker = { id: string; lat: number; lon: number; label: string; kind: 'seller' | 'maybe'; active?: boolean };

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

type PolygonFeature = { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'Polygon'; coordinates: number[][][] } };

function circle(lat: number, lon: number, radiusM: number): PolygonFeature {
  const pts: number[][] = [];
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

function pinEl(kind: 'user' | 'pick'): HTMLElement {
  const el = document.createElement('div');
  el.className = kind === 'user' ? 'hk-pin-user' : 'hk-pin-pick';
  el.style.cssText =
    kind === 'user'
      ? 'width:18px;height:18px;border-radius:9999px;background:#0f766e;border:3px solid white;box-shadow:0 0 0 6px rgba(15,118,110,.25)'
      : 'width:22px;height:22px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)';
  return el;
}

function sellerEl(m: MapMarker, onClick?: (id: string) => void): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', m.label);
  el.textContent = m.kind === 'seller' ? toFaDigits(m.label) : '؟';
  el.style.cssText = `min-width:26px;height:26px;padding:0 6px;border-radius:9999px;font:600 12px/26px Vazirmatn,sans-serif;color:${
    m.kind === 'seller' ? 'white' : '#334155'
  };background:${m.kind === 'seller' ? (m.active ? '#b45309' : '#0f766e') : '#e2e8f0'};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer`;
  if (onClick) el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(m.id);
  });
  return el;
}

function shopsGeoJSON(points: ShopPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((p) => ({
      type: 'Feature' as const,
      properties: { id: p.id, name: p.name, kind: p.kind, type: p.type },
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
    })),
  };
}

/** Image id for a cluster pill: colour from its shops, glyph (`unknown` = generic shop), category-only count. */
function clusterIcon(type: ShopType | null | undefined): ExpressionSpecification {
  return [
    'concat',
    'cl:',
    ['case', ['>', ['get', 'offers'], 0], 'offers', 'none'],
    ':',
    ['to-string', ['get', 'point_count']],
    `:${type ?? 'unknown'}:`,
    ['to-string', ['get', 'maybe']],
  ];
}

export default function MapView({
  center,
  radiusM,
  markers = [],
  onMarkerClick,
  shops,
  selectedShopId,
  onShopClick,
  onClusterClick,
  clusterType,
  pick,
  onPick,
  className,
}: {
  center: { lat: number; lon: number };
  radiusM: number;
  markers?: MapMarker[];
  onMarkerClick?: (id: string) => void;
  /** every shop in the area (clickable dots) */
  shops?: ShopPoint[];
  selectedShopId?: string | null;
  onShopClick?: (id: string) => void;
  /** a group of shops that cannot be split by zooming (same mall/building) */
  onClusterClick?: (ids: string[]) => void;
  /** glyph on cluster pills: the filtered type, or a generic shop */
  clusterType?: ShopType | null;
  pick?: { lat: number; lon: number } | null;
  onPick?: (lat: number, lon: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const userPin = useRef<MLMarker | null>(null);
  const pickPin = useRef<MLMarker | null>(null);
  const markerRefs = useRef<MLMarker[]>([]);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onShopRef = useRef(onShopClick);
  onShopRef.current = onShopClick;
  const onClusterRef = useRef(onClusterClick);
  onClusterRef.current = onClusterClick;
  const kit = useRef<MapIconKit | null>(null);
  const clusterTypeRef = useRef(clusterType);
  clusterTypeRef.current = clusterType;
  // layers are added on 'style.load' (no waiting for tiles); later updates queue until then
  const ready = useRef(false);
  const queue = useRef<Array<() => void>>([]);
  const whenReady = (fn: () => void) => (ready.current ? fn() : queue.current.push(fn));

  useEffect(() => {
    if (!box.current) return;
    const m = new MLMap({
      container: box.current,
      style: OSM_STYLE,
      center: [center.lon, center.lat],
      zoom: 15,
      maxZoom: 18,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    m.once('style.load', async () => {
      m.addSource('radius', { type: 'geojson', data: circle(center.lat, center.lon, radiusM) });
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#0f766e', 'line-width': 2, 'line-dasharray': [2, 2] } });
      kit.current = await loadMapIconKit().catch(() => null);
      if (map.current !== m) return; // unmounted while loading
      // shops in the same mall share coordinates, so they are clustered up to the max zoom
      m.addSource('shops', {
        type: 'geojson',
        data: shopsGeoJSON([]),
        maxzoom: 19,
        cluster: true,
        clusterRadius: 30,
        clusterMaxZoom: 18,
        clusterProperties: {
          offers: ['+', ['case', ['==', ['get', 'kind'], 'offers'], 1, 0]],
          maybe: ['+', ['case', ['==', ['get', 'kind'], 'maybe'], 1, 0]],
        },
      });
      m.addLayer({
        id: 'shops-selected',
        type: 'circle',
        source: 'shops',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], '']],
        paint: { 'circle-radius': 18, 'circle-color': '#b45309', 'circle-opacity': 0.3, 'circle-stroke-color': '#b45309', 'circle-stroke-width': 2 },
      });
      m.addLayer({
        id: 'shops-icon',
        type: 'symbol',
        source: 'shops',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['concat', 'shop:', ['get', 'type'], ':', ['get', 'kind']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 0.8, 17, 1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['match', ['get', 'kind'], 'maybe', 3, 'offers', 2, 1],
        },
      });
      m.addLayer({
        id: 'shops-cluster',
        type: 'symbol',
        source: 'shops',
        filter: ['has', 'point_count'],
        layout: {
          'icon-image': clusterIcon(clusterTypeRef.current),
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      ready.current = true;
      queue.current.splice(0).forEach((f) => f());
    });
    // badge images are drawn on demand: shop:<type>:<kind> and cl:<kind>:<count>
    m.setMissingStyleImageResolver((id) => {
      const k = kit.current;
      if (!k || m.hasImage(id)) return;
      const [what, a, b] = id.split(':');
      if (what === 'shop') m.addImage(id, shopIconImage(k, a, b), { pixelRatio: k.dpr });
      else if (what === 'cl') {
        const [, , , glyph = 'unknown', maybe = '0'] = id.split(':');
        m.addImage(id, clusterImage(k, a, Number(b), glyph, Number(maybe)), { pixelRatio: k.dpr });
      }
    });
    const hover = new Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'hk-popup' });
    const showHover = (e: MapLayerMouseEvent, text: (p: Record<string, unknown>) => string) => {
      m.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (f) hover.setLngLat((f.geometry as { coordinates: [number, number] }).coordinates).setText(text(f.properties ?? {})).addTo(m);
    };
    const hideHover = () => {
      m.getCanvas().style.cursor = '';
      hover.remove();
    };
    m.on('mousemove', 'shops-icon', (e: MapLayerMouseEvent) => showHover(e, (p) => `${p.name} · ${shopTypeLabel(String(p.type))}`));
    m.on('mousemove', 'shops-cluster', (e: MapLayerMouseEvent) => showHover(e, (p) => `${toFaDigits(Number(p.point_count))} فروشگاه — برای دیدن بزنید`));
    m.on('mouseleave', 'shops-icon', hideHover);
    m.on('mouseleave', 'shops-cluster', hideHover);
    m.on('click', 'shops-icon', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onShopRef.current?.(String(id));
    });
    m.on('click', 'shops-cluster', async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const src = m.getSource('shops') as GeoJSONSource | undefined;
      if (!f || !src) return;
      const clusterId = Number(f.properties?.cluster_id);
      const at = (f.geometry as { coordinates: [number, number] }).coordinates;
      hideHover();
      const zoom = await src.getClusterExpansionZoom(clusterId);
      if (zoom <= m.getMaxZoom()) {
        m.easeTo({ center: at, zoom, duration: 500 });
        return;
      }
      const leaves = await src.getClusterLeaves(clusterId, 500, 0);
      onClusterRef.current?.(leaves.map((l) => String(l.properties?.id)));
    });
    m.on('click', (e: MapMouseEvent) => onPickRef.current?.(e.lngLat.lat, e.lngLat.lng));
    userPin.current = new MLMarker({ element: pinEl('user') }).setLngLat([center.lon, center.lat]).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
      queue.current = [];
    };
    // the map is created once; later prop changes are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    userPin.current?.setLngLat([center.lon, center.lat]);
    const apply = () => {
      (m.getSource('radius') as GeoJSONSource | undefined)?.setData(circle(center.lat, center.lon, radiusM));
      const dLat = radiusM / 111_320;
      const dLon = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
      m.fitBounds(
        [
          [center.lon - dLon, center.lat - dLat],
          [center.lon + dLon, center.lat + dLat],
        ],
        { padding: 24, duration: 400, maxZoom: 17 },
      );
    };
    whenReady(apply);
  }, [center.lat, center.lon, radiusM]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markerRefs.current.forEach((mk) => mk.remove());
    markerRefs.current = markers.map((mk) => new MLMarker({ element: sellerEl(mk, onMarkerClick) }).setLngLat([mk.lon, mk.lat]).addTo(m));
  }, [markers, onMarkerClick]);

  useEffect(() => {
    const m = map.current;
    if (!m || !shops) return;
    whenReady(() => (m.getSource('shops') as GeoJSONSource | undefined)?.setData(shopsGeoJSON(shops)));
  }, [shops]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    whenReady(() => m.setLayoutProperty('shops-cluster', 'icon-image', clusterIcon(clusterType)));
  }, [clusterType]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    whenReady(() => m.setFilter('shops-selected', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedShopId ?? '']]));
  }, [selectedShopId]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pickPin.current?.remove();
    pickPin.current = pick ? new MLMarker({ element: pinEl('pick') }).setLngLat([pick.lon, pick.lat]).addTo(m) : null;
  }, [pick]);

  return <div ref={box} dir="ltr" className={className} />;
}
