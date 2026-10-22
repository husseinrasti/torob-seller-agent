// Loads .env for CLI scripts (Next.js loads it by itself for the app).
import { config } from 'dotenv';
import { sanitizeEnv } from '../lib/env-sanitize';

config({ path: ['.env.local', '.env'], quiet: true });
sanitizeEnv();
