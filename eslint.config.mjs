import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Product images come from image.torob.com; plain <img loading="lazy"> keeps the image pipeline out of the build.
      '@next/next/no-img-element': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist-scripts/**',
      'drizzle/**',
      'components/ui/**',
      'next-env.d.ts',
      'video/**',
      'data/**',
    ],
  },
];

export default eslintConfig;
