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
 * Atomic source unit used for quota-efficient batching.
 * MegaTXT-style scheduling keeps small recovery units while combining adjacent
 * units into larger Gemini requests. 2,500 is the source-unit target and
 * 7,000 is the maximum source-character budget of one Gemini batch.
 */
export const ATOMIC_CHUNK_CHAR_BUDGET = 2500;

/**
 * Splits text into deterministic atomic pieces at paragraph/sentence boundaries.
 * A piece never exceeds maxSize unless a single sentence is itself longer than
 * maxSize, in which case it is hard-split so the request budget remains bounded.
 */
export function splitLargeChapter(
  chapterText: string,
  targetSize: number = ATOMIC_CHUNK_CHAR_BUDGET,
  maxSize: number = ATOMIC_CHUNK_CHAR_BUDGET
): string[] {
  if (chapterText.length <= maxSize) return [chapterText];

  const paragraphs = chapterText.split(/(?<=\n)/);
  const pieces: string[] = [];
  let currentBuffer = '';

  const flush = () => {
    if (currentBuffer.length > 0) {
      pieces.push(currentBuffer);
      currentBuffer = '';
    }
  };

  for (const para of paragraphs) {
    if (currentBuffer.length + para.length > targetSize && currentBuffer.length > 0) {
      flush();
    }

    if (para.length > maxSize) {
      const sentences = para.split(/(?<=[。！？!?…\n])/);
      for (const sent of sentences) {
        if (!sent) continue;
        if (currentBuffer.length + sent.length > targetSize && currentBuffer.length > 0) {
          flush();
        }
        if (sent.length > maxSize) {
          for (let i = 0; i < sent.length; i += targetSize) {
            const slice = sent.slice(i, i + targetSize);
            if (slice.length === targetSize) pieces.push(slice);
            else currentBuffer += slice;
          }
        } else {
          currentBuffer += sent;
        }
      }
    } else {
      currentBuffer += para;
    }
  }

  flush();
  return pieces.length ? pieces : [chapterText];
}

interface AtomicPiece {
  chapterIndex: number;
  chapterTitle: string;
  pieceIndex: number;
  totalPieces: number;
  text: string;
}

function pieceStartMarker(piece: AtomicPiece): string {
  return `<<<OMNI_PIECE_START chapter="${piece.chapterIndex}" piece="${piece.pieceIndex}" total="${piece.totalPieces}">>>`;
}

function pieceEndMarker(piece: AtomicPiece): string {
  return `<<<OMNI_PIECE_END chapter="${piece.chapterIndex}" piece="${piece.pieceIndex}" total="${piece.totalPieces}">>>`;
}

function renderBatch(units: AtomicPiece[], batchHasMultipleChapters: boolean): string {
  const parts: string[] = [];
  let currentChapter: number | null = null;

  for (const unit of units) {
    if (batchHasMultipleChapters && unit.chapterIndex !== currentChapter) {
      if (currentChapter !== null) {
        parts.push(`<<<OMNI_CHAPTER_END index="${currentChapter}">>>`);
      }
      parts.push(`<<<OMNI_CHAPTER_START index="${unit.chapterIndex}">>>`);
      currentChapter = unit.chapterIndex;
    }

    parts.push(pieceStartMarker(unit));
    parts.push(unit.text);
    parts.push(pieceEndMarker(unit));
  }

  if (batchHasMultipleChapters && currentChapter !== null) {
    parts.push(`<<<OMNI_CHAPTER_END index="${currentChapter}">>>`);
  }

  return parts.join('\n');
}

/**
 * Creates quota-efficient translation batches:
 *   - 2,500 Chinese characters is the atomic recovery unit.
 *   - Adjacent atomic units are combined up to 7,000 source characters/request.
 *   - Explicit piece markers make every atomic unit auditable and lossless.
 *   - Chapter markers are preserved for multi-chapter batches.
 *   - Source order is never changed.
 */
export function createOptimizedBatches(
  chapters: ParsedChapter[],
  maxBudget: number = MAX_BATCH_CHAR_BUDGET
): TranslationBatch[] {
  const atomicPieces: AtomicPiece[] = [];

  for (const chapter of chapters) {
    const pieces = splitLargeChapter(
      chapter.text,
      Math.min(ATOMIC_CHUNK_CHAR_BUDGET, maxBudget),
      Math.min(ATOMIC_CHUNK_CHAR_BUDGET, maxBudget)
    );
    const totalPieces = pieces.length;
    pieces.forEach((text, pieceIndex) => {
      atomicPieces.push({
        chapterIndex: chapter.index,
        chapterTitle: chapter.title,
        pieceIndex,
        totalPieces,
        text,
      });
    });
  }

  const batches: TranslationBatch[] = [];
  let current: AtomicPiece[] = [];
  let currentLength = 0;

  const flush = () => {
    if (!current.length) return;

    const chapterIndices: number[] = [];
    const chapterTitles: string[] = [];
    for (const piece of current) {
      if (!chapterIndices.includes(piece.chapterIndex)) {
        chapterIndices.push(piece.chapterIndex);
        chapterTitles.push(piece.chapterTitle);
      }
    }

    batches.push({
      id: `b_${batches.length}`,
      batchIndex: batches.length,
      chapterIndices,
      chapterTitles,
      pieceIndex: current.length === 1 ? current[0].pieceIndex : undefined,
      totalPieces: current.length === 1 ? current[0].totalPieces : undefined,
      originalText: renderBatch(current, chapterIndices.length > 1),
    });

    current = [];
    currentLength = 0;
  };

  for (const piece of atomicPieces) {
    const pieceLength = piece.text.length;

    // A single pathological unit is never dropped. It is already hard-split by
    // splitLargeChapter, but retain this guard for future configuration changes.
    if (pieceLength > maxBudget) {
      flush();
      batches.push({
        id: `b_${batches.length}`,
        batchIndex: batches.length,
        chapterIndices: [piece.chapterIndex],
        chapterTitles: [piece.chapterTitle],
        pieceIndex: piece.pieceIndex,
        totalPieces: piece.totalPieces,
        originalText: renderBatch([piece], false),
      });
      continue;
    }

    if (current.length && currentLength + pieceLength > maxBudget) {
      flush();
    }

    current.push(piece);
    currentLength += pieceLength;
  }

  flush();
  return batches;
}

function stripPieceMarkers(text: string): string {
  return text.replace(/<<<OMNI_PIECE_(?:START|END)\s+chapter="\d+"\s+piece="\d+"\s+total="\d+">>>/g, '').trim();
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
    result.set(chapterIndices[0], stripPieceMarkers(translatedText));
    return result;
  }

  const cleanTranslated = translatedText.replace(/\r\n/g, '\n');

  // Preferred path: exact control markers emitted by the translator.
  const markerPattern = /<<<OMNI_CHAPTER_START\s+index=\"(\d+)\">>>([\s\S]*?)<<<OMNI_CHAPTER_END\s+index=\"(\d+)\">>>/g;
  const markerMatches = [...cleanTranslated.matchAll(markerPattern)];
  if (markerMatches.length === chapterIndices.length) {
    let valid = true;
    for (let i = 0; i < markerMatches.length; i++) {
      const startIndex = Number(markerMatches[i][1]);
      const endIndex = Number(markerMatches[i][3]);
      if (startIndex !== chapterIndices[i] || endIndex !== chapterIndices[i]) {
        valid = false;
        break;
      }
      result.set(chapterIndices[i], stripPieceMarkers(markerMatches[i][2]));
    }
    if (valid) return result;
    result.clear();
  }

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
      const chContent = stripPieceMarkers(cleanTranslated.slice(current.startIdx, nextStart));
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
      result.set(chIdx, stripPieceMarkers(remaining));
    } else {
      const targetParaCount = Math.max(1, Math.round(paragraphs.length / chapterIndices.length));
      const chParas = paragraphs.slice(paraIdx, paraIdx + targetParaCount);
      paraIdx += chParas.length;
      result.set(chIdx, stripPieceMarkers(chParas.join('\n\n')));
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
  targetSize: number = ATOMIC_CHUNK_CHAR_BUDGET,
  maxSize: number = ATOMIC_CHUNK_CHAR_BUDGET
): ParsedChunk[] {
  const pieces = splitLargeChapter(chapterText, targetSize, maxSize);
  return pieces.map((p, idx) => ({
    chapterIndex,
    chunkIndex: idx,
    text: p,
  }));
}
