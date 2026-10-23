import { generateText, Output } from 'ai';
import { llmConfigured, llmProvider, visionModel, visionModelId } from '../llm';
import { VisionSchema, type Vision } from './parse';

/**
 * Image calls take 2.3–6 s on the three providers (`pnpm vision-check`), so 10 s instead of the general 6 s;
 * on timeout the card asks the user to type the name instead (DECISIONS #98).
 */
export const VISION_TIMEOUT_MS = 10_000;

const SYSTEM =
  'You identify the product in a shopper\'s photo for a Tehran shopping assistant: a product, its box, or a shelf price tag. ' +
  'Read brand and model exactly as printed (e.g. «Samsung», «Galaxy A17»); product_type in Persian (گوشی موبایل، کاور گوشی، هدفون، پاوربانک …). ' +
  'If a price is printed, return it in toman (prices in ریال ÷ 10; «۶۴٬۵۰۰٬۰۰۰ تومان» = 64500000). text_lines = legible text, as printed. ' +
  'If the photo shows no product (a landscape, a person, an animal …) set product_type null and confidence below 0.2. Never guess a model that is not visible.';

export type IdentifyResult = { vision: Vision | null; provider: string; model: string; ms: number; error?: string };

/** One vision call (image part via the AI SDK); the image is sent to the provider and not stored here. */
export async function identifyProduct(image: Uint8Array, mediaType: string, opts: { timeoutMs?: number } = {}): Promise<IdentifyResult> {
  const provider = llmProvider();
  const model = visionModelId();
  const t0 = Date.now();
  if (!llmConfigured()) return { vision: null, provider, model, ms: 0, error: 'no vision provider configured' };
  try {
    const { output } = await generateText({
      model: visionModel(),
      output: Output.object({ schema: VisionSchema }),
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'این چه کالایی است؟ JSON بده.' },
            { type: 'file', data: image, mediaType },
          ],
        },
      ],
      timeout: opts.timeoutMs ?? VISION_TIMEOUT_MS,
      maxRetries: 0,
    });
    return { vision: output ?? null, provider, model, ms: Date.now() - t0 };
  } catch (err) {
    return { vision: null, provider, model, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}
