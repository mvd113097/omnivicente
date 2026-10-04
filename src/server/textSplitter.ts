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
    // match.index is the position of match start
    // Find where the captured group starts inside the match
    const titleOffset = match[0].indexOf(match[1]);
    const startIndex = match.index + titleOffset;
    matches.push({
      title: matchedTitle,
      index: startIndex,
      length: match[1].length,
    });
  }

  if (matches.length === 0) {
    // No chapter headers found; treat whole text as Chapter 1 or split into ~15k char chapters
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
    // Extract text from the start of this chapter's title up to the start of the next chapter
    const chapterContent = normalizedText.slice(current.index, nextStart);
    chapters.push({
      index: chapters.length + (chapters.length > 0 && chapters[0].index === 0 ? 0 : 1),
      title: current.title,
      text: chapterContent,
    });
  }

  // Renumber sequentially to ensure chapter indices are 1, 2, 3... or 0, 1, 2...
  return chapters.map((ch, idx) => ({
    ...ch,
    index: idx + 1,
  }));
}

/**
 * Splits a chapter into translation chunks respecting paragraph and sentence boundaries.
 * Preserves 100% of characters (zero omission).
 * Target chunk size: ~800 - 1200 characters.
 */
export function chunkChapter(
  chapterIndex: number,
  chapterText: string,
  targetSize: number = 1000,
  maxSize: number = 1500
): ParsedChunk[] {
  if (!chapterText || chapterText.length === 0) {
    return [];
  }

  if (chapterText.length <= maxSize) {
    return [
      {
        chapterIndex,
        chunkIndex: 0,
        text: chapterText,
      },
    ];
  }

  // Split preserving delimiters using paragraph split
  const paragraphs = chapterText.split(/(?<=\n)/);
  const chunks: ParsedChunk[] = [];
  let currentBuffer = '';

  for (const para of paragraphs) {
    if (para.length > maxSize) {
      // Flush current buffer if any
      if (currentBuffer.length > 0) {
        chunks.push({
          chapterIndex,
          chunkIndex: chunks.length,
          text: currentBuffer,
        });
        currentBuffer = '';
      }

      // Large paragraph: split by sentence delimiters preserving punctuation
      const sentences = para.split(/(?<=[。！？!?…\n])/);
      for (const sent of sentences) {
        if (currentBuffer.length + sent.length > targetSize && currentBuffer.length > 0) {
          chunks.push({
            chapterIndex,
            chunkIndex: chunks.length,
            text: currentBuffer,
          });
          currentBuffer = '';
        }

        if (sent.length > maxSize) {
          // Hard split for giant unbroken lines if necessary
          for (let i = 0; i < sent.length; i += targetSize) {
            chunks.push({
              chapterIndex,
              chunkIndex: chunks.length,
              text: sent.slice(i, i + targetSize),
            });
          }
        } else {
          currentBuffer += sent;
        }
      }
    } else {
      if (currentBuffer.length + para.length > targetSize && currentBuffer.length > 0) {
        chunks.push({
          chapterIndex,
          chunkIndex: chunks.length,
          text: currentBuffer,
        });
        currentBuffer = '';
      }
      currentBuffer += para;
    }
  }

  if (currentBuffer.length > 0) {
    chunks.push({
      chapterIndex,
      chunkIndex: chunks.length,
      text: currentBuffer,
    });
  }

  return chunks;
}
