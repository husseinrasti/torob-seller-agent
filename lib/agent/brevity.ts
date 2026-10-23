import type { StreamTextTransform, TextStreamPart, ToolSet } from 'ai';

/**
 * Keeps the agent's prose short: the cards carry the details, so a reply stops after `max` sentences
 * («.»، «؟»، «!» or a line break; a dot between digits is not a sentence end). Tool calls pass through.
 */
export function sentenceCap(max: number) {
  let count = 0;
  let prev = '';
  return {
    get done() {
      return count >= max;
    },
    /** The part of `chunk` that still fits. */
    push(chunk: string): string {
      if (count >= max) return '';
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        const next = chunk[i + 1] ?? '';
        const end = c === '؟' || c === '?' || c === '!' || c === '\n' || (c === '.' && !(/\d/.test(prev) && /\d/.test(next)));
        prev = c;
        if (end && i > 0) {
          count++;
          if (count >= max) return chunk.slice(0, i + 1).replace(/\n$/, '');
        }
      }
      return chunk;
    },
  };
}

/** `streamText` transform: text after the first `max` sentences of a response is dropped. */
export function capSentences(max = 2): StreamTextTransform<ToolSet> {
  return () => {
    const cap = sentenceCap(max);
    return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(part, controller) {
        if (part.type !== 'text-delta') return controller.enqueue(part);
        const text = cap.push(part.text);
        if (text) controller.enqueue({ ...part, text });
      },
    });
  };
}
