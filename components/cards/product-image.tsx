'use client';

import { useState } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Product photo from the catalog CDN; a neutral placeholder stays visible until the image actually loads. */
export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>(src ? 'loading' : 'failed');
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border', className)}>
      {state !== 'ok' && <Package className="size-7 text-muted-foreground/40" />}
      {src && state !== 'failed' && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn('absolute inset-0 size-full object-contain p-1 transition-opacity', state === 'ok' ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setState('ok')}
          onError={() => setState('failed')}
        />
      )}
    </div>
  );
}
