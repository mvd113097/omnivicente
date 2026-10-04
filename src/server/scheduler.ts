import { GeminiAuthError, GeminiRateLimitError, translateChunkSafely } from './geminiTranslator.js';
import { Store } from './store.js';
import { Chunk, Job } from './types.js';

interface KeyState {
  key: string;
  isBusy: boolean;
  cooldownUntil: number;
}

export class TranslationScheduler {
  private static instance: TranslationScheduler | null = null;
  private activeJobs = new Set<string>();
  private keyStates: KeyState[] = [];
  private leaseCheckTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.refreshKeys();
    this.startPeriodicRecovery();
  }

  static getInstance(): TranslationScheduler {
    if (!this.instance) {
      this.instance = new TranslationScheduler();
    }
    return this.instance;
  }

  refreshKeys(): void {
    const configuredKeys = Store.getKeys();
    // Maintain busy states for existing keys, add new ones
    this.keyStates = configuredKeys.map((key) => {
      const existing = this.keyStates.find((k) => k.key === key);
      return existing || { key, isBusy: false, cooldownUntil: 0 };
    });
  }

  // Periodic recovery of stale leases (crash or unexpected worker death)
  private startPeriodicRecovery(): void {
    if (this.leaseCheckTimer) clearInterval(this.leaseCheckTimer);
    this.leaseCheckTimer = setInterval(async () => {
      for (const jobId of this.activeJobs) {
        await Store.recoverStaleLeases(jobId);
        this.dispatch(jobId);
      }
    }, 30000);
  }

  /**
   * Recovers any jobs that were translating before server restart.
   */
  async recoverOnStartup(): Promise<void> {
    const jobs = await Store.listJobs();
    for (const job of jobs) {
      if (job.status === 'translating') {
        console.log(`[Omni Recovery] Resuming translating job ${job.id} (${job.filename})`);
        await Store.recoverStaleLeases(job.id);
        await this.startJob(job.id);
      }
    }
  }

  /**
   * Starts or resumes a translation job.
   */
  async startJob(jobId: string): Promise<boolean> {
    const job = await Store.getJob(jobId);
    if (!job) return false;

    this.refreshKeys();
    if (this.keyStates.length === 0) {
      console.warn(`[Omni Scheduler] Cannot start job ${jobId}: No Gemini API keys configured`);
      await Store.updateJob(jobId, {
        status: 'paused',
        error: 'No Gemini API keys configured. Please add at least 1 key.',
      });
      return false;
    }

    this.activeJobs.add(jobId);
    await Store.updateJob(jobId, { status: 'translating', error: null });
    await Store.recoverStaleLeases(jobId);

    // Kick off dispatch
    this.dispatch(jobId);
    return true;
  }

  /**
   * Pauses an active job safely:
   * Stop dispatching new chunks; let in-flight chunks finish and save.
   */
  async pauseJob(jobId: string): Promise<boolean> {
    const job = await Store.getJob(jobId);
    if (!job) return false;

    this.activeJobs.delete(jobId);
    await Store.updateJob(jobId, { status: 'paused' });
    console.log(`[Omni Scheduler] Job ${jobId} paused. In-flight requests will complete safely.`);
    return true;
  }

  /**
   * Resumes a paused job.
   */
  async resumeJob(jobId: string): Promise<boolean> {
    return this.startJob(jobId);
  }

  /**
   * Cancels and stops scheduling for a job immediately.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    this.activeJobs.delete(jobId);
    await Store.deleteJob(jobId);
    console.log(`[Omni Scheduler] Job ${jobId} canceled and removed.`);
    return true;
  }

  /**
   * Core Five-Key Scheduler Loop.
   * Dispatches chunks to available keys up to 5 concurrent requests (max 1 per key).
   */
  dispatch(jobId: string): void {
    if (!this.activeJobs.has(jobId)) {
      return; // Job is paused or not active
    }

    this.refreshKeys();
    const now = Date.now();

    // Check all keys
    const availableKeys = this.keyStates.filter(
      (k) => !k.isBusy && k.cooldownUntil <= now
    );

    if (availableKeys.length === 0) {
      // Check if all keys are in cooldown / invalid
      const busyCount = this.keyStates.filter((k) => k.isBusy).length;
      if (busyCount === 0 && this.keyStates.length > 0) {
        const minCooldown = Math.min(...this.keyStates.map((k) => k.cooldownUntil));
        const waitMs = Math.max(1000, minCooldown - now);

        if (waitMs > 120000) {
          // Prolonged quota or auth issue (e.g. 12 hours) -> Pause job with clear instruction
          console.warn(`[Omni Scheduler] All keys are exhausted or invalid. Pausing job ${jobId}.`);
          this.activeJobs.delete(jobId);
          Store.updateJob(jobId, {
            status: 'paused',
            error: 'All configured Gemini API keys have reached quota limit or are invalid. Please check your API keys in "Configure Keys" (Standard keys start with "AIzaSy...").',
          });
          return;
        }

        // Transient rate limit: schedule retry at earliest expiration
        setTimeout(() => this.dispatch(jobId), waitMs);
      }
      return;
    }

    // Try to claim and dispatch a chunk for each available key
    for (const keyState of availableKeys) {
      if (!this.activeJobs.has(jobId)) break;

      const workerId = `worker_${keyState.key.slice(-6)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Execute dispatch step asynchronously
      (async () => {
        // Atomically claim chunk with 5-minute lease
        const chunk = await Store.claimPendingChunk(jobId, workerId, 300000);
        if (!chunk) {
          // No pending chunks available. Check if job is fully completed.
          const status = await Store.getJobStatus(jobId);
          if (status && status.completedChunks === status.totalChunks) {
            this.activeJobs.delete(jobId);
            await Store.updateJob(jobId, { status: 'completed' });
            console.log(`[Omni Scheduler] Job ${jobId} FULLY COMPLETED!`);
          }
          return;
        }

        // Mark key busy
        keyState.isBusy = true;
        this.processChunk(jobId, chunk, keyState, workerId);
      })();
    }
  }

  private async processChunk(
    jobId: string,
    chunk: Chunk,
    keyState: KeyState,
    workerId: string
  ): Promise<void> {
    try {
      // Translate chunk using Gemini with safe MAX_TOKENS handling
      const translatedText = await translateChunkSafely(chunk.originalText, keyState.key);

      // Complete chunk atomically (validates worker claim to prevent duplicate finalization)
      const completed = await Store.completeChunk(jobId, chunk.id, workerId, translatedText);
      if (!completed) {
        console.warn(`[Omni Scheduler] Worker ${workerId} could not finalize chunk ${chunk.id}`);
      }
    } catch (err: any) {
      console.error(`[Omni Scheduler] Error translating chunk ${chunk.id}:`, err);

      if (err instanceof GeminiAuthError) {
        // Invalid Key format (e.g. 401 unauthenticated / unsupported access token)
        // Disable this key for 24 hours so it won't be retried
        keyState.cooldownUntil = Date.now() + 86400000;
        console.warn(
          `[Omni Scheduler] Key ${keyState.key.slice(0, 6)}... failed authentication. Disabling key.`
        );
        await Store.releaseChunk(jobId, chunk.id, err.message);
      } else if (err instanceof GeminiRateLimitError) {
        // 429 Failover:
        // 1. Put this key into cooldown
        const cooldownMs = (err.retryAfterSeconds || 30) * 1000;
        keyState.cooldownUntil = Date.now() + cooldownMs;
        console.warn(
          `[Omni Scheduler] Key ${keyState.key.slice(-6)} received 429. Backing off for ${err.retryAfterSeconds}s.`
        );

        // 2. Return chunk to pending immediately so other keys can pick it up
        await Store.releaseChunk(jobId, chunk.id, `429 Rate limited (cooldown ${err.retryAfterSeconds}s)`);
      } else {
        // Other error (timeout, network, 5xx): release chunk back to pending for retry
        await Store.releaseChunk(jobId, chunk.id, err.message || String(err));
      }
    } finally {
      // Always release key
      keyState.isBusy = false;

      // Dispatch next chunk immediately if job is still active
      if (this.activeJobs.has(jobId)) {
        this.dispatch(jobId);
      }
    }
  }
}
