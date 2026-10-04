/**
 * Google Translate fallback using the same no-key web endpoints used by
 * MegaTXT-Translator. This is deliberately NOT the paid Google Cloud
 * Translation API and requires no Google API key.
 *
 * IMPORTANT: OmniVicente calls this only after Gemini explicitly blocks a
 * chunk for content-policy/safety reasons. Normal translation remains Gemini.
 */

const GOOGLE_REQUEST_TIMEOUT_MS = 5000;
const GOOGLE_BATCH_CHARS = 1200;
const GOOGLE_BATCH_CONCURRENCY = 5;
const MAX_CACHE_SIZE = 10000;

const translationCache = new Map<string, string>();

function hasChineseCharacters(text: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
}

function cacheSet(key: string, value: string): void {
  translationCache.set(key, value);
  if (translationCache.size > MAX_CACHE_SIZE) {
    const first = translationCache.keys().next().value;
    if (first) translationCache.delete(first);
  }
}

function parseGoogleResponse(data: any): string {
  if (!Array.isArray(data)) return '';

  if (Array.isArray(data[0])) {
    return data[0]
      .map((segment: any) => Array.isArray(segment) ? String(segment[0] ?? '') : '')
      .join('');
  }

  if (typeof data[0] === 'string') return data.join('');
  return '';
}

async function translateSmallText(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (!hasChineseCharacters(trimmed)) return trimmed;

  const cacheKey = `zh-CN:en:${trimmed}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const endpoints = [
    `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=zh-CN&tl=en&q=${encodeURIComponent(trimmed)}`,
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=${encodeURIComponent(trimmed)}`,
  ];

  let lastError: unknown = null;

  for (const url of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
          Accept: '*/*',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Google Translate HTTP ${response.status}`);
      }

      const data = await response.json();
      const translated = parseGoogleResponse(data).trim();
      if (translated) {
        cacheSet(cacheKey, translated);
        return translated;
      }

      throw new Error('Google Translate returned an empty response');
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Google Translate fallback failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function makeBatches(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const batches: string[] = [];
  let current: string[] = [];
  let length = 0;

  for (const paragraph of paragraphs) {
    if (paragraph.length > GOOGLE_BATCH_CHARS) {
      if (current.length) {
        batches.push(current.join('\n\n'));
        current = [];
        length = 0;
      }
      for (let i = 0; i < paragraph.length; i += GOOGLE_BATCH_CHARS) {
        batches.push(paragraph.slice(i, i + GOOGLE_BATCH_CHARS));
      }
      continue;
    }

    const addition = paragraph.length + (current.length ? 2 : 0);
    if (current.length && length + addition > GOOGLE_BATCH_CHARS) {
      batches.push(current.join('\n\n'));
      current = [];
      length = 0;
    }

    current.push(paragraph);
    length += paragraph.length + (current.length > 1 ? 2 : 0);
  }

  if (current.length) batches.push(current.join('\n\n'));
  return batches;
}

/**
 * Translate a normal chunk/chapter with Google's free web translator.
 * Chapter markers are never sent to Google; they are restored exactly.
 */
export async function translateWithGoogleFallback(sourceText: string): Promise<string> {
  if (!sourceText || !sourceText.trim()) return '';

  const markerPattern = /<<<OMNI_(?:CHAPTER_(?:START|END)\s+index="\d+"|PIECE_(?:START|END)\s+chapter="\d+"\s+piece="\d+"\s+total="\d+")>>>/g;
  const parts = sourceText.split(markerPattern);
  const markers = sourceText.match(markerPattern) ?? [];

  const translatedParts: string[] = [];

  for (const part of parts) {
    if (!part.trim()) {
      translatedParts.push(part);
      continue;
    }

    const batches = makeBatches(part);
    const translatedBatches: string[] = [];

    for (let i = 0; i < batches.length; i += GOOGLE_BATCH_CONCURRENCY) {
      const group = batches.slice(i, i + GOOGLE_BATCH_CONCURRENCY);
      const results = await Promise.all(group.map((batch) => translateSmallText(batch)));
      translatedBatches.push(...results);
    }

    translatedParts.push(translatedBatches.join('\n\n'));
  }

  let result = '';
  for (let i = 0; i < translatedParts.length; i++) {
    result += translatedParts[i];
    if (i < markers.length) result += markers[i];
  }

  return result.trim();
}
