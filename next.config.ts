import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'pg-copy-streams'],
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
