import fs from 'fs';
import path from 'path';
import { Chunk, Job, JobStatus, JobStatusResponse, TelegramSettings } from './types.js';
import { splitTranslatedBatch } from './textSplitter.js';
import { hasExpectedChapterMarkers, validateTranslation } from './translationValidator.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const KEYS_FILE = path.join(CONFIG_DIR, 'keys.json');
const TELEGRAM_FILE = path.join(CONFIG_DIR, 'telegram.json');

// Ensure base directories exist
function ensureDirs() {
  for (const dir of [DATA_DIR, JOBS_DIR, CHUNKS_DIR, CONFIG_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

ensureDirs();

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2)}`;
  const json = JSON.stringify(data);
  await fs.promises.writeFile(tempPath, json, 'utf-8');
  await fs.promises.rename(tempPath, filePath);
}

function atomicWriteJsonSync(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function countEnglishWords(text: string): number {
  const clean = text.replace(/<<<OMNI_(?:CHAPTER_(?:START|END)\s+index="\d+"|PIECE_(?:START|END)\s+chapter="\d+"\s+piece="\d+"\s+total="\d+")>>>/g, ' ').trim();
  return clean ? clean.split(/\s+/).filter(Boolean).length : 0;
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content || !content.trim()) return null;
    return JSON.parse(content) as T;
  } catch (err) {
    console.error(`Failed to read JSON at ${filePath}:`, err);
    return null;
  }
}

export class Store {
  // In-memory cache synced with disk for high performance & safe concurrency
  private static jobsCache = new Map<string, Job>();
  private static chunksCache = new Map<string, Map<string, Chunk>>();
  private static lockMap = new Map<string, Promise<unknown>>();

  static async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prevLock = this.lockMap.get(key) || Promise.resolve();
    let resolveLock: () => void;
    const newLock = new Promise<void>((res) => {
      resolveLock = res;
    });
    this.lockMap.set(key, prevLock.then(() => newLock));

    try {
      await prevLock;
      return await fn();
    } finally {
      resolveLock!();
      if (this.lockMap.get(key) === newLock) {
        this.lockMap.delete(key);
      }
    }
  }

  static async saveJob(job: Job): Promise<void> {
    ensureDirs();
    this.jobsCache.set(job.id, job);
    const jobPath = path.join(JOBS_DIR, `${job.id}.json`);
    await atomicWriteJson(jobPath, job);
  }

  static async getJob(jobId: string): Promise<Job | null> {
    if (this.jobsCache.has(jobId)) {
      return this.jobsCache.get(jobId)!;
    }
    const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
    const job = readJson<Job>(jobPath);
    if (job) {
      this.jobsCache.set(jobId, job);
    }
    return job;
  }

  static async updateJob(jobId: string, updates: Partial<Job>): Promise<Job | null> {
    return this.withLock(`job_${jobId}`, async () => {
      const job = await this.getJob(jobId);
      if (!job) return null;
      const updated: Job = {
        ...job,
        ...updates,
        updatedAt: Date.now(),
      };
      await this.saveJob(updated);
      return updated;
    });
  }

  static async listJobs(): Promise<Job[]> {
    ensureDirs();
    const files = fs.readdirSync(JOBS_DIR).filter((f) => f.endsWith('.json'));
    const jobs: Job[] = [];
    for (const file of files) {
      const jobId = path.basename(file, '.json');
      const job = await this.getJob(jobId);
      if (job) jobs.push(job);
    }
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  static async saveChunks(jobId: string, chunks: Chunk[]): Promise<void> {
    ensureDirs();
    const jobChunksDir = path.join(CHUNKS_DIR, jobId);
    if (!fs.existsSync(jobChunksDir)) {
      fs.mkdirSync(jobChunksDir, { recursive: true });
    }

    let chunkMap = this.chunksCache.get(jobId);
    if (!chunkMap) {
      chunkMap = new Map();
      this.chunksCache.set(jobId, chunkMap);
    }

    for (const chunk of chunks) {
      chunkMap.set(chunk.id, chunk);
      const chunkPath = path.join(jobChunksDir, `${chunk.id}.json`);
      await atomicWriteJson(chunkPath, chunk);
    }
  }

  static async getChunks(jobId: string): Promise<Chunk[]> {
    if (this.chunksCache.has(jobId)) {
      const map = this.chunksCache.get(jobId)!;
      return Array.from(map.values()).sort((a, b) => {
        if (a.chapterIndex !== b.chapterIndex) {
          return a.chapterIndex - b.chapterIndex;
        }
        return a.chunkIndex - b.chunkIndex;
      });
    }

    ensureDirs();
    const jobChunksDir = path.join(CHUNKS_DIR, jobId);
    if (!fs.existsSync(jobChunksDir)) return [];

    const files = fs.readdirSync(jobChunksDir).filter((f) => f.endsWith('.json'));
    const chunkMap = new Map<string, Chunk>();
    for (const file of files) {
      const chunk = readJson<Chunk>(path.join(jobChunksDir, file));
      if (chunk) {
        chunkMap.set(chunk.id, chunk);
      }
    }
    this.chunksCache.set(jobId, chunkMap);

    return Array.from(chunkMap.values()).sort((a, b) => {
      if (a.chapterIndex !== b.chapterIndex) {
        return a.chapterIndex - b.chapterIndex;
      }
      return a.chunkIndex - b.chunkIndex;
    });
  }

  static async getChunk(jobId: string, chunkId: string): Promise<Chunk | null> {
    const chunkMap = this.chunksCache.get(jobId);
    if (chunkMap && chunkMap.has(chunkId)) {
      return chunkMap.get(chunkId)!;
    }
    const chunkPath = path.join(CHUNKS_DIR, jobId, `${chunkId}.json`);
    const chunk = readJson<Chunk>(chunkPath);
    if (chunk) {
      if (!this.chunksCache.has(jobId)) {
        this.chunksCache.set(jobId, new Map());
      }
      this.chunksCache.get(jobId)!.set(chunkId, chunk);
    }
    return chunk;
  }

  static async updateChunk(chunk: Chunk): Promise<void> {
    ensureDirs();
    const jobChunksDir = path.join(CHUNKS_DIR, chunk.jobId);
    if (!fs.existsSync(jobChunksDir)) {
      fs.mkdirSync(jobChunksDir, { recursive: true });
    }

    if (!this.chunksCache.has(chunk.jobId)) {
      this.chunksCache.set(chunk.jobId, new Map());
    }
    this.chunksCache.get(chunk.jobId)!.set(chunk.id, chunk);

    const chunkPath = path.join(jobChunksDir, `${chunk.id}.json`);
    await atomicWriteJson(chunkPath, chunk);
  }

  /**
   * Atomically claims the next pending chunk or an expired lease chunk.
   * Duplicate prevention: only one worker can lease this chunk at a time.
   */
  static async claimPendingChunk(
    jobId: string,
    workerId: string,
    leaseDurationMs: number = 300000 // 5 minutes safe lease
  ): Promise<Chunk | null> {
    return this.withLock(`claim_${jobId}`, async () => {
      const chunks = await this.getChunks(jobId);
      const now = Date.now();

      // Find first chunk that is pending OR has an expired lease
      const candidate = chunks.find((c) => {
        if (c.status === 'pending') return true;
        if (c.status === 'translating' && c.leaseExpiresAt !== null && c.leaseExpiresAt < now) {
          return true; // Expired lease recovery
        }
        return false;
      });

      if (!candidate) return null;

      // Atomically claim
      candidate.status = 'translating';
      candidate.claimedBy = workerId;
      candidate.leaseExpiresAt = now + leaseDurationMs;
      candidate.updatedAt = now;

      await this.updateChunk(candidate);
      return candidate;
    });
  }

  /**
   * Completes a chunk atomically. Ensures only the worker that owns the active claim can finalize it.
   */
  static async completeChunk(
    jobId: string,
    chunkId: string,
    workerId: string,
    translatedText: string
  ): Promise<boolean> {
    return this.withLock(`claim_${jobId}`, async () => {
      const chunk = await this.getChunk(jobId, chunkId);
      if (!chunk) return false;

      // Duplicate prevention: verify worker claim
      if (chunk.status === 'completed') {
        return true; // already completed
      }
      if (chunk.claimedBy !== workerId) {
        console.warn(`Worker ${workerId} tried to finalize chunk ${chunkId} owned by ${chunk.claimedBy}`);
        return false;
      }

      const now = Date.now();

      // Never allow an API response to become a successful chunk unless it
      // passes the translation quality gate first. This protects the final
      // EPUB/TXT from empty, mostly-Chinese, duplicated, or truncated output.
      const validation = validateTranslation(chunk.originalText, translatedText);
      const expectedIndices = chunk.chapterIndices && chunk.chapterIndices.length > 0
        ? chunk.chapterIndices
        : [chunk.chapterIndex];
      const markersValid = hasExpectedChapterMarkers(translatedText, expectedIndices);

      if (!validation.valid || !markersValid) {
        const reason = !markersValid
          ? `Chapter boundary markers are missing or out of order.`
          : validation.reason || 'Translation failed quality validation.';
        chunk.status = chunk.retries >= 2 ? 'failed' : 'pending';
        chunk.translatedText = '';
        chunk.claimedBy = null;
        chunk.leaseExpiresAt = null;
        chunk.validationError = reason;
        chunk.error = reason;
        chunk.retries = (chunk.retries || 0) + 1;
        chunk.updatedAt = now;
        await this.updateChunk(chunk);
        return false;
      }

      chunk.status = 'completed';
      chunk.translatedText = translatedText;
      chunk.claimedBy = null;
      chunk.leaseExpiresAt = null;
      chunk.error = null;
      chunk.validationError = null;
      chunk.updatedAt = now;

      const cachedMap = this.chunksCache.get(jobId);
      const chunks = cachedMap ? Array.from(cachedMap.values()) : await this.getChunks(jobId);
      const completedCount = chunks.filter((c) => c.status === 'completed').length;
      const currentJob = await this.getJob(jobId);
      const expectedChunkCount = currentJob?.totalChunks ?? chunks.length;
      const isAllCompleted = chunks.length === expectedChunkCount && completedCount === expectedChunkCount;
      const translatedWordsForChunk = countEnglishWords(translatedText);
      const jobUpdates: Partial<Job> = {
        completedChunks: completedCount,
        translatedWords: (currentJob?.translatedWords ?? 0) + translatedWordsForChunk,
        updatedAt: now,
      };

      // Recompute the contiguous export word count only when a chunk changes.
      // This keeps 5-second status polling cheap while keeping contiguous
      // partial-download metadata exact.
      const contiguous = await this.getContiguousCompletedChapters(jobId, true);
      const contiguousWords = contiguous.reduce((sum, ch) =>
        sum + (ch.translatedContent.trim() ? ch.translatedContent.trim().split(/\s+/).filter(Boolean).length : 0), 0
      );
      jobUpdates.contiguousTranslatedWords = contiguousWords;

      if (isAllCompleted) {
        jobUpdates.status = 'completed';
      }

      // These are independent files. Persist them concurrently so a completed
      // Gemini request does not wait on two sequential disk writes.
      await Promise.all([
        this.updateChunk(chunk),
        this.updateJob(jobId, jobUpdates),
      ]);
      return true;
    });
  }

  /**
   * Releases a chunk back to pending (e.g. on 429 or worker release).
   */
  static async releaseChunk(
    jobId: string,
    chunkId: string,
    errorMessage?: string,
    countRetry: boolean = true
  ): Promise<void> {
    await this.withLock(`claim_${jobId}`, async () => {
      const chunk = await this.getChunk(jobId, chunkId);
      if (!chunk) return;
      if (chunk.status === 'completed') return;

      // Provider-level rate limiting is not a translation failure. A 429 means
      // this particular Gemini project/key cannot serve the request right now,
      // so the scheduler rotates to another key or waits for cooldown. Do not
      // burn the chunk's finite retry budget while doing that.
      if (countRetry) {
        chunk.retries = (chunk.retries || 0) + 1;
        chunk.status = chunk.retries >= 10 ? 'failed' : 'pending';
      } else {
        chunk.status = 'pending';
      }
      chunk.claimedBy = null;
      chunk.leaseExpiresAt = null;
      if (errorMessage) {
        chunk.error = errorMessage;
      }
      chunk.updatedAt = Date.now();
      await this.updateChunk(chunk);
    });
  }

  /**
   * Recovers any stale leases (e.g. after server restart).
   */
  static async recoverStaleLeases(jobId: string): Promise<number> {
    return this.withLock(`claim_${jobId}`, async () => {
      const chunks = await this.getChunks(jobId);
      const now = Date.now();
      let recovered = 0;

      for (const chunk of chunks) {
        if (chunk.status === 'translating' && chunk.leaseExpiresAt !== null && chunk.leaseExpiresAt < now) {
          chunk.status = 'pending';
          chunk.claimedBy = null;
          chunk.leaseExpiresAt = null;
          chunk.updatedAt = now;
          await this.updateChunk(chunk);
          recovered++;
        }
      }
      return recovered;
    });
  }

  /**
   * Revalidates completed chunks before export. This is deliberately NOT used
   * by normal status polling, so reopening the browser never scans/reprocesses
   * the whole translated book.
   */
  private static async getValidatedCompletedChunks(jobId: string): Promise<Chunk[]> {
    const chunks = await this.getChunks(jobId);
    const valid: Chunk[] = [];
    for (const chunk of chunks) {
      if (chunk.status !== 'completed') continue;
      const result = validateTranslation(chunk.originalText, chunk.translatedText);
      const indices = chunk.chapterIndices && chunk.chapterIndices.length > 0 ? chunk.chapterIndices : [chunk.chapterIndex];
      if (!result.valid || !hasExpectedChapterMarkers(chunk.translatedText, indices)) {
        chunk.status = 'failed';
        chunk.validationError = result.reason || 'Stored translation failed validation.';
        chunk.error = chunk.validationError;
        chunk.claimedBy = null;
        chunk.leaseExpiresAt = null;
        await this.updateChunk(chunk);
        await this.updateJob(jobId, { status: 'failed', error: `Stored completed chunk ${chunk.chunkIndex + 1} failed final validation: ${chunk.validationError}` });
        continue;
      }
      valid.push(chunk);
    }
    return valid;
  }

  /**
   * Lightweight Never-Skip boundary calculation for status polling.
   * Unlike getContiguousCompletedChapters(), this does not build translated
   * chapter text or split multi-chapter translations.
   */
  static async getContiguousCompletedChapterCount(jobId: string): Promise<number> {
    const job = await this.getJob(jobId);
    if (!job) return 0;

    const chunks = await this.getChunks(jobId);
    const chapterChunksMap = new Map<number, Chunk[]>();

    for (const chunk of chunks) {
      const indices =
        chunk.chapterIndices && chunk.chapterIndices.length > 0
          ? chunk.chapterIndices
          : [chunk.chapterIndex];

      for (const chIdx of indices) {
        const list = chapterChunksMap.get(chIdx);
        if (list) list.push(chunk);
        else chapterChunksMap.set(chIdx, [chunk]);
      }
    }

    let count = 0;
    for (const chapter of job.chapters) {
      const chChunks = chapterChunksMap.get(chapter.index) || [];
      if (chChunks.length !== chapter.chunkCount || !chChunks.every((c) => c.status === 'completed')) {
        break;
      }
      count++;
    }

    return count;
  }

  static async getContiguousCompletedChapters(jobId: string, ignorePartialThreshold: boolean = false): Promise<
    Array<{
      index: number;
      title: string;
      translatedContent: string;
    }>
  > {
    const job = await this.getJob(jobId);
    if (!job) return [];

    const chunks = await this.getValidatedCompletedChunks(jobId);

    // Map each chapter index to all chunks that contain that chapter
    const chapterChunksMap = new Map<number, Chunk[]>();
    for (const chunk of chunks) {
      const indices =
        chunk.chapterIndices && chunk.chapterIndices.length > 0
          ? chunk.chapterIndices
          : [chunk.chapterIndex];

      for (const chIdx of indices) {
        if (!chapterChunksMap.has(chIdx)) {
          chapterChunksMap.set(chIdx, []);
        }
        chapterChunksMap.get(chIdx)!.push(chunk);
      }
    }

    // Sort chapters by index ascending
    const sortedChapters = [...job.chapters].sort((a, b) => a.index - b.index);
    const exportableChapters: Array<{ index: number; title: string; translatedContent: string }> = [];

    for (const ch of sortedChapters) {
      const chChunks = chapterChunksMap.get(ch.index) || [];

      // If chapter has no chunks or any chunk is not completed -> STOP IMMEDIATELY (Never-Skip rule)!
      if (chChunks.length !== ch.chunkCount) {
        // Missing source chunk(s) are a hard Never-Skip boundary.
        break;
      }

      const allCompleted = chChunks.every((c) => c.status === 'completed');
      if (!allCompleted) {
        // Gap found! Stop immediately. Never inspect later chapters!
        break;
      }

      // Sort chapter's chunks by pieceIndex or chunkIndex
      chChunks.sort((a, b) => (a.pieceIndex ?? a.chunkIndex) - (b.pieceIndex ?? b.chunkIndex));

      // Extract translated text for this chapter
      const chapterPieces: string[] = [];
      for (const chunk of chChunks) {
        const indices =
          chunk.chapterIndices && chunk.chapterIndices.length > 0
            ? chunk.chapterIndices
            : [chunk.chapterIndex];

        if (indices.length === 1) {
          chapterPieces.push(chunk.translatedText);
        } else {
          // Multiple chapters in this batch -> extract content for this chapter
          const splitMap = splitTranslatedBatch(
            chunk.originalText,
            chunk.translatedText,
            indices,
            chunk.chapterTitles || []
          );
          const chContent = splitMap.get(ch.index) || chunk.translatedText;
          chapterPieces.push(chContent);
        }
      }

      const translatedText = chapterPieces.join('\n\n').trim();

      exportableChapters.push({
        index: ch.index,
        title: ch.title,
        translatedContent: translatedText,
      });
    }

    return exportableChapters;
  }

  /**
   * Lightweight status summary for mobile data saving.
   */
  static async getJobStatus(jobId: string): Promise<JobStatusResponse | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const [exportableChapterCount, chunks] = await Promise.all([
      this.getContiguousCompletedChapterCount(jobId),
      this.getChunks(jobId),
    ]);
    const completedCount = chunks.filter((c) => c.status === 'completed').length;
    const totalCount = job.totalChunks || chunks.length || 1;

    // Count completed chapters without constructing translated chapter text.
    const chapterChunksMap = new Map<number, Chunk[]>();
    for (const chunk of chunks) {
      const indices =
        chunk.chapterIndices && chunk.chapterIndices.length > 0
          ? chunk.chapterIndices
          : [chunk.chapterIndex];

      for (const chIdx of indices) {
        const list = chapterChunksMap.get(chIdx);
        if (list) list.push(chunk);
        else chapterChunksMap.set(chIdx, [chunk]);
      }
    }

    let completedChaptersCount = 0;
    for (const chapter of job.chapters) {
      const chChunks = chapterChunksMap.get(chapter.index) || [];
      if (chChunks.length > 0 && chChunks.every((c) => c.status === 'completed')) {
        completedChaptersCount++;
      }
    }

    // The running total is persisted when each chunk completes, avoiding a full
    // English-word recount on every 3-second frontend status poll.
    let totalWords = job.translatedWords;
    if (typeof totalWords !== 'number') {
      totalWords = 0;
      for (const chunk of chunks) {
        if (chunk.status === 'completed' && chunk.translatedText) {
          totalWords += countEnglishWords(chunk.translatedText);
        }
      }
      // Persist the recovered counter once for older jobs created before this field existed.
      await this.updateJob(jobId, { translatedWords: totalWords });
    }

    const percentage = Math.floor((completedCount / totalCount) * 100);

    return {
      id: job.id,
      filename: job.filename,
      status: job.status,
      totalChapters: job.totalChapters,
      completedChapters: completedChaptersCount,
      exportableChapters: exportableChapterCount,
      totalChunks: totalCount,
      completedChunks: completedCount,
      percentage,
      translatedWords: totalWords,
      contiguousTranslatedWords: job.contiguousTranslatedWords || 0,
      error: job.error,
      updatedAt: job.updatedAt,
    };
  }

  /**
   * Permanently deletes a job and all its chunks to cancel or clear.
   */
  static async deleteJob(jobId: string): Promise<boolean> {
    return this.withLock(`job_${jobId}`, async () => {
      this.jobsCache.delete(jobId);
      this.chunksCache.delete(jobId);

      const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
      if (fs.existsSync(jobPath)) {
        try { fs.unlinkSync(jobPath); } catch (e) { /* ignore */ }
      }

      const jobChunksDir = path.join(CHUNKS_DIR, jobId);
      if (fs.existsSync(jobChunksDir)) {
        try { fs.rmSync(jobChunksDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
      }

      return true;
    });
  }

  /**
   * API Key storage.
   */
  static getKeys(): string[] {
    ensureDirs();

    // 1. Check saved keys file first if populated (e.g. from UI settings)
    const stored = readJson<{ keys: string[] }>(KEYS_FILE);
    const savedKeys = (stored?.keys || []).filter(
      (k) =>
        k.trim().length > 0 &&
        k !== 'MY_GEMINI_API_KEY' &&
        !k.startsWith('test-key') &&
        !k.startsWith('mock-key') &&
        !k.startsWith('benchmark-key')
    );
    if (savedKeys.length > 0) {
      return savedKeys.slice(0, 5);
    }

    const envKeys: string[] = [];

    // 2. Check process.env.GEMINI_API_KEYS (comma or newline separated list of up to 5 keys)
    if (process.env.GEMINI_API_KEYS) {
      const parsed = process.env.GEMINI_API_KEYS.split(/[\n,;\s]+/)
        .map((k) => k.trim())
        .filter(
          (k) =>
            k.length > 0 &&
            k !== 'MY_GEMINI_API_KEY' &&
            !k.startsWith('test-key') &&
            !k.startsWith('mock-key') &&
            !k.startsWith('benchmark-key')
        );
      for (const k of parsed) {
        if (!envKeys.includes(k)) envKeys.push(k);
      }
    }

    // 3. Check process.env.GEMINI_API_KEY_1 through GEMINI_API_KEY_5
    for (let i = 1; i <= 5; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`];
      if (
        k &&
        k.trim() &&
        k.trim() !== 'MY_GEMINI_API_KEY' &&
        !k.trim().startsWith('test-key') &&
        !k.trim().startsWith('mock-key') &&
        !k.trim().startsWith('benchmark-key') &&
        !envKeys.includes(k.trim())
      ) {
        envKeys.push(k.trim());
      }
    }

    // 4. Check standard process.env.GEMINI_API_KEY
    if (
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim() &&
      process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY' &&
      !process.env.GEMINI_API_KEY.trim().startsWith('test-key') &&
      !process.env.GEMINI_API_KEY.trim().startsWith('mock-key') &&
      !process.env.GEMINI_API_KEY.trim().startsWith('benchmark-key')
    ) {
      const k = process.env.GEMINI_API_KEY.trim();
      if (!envKeys.includes(k)) {
        envKeys.push(k);
      }
    }

    return envKeys.slice(0, 5);
  }

  static saveKeys(keys: string[]): void {
    ensureDirs();
    const validKeys = keys
      .map((k) => k.trim())
      .filter(
        (k) =>
          k.length > 0 &&
          k !== 'MY_GEMINI_API_KEY' &&
          !k.startsWith('test-key') &&
          !k.startsWith('mock-key') &&
          !k.startsWith('benchmark-key')
      )
      .slice(0, 5);
    atomicWriteJsonSync(KEYS_FILE, { keys: validKeys });
  }

  static getTelegramSettings(): TelegramSettings {
    ensureDirs();
    const stored = readJson<TelegramSettings>(TELEGRAM_FILE);
    if (stored) {
      return {
        botToken: stored.botToken || '',
        chatIds: Array.isArray(stored.chatIds) ? stored.chatIds.slice(0, 2) : [],
        notifyStart: stored.notifyStart !== false,
        notifyProgress: stored.notifyProgress !== false,
        notifyComplete: stored.notifyComplete !== false,
        notifyPause: stored.notifyPause !== false,
        notifyResume: stored.notifyResume !== false,
        notifyError: stored.notifyError !== false,
        notifyWaiting: stored.notifyWaiting !== false,
      };
    }

    const envToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const envChatId = process.env.TELEGRAM_CHAT_ID || '';
    const ids = envChatId ? envChatId.split(/[\s,;]+/).filter(Boolean) : [];

    return {
      botToken: envToken,
      chatIds: ids.slice(0, 2),
      notifyStart: true,
      notifyProgress: true,
      notifyComplete: true,
      notifyPause: true,
      notifyResume: true,
      notifyError: true,
      notifyWaiting: true,
    };
  }

  static saveTelegramSettings(settings: TelegramSettings): void {
    ensureDirs();
    atomicWriteJsonSync(TELEGRAM_FILE, {
      botToken: (settings.botToken || '').trim(),
      chatIds: (settings.chatIds || []).map((id) => id.trim()).filter(Boolean).slice(0, 2),
      notifyStart: Boolean(settings.notifyStart),
      notifyProgress: Boolean(settings.notifyProgress),
      notifyComplete: Boolean(settings.notifyComplete),
      notifyPause: settings.notifyPause !== false,
      notifyResume: settings.notifyResume !== false,
      notifyError: settings.notifyError !== false,
      notifyWaiting: settings.notifyWaiting !== false,
    });
  }
}
