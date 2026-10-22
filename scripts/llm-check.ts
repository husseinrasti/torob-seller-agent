// Verifies each LLM provider with one trivial tool call.
// Usage: pnpm llm-check [--provider=openai|google|openrouter]
import './load-env';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { model } from '../lib/llm';

const PROVIDERS = [
  { name: 'openai', key: 'OPENAI_API_KEY', fallbackModel: 'gpt-4.1-mini' },
  { name: 'google', key: 'GOOGLE_GENERATIVE_AI_API_KEY', fallbackModel: 'gemini-2.5-flash' },
  { name: 'openrouter', key: 'OPENROUTER_API_KEY', fallbackModel: 'openai/gpt-4.1-mini' },
] as const;

const configuredProvider = process.env.LLM_PROVIDER || 'openai';
const configuredModel = process.env.LLM_MODEL;
const only = process.argv.find((a) => a.startsWith('--provider='))?.split('=')[1];

async function check(p: (typeof PROVIDERS)[number]): Promise<'ok' | 'skip' | 'fail'> {
  if (!process.env[p.key]) {
    console.log(`- ${p.name}: SKIP (${p.key} is not set)`);
    return 'skip';
  }
  const envModel = process.env[`LLM_CHECK_${p.name.toUpperCase()}_MODEL`];
  const id = envModel || (p.name === configuredProvider && configuredModel) || p.fallbackModel;
  process.env.LLM_PROVIDER = p.name;
  process.env.LLM_MODEL = id;
  const started = Date.now();
  try {
    const res = await generateText({
      model: model('chat'),
      prompt: 'جمع ۲ و ۳ را با ابزار add حساب کن.',
      tools: {
        add: tool({
          description: 'Add two integers',
          inputSchema: z.object({ a: z.number(), b: z.number() }),
          execute: async ({ a, b }) => ({ sum: a + b }),
        }),
      },
      toolChoice: 'required',
      stopWhen: stepCountIs(1),
      timeout: 25_000,
    });
    const call = res.toolCalls[0];
    const result = res.toolResults[0];
    if (!call) throw new Error('no tool call returned');
    console.log(
      `- ${p.name} (${id}): OK in ${Date.now() - started} ms → ${call.toolName}(${JSON.stringify(call.input)}) = ${JSON.stringify(result?.output)}`,
    );
    return 'ok';
  } catch (err) {
    console.log(`- ${p.name} (${id}): FAIL → ${(err as Error).message}`);
    return 'fail';
  }
}

async function main() {
  const targets = PROVIDERS.filter((p) => !only || p.name === only);
  const results = [];
  for (const p of targets) results.push(await check(p));
  const failed = results.filter((r) => r === 'fail').length;
  const ok = results.filter((r) => r === 'ok').length;
  console.log(`\nllm-check: ${ok} ok, ${failed} failed, ${results.length - ok - failed} skipped`);
  process.exit(failed ? 1 : 0);
}

main();
