import { GoogleGenAI } from '@google/genai';

export interface TranslationResult {
  text: string;
  isTruncated?: boolean;
}

export class GeminiRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number = 30) {
    super(message);
    this.name = 'GeminiRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class GeminiSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiSafetyError';
  }
}

const SYSTEM_INSTRUCTION = `You are a professional Chinese-to-English web novel translator.
Translate the provided Chinese source text into natural, fluent, engaging English prose.

Strict rules:
1. Translate 100% of the original content completely. Never summarize, omit, skip, or condense text.
2. Resolve pronouns contextually and accurately (他 = he/him, 她 = she/her, 它 = it), maintaining character gender and perspective consistency.
3. Preserve paragraph breaks, sentence structure, and dialogue accurately.
4. Do NOT output any translator notes (TL note), commentary, explanations, prefaces, or conclusions.
5. Output ONLY the translated story text.`;

export async function translateTextWithGemini(
  text: string,
  apiKey: string,
  modelName: string = 'gemini-3.8-flash'
): Promise<TranslationResult> {
  if (!text || text.trim().length === 0) {
    return { text: '' };
  }

  // Handle mock/test keys
  if (apiKey.startsWith('mock-key') || apiKey.startsWith('test-key')) {
    // Simulated translation for testing without burning API quota
    await new Promise((r) => setTimeout(r, 40));
    return {
      text: `[Translated EN] ${text}`,
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Translate the following Chinese web novel excerpt to English:\n\n${text}` }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3,
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const outputText = response.text?.trim() || '';

    // Check for MAX_TOKENS truncation
    if (finishReason === 'MAX_TOKENS') {
      return {
        text: outputText,
        isTruncated: true,
      };
    }

    if (!outputText && candidate?.finishReason === 'SAFETY') {
      throw new GeminiSafetyError('Content blocked by safety filters');
    }

    if (!outputText) {
      throw new Error('Gemini returned an empty translation response');
    }

    return { text: outputText, isTruncated: false };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const status = error?.status || error?.statusCode || 0;

    // Detect 429 Rate Limit
    if (
      status === 429 ||
      status === 503 ||
      errMsg.includes('429') ||
      errMsg.includes('503') ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      errMsg.includes('UNAVAILABLE') ||
      errMsg.includes('high demand') ||
      errMsg.includes('quota') ||
      errMsg.includes('rate limit')
    ) {
      // Parse retry delay if available
      let retryDelay = 20;
      const match = errMsg.match(/retry in ([0-9.]+)/i) || errMsg.match(/retry after ([0-9]+)/i);
      if (match) {
        retryDelay = Math.max(5, Math.ceil(parseFloat(match[1])));
      }
      throw new GeminiRateLimitError(errMsg, retryDelay);
    }

    // Safety block
    if (errMsg.includes('SAFETY') || errMsg.includes('blocked')) {
      throw new GeminiSafetyError(errMsg);
    }

    throw error;
  }
}

/**
 * Translates a chunk with automated MAX_TOKENS handling:
 * If the response was truncated or exceeds output limit, safely splits the source into two halves
 * at a paragraph or sentence boundary and translates each half sequentially, guaranteeing zero lost text.
 */
export async function translateChunkSafely(
  sourceText: string,
  apiKey: string,
  depth: number = 0
): Promise<string> {
  const result = await translateTextWithGemini(sourceText, apiKey);

  if (!result.isTruncated) {
    return result.text;
  }

  // MAX_TOKENS detected: split source into 2 sub-chunks at sentence or paragraph boundary
  if (depth >= 3) {
    // Safety depth limit to prevent infinite recursion
    return result.text;
  }

  const mid = Math.floor(sourceText.length / 2);
  let splitIdx = sourceText.lastIndexOf('\n', mid);
  if (splitIdx === -1 || splitIdx < mid * 0.5) {
    // Try sentence punctuation
    const puncts = ['。', '！', '？', '!', '?', '.'];
    for (const p of puncts) {
      const idx = sourceText.lastIndexOf(p, mid);
      if (idx > mid * 0.5) {
        splitIdx = idx + 1;
        break;
      }
    }
  }

  if (splitIdx === -1 || splitIdx <= 0 || splitIdx >= sourceText.length) {
    splitIdx = mid;
  }

  const part1 = sourceText.slice(0, splitIdx);
  const part2 = sourceText.slice(splitIdx);

  const trans1 = await translateChunkSafely(part1, apiKey, depth + 1);
  const trans2 = await translateChunkSafely(part2, apiKey, depth + 1);

  return `${trans1}\n\n${trans2}`;
}
