import { GoogleGenAI } from '@google/genai';

export class SafetyBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyBlockError';
  }
}

export class RateLimitError extends Error {
  public retryDelaySeconds?: number;
  constructor(message: string, retryDelaySeconds?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryDelaySeconds = retryDelaySeconds;
  }
}

export class TruncationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TruncationError';
  }
}

export interface TranslationOptions {
  model?: string;
  sourceLang?: string;
  targetLang?: string;
  glossary?: Record<string, string>;
  timeoutMs?: number;
}

export function sanitizeApiKey(key: string): string {
  if (!key) return '';
  return key.trim();
}

/**
 * Translates a single text chunk with Gemini AI.
 * Follows strict literary translation instructions.
 * NEVER uses LOW thinking (explicitly forbidden by Requirement 14).
 * Validates output for non-truncation, non-empty, and safety blocks.
 */
export async function translateChunkWithGemini(
  text: string,
  apiKey: string,
  options: TranslationOptions = {}
): Promise<string> {
  const cleanKey = sanitizeApiKey(apiKey);
  if (!cleanKey) {
    throw new Error('No API key provided');
  }

  const model = options.model || 'gemini-3.8-flash';
  const targetLang = options.targetLang || 'English';
  const sourceLang = options.sourceLang || 'the original novel language';
  const timeoutMs = options.timeoutMs || 45000;

  const ai = new GoogleGenAI({
    apiKey: cleanKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Prepare glossary hints if available
  let glossaryPrompt = '';
  if (options.glossary && Object.keys(options.glossary).length > 0) {
    const entries = Object.entries(options.glossary)
      .map(([k, v]) => `- "${k}" -> "${v}"`)
      .join('\n');
    glossaryPrompt = `\nStrictly adhere to these specific novel terms and character names:\n${entries}\n`;
  }

  // Enhanced literary web-novel prompt per Requirement 15
  const systemInstruction = `You are a master literary translator specializing in Chinese web novels, xianxia, wuxia, and modern fiction.
Translate the provided text from ${sourceLang} into natural, fluid, and immersive ${targetLang}.

CORE RULES:
1. Preserve complete meaning, emotional tone, nuances, and dialogue styles.
2. Infer Chinese third-person pronouns (他/她/它) and implied subjects accurately from context to maintain gender consistency.
3. Preserve original paragraph structure and dialogue breaks without merging or reordering.
4. NEVER summarize, condense, or omit any sentences or paragraphs.
5. NEVER add translator notes, conversational preambles, or sign-offs (e.g., do NOT output "Here is the translation:").
6. Output ONLY the translated story text.${glossaryPrompt}`;

  const callModel = async () => {
    // Note: Do NOT add thinkingLevel: LOW (strictly prohibited by Requirement 14)
    return await ai.models.generateContent({
      model,
      contents: text,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `Gemini translation request timed out after ${Math.round(
              timeoutMs / 1000
            )}s`
          )
        ),
      timeoutMs
    )
  );

  try {
    const response: any = await Promise.race([callModel(), timeoutPromise]);

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    // Check for safety finish reason
    if (
      finishReason &&
      ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(
        finishReason.toString()
      )
    ) {
      throw new SafetyBlockError(
        `Gemini safety filter triggered with finishReason: ${finishReason}`
      );
    }

    // Check for truncation / MAX_TOKENS (Requirement 17)
    if (finishReason === 'MAX_TOKENS') {
      throw new TruncationError(
        'Gemini response was truncated due to max output tokens.'
      );
    }

    const output = response.text;
    if (!output || output.trim().length === 0) {
      if (candidate?.finishReason) {
        throw new SafetyBlockError(
          `Gemini returned empty text with finishReason: ${candidate.finishReason}`
        );
      }
      throw new Error('Gemini returned an empty translation response');
    }

    return output.trim();
  } catch (err: any) {
    const errMsg = err?.message || String(err);

    // Explicit Safety Block
    if (
      err instanceof SafetyBlockError ||
      /safety|blocked|harm_category|policy|sensitive/i.test(errMsg)
    ) {
      throw new SafetyBlockError(errMsg);
    }

    // Rate Limit / Quota Exhaustion
    if (
      err?.status === 429 ||
      /429|quota|rate limit|resource_exhausted/i.test(errMsg)
    ) {
      let retryDelaySeconds: number | undefined;
      const match = errMsg.match(/retry in ([\d\.]+)s/i) || errMsg.match(/retryDelay":"?(\d+)s/i);
      if (match) {
        retryDelaySeconds = Math.ceil(parseFloat(match[1]));
      }
      throw new RateLimitError(errMsg, retryDelaySeconds);
    }

    throw err;
  }
}
