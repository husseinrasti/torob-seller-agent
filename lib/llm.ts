import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export type ModelKind = 'chat' | 'fast';

export function llmProvider(): string {
  return process.env.LLM_PROVIDER || 'openai';
}

/** True when the configured provider has an API key, so callers can skip LLM work early. */
export function llmConfigured(): boolean {
  switch (llmProvider()) {
    case 'google':
      return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    case 'openrouter':
      return Boolean(process.env.OPENROUTER_API_KEY);
    default:
      return Boolean(process.env.OPENAI_API_KEY);
  }
}

export function model(kind: ModelKind = 'chat') {
  const id = kind === 'fast' && process.env.LLM_FAST_MODEL ? process.env.LLM_FAST_MODEL : process.env.LLM_MODEL!;
  switch (llmProvider()) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(id);
    case 'openrouter':
      return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(id);
    default:
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined })(id);
  }
}
