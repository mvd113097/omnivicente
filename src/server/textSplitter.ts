export interface ParsedChapter {
  index: number;
  title: string;
  text: string;
}

export interface ParsedChunk {
  chapterIndex: number;
  chunkIndex: number;
  text: string;
}

export interface TranslationBatch {
  id: string;
  batchIndex: number;
  chapterIndices: number[];
  chapterTitles: string[];
  pieceIndex?: number;
  totalPieces?: number;
  originalText: string;
}

// Target 7000 Chinese characters per batch as requested
export const MAX_BATCH_CHAR_BUDGET = 7000;

// Comprehensive chapter pattern matching Chinese web novel conventions
const CHAPTER_REGEX = /(?:^|\r?\n)\s*(第\s*[0-9一二三四五六七八九十百千万]+\s*[章回节卷集篇部][^\r\n]*|Chapter\s+[0-9]+[^\r\n]*|序章[^\r\n]*|楔子[^\r\n]*|尾声[^\r\n]*|番外[^\r\n]*)/g;

/**
 * Parses raw text into chapters preserving 100% of the content.
 */
export function detectChapters(fullText: string): ParsedChapter[] {
  const normalizedText = fullText.replace(/\r\n/g, '\n');
  const chapters: ParsedChapter[] = [];

  const matches: { title: string; index: number; length: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = CHAPTER_REGEX.exec(normalizedText)) !== null) {
    const matchedTitle = match[1].trim();
    const titleOffset = match[0].indexOf(match[1]);
    const startIndex = match.index + titleOffset;
    matches.push({
      title: matchedTitle,
      index: startIndex,
      length: match[1].length,
    });
  }

  if (matches.length === 0) {
    // No chapter headers found; treat whole text as Chapter 1 or split into ~20k char chapters
    const chunkSize = 20000;
    if (normalizedText.length <= chunkSize) {
      return [{ index: 1, title: 'Chapter 1', text: normalizedText }];
    }
    let curIndex = 1;
    for (let i = 0; i < normalizedText.length; i += chunkSize) {
      chapters.push({
        index: curIndex,
        title: `Chapter ${curIndex}`,
        text: normalizedText.slice(i, i + chunkSize),
      });
      curIndex++;
    }
    return chapters;
  }

  // Check if there is text before the first detected chapter
  if (matches[0].index > 0) {
    const preText = normalizedText.slice(0, matches[0].index).trim();
    if (preText.length > 0) {
      chapters.push({
        index: 0,
        title: 'Prologue / Introduction',
        text: normalizedText.slice(0, matches[0].index),
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : normalizedText.length;
    const chapterContent = normalizedText.slice(current.index, nextStart);
    chapters.push({
      index: chapters.length + (chapters.length > 0 && chapters[0].index === 0 ? 0 : 1),
      title: current.title,
      text: chapterContent,
    });
  }

  // Renumber sequentially to ensure chapter indices are 1, 2, 3...
  return chapters.map((ch, idx) => ({
    ...ch,
    index: idx + 1,
  }));
}

/**
 * Splits a chapter that exceeds the batch budget into sequential pieces at paragraph/sentence boundaries.
 * Guarantees zero lost text and exact ordering.
 */
export function splitLargeChapter(
  chapterText: string,
  targetSize: number = 6000,
  maxSize: number = MAX_BATCH_CHAR_BUDGET
): string[] {
  if (chapterText.length <= maxSize) {
    return [chapterText];
  }

  const paragraphs = chapterText.split(/(?<=\n)/);
  const pieces: string[] = [];
  let currentBuffer = '';

  for (const para of paragraphs) {
    if (currentBuffer.length + para.length > targetSize && currentBuffer.length > 0) {
      pieces.push(currentBuffer);
      currentBuffer = '';
    }

    if (para.length > maxSize) {
      // Long paragraph without newlines: split by sentence delimiters
      const sentences = para.split(/(?<=[。！？!?…\n])/);
      for (const sent of sentences) {
        if (currentBuffer.length + sent.length > targetSize && currentBuffer.length > 0) {
          pieces.push(currentBuffer);
          currentBuffer = '';
        }
        if (sent.length > maxSize) {
          for (let i = 0; i < sent.length; i += targetSize) {
            pieces.push(sent.slice(i, i + targetSize));
          }
        } else {
          currentBuffer += sent;
        }
      }
    } else {
      currentBuffer += para;
    }
  }

  if (currentBuffer.length > 0) {
    pieces.push(currentBuffer);
  }

  return pieces;
}

/**
 * Creates optimized translation batches targeting MAX_BATCH_CHAR_BUDGET (7000 Chinese characters).
 * 
 * Rules:
 * 1. Keep chapter boundaries intact.
 * 2. Never split in the middle of a chapter unless the chapter exceeds MAX_BATCH_CHAR_BUDGET.
 * 3. Combine consecutive adjacent small chapters into a single batch up to 7000 chars.
 * 4. Never reorder, skip, or duplicate text.
 */
export function createOptimizedBatches(
  chapters: ParsedChapter[],
  maxBudget: number = MAX_BATCH_CHAR_BUDGET
): TranslationBatch[] {
  const batches: TranslationBatch[] = [];
  let currentBatchChapters: ParsedChapter[] = [];
  let currentBatchLength = 0;

  function flushBatch() {
    if (currentBatchChapters.length === 0) return;

    const originalText = currentBatchChapters.map((c) => c.text).join('\n\n');
    const chapterIndices = currentBatchChapters.map((c) => c.index);
    const chapterTitles = currentBatchChapters.map((c) => c.title);

    batches.push({
      id: `b_${batches.length}`,
      batchIndex: batches.length,
      chapterIndices,
      chapterTitles,
      originalText,
    });

    currentBatchChapters = [];
    currentBatchLength = 0;
  }

  for (const chapter of chapters) {
    const chLength = chapter.text.length;

    // Case 1: Chapter itself is larger than maxBudget (e.g. 12,000 chars)
    if (chLength > maxBudget) {
      // First flush any accumulated chapters
      flushBatch();

      // Split this large chapter into sequential pieces
      const pieces = splitLargeChapter(chapter.text, Math.round(maxBudget * 0.85), maxBudget);
      for (let pIdx = 0; pIdx < pieces.length; pIdx++) {
        batches.push({
          id: `b_${batches.length}`,
          batchIndex: batches.length,
          chapterIndices: [chapter.index],
          chapterTitles: [chapter.title],
          pieceIndex: pIdx,
          totalPieces: pieces.length,
          originalText: pieces[pIdx],
        });
      }
      continue;
    }

    // Case 2: Chapter fits in budget. Check if adding it exceeds maxBudget
    if (currentBatchLength + chLength > maxBudget && currentBatchChapters.length > 0) {
      flushBatch();
    }

    currentBatchChapters.push(chapter);
    currentBatchLength += chLength;
  }

  flushBatch();
  return batches;
}

/**
 * Splits translated batch text back to individual chapters when multiple chapters were batched together.
 * Preserves 100% of translated content with zero loss.
 */
export function splitTranslatedBatch(
  originalText: string,
  translatedText: string,
  chapterIndices: number[],
  chapterTitles: string[] = []
): Map<number, string> {
  const result = new Map<number, string>();

  if (chapterIndices.length === 0) return result;
  if (chapterIndices.length === 1) {
    result.set(chapterIndices[0], translatedText.trim());
    return result;
  }

  const cleanTranslated = translatedText.replace(/\r\n/g, '\n');
  const splitPoints: { chapterIndex: number; startIdx: number }[] = [];

  // Chapter 0 in batch starts at index 0
  splitPoints.push({ chapterIndex: chapterIndices[0], startIdx: 0 });

  let lastSearchPos = 0;
  for (let i = 1; i < chapterIndices.length; i++) {
    const chIdx = chapterIndices[i];
    const chTitle = chapterTitles[i] || '';

    const patterns = [
      new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?(?:Chapter\\s+0*${chIdx}\\b|第\\s*0*${chIdx}\\s*[章回节卷集篇部])`, 'i'),
      new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?(?:${escapeRegex(chTitle)})`, 'i'),
    ];

    let foundIdx = -1;
    for (const pattern of patterns) {
      const match = pattern.exec(cleanTranslated.slice(lastSearchPos));
      if (match) {
        foundIdx = lastSearchPos + match.index + (match[0].startsWith('\n') ? 1 : 0);
        break;
      }
    }

    if (foundIdx !== -1 && foundIdx > lastSearchPos) {
      splitPoints.push({ chapterIndex: chIdx, startIdx: foundIdx });
      lastSearchPos = foundIdx;
    }
  }

  // If all chapter headings were cleanly matched:
  if (splitPoints.length === chapterIndices.length) {
    for (let i = 0; i < splitPoints.length; i++) {
      const current = splitPoints[i];
      const nextStart = i + 1 < splitPoints.length ? splitPoints[i + 1].startIdx : cleanTranslated.length;
      const chContent = cleanTranslated.slice(current.startIdx, nextStart).trim();
      result.set(current.chapterIndex, chContent);
    }
    return result;
  }

  // Fallback: split by paragraphs proportionally to original text lengths
  const paragraphs = cleanTranslated.split(/\n\n+/);
  let paraIdx = 0;

  for (let i = 0; i < chapterIndices.length; i++) {
    const chIdx = chapterIndices[i];
    if (i === chapterIndices.length - 1) {
      const remaining = paragraphs.slice(paraIdx).join('\n\n').trim();
      result.set(chIdx, remaining);
    } else {
      const targetParaCount = Math.max(1, Math.round(paragraphs.length / chapterIndices.length));
      const chParas = paragraphs.slice(paraIdx, paraIdx + targetParaCount);
      paraIdx += chParas.length;
      result.set(chIdx, chParas.join('\n\n').trim());
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Legacy helper for backward compatibility
 */
export function chunkChapter(
  chapterIndex: number,
  chapterText: string,
  targetSize: number = 6000,
  maxSize: number = MAX_BATCH_CHAR_BUDGET
): ParsedChunk[] {
  const pieces = splitLargeChapter(chapterText, targetSize, maxSize);
  return pieces.map((p, idx) => ({
    chapterIndex,
    chunkIndex: idx,
    text: p,
  }));
}
