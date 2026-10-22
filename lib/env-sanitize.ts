// Optional env vars copied from .env.example arrive as empty strings. Some SDKs treat ''
// differently from "unset" (e.g. @ai-sdk/openai throws on an empty OPENAI_BASE_URL at import time).
const OPTIONAL_VARS = [
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENROUTER_API_KEY',
  'LLM_FAST_MODEL',
  'SIM_SALT',
];

export function sanitizeEnv() {
  for (const key of OPTIONAL_VARS) {
    if (process.env[key] !== undefined && process.env[key]!.trim() === '') delete process.env[key];
  }
}
