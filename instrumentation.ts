import { sanitizeEnv } from './lib/env-sanitize';

export function register() {
  sanitizeEnv();
}
