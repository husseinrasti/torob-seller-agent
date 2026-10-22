'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MLMap, Marker as MLMarker, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { toFaDigits } from '@/lib/fa/digits';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

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

export default function MapView({
  center,
  radiusM,
  markers = [],
  onMarkerClick,
  pick,
  onPick,
  className,
}: {
  center: { lat: number; lon: number };
  radiusM: number;
  markers?: MapMarker[];
  onMarkerClick?: (id: string) => void;
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

  useEffect(() => {
    if (!box.current) return;
    const m = new MLMap({
      container: box.current,
      style: OSM_STYLE,
      center: [center.lon, center.lat],
      zoom: 15,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    m.on('load', () => {
      m.addSource('radius', { type: 'geojson', data: circle(center.lat, center.lon, radiusM) });
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#0f766e', 'line-width': 2, 'line-dasharray': [2, 2] } });
    });
    m.on('click', (e: MapMouseEvent) => onPickRef.current?.(e.lngLat.lat, e.lngLat.lng));
    userPin.current = new MLMarker({ element: pinEl('user') }).setLngLat([center.lon, center.lat]).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
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
    if (m.isStyleLoaded()) apply();
    else m.once('load', apply);
  }, [center.lat, center.lon, radiusM]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markerRefs.current.forEach((mk) => mk.remove());
    markerRefs.current = markers.map((mk) => new MLMarker({ element: sellerEl(mk, onMarkerClick) }).setLngLat([mk.lon, mk.lat]).addTo(m));
  }, [markers, onMarkerClick]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pickPin.current?.remove();
    pickPin.current = pick ? new MLMarker({ element: pinEl('pick') }).setLngLat([pick.lon, pick.lat]).addTo(m) : null;
  }, [pick]);

  return <div ref={box} dir="ltr" className={className} />;
}
