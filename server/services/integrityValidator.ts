import { ParentChapter, TranslationChunk } from '../types.js';

export interface IntegrityReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalExpectedChapters: number;
  totalValidatedChapters: number;
  contiguousCompletedCount: number;
}

/**
 * Deterministic Chapter Integrity Validator.
 * Makes ZERO Gemini / API calls.
 * Ensures strict sequential ordering, 1:1 parent-to-export mapping, complete subchunk coverage,
 * and zero cross-chapter boundary bleeding.
 */
export function validateChapterIntegrity(
  chapters: ParentChapter[],
  chunks: TranslationChunk[],
  options: { contiguousOnly?: boolean } = {}
): IntegrityReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!chapters || chapters.length === 0) {
    return {
      valid: false,
      errors: ['No chapters provided to validate'],
      warnings: [],
      totalExpectedChapters: 0,
      totalValidatedChapters: 0,
      contiguousCompletedCount: 0,
    };
  }

  // 1. Check chapter indexes are 1-based and strictly sequential
  const sortedChapters = [...chapters].sort((a, b) => a.index - b.index);
  const seenIndexes = new Set<number>();
  const seenChapterIds = new Set<string>();

  sortedChapters.forEach((ch, idx) => {
    const expectedIndex = idx + 1;
    if (ch.index !== expectedIndex) {
      errors.push(
        `Chapter sequence gap or mismatch: expected index ${expectedIndex}, but found ${ch.index} (id: ${ch.id})`
      );
    }
    if (seenIndexes.has(ch.index)) {
      errors.push(`Duplicate chapter index detected: ${ch.index}`);
    }
    seenIndexes.add(ch.index);

    if (seenChapterIds.has(ch.id)) {
      errors.push(`Duplicate parent chapter ID detected: ${ch.id}`);
    }
    seenChapterIds.add(ch.id);

    if (!ch.title || ch.title.trim().length === 0) {
      warnings.push(`Chapter ${ch.index} has empty title; fallback title will be used`);
    }
  });

  // Group chunks by parentChapterId
  const chunksByParent = new Map<string, TranslationChunk[]>();
  const seenChunkIds = new Set<string>();

  for (const chunk of chunks) {
    if (seenChunkIds.has(chunk.id)) {
      errors.push(`Duplicate subchunk ID detected: ${chunk.id}`);
    }
    seenChunkIds.add(chunk.id);

    if (!chunk.parentChapterId) {
      errors.push(`Subchunk ${chunk.id} is orphaned with no parentChapterId`);
      continue;
    }

    const list = chunksByParent.get(chunk.parentChapterId) || [];
    list.push(chunk);
    chunksByParent.set(chunk.parentChapterId, list);
  }

  // Calculate contiguous completed chapters
  let contiguousCompletedCount = 0;
  let gapFound = false;

  for (const ch of sortedChapters) {
    const chapterChunks = (chunksByParent.get(ch.id) || []).sort(
      (a, b) => a.subChunkIndex - b.subChunkIndex
    );

    // Verify subchunks belong strictly to this parent chapter
    for (const chunk of chapterChunks) {
      if (chunk.parentChapterIndex !== ch.index) {
        errors.push(
          `Subchunk ${chunk.id} index mismatch: chunk has parentChapterIndex ${chunk.parentChapterIndex} but assigned to Chapter ${ch.index}`
        );
      }
    }

    // Verify subchunk indexes are 0-based and strictly sequential (0, 1, 2... N-1)
    if (chapterChunks.length !== ch.subChunkCount) {
      errors.push(
        `Chapter ${ch.index} expected ${ch.subChunkCount} subchunks, but found ${chapterChunks.length} in record`
      );
    }

    chapterChunks.forEach((chunk, subIdx) => {
      if (chunk.subChunkIndex !== subIdx) {
        errors.push(
          `Chapter ${ch.index} subchunk sequence gap: expected subChunkIndex ${subIdx}, found ${chunk.subChunkIndex}`
        );
      }
    });

    // Check if this chapter is completely translated
    const isChapterCompleted =
      chapterChunks.length > 0 &&
      chapterChunks.every(
        c => c.status === 'completed' || c.status === 'fallback_google'
      );

    if (isChapterCompleted && !gapFound) {
      contiguousCompletedCount++;
    } else {
      gapFound = true;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalExpectedChapters: chapters.length,
    totalValidatedChapters: sortedChapters.length,
    contiguousCompletedCount,
  };
}
