import { createOptimizedBatches, detectChapters, MAX_BATCH_CHAR_BUDGET } from './textSplitter.js';
import { Store } from './store.js';
import { TranslationScheduler } from './scheduler.js';
import { sendTelegramNotification } from './telegram.js';
import { Chunk, Job } from './types.js';

export class JobManager {
  /**
   * Creates a new translation job from uploaded TXT content.
   * Handles large files (1,000,000+ Chinese characters) efficiently.
   */
  static async createJobFromText(filename: string, fullText: string): Promise<Job> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    // 1. Detect chapters server-side
    const parsedChapters = detectChapters(fullText);

    // 2. Create optimized translation batches around MAX_BATCH_CHAR_BUDGET (7000 chars)
    const batches = createOptimizedBatches(parsedChapters, MAX_BATCH_CHAR_BUDGET);

    const chapterInfos: Job['chapters'] = parsedChapters.map((ch) => {
      const containingBatches = batches.filter((b) => b.chapterIndices.includes(ch.index));
      return {
        index: ch.index,
        title: ch.title,
        chunkCount: Math.max(1, containingBatches.length),
      };
    });

    const allChunks: Chunk[] = batches.map((b) => ({
      id: b.id,
      jobId,
      chapterIndex: b.chapterIndices[0],
      chapterIndices: b.chapterIndices,
      chapterTitles: b.chapterTitles,
      chunkIndex: b.batchIndex,
      pieceIndex: b.pieceIndex,
      totalPieces: b.totalPieces,
      originalText: b.originalText,
      translatedText: '',
      status: 'pending',
      claimedBy: null,
      leaseExpiresAt: null,
      retries: 0,
      updatedAt: now,
    }));

    const job: Job = {
      id: jobId,
      filename,
      totalChapters: parsedChapters.length,
      totalChunks: allChunks.length,
      completedChunks: 0,
      translatedWords: 0,
      contiguousTranslatedWords: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      chapters: chapterInfos,
    };

    // Save job and chunks in persistent storage
    await Store.saveJob(job);
    await Store.saveChunks(jobId, allChunks);

    console.log(
      `[Omni JobManager] Created job ${jobId} for "${filename}": ${parsedChapters.length} chapters, ${allChunks.length} chunks`
    );

    return job;
  }

  static async startJob(jobId: string): Promise<boolean> {
    const scheduler = TranslationScheduler.getInstance();
    const success = await scheduler.startJob(jobId);
    if (success) {
      const job = await Store.getJob(jobId);
      if (job) {
        sendTelegramNotification(
          `📖 <b>Translation Started</b>\n<b>Novel:</b> ${job.filename}\n<b>Chapters:</b> ${job.totalChapters}\n<b>Chunks:</b> ${job.totalChunks}`,
          'start'
        );
      }
    }
    return success;
  }

  static async pauseJob(jobId: string): Promise<boolean> {
    const scheduler = TranslationScheduler.getInstance();
    const success = await scheduler.pauseJob(jobId);
    if (success) {
      const job = await Store.getJob(jobId);
      if (job) {
        sendTelegramNotification(
          `⏸️ <b>Translation Paused</b>\n<b>Novel:</b> ${job.filename}\n<b>Progress:</b> ${job.completedChunks}/${job.totalChunks} (${Math.floor((job.completedChunks / Math.max(1, job.totalChunks)) * 100)}%)\n<b>English Words:</b> ${(job.translatedWords || 0).toLocaleString()}`,
          'pause'
        );
      }
    }
    return success;
  }

  static async resumeJob(jobId: string): Promise<boolean> {
    const scheduler = TranslationScheduler.getInstance();
    const success = await scheduler.resumeJob(jobId);
    if (success) {
      const job = await Store.getJob(jobId);
      if (job) {
        sendTelegramNotification(
          `▶️ <b>Translation Resumed</b>\n<b>Novel:</b> ${job.filename}\n<b>Progress:</b> ${job.completedChunks}/${job.totalChunks} (${Math.floor((job.completedChunks / Math.max(1, job.totalChunks)) * 100)}%)\n<b>English Words:</b> ${(job.translatedWords || 0).toLocaleString()}`,
          'resume'
        );
      }
    }
    return success;
  }

  static async deleteJob(jobId: string): Promise<boolean> {
    const scheduler = TranslationScheduler.getInstance();
    return scheduler.cancelJob(jobId);
  }
}
