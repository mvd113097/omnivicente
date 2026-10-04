/**
 * Fallback Translator using Google Translate
 * ONLY invoked when Gemini rejects a chapter due to Safety / Content filtering.
 * Preserves paragraph formatting and handles any length.
 */

async function translateSingleChunk(text: string, targetLang: string = 'en', sourceLang: string = 'auto'): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    sourceLang
  )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Google Translate HTTP ${response.status}: ${response.statusText}`);
  }

  const raw = await response.json();
  // Format of google translate gtx: [[ [translatedText, originalText, ...], ... ]]
  if (!Array.isArray(raw) || !Array.isArray(raw[0])) {
    throw new Error('Unexpected response format from Google Translate');
  }

  const translatedPieces: string[] = [];
  for (const part of raw[0]) {
    if (part && part[0]) {
      translatedPieces.push(part[0]);
    }
  }

  return translatedPieces.join('');
}

export async function translateWithGoogleTranslate(
  text: string,
  targetLang: string = 'en',
  sourceLang: string = 'auto'
): Promise<string> {
  // If text is short (< 1500 chars), translate in one shot
  if (text.length <= 1500) {
    return await translateSingleChunk(text, targetLang, sourceLang);
  }

  // Otherwise, split by paragraphs to preserve novel layout cleanly
  const paragraphs = text.split('\n');
  const translatedParagraphs: string[] = [];
  let buffer: string[] = [];
  let bufferLen = 0;

  for (const p of paragraphs) {
    if (bufferLen + p.length > 1200 && buffer.length > 0) {
      const combined = buffer.join('\n');
      const translated = await translateSingleChunk(combined, targetLang, sourceLang);
      translatedParagraphs.push(translated);
      buffer = [p];
      bufferLen = p.length;
      // Slight throttle to be polite
      await new Promise(r => setTimeout(r, 100));
    } else {
      buffer.push(p);
      bufferLen += p.length + 1;
    }
  }

  if (buffer.length > 0) {
    const combined = buffer.join('\n');
    const translated = await translateSingleChunk(combined, targetLang, sourceLang);
    translatedParagraphs.push(translated);
  }

  return translatedParagraphs.join('\n');
}
