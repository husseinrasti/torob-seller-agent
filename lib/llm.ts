import './env-init';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { wrapLanguageModel } from 'ai';
import { offlineModel } from './agent/offline-model';

export type ModelKind = 'chat' | 'fast';

export function llmProvider(): string {
  return process.env.LLM_PROVIDER || 'openai';
}

/** True when a real provider with an API key is configured (routing / persona / checklist may call it). */
export function llmConfigured(): boolean {
  switch (llmProvider()) {
    case 'google':
      return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    case 'openrouter':
      return Boolean(process.env.OPENROUTER_API_KEY);
    case 'offline':
      return false;
    default:
      return Boolean(process.env.OPENAI_API_KEY);
  }
}

/** 'live' = real LLM; 'offline' = rule-based stand-in (LLM_PROVIDER=offline or no key configured). */
export function llmMode(): 'live' | 'offline' {
  return llmConfigured() ? 'live' : 'offline';
}

export function model(kind: ModelKind = 'chat') {
  const id = kind === 'fast' && process.env.LLM_FAST_MODEL ? process.env.LLM_FAST_MODEL : process.env.LLM_MODEL!;
  if (!llmConfigured()) return offlineModel();
  switch (llmProvider()) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(id);
    case 'openrouter':
      return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(id);
    default:
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined })(id);
  }
}

const FALLBACK_AFTER_MS = 12_000;

function withDeadline<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`LLM did not respond within ${ms} ms`)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * The chat model, wrapped so that a failing or unreachable provider degrades to the rule-based
 * offline model for that step instead of breaking the conversation. `onFallback` lets the caller
 * tell the user (the UI shows a Persian notice).
 */
export function chatModel(onFallback?: (err: unknown) => void) {
  const live = model('chat');
  if (!llmConfigured()) return live;
  const offline = offlineModel();
  return wrapLanguageModel({
    model: live,
    middleware: {
      wrapStream: async ({ doStream, params }) => {
        try {
          return await withDeadline(doStream(), FALLBACK_AFTER_MS);
        } catch (err) {
          onFallback?.(err);
          return offline.doStream(params);
        }
      },
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await withDeadline(doGenerate(), FALLBACK_AFTER_MS);
        } catch (err) {
          onFallback?.(err);
          return offline.doGenerate(params);
        }
      },
    },
  });
}
