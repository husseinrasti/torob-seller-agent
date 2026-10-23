'use client';

import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { LucideIcon } from 'lucide-react';
import { toFaDigits } from '@/lib/fa/digits';
import { SHOP_KIND_COLORS, SHOP_TYPE_ICONS, type ShopKind } from './shop-type-icon';

/**
 * Canvas images for the MapLibre symbol layers: a coloured badge with the shop type's lucide glyph,
 * and cluster badges with a Persian count. The OSM raster style has no glyph server, so text is drawn
 * here with the page font instead of by MapLibre.
 */
const BADGE = 26; // css px
const GLYPH = 15;

export type MapIconKit = { dpr: number; font: string; glyphs: Map<string, HTMLImageElement> };

function svgOf(Icon: LucideIcon, px: number): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement(Icon, { size: px, color: '#ffffff', strokeWidth: 2.4 })));
  const svg = host.innerHTML;
  root.unmount();
  return svg;
}

async function rasterize(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

/** Rasterizes every type glyph once and waits for the page font (used for cluster counts). */
export async function loadMapIconKit(): Promise<MapIconKit> {
  const dpr = Math.min(Math.max(Math.ceil(window.devicePixelRatio || 1), 1), 3);
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  await document.fonts?.load(`700 13px ${font}`, '۰۱۲۳۴۵۶۷۸۹').catch(() => undefined);
  const glyphs = new Map<string, HTMLImageElement>();
  await Promise.all(
    Object.entries(SHOP_TYPE_ICONS).map(async ([type, Icon]) => {
      try {
        glyphs.set(type, await rasterize(svgOf(Icon, GLYPH * dpr)));
      } catch {
        // the badge is still drawn, without its glyph
      }
    }),
  );
  return { dpr, font, glyphs };
}

function canvas(sizeCss: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(sizeCss * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return [c, ctx];
}

function kindColor(kind: string): string {
  return SHOP_KIND_COLORS[kind as ShopKind] ?? SHOP_KIND_COLORS.none;
}

/** `shop:<type>:<kind>` */
export function shopIconImage(kit: MapIconKit, type: string, kind: string): ImageData {
  const size = BADGE + 6;
  const [c, ctx] = canvas(size, kit.dpr);
  const mid = size / 2;
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(mid, mid, BADGE / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = kindColor(kind);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  const glyph = kit.glyphs.get(type) ?? kit.glyphs.get('unknown');
  if (glyph) ctx.drawImage(glyph, mid - GLYPH / 2, mid - GLYPH / 2, GLYPH, GLYPH);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/**
 * `cl:<kind>:<count>:<glyph>:<maybe>` — a pill with a shop glyph and the Persian count, so it reads as
 * "N shops"; an amber bubble counts the shops that only match the chosen product's category.
 */
export function clusterImage(kit: MapIconKit, kind: string, count: number, glyphType: string, maybe = 0): ImageData {
  const h = count < 50 ? 26 : 30;
  const fontPx = count < 50 ? 12 : 13;
  const label = toFaDigits(count);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `700 ${fontPx}px ${kit.font}`;
  const textW = Math.ceil(measure.measureText(label).width);
  const g = h - 12;
  const w = Math.max(h, 8 + g + 4 + textW + 9);
  const pad = 9; // symmetric so the pill stays centred on the point
  const c = document.createElement('canvas');
  c.width = Math.round((w + pad * 2) * kit.dpr);
  c.height = Math.round((h + pad * 2) * kit.dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(kit.dpr, kit.dpr);
  const color = kindColor(kind);
  const pill = (x: number, y: number, pw: number, ph: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, ph / 2);
  };
  pill(pad - 4, pad - 4, w + 8, h + 8);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  pill(pad, pad, w, h);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // RTL reading order: glyph on the right, count on the left
  const glyph = kit.glyphs.get(glyphType) ?? kit.glyphs.get('unknown');
  if (glyph) ctx.drawImage(glyph, pad + w - 8 - g, pad + (h - g) / 2, g, g);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${fontPx}px ${kit.font}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pad + w - 8 - g - 4, pad + h / 2 + 1);
  if (maybe > 0) {
    const m = toFaDigits(maybe);
    ctx.font = `700 10px ${kit.font}`;
    const bw = Math.max(16, Math.ceil(ctx.measureText(m).width) + 8);
    const bx = 1;
    const by = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 16, 8);
    ctx.fillStyle = SHOP_KIND_COLORS.maybe;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(m, bx + bw / 2, by + 9);
  }
  return ctx.getImageData(0, 0, c.width, c.height);
}
