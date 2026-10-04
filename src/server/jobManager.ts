import { chunkChapter, detectChapters } from './textSplitter.js';
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

    // 2. Split each chapter into chunks
    const allChunks: Chunk[] = [];
    const chapterInfos: Job['chapters'] = [];

    let totalChunkCount = 0;
    for (const ch of parsedChapters) {
      const chunks = chunkChapter(ch.index, ch.text);
      chapterInfos.push({
        index: ch.index,
        title: ch.title,
        chunkCount: chunks.length,
      });

      for (const c of chunks) {
        const chunkId = `c_${ch.index}_${c.chunkIndex}`;
        allChunks.push({
          id: chunkId,
          jobId,
          chapterIndex: ch.index,
          chunkIndex: c.chunkIndex,
          originalText: c.text,
          translatedText: '',
          status: 'pending',
          claimedBy: null,
          leaseExpiresAt: null,
          retries: 0,
          updatedAt: now,
        });
        totalChunkCount++;
      }
    }

    const job: Job = {
      id: jobId,
      filename,
      totalChapters: parsedChapters.length,
      totalChunks: totalChunkCount,
      completedChunks: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      chapters: chapterInfos,
    };

    // Save job and chunks in persistent storage
    await Store.saveJob(job);
    await Store.saveChunks(jobId, allChunks);

    console.log(
      `[Omni JobManager] Created job ${jobId} for "${filename}": ${parsedChapters.length} chapters, ${totalChunkCount} chunks`
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
          `📖 <b>Translation Started</b>\n<b>Novel:</b> ${job.filename}\n<b>Chapters:</b> ${job.totalChapters}\n<b>Chunks:</b> ${job.totalChunks}`
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
          `⏸️ <b>Translation Paused</b>\n<b>Novel:</b> ${job.filename}\n<b>Progress:</b> ${job.completedChunks}/${job.totalChunks}`
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
          `▶️ <b>Translation Resumed</b>\n<b>Novel:</b> ${job.filename}\n<b>Progress:</b> ${job.completedChunks}/${job.totalChunks}`
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
