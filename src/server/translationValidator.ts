/**
 * Conservative quality gate for Chinese -> English translation results.
 * A chunk may only become `completed` after this validator passes.
 *
 * This intentionally does not require zero Chinese characters because names,
 * titles, and occasional Chinese terms can legitimately remain in English prose.
 */
export interface TranslationValidationResult {
  valid: boolean;
  reason?: string;
  sourceParagraphs: number;
  translatedParagraphs: number;
  chineseRatio: number;
  englishLetters: number;
}

const MARKER_RE = /<<<OMNI_CHAPTER_(?:START|END)\s+index="\d+">>>/g;

function cleanForValidation(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(MARKER_RE, '')
    .trim();
}

function nonEmptyLines(text: string): string[] {
  return cleanForValidation(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function countCjk(text: string): number {
  return (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
}

function countEnglishLetters(text: string): number {
  return (text.match(/[A-Za-z]/g) || []).length;
}

function normalizedComparable(text: string): string {
  return cleanForValidation(text)
    .replace(/\s+/g, '')
    .replace(/[\p{P}\p{S}]/gu, '');
}

export function validateTranslation(
  sourceText: string,
  translatedText: string
): TranslationValidationResult {
  const source = cleanForValidation(sourceText);
  const translated = cleanForValidation(translatedText);
  const sourceParagraphs = nonEmptyLines(sourceText).length;
  const translatedParagraphs = nonEmptyLines(translatedText).length;

  if (!translated) {
    return { valid: false, reason: 'Translation is empty.', sourceParagraphs, translatedParagraphs, chineseRatio: 1, englishLetters: 0 };
  }

  if (translated.length < Math.max(20, Math.floor(source.length * 0.18)) && source.length >= 100) {
    return { valid: false, reason: `Translation is suspiciously short (${translated.length}/${source.length} characters).`, sourceParagraphs, translatedParagraphs, chineseRatio: countCjk(translated) / Math.max(1, translated.length), englishLetters: countEnglishLetters(translated) };
  }

  if (translated.length > Math.max(500, source.length * 12)) {
    return { valid: false, reason: 'Translation is suspiciously large and may contain a repeated/API wrapper response.', sourceParagraphs, translatedParagraphs, chineseRatio: countCjk(translated) / Math.max(1, translated.length), englishLetters: countEnglishLetters(translated) };
  }

  if (normalizedComparable(source) === normalizedComparable(translated)) {
    return { valid: false, reason: 'Translation is essentially identical to the source.', sourceParagraphs, translatedParagraphs, chineseRatio: countCjk(translated) / Math.max(1, translated.length), englishLetters: countEnglishLetters(translated) };
  }

  const chineseCount = countCjk(translated);
  const chineseRatio = chineseCount / Math.max(1, translated.length);
  const englishLetters = countEnglishLetters(translated);

  // Long chunks should clearly be English prose, not mostly untranslated Chinese.
  const chineseLimit = source.length >= 500 ? 0.28 : source.length >= 150 ? 0.40 : 0.60;
  if (chineseRatio > chineseLimit) {
    return { valid: false, reason: `Translation contains too much Chinese (${Math.round(chineseRatio * 100)}%).`, sourceParagraphs, translatedParagraphs, chineseRatio, englishLetters };
  }

  if (source.length >= 150 && englishLetters < 20) {
    return { valid: false, reason: 'Translation does not contain enough English prose.', sourceParagraphs, translatedParagraphs, chineseRatio, englishLetters };
  }

  const suspiciousWrapper = /^(?:sure[,! ]*|here(?:'s| is)[^\n]*:|translation\s*:\s*|i(?:'m| am) sorry[^\n]*|i cannot translate|i can(?:not|'t) help)/i;
  if (suspiciousWrapper.test(translated)) {
    return { valid: false, reason: 'Translation appears to contain an API/refusal/wrapper response.', sourceParagraphs, translatedParagraphs, chineseRatio, englishLetters };
  }

  // The translator is instructed to preserve paragraph breaks. Allow a small
  // tolerance for models that insert/remove one line break, but reject major loss.
  if (sourceParagraphs >= 2 && translatedParagraphs !== sourceParagraphs) {
    return { valid: false, reason: `Paragraph count changed (${translatedParagraphs}/${sourceParagraphs}); the translation may have omitted or merged content.`, sourceParagraphs, translatedParagraphs, chineseRatio, englishLetters };
  }

  return { valid: true, sourceParagraphs, translatedParagraphs, chineseRatio, englishLetters };
}

export function hasExpectedChapterMarkers(text: string, expectedIndices: number[]): boolean {
  if (expectedIndices.length <= 1) return true;
  const markers = [...text.matchAll(/<<<OMNI_CHAPTER_(START|END)\s+index="(\d+)">>>/g)]
    .map((m) => `${m[1]}:${m[2]}`);
  const expected = expectedIndices.flatMap((index) => [`START:${index}`, `END:${index}`]);
  if (markers.length !== expected.length) return false;
  return markers.every((marker, i) => marker === expected[i]);
}
