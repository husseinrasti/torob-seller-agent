'use client';

import { useEffect, useState } from 'react';

/** RFC 4122 v4 id (works on plain-HTTP origins where crypto.randomUUID is unavailable). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // insecure context
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** true on desktop widths (≥ 1024px); false during SSR and on phones/tablets. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}
