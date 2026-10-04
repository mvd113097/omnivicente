import crypto from 'node:crypto';
import { TranslationChunk, ParentChapter } from '../types.js';

export function countWords(text: string): number {
  if (!text) return 0;
  // For CJK characters, count each character
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  // For alphabetic words, count whitespace-separated words
  const nonCjk = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const words = (nonCjk.trim().match(/\b\w+\b/g) || []).length;
  return cjkChars + words;
}

export function computeContentHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

export interface SplitResult {
  title: string;
  chapters: ParentChapter[];
  chunks: TranslationChunk[];
  totalOriginalWords: number;
}

/**
 * Splits raw novel text into immutable parent chapters and internal subchunks of ~2500 chars.
 * HARD CHAPTER BOUNDARIES: Subchunks NEVER cross between chapter N and chapter N+1.
 */
export function splitNovelIntoChaptersAndChunks(
  rawText: string,
  defaultTitle: string = 'Untitled Novel',
  targetChunkChars: number = 2500
): SplitResult {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) {
    return {
      title: defaultTitle,
      chapters: [],
      chunks: [],
      totalOriginalWords: 0,
    };
  }

  const isChapterHeading = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) return false;
    // Chapter titles do not end in sentence punctuation
    if (/[。！？\.\?\!]$/.test(trimmed)) return false;
    return /^(?:第\s*[0-9一二三四五六七八九十百千万零]+\s*[章回节集卷話幕]|Chapter\s+[0-9IVXLCDMivxlcdm]+|Ch\.\s*[0-9]+|Cap[ií]tulo\s+[0-9]+|제\s*[0-9]+\s*[장화]|Prologue|Epilogue|Preface|Interlude\b)/i.test(trimmed);
  };

  const lines = text.split('\n');
  const detectedSections: Array<{ title: string; text: string }> = [];
  let curLines: string[] = [];
  let curTitle = '';

  for (const line of lines) {
    if (isChapterHeading(line)) {
      if (curLines.length > 0) {
        detectedSections.push({ title: curTitle, text: curLines.join('\n').trim() });
      }
      curTitle = line.trim();
      curLines = [line];
    } else {
      curLines.push(line);
    }
  }

  if (curLines.length > 0) {
    detectedSections.push({ title: curTitle, text: curLines.join('\n').trim() });
  }

  const parsedParentChapters: Array<{
    index: number;
    title: string;
    text: string;
  }> = [];

  if (detectedSections.length >= 2 || (detectedSections.length === 1 && detectedSections[0].title)) {
    let idx = 1;
    for (const sec of detectedSections) {
      let chapterTitle = sec.title;
      let body = sec.text;

      // Extract numeric chapter number if present (e.g. 第53章 -> 53)
      const numMatch = chapterTitle.match(/(?:第\s*|Chapter\s+|Ch\.\s*|Cap[ií]tulo\s+)(\d+)/i);
      const chapterNumber = numMatch ? parseInt(numMatch[1], 10) : idx;

      if (!chapterTitle) {
        chapterTitle = `Chapter ${chapterNumber}`;
      }

      parsedParentChapters.push({
        index: chapterNumber,
        title: chapterTitle.slice(0, 100).trim(),
        text: body,
      });

      idx = chapterNumber >= idx ? chapterNumber + 1 : idx + 1;
    }
  }

  // If chapter regex didn't split into multiple chapters, chunk based on natural headings or paragraphs
  if (parsedParentChapters.length === 0) {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let currentParagraphs: string[] = [];
    let currentChars = 0;
    let idx = 1;

    for (const para of paragraphs) {
      if (currentChars + para.length > 5000 && currentParagraphs.length > 0) {
        const full = currentParagraphs.join('\n\n');
        parsedParentChapters.push({
          index: idx,
          title: `Chapter ${idx}`,
          text: full,
        });
        idx++;
        currentParagraphs = [para];
        currentChars = para.length;
      } else {
        currentParagraphs.push(para);
        currentChars += para.length;
      }
    }

    if (currentParagraphs.length > 0) {
      const full = currentParagraphs.join('\n\n');
      parsedParentChapters.push({
        index: idx,
        title: `Chapter ${idx}`,
        text: full,
      });
    }
  }

  const chapters: ParentChapter[] = [];
  const chunks: TranslationChunk[] = [];
  let totalOriginalWords = 0;

  // Now create subchunks for each parent chapter strictly respecting HARD chapter boundaries
  for (const parent of parsedParentChapters) {
    const parentId = `ch_${parent.index}`;
    const chapterWords = countWords(parent.text);
    totalOriginalWords += chapterWords;

    // Subchunking within this parent chapter ONLY
    const chapterSubchunks = createSubchunksForChapter(
      parent.text,
      parentId,
      parent.index,
      parent.title,
      targetChunkChars
    );

    const subChunkIds = chapterSubchunks.map(c => c.id);

    chapters.push({
      id: parentId,
      jobId: '', // Set by caller
      index: parent.index,
      title: parent.title,
      originalText: parent.text,
      originalWordCount: chapterWords,
      subChunkCount: chapterSubchunks.length,
      subChunkIds,
      status: 'pending',
      translatedWordCount: 0,
    });

    chunks.push(...chapterSubchunks);
  }

  return {
    title: defaultTitle,
    chapters,
    chunks,
    totalOriginalWords,
  };
}

/**
 * Creates internal subchunks (~2500 characters each) for a SINGLE chapter.
 * Guarantees zero text crosses parent chapter boundaries.
 */
function createSubchunksForChapter(
  chapterText: string,
  parentChapterId: string,
  parentChapterIndex: number,
  parentChapterTitle: string,
  targetChars: number = 2500
): TranslationChunk[] {
  // If the chapter is already small enough, keep as 1 subchunk
  if (chapterText.length <= targetChars * 1.3) {
    return [
      {
        id: `${parentChapterId}_sub_0`,
        jobId: '',
        parentChapterId,
        parentChapterIndex,
        parentChapterTitle,
        subChunkIndex: 0,
        sourceText: chapterText,
        sourceCharStart: 0,
        sourceCharEnd: chapterText.length,
        status: 'pending',
        englishText: '',
        translatedWordCount: 0,
        translatorUsed: 'gemini',
        updatedAt: Date.now(),
      },
    ];
  }

  // Split into paragraphs to never break a dialogue or sentence abruptly
  const paragraphs = chapterText.split('\n');
  const result: TranslationChunk[] = [];
  let currentParagraphs: string[] = [];
  let currentLen = 0;
  let charCursor = 0;
  let subIndex = 0;

  for (const para of paragraphs) {
    const paraLen = para.length + 1; // +1 for newline

    // If an individual single paragraph is monstrously large (> targetChars)
    if (paraLen > targetChars * 1.5) {
      if (currentParagraphs.length > 0) {
        const text = currentParagraphs.join('\n');
        result.push({
          id: `${parentChapterId}_sub_${subIndex++}`,
          jobId: '',
          parentChapterId,
          parentChapterIndex,
          parentChapterTitle,
          subChunkIndex: subIndex - 1,
          sourceText: text,
          sourceCharStart: charCursor,
          sourceCharEnd: charCursor + text.length,
          status: 'pending',
          englishText: '',
          translatedWordCount: 0,
          translatorUsed: 'gemini',
          updatedAt: Date.now(),
        });
        charCursor += text.length + 1;
        currentParagraphs = [];
        currentLen = 0;
      }

      // Split the single huge paragraph by sentences (。！？)
      const sentences = para.split(/(?<=[。！？\.\?\!])/);
      let sentBuffer: string[] = [];
      let sentLen = 0;

      for (const sent of sentences) {
        if (sentLen + sent.length > targetChars && sentBuffer.length > 0) {
          const sentText = sentBuffer.join('');
          result.push({
            id: `${parentChapterId}_sub_${subIndex++}`,
            jobId: '',
            parentChapterId,
            parentChapterIndex,
            parentChapterTitle,
            subChunkIndex: subIndex - 1,
            sourceText: sentText,
            sourceCharStart: charCursor,
            sourceCharEnd: charCursor + sentText.length,
            status: 'pending',
            englishText: '',
            translatedWordCount: 0,
            translatorUsed: 'gemini',
            updatedAt: Date.now(),
          });
          charCursor += sentText.length;
          sentBuffer = [sent];
          sentLen = sent.length;
        } else {
          sentBuffer.push(sent);
          sentLen += sent.length;
        }
      }

      if (sentBuffer.length > 0) {
        const sentText = sentBuffer.join('');
        result.push({
          id: `${parentChapterId}_sub_${subIndex++}`,
          jobId: '',
          parentChapterId,
          parentChapterIndex,
          parentChapterTitle,
          subChunkIndex: subIndex - 1,
          sourceText: sentText,
          sourceCharStart: charCursor,
          sourceCharEnd: charCursor + sentText.length,
          status: 'pending',
          englishText: '',
          translatedWordCount: 0,
          translatorUsed: 'gemini',
          updatedAt: Date.now(),
        });
        charCursor += sentText.length + 1;
      }
      continue;
    }

    if (currentLen + paraLen > targetChars && currentParagraphs.length > 0) {
      const text = currentParagraphs.join('\n');
      result.push({
        id: `${parentChapterId}_sub_${subIndex++}`,
        jobId: '',
        parentChapterId,
        parentChapterIndex,
        parentChapterTitle,
        subChunkIndex: subIndex - 1,
        sourceText: text,
        sourceCharStart: charCursor,
        sourceCharEnd: charCursor + text.length,
        status: 'pending',
        englishText: '',
        translatedWordCount: 0,
        translatorUsed: 'gemini',
        updatedAt: Date.now(),
      });
      charCursor += text.length + 1;
      currentParagraphs = [para];
      currentLen = paraLen;
    } else {
      currentParagraphs.push(para);
      currentLen += paraLen;
    }
  }

  if (currentParagraphs.length > 0) {
    const text = currentParagraphs.join('\n');
    result.push({
      id: `${parentChapterId}_sub_${subIndex++}`,
      jobId: '',
      parentChapterId,
      parentChapterIndex,
      parentChapterTitle,
      subChunkIndex: subIndex - 1,
      sourceText: text,
      sourceCharStart: charCursor,
      sourceCharEnd: charCursor + text.length,
      status: 'pending',
      englishText: '',
      translatedWordCount: 0,
      translatorUsed: 'gemini',
      updatedAt: Date.now(),
    });
  }

  return result;
}
