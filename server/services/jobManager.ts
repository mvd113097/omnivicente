import {
  ParentChapter,
  TranslationChunk,
  TranslationJob,
  JobStatusSummary,
  ChapterSummaryHeader,
  ChapterDetailHeader,
} from '../types.js';
import {
  splitNovelIntoChaptersAndChunks,
  computeContentHash,
  countWords,
} from './textSplitter.js';
import { validateChapterIntegrity } from './integrityValidator.js';
import { firestoreService } from './firestoreService.js';
import { TranslationScheduler } from './scheduler.js';
import { generateEpubBuffer, generateTxtBuffer } from './epubGenerator.js';
import { sendTelegramNotification } from './telegramService.js';

interface PreparedData {
  prepareId: string;
  title: string;
  contentHash: string;
  chapters: ParentChapter[];
  chunks: TranslationChunk[];
  totalOriginalWords: number;
  createdAt: number;
}

export class JobManager {
  private activeJobs: Map<string, TranslationJob> = new Map();
  private jobChapters: Map<string, ParentChapter[]> = new Map();
  private jobChunks: Map<string, TranslationChunk[]> = new Map();
  private jobSchedulers: Map<string, TranslationScheduler> = new Map();
  private preparedStore: Map<string, PreparedData> = new Map();
  private isHydrated: boolean = false;

  constructor() {
    this.initAsync();
  }

  private async initAsync() {
    try {
      await this.hydrateFromFirestore();
    } catch (err) {
      console.warn('Initial Firestore hydration failed (will retry on demand):', err);
    }
  }

  /**
   * Requirement 20: Startup / Cloud Run Recovery
   * Firestore is authoritative. Stale local data NEVER overwrites newer Firestore state.
   */
  public async hydrateFromFirestore(): Promise<void> {
    if (!firestoreService.isAvailable()) return;
    try {
      const persistedJobs = await firestoreService.getAllJobs();
      for (const pJob of persistedJobs) {
        // Hydrate job into active map
        this.activeJobs.set(pJob.id, pJob);

        // If job was marked running when Cloud Run restarted, set to paused until resumed
        if (pJob.status === 'running') {
          pJob.status = 'paused';
          await firestoreService.saveJob(pJob);
        }
      }
      this.isHydrated = true;
    } catch (err) {
      console.error('Error hydrating jobs from Firestore:', err);
    }
  }

  /**
   * Requirement 5 & 25: NEVER return rawChapters or full novel text back from parse-text!
   * Parses uploaded novel and stores server-side, returning lightweight summaries only.
   */
  public prepareNovel(
    rawText: string,
    title?: string,
    targetChunkChars: number = 2500
  ): {
    prepareId: string;
    title: string;
    totalChapters: number;
    totalOriginalWords: number;
    chapters: ChapterSummaryHeader[];
  } {
    const split = splitNovelIntoChaptersAndChunks(
      rawText,
      title || 'Uploaded Novel',
      targetChunkChars
    );

    const prepareId = 'prep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const contentHash = computeContentHash(rawText);

    this.preparedStore.set(prepareId, {
      prepareId,
      title: split.title,
      contentHash,
      chapters: split.chapters,
      chunks: split.chunks,
      totalOriginalWords: split.totalOriginalWords,
      createdAt: Date.now(),
    });

    // Clean old prepared entries (> 2 hours old)
    const twoHoursAgo = Date.now() - 7200000;
    for (const [key, val] of this.preparedStore.entries()) {
      if (val.createdAt < twoHoursAgo) {
        this.preparedStore.delete(key);
      }
    }

    // Return lightweight headers only (no raw text)
    const summaries: ChapterSummaryHeader[] = split.chapters.map(ch => ({
      index: ch.index,
      title: ch.title,
      wordCount: ch.originalWordCount,
      subChunkCount: ch.subChunkCount,
      preview: (ch.originalText || '').slice(0, 150).replace(/\n+/g, ' ') + '...',
    }));

    return {
      prepareId,
      title: split.title,
      totalChapters: split.chapters.length,
      totalOriginalWords: split.totalOriginalWords,
      chapters: summaries,
    };
  }

  /**
   * Requirement 21: Never Restart a Completed Novel.
   * Creates or attaches to durable Firestore job.
   */
  public async createJob(params: {
    prepareId?: string;
    title?: string;
    sourceLang?: string;
    targetLang?: string;
    model?: string;
    apiKeys?: string[];
    glossary?: Record<string, string>;
    targetChunkChars?: number;
    telegramConfig?: { botToken: string; chatId: string; enabled: boolean };
    autoStart?: boolean;
  }): Promise<TranslationJob> {
    let prepared: PreparedData | undefined;

    if (params.prepareId && this.preparedStore.has(params.prepareId)) {
      prepared = this.preparedStore.get(params.prepareId)!;
    }

    if (!prepared) {
      throw new Error('Prepared novel data not found or expired. Please upload text again.');
    }

    // 1. Check if a completed job for this exact novel already exists in Firestore!
    if (firestoreService.isAvailable() && prepared.contentHash) {
      const existing = await firestoreService.findJobByContentHash(prepared.contentHash);
      if (existing && existing.status === 'completed') {
        console.log(`Found existing completed novel for hash ${prepared.contentHash}. Attaching without restart.`);
        this.activeJobs.set(existing.id, existing);
        return existing;
      }
    }

    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // Link job ID to chapters and chunks
    const chapters = prepared.chapters.map(c => ({ ...c, jobId }));
    const chunks = prepared.chunks.map(c => ({ ...c, jobId }));

    // API Keys resolution
    const keys = (params.apiKeys || []).map(k => k.trim()).filter(Boolean);
    if (keys.length === 0 && process.env.GEMINI_API_KEY) {
      keys.push(process.env.GEMINI_API_KEY.trim());
    }

    const job: TranslationJob = {
      id: jobId,
      title: params.title || prepared.title || 'Untitled Novel',
      sourceLang: params.sourceLang || 'Chinese',
      targetLang: params.targetLang || 'English',
      model: params.model || 'gemini-3.8-flash',
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalChapters: chapters.length,
      completedChapters: 0,
      contiguousCompletedChapters: 0,
      totalChunks: chunks.length,
      completedChunks: 0,
      totalOriginalWords: prepared.totalOriginalWords,
      translatedWords: 0,
      activeKeyIndex: 0,
      apiKeys: keys,
      glossary: params.glossary || {},
      targetChunkChars: params.targetChunkChars || 2500,
      contentHash: prepared.contentHash,
      telegramConfig: params.telegramConfig,
    };

    // Store in active memory maps
    this.activeJobs.set(jobId, job);
    this.jobChapters.set(jobId, chapters);
    this.jobChunks.set(jobId, chunks);

    // Save durably to Firestore
    if (firestoreService.isAvailable()) {
      await firestoreService.saveJob(job);
      await firestoreService.saveChaptersBatch(jobId, chapters);
      await firestoreService.saveChunksBatch(jobId, chunks);
    }

    if (params.autoStart !== false) {
      await this.startJob(jobId);
    }

    return job;
  }

  public async getJob(jobId: string): Promise<TranslationJob | null> {
    if (this.activeJobs.has(jobId)) {
      return this.activeJobs.get(jobId)!;
    }
    if (firestoreService.isAvailable()) {
      const job = await firestoreService.getJob(jobId);
      if (job) {
        this.activeJobs.set(jobId, job);
        return job;
      }
    }
    return null;
  }

  public async getAllJobs(): Promise<TranslationJob[]> {
    if (firestoreService.isAvailable()) {
      const jobs = await firestoreService.getAllJobs();
      for (const j of jobs) {
        // Keep active in-memory keys
        const local = this.activeJobs.get(j.id);
        if (local && local.apiKeys.length > 0) {
          j.apiKeys = local.apiKeys;
        }
        this.activeJobs.set(j.id, j);
      }
      return jobs;
    }
    return Array.from(this.activeJobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Requirement 4 & 26: Data-Saving Status Check
   * Returns metadata only (~250-400 bytes). Zero chapter text!
   */
  public getJobStatusSummary(jobId: string): JobStatusSummary | null {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    const chunks = this.jobChunks.get(jobId) || [];
    const sensitiveChaptersCount = chunks.filter(c => c.status === 'fallback_google').length;

    const currentChunk = chunks.find(c => c.status === 'translating');

    return {
      id: job.id,
      title: job.title,
      status: job.status,
      sourceLang: job.sourceLang,
      targetLang: job.targetLang,
      totalChapters: job.totalChapters,
      completedChapters: job.completedChapters,
      contiguousCompletedChapters: job.contiguousCompletedChapters,
      totalChunks: job.totalChunks,
      completedChunks: job.completedChunks,
      totalOriginalWords: job.totalOriginalWords,
      translatedWords: job.translatedWords,
      activeKeyIndex: job.activeKeyIndex,
      totalKeys: job.apiKeys.length,
      currentChapterTitle: currentChunk?.parentChapterTitle,
      currentChapterIndex: currentChunk?.parentChapterIndex,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      lastError: job.lastError,
      readyForEpub: job.contiguousCompletedChapters > 0 || job.completedChapters > 0,
      sensitiveChaptersCount,
    };
  }

  /**
   * Returns chapter list metadata without full text.
   */
  public async getChapterHeaders(jobId: string): Promise<ChapterDetailHeader[]> {
    let chapters = this.jobChapters.get(jobId);
    if (!chapters && firestoreService.isAvailable()) {
      chapters = await firestoreService.getChapters(jobId);
      this.jobChapters.set(jobId, chapters);
    }
    if (!chapters) return [];

    let chunks = this.jobChunks.get(jobId);
    if (!chunks && firestoreService.isAvailable()) {
      chunks = await firestoreService.getAllChunks(jobId);
      this.jobChunks.set(jobId, chunks);
    }
    chunks = chunks || [];

    const chunksByParent = new Map<string, TranslationChunk[]>();
    for (const c of chunks) {
      const list = chunksByParent.get(c.parentChapterId) || [];
      list.push(c);
      chunksByParent.set(c.parentChapterId, list);
    }

    return chapters.map(ch => {
      const chChunks = chunksByParent.get(ch.id) || [];
      const completedSub = chChunks.filter(
        c => c.status === 'completed' || c.status === 'fallback_google'
      ).length;

      const hasFallback = chChunks.some(c => c.status === 'fallback_google');

      return {
        index: ch.index,
        title: ch.title,
        status: ch.status,
        subChunkCount: ch.subChunkCount,
        completedSubChunks: completedSub,
        originalWordCount: ch.originalWordCount,
        translatedWordCount: ch.translatedWordCount,
        translatorUsed: hasFallback ? 'google_translate' : ch.translatorUsed,
        fallbackReason: ch.fallbackReason,
        error: ch.error,
      };
    });
  }

  /**
   * Requirement 6 & 24: Lazy Loading Reader Chapter
   * Returns merged translated text for ONE chapter only.
   */
  public async getMergedChapter(
    jobId: string,
    chapterIndex: number
  ): Promise<{
    index: number;
    title: string;
    originalText: string;
    translatedText: string;
    status: string;
    translatorUsed: string;
    originalWordCount: number;
    translatedWordCount: number;
  } | null> {
    await this.ensureJobLoaded(jobId);

    const chapters = this.jobChapters.get(jobId) || [];
    const chapter = chapters.find(c => c.index === chapterIndex);
    if (!chapter) return null;

    const chunks = this.jobChunks.get(jobId) || [];
    const chapterChunks = chunks
      .filter(c => c.parentChapterId === chapter.id)
      .sort((a, b) => a.subChunkIndex - b.subChunkIndex);

    const mergedTranslatedText = chapterChunks
      .map(c => c.englishText || c.sourceText)
      .join('\n\n');

    const hasFallback = chapterChunks.some(c => c.status === 'fallback_google');

    return {
      index: chapter.index,
      title: chapter.title,
      originalText: chapter.originalText || '',
      translatedText: mergedTranslatedText,
      status: chapter.status,
      translatorUsed: hasFallback ? 'google_translate' : chapter.translatorUsed || 'gemini',
      originalWordCount: chapter.originalWordCount,
      translatedWordCount: chapter.translatedWordCount,
    };
  }

  /**
   * Requirement 13 & 22: Starts or resumes background translation.
   */
  public async startJob(jobId: string): Promise<boolean> {
    await this.ensureJobLoaded(jobId);

    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    // Requirement 21: Resume on a completed job is rejected/no-op
    if (job.status === 'completed') {
      return true;
    }

    job.status = 'running';
    job.updatedAt = Date.now();
    if (firestoreService.isAvailable()) {
      await firestoreService.saveJob(job);
    }

    const chunks = this.jobChunks.get(jobId) || [];

    // Send Telegram alert if configured
    if (job.telegramConfig?.enabled && job.telegramConfig.botToken) {
      sendTelegramNotification(
        job.telegramConfig.botToken,
        job.telegramConfig.chatId,
        `🚀 <b>MegaTXT Translator Started</b>\nNovel: <i>${job.title}</i>\nTotal Chapters: ${job.totalChapters}\nKeys: ${job.apiKeys.length}`
      ).catch(() => {});
    }

    // Initialize scheduler with 5-key worker pool
    const scheduler = new TranslationScheduler(
      jobId,
      job.apiKeys,
      chunks,
      {
        model: job.model,
        sourceLang: job.sourceLang,
        targetLang: job.targetLang,
        glossary: job.glossary,
      },
      {
        onChunkCompleted: async (chunk, englishText, translatorUsed, fallbackReason) => {
          // Requirement 19: Durable persistence must succeed before marking completed!
          if (firestoreService.isAvailable()) {
            await firestoreService.saveChunk(jobId, {
              ...chunk,
              englishText,
              translatedWordCount: countWords(englishText),
              status: translatorUsed === 'google_translate' ? 'fallback_google' : 'completed',
              translatorUsed,
              fallbackReason,
              completedAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
        },
        onProgressUpdate: async () => {
          await this.recalculateJobProgress(jobId);
        },
        onAllCompleted: async () => {
          await this.handleAllCompleted(jobId);
        },
        onError: async (errMsg: string) => {
          job.lastError = errMsg;
          if (firestoreService.isAvailable()) {
            await firestoreService.saveJob(job);
          }
        },
      }
    );

    this.jobSchedulers.set(jobId, scheduler);
    scheduler.start();
    return true;
  }

  public async pauseJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    job.status = 'paused';
    job.updatedAt = Date.now();

    const scheduler = this.jobSchedulers.get(jobId);
    if (scheduler) {
      scheduler.pause();
    }

    if (firestoreService.isAvailable()) {
      await firestoreService.saveJob(job);
    }
    return true;
  }

  public async deleteJob(jobId: string): Promise<boolean> {
    this.pauseJob(jobId);
    this.activeJobs.delete(jobId);
    this.jobChapters.delete(jobId);
    this.jobChunks.delete(jobId);
    this.jobSchedulers.delete(jobId);

    if (firestoreService.isAvailable()) {
      await firestoreService.deleteJob(jobId);
    }
    return true;
  }

  public async updateJobKeys(jobId: string, keys: string[]): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    job.apiKeys = keys.map(k => k.trim()).filter(Boolean);
    if (job.apiKeys.length === 0 && process.env.GEMINI_API_KEY) {
      job.apiKeys.push(process.env.GEMINI_API_KEY.trim());
    }

    const scheduler = this.jobSchedulers.get(jobId);
    if (scheduler) {
      scheduler.setKeys(job.apiKeys);
    }

    job.updatedAt = Date.now();
    if (firestoreService.isAvailable()) {
      await firestoreService.saveJob(job);
    }
    return true;
  }

  /**
   * Recalculates progress from authoritative persisted chunk records.
   */
  private async recalculateJobProgress(jobId: string) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const chapters = this.jobChapters.get(jobId) || [];
    const chunks = this.jobChunks.get(jobId) || [];

    // Group chunks by parentChapterId
    const chunksByParent = new Map<string, TranslationChunk[]>();
    for (const c of chunks) {
      const list = chunksByParent.get(c.parentChapterId) || [];
      list.push(c);
      chunksByParent.set(c.parentChapterId, list);
    }

    let completedChunks = 0;
    let translatedWords = 0;
    let completedChapters = 0;
    let contiguousCompletedChapters = 0;
    let gapFound = false;

    for (const ch of chapters) {
      const chChunks = chunksByParent.get(ch.id) || [];
      const chCompleted = chChunks.filter(
        c => c.status === 'completed' || c.status === 'fallback_google'
      );

      completedChunks += chCompleted.length;
      for (const cc of chCompleted) {
        translatedWords += cc.translatedWordCount || 0;
      }

      if (chCompleted.length === ch.subChunkCount && ch.subChunkCount > 0) {
        ch.status = 'completed';
        completedChapters++;
        if (!gapFound) {
          contiguousCompletedChapters++;
        }
      } else {
        gapFound = true;
      }
    }

    job.completedChunks = completedChunks;
    job.translatedWords = translatedWords;
    job.completedChapters = completedChapters;
    job.contiguousCompletedChapters = contiguousCompletedChapters;
    job.updatedAt = Date.now();

    const scheduler = this.jobSchedulers.get(jobId);
    if (scheduler) {
      job.activeKeyIndex = scheduler.getActiveKeyIndex();
    }

    if (firestoreService.isAvailable()) {
      await firestoreService.saveJob(job);
    }
  }

  /**
   * Requirement 18 & 31: All chunks complete.
   * Runs integrity validator before declaring completion!
   */
  private async handleAllCompleted(jobId: string) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const chapters = this.jobChapters.get(jobId) || [];
    const chunks = this.jobChunks.get(jobId) || [];

    // Deterministic validation
    const report = validateChapterIntegrity(chapters, chunks);
    if (!report.valid) {
      job.status = 'error';
      job.lastError = `Chapter integrity validation failed: ${report.errors.join('; ')}`;
      if (firestoreService.isAvailable()) {
        await firestoreService.saveJob(job);
      }
      return;
    }

    // Requirement 8: Only actual completed chunks can prove completion
    if (job.completedChunks !== job.totalChunks || job.totalChunks === 0) {
      console.warn(`Cannot mark job completed: ${job.completedChunks}/${job.totalChunks} chunks`);
      return;
    }

    job.status = 'completed';
    job.completedChapters = job.totalChapters;
    job.contiguousCompletedChapters = job.totalChapters;
    job.updatedAt = Date.now();

    if (firestoreService.isAvailable()) {
      await firestoreService.saveJob(job);
    }

    // Telegram completion notification
    if (job.telegramConfig?.enabled && job.telegramConfig.botToken) {
      sendTelegramNotification(
        job.telegramConfig.botToken,
        job.telegramConfig.chatId,
        `🎉 <b>Novel Translation Finished!</b>\nNovel: <i>${job.title}</i>\nChapters: ${job.totalChapters}/${job.totalChapters}\nWords: ${job.translatedWords.toLocaleString()} English words.\nAll chapters verified intact and ready to download!`
      ).catch(() => {});
    }
  }

  /**
   * Requirement 18, 23: Generates EPUB with Never-Skip Contiguous Guarantee.
   */
  public async generateEpub(jobId: string, partial: boolean = true): Promise<Buffer | null> {
    await this.ensureJobLoaded(jobId);

    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    const chapters = this.jobChapters.get(jobId) || [];
    const chunks = this.jobChunks.get(jobId) || [];

    // Run deterministic integrity check
    const report = validateChapterIntegrity(chapters, chunks, { contiguousOnly: partial });
    if (!report.valid && !partial) {
      throw new Error(`Integrity check failed: ${report.errors.join(', ')}`);
    }

    return await generateEpubBuffer(job, chapters, chunks, { partial });
  }

  public async generateTxt(jobId: string, partial: boolean = true): Promise<string | null> {
    await this.ensureJobLoaded(jobId);

    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    const chapters = this.jobChapters.get(jobId) || [];
    const chunks = this.jobChunks.get(jobId) || [];

    return generateTxtBuffer(job, chapters, chunks, { partial });
  }

  private async ensureJobLoaded(jobId: string): Promise<void> {
    if (!this.activeJobs.has(jobId)) {
      if (firestoreService.isAvailable()) {
        const job = await firestoreService.getJob(jobId);
        if (job) this.activeJobs.set(jobId, job);
      }
    }
    if (!this.jobChapters.has(jobId)) {
      if (firestoreService.isAvailable()) {
        const chapters = await firestoreService.getChapters(jobId);
        this.jobChapters.set(jobId, chapters);
      }
    }
    if (!this.jobChunks.has(jobId)) {
      if (firestoreService.isAvailable()) {
        const chunks = await firestoreService.getAllChunks(jobId);
        this.jobChunks.set(jobId, chunks);
      }
    }
  }
}

export const jobManager = new JobManager();
