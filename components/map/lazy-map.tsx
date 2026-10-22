'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/** MapLibre is loaded only when a map is opened (keeps `/` light). */
export const LazyMap = dynamic(() => import('./map-view'), {
  ssr: false,
  loading: () => <Skeleton className="size-full min-h-48 rounded-2xl" />,
});
