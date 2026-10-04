import fs from 'fs';
import path from 'path';
import { Chunk, Job, JobStatus, JobStatusResponse } from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const KEYS_FILE = path.join(CONFIG_DIR, 'keys.json');

// Ensure base directories exist
function ensureDirs() {
  for (const dir of [DATA_DIR, JOBS_DIR, CHUNKS_DIR, CONFIG_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

ensureDirs();

function atomicWriteJson(filePath: string, data: unknown) {
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
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
    atomicWriteJson(jobPath, job);
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
      atomicWriteJson(chunkPath, chunk);
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
    atomicWriteJson(chunkPath, chunk);
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
      chunk.status = 'completed';
      chunk.translatedText = translatedText;
      chunk.claimedBy = null;
      chunk.leaseExpiresAt = null;
      chunk.error = null;
      chunk.updatedAt = now;

      await this.updateChunk(chunk);

      // Update job progress
      const chunks = await this.getChunks(jobId);
      const completedCount = chunks.filter((c) => c.status === 'completed').length;
      const isAllCompleted = completedCount === chunks.length;

      const jobUpdates: Partial<Job> = {
        completedChunks: completedCount,
        updatedAt: now,
      };
      if (isAllCompleted) {
        jobUpdates.status = 'completed';
      }

      await this.updateJob(jobId, jobUpdates);
      return true;
    });
  }

  /**
   * Releases a chunk back to pending (e.g. on 429 or worker release).
   */
  static async releaseChunk(jobId: string, chunkId: string, errorMessage?: string): Promise<void> {
    await this.withLock(`claim_${jobId}`, async () => {
      const chunk = await this.getChunk(jobId, chunkId);
      if (!chunk) return;
      if (chunk.status === 'completed') return;

      chunk.status = 'pending';
      chunk.claimedBy = null;
      chunk.leaseExpiresAt = null;
      chunk.retries = (chunk.retries || 0) + 1;
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
   * HARD REQUIREMENT: NEVER-SKIP EXPORT ALGORITHM
   * 1. Sort chapters by chapter index.
   * 2. Examine chapters from Chapter 1 onward.
   * 3. Verify that every chunk in the current chapter is complete.
   * 4. Add the chapter only if ALL its chunks are complete.
   * 5. Stop immediately at the first incomplete chapter.
   * 6. Never inspect later chapters for export once a gap is found.
   */
  static async getContiguousCompletedChapters(jobId: string): Promise<
    Array<{
      index: number;
      title: string;
      translatedContent: string;
    }>
  > {
    const job = await this.getJob(jobId);
    if (!job) return [];

    const chunks = await this.getChunks(jobId);

    // Group chunks by chapter index
    const chapterChunksMap = new Map<number, Chunk[]>();
    for (const chunk of chunks) {
      if (!chapterChunksMap.has(chunk.chapterIndex)) {
        chapterChunksMap.set(chunk.chapterIndex, []);
      }
      chapterChunksMap.get(chunk.chapterIndex)!.push(chunk);
    }

    // Sort chapters by index ascending
    const sortedChapters = [...job.chapters].sort((a, b) => a.index - b.index);
    const exportableChapters: Array<{ index: number; title: string; translatedContent: string }> = [];

    for (const ch of sortedChapters) {
      const chChunks = chapterChunksMap.get(ch.index) || [];

      // If chapter has no chunks or any chunk is not completed -> STOP IMMEDIATELY!
      if (chChunks.length === 0) {
        break;
      }

      const allCompleted = chChunks.every((c) => c.status === 'completed');
      if (!allCompleted) {
        // Gap found! Stop immediately. Never inspect later chapters!
        break;
      }

      // Sort chapter's chunks by chunkIndex
      chChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const translatedText = chChunks.map((c) => c.translatedText).join('\n\n');

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

    const exportable = await this.getContiguousCompletedChapters(jobId);
    const chunks = await this.getChunks(jobId);
    const completedCount = chunks.filter((c) => c.status === 'completed').length;
    const totalCount = job.totalChunks || chunks.length || 1;

    // Count completed chapters
    const chapterChunksMap = new Map<number, Chunk[]>();
    for (const chunk of chunks) {
      if (!chapterChunksMap.has(chunk.chapterIndex)) {
        chapterChunksMap.set(chunk.chapterIndex, []);
      }
      chapterChunksMap.get(chunk.chapterIndex)!.push(chunk);
    }

    let completedChaptersCount = 0;
    for (const ch of job.chapters) {
      const chChunks = chapterChunksMap.get(ch.index) || [];
      if (chChunks.length > 0 && chChunks.every((c) => c.status === 'completed')) {
        completedChaptersCount++;
      }
    }

    // Calculate total English translated words across completed chunks
    let totalWords = 0;
    for (const chunk of chunks) {
      if (chunk.status === 'completed' && chunk.translatedText) {
        totalWords += chunk.translatedText.trim().split(/\s+/).filter(Boolean).length;
      }
    }

    const percentage = Math.floor((completedCount / totalCount) * 100);

    return {
      id: job.id,
      filename: job.filename,
      status: job.status,
      totalChapters: job.totalChapters,
      completedChapters: completedChaptersCount,
      exportableChapters: exportable.length,
      totalChunks: totalCount,
      completedChunks: completedCount,
      percentage,
      translatedWords: totalWords,
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
    const stored = readJson<{ keys: string[] }>(KEYS_FILE);
    const keys: string[] = stored?.keys || [];

    // Also check process.env for GEMINI_API_KEY and GEMINI_API_KEY_1..5
    const envKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) envKeys.push(process.env.GEMINI_API_KEY);
    for (let i = 1; i <= 5; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`];
      if (k && !envKeys.includes(k)) envKeys.push(k);
    }

    const realStored = keys.filter((k) => !k.startsWith('mock-key') && !k.startsWith('test-key'));
    const combined = [...realStored];
    for (const ek of envKeys) {
      if (!combined.includes(ek)) {
        combined.push(ek);
      }
    }

    if (combined.length > 0) {
      return combined.slice(0, 5);
    }

    return keys.slice(0, 5);
  }

  static saveKeys(keys: string[]): void {
    ensureDirs();
    const validKeys = keys
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .slice(0, 5);
    atomicWriteJson(KEYS_FILE, { keys: validKeys });
  }
}
