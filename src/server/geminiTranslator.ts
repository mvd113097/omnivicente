export interface TranslationResult {
  text: string;
  isTruncated?: boolean;
}

export class GeminiRateLimitError extends Error {
  retryAfterSeconds: number;
  quotaKind: 'transient_rate_limit' | 'daily_quota';
  constructor(message: string, retryAfterSeconds: number = 30, quotaKind: 'transient_rate_limit' | 'daily_quota' = 'transient_rate_limit') {
    super(message);
    this.name = 'GeminiRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.quotaKind = quotaKind;
  }
}

export class GeminiPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiPermissionError';
  }
}

export class GeminiModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiModelError';
  }
}

export class GeminiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeminiRequestError';
    this.status = status;
  }
}

export class GeminiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiAuthError';
  }
}

export class GeminiSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiSafetyError';
  }
}

const GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 180000);


function extractRetryAfterSeconds(error: any, fallbackSeconds: number = 15): number {
  const retryDelay = error?.data?.error?.details?.find?.((detail: any) =>
    String(detail?.['@type'] || '').includes('RetryInfo')
  )?.retryDelay;

  if (typeof retryDelay === 'string') {
    const match = retryDelay.match(/(\d+(?:\.\d+)?)s/i);
    if (match) return Math.max(1, Math.ceil(Number(match[1])));
  }

  const message = String(error?.message || '');
  const match = message.match(/retry(?: in| after)\s+(\d+(?:\.\d+)?)\s*s/i);
  if (match) return Math.max(1, Math.ceil(Number(match[1])));

  return fallbackSeconds;
}

function getErrorText(error: any): string {
  const message = String(error?.message || '');
  const apiMessage = String(error?.data?.error?.message || '');
  return `${message} ${apiMessage}`.trim();
}

function looksLikeDailyQuota(error: any): boolean {
  const text = getErrorText(error).toLowerCase();
  const details = Array.isArray(error?.data?.error?.details) ? error.data.error.details : [];
  const quotaViolationText = details
    .map((detail: any) => JSON.stringify(detail))
    .join(' ')
    .toLowerCase();
  const combined = `${text} ${quotaViolationText}`;
  return (
    /\bdaily\b/.test(combined) ||
    /per\s*day/.test(combined) ||
    /requests[_\s-]*per[_\s-]*day/.test(combined) ||
    /tokens[_\s-]*per[_\s-]*day/.test(combined) ||
    /generate[_\s-]*content[_\s-]*(free[_\s-]*)?requests[_\s-]*per[_\s-]*day/.test(combined) ||
    /rpd/.test(combined) ||
    /quota.*reset/.test(combined) ||
    /retry.?after.*(?:hour|day)/.test(combined)
  );
}

function classify429(error: any): { kind: 'transient_rate_limit' | 'daily_quota'; retryAfterSeconds: number } {
  const retryAfterSeconds = extractRetryAfterSeconds(error, 15);
  const daily = looksLikeDailyQuota(error) || retryAfterSeconds >= 3600;
  return {
    kind: daily ? 'daily_quota' : 'transient_rate_limit',
    retryAfterSeconds: daily ? Math.max(retryAfterSeconds, 3600) : retryAfterSeconds,
  };
}

const SYSTEM_INSTRUCTION = `You are a professional Chinese-to-English web novel translator.
Translate the provided Chinese source text into natural, fluent, engaging English prose.

Strict rules:
1. Translate 100% of the original content completely. Never summarize, omit, skip, or condense text.
2. Resolve pronouns contextually and accurately (他 = he/him, 她 = she/her, 它 = it), maintaining character gender and perspective consistency.
3. Preserve paragraph breaks, sentence structure, and dialogue accurately.
4. Do NOT output any translator notes (TL note), commentary, explanations, prefaces, or conclusions.
5. Output ONLY the translated story text.
6. If the input contains markers matching <<<OMNI_CHAPTER_START index="N">>> and <<<OMNI_CHAPTER_END index="N">>>, copy every marker EXACTLY, in the same order. Never translate, remove, rename, or invent a marker.
7. Preserve the number and order of non-empty paragraph lines. Do not merge or omit paragraphs.`;

// High-quota model cascade sequence
export const MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// Pin normal translation to Google's current highest-capability stable Flash model.
// Environment variables cannot silently downgrade the novel translator.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Executes a single API call to Gemini supporting all key formats (AIzaSy..., AQ...).
 */
async function callGeminiApiSingle(
  text: string,
  apiKey: string,
  modelName: string
): Promise<TranslationResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: `Translate the following Chinese web novel excerpt to English:\n\n${text}` }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${GEMINI_REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = data?.error?.message || response.statusText || 'API request failed';
    const error: any = new Error(errMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const promptBlockReason = data?.promptFeedback?.blockReason;
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const nonRetryableReasons = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'RECITATION', 'SPII']);
  if (promptBlockReason && nonRetryableReasons.has(String(promptBlockReason))) {
    throw new GeminiSafetyError(`Gemini blocked the request: ${promptBlockReason}`);
  }
  if (finishReason && nonRetryableReasons.has(String(finishReason))) {
    throw new GeminiSafetyError(`Gemini blocked the response: ${finishReason}`);
  }
  const parts = candidate?.content?.parts || [];
  const outputText = parts.map((p: any) => p.text || '').join('').trim();

  if (finishReason === 'MAX_TOKENS') {
    return { text: outputText, isTruncated: true };
  }
  if (!outputText && candidate?.finishReason === 'SAFETY') {
    throw new GeminiSafetyError('Content blocked by safety filters');
  }
  if (!outputText) {
    throw new Error('Gemini returned an empty translation response');
  }

  return { text: outputText, isTruncated: false };
}

/**
 * Translates Chinese text with multi-model fallback cascade and dual auth support.
 */
export async function translateTextWithGemini(
  text: string,
  apiKey: string,
  preferredModel: string = DEFAULT_GEMINI_MODEL
): Promise<TranslationResult> {
  if (!text || text.trim().length === 0) {
    return { text: '' };
  }

  // Handle mock/test keys ONLY during automated test suite execution
  if (
    process.env.NODE_ENV === 'test' &&
    (apiKey.startsWith('mock-key') || apiKey.startsWith('test-key') || apiKey.startsWith('benchmark-key'))
  ) {
    await new Promise((r) => setTimeout(r, 40));
    return { text: `[Translated EN] ${text}` };
  }

  // Build model sequence starting with preferredModel, then remaining cascade
  const modelsToTry = [preferredModel, ...MODEL_CASCADE.filter((m) => m !== preferredModel)];
  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    try {
      return await callGeminiApiSingle(text, apiKey, currentModel);
    } catch (error: any) {
      lastError = error;
      const errMsg = error?.message || String(error);
      const status = error?.status || error?.statusCode || 0;

      // Quota/rate-limit errors should fail over to another API key immediately.
      // Cycling through several models on the same exhausted key adds latency and
      // can consume additional quota before the scheduler gets a chance to rotate keys.
      const lowerMsg = errMsg.toLowerCase();
      const is429 = status === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || lowerMsg.includes('rate limit');
      if (is429) {
        const quota = classify429(error);
        throw new GeminiRateLimitError(errMsg, quota.retryAfterSeconds, quota.kind);
      }

      // 503 is transient service availability, not a key-invalid/quota state.
      if (status === 503 || errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || lowerMsg.includes('service unavailable')) {
        const retryAfterSeconds = extractRetryAfterSeconds(error, 5);
        throw new GeminiRateLimitError(errMsg, retryAfterSeconds, 'transient_rate_limit');
      }

      // Authentication and permission failures are different from quota failures.
      if (status === 401 || errMsg.includes('401') || errMsg.includes('API_KEY_INVALID') || lowerMsg.includes('invalid authentication credentials')) {
        throw new GeminiAuthError(`Gemini authentication failed: ${errMsg}`);
      }

      if (status === 403 || errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED') || lowerMsg.includes('does not have permission')) {
        throw new GeminiPermissionError(`Gemini permission denied: ${errMsg}`);
      }

      if (status === 404 || errMsg.includes('404') || errMsg.includes('NOT_FOUND') || lowerMsg.includes('model not found')) {
        throw new GeminiModelError(`Gemini model/resource not found: ${errMsg}`);
      }

      if (errMsg.includes('SAFETY') || errMsg.includes('blocked')) {
        throw new GeminiSafetyError(errMsg);
      }

      if (status >= 400 && status < 500) {
        throw new GeminiRequestError(`Gemini rejected the request (HTTP ${status}): ${errMsg}`, status);
      }

      throw error;
    }
  }

  throw lastError || new Error('All model attempts failed');
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

  if (depth >= 4) {
    throw new Error('Gemini output remained truncated after safe source splitting; chunk was not accepted.');
  }

  // Multi-chapter batches contain explicit chapter marker blocks. Never split
  // inside one of those blocks during truncation recovery.
  const chapterBlocks = [...sourceText.matchAll(/<<<OMNI_CHAPTER_START\s+index=\"\d+\">>>[\s\S]*?<<<OMNI_CHAPTER_END\s+index=\"\d+\">>>/g)].map((m) => m[0]);
  if (chapterBlocks.length > 1) {
    const midpoint = Math.ceil(chapterBlocks.length / 2);
    const part1 = chapterBlocks.slice(0, midpoint).join('\n\n');
    const part2 = chapterBlocks.slice(midpoint).join('\n\n');
    const trans1 = await translateChunkSafely(part1, apiKey, depth + 1);
    const trans2 = await translateChunkSafely(part2, apiKey, depth + 1);
    return `${trans1}\n\n${trans2}`;
  }

  const mid = Math.floor(sourceText.length / 2);
  let splitIdx = sourceText.lastIndexOf('\n', mid);
  if (splitIdx === -1 || splitIdx < mid * 0.5) {
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
