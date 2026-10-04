import { GeminiAuthError, GeminiPermissionError, GeminiModelError, GeminiRequestError, GeminiRateLimitError, GeminiSafetyError, translateChunkSafely } from './geminiTranslator.js';
import { Store } from './store.js';
import { Chunk, Job } from './types.js';
import { sendTelegramNotification } from './telegram.js';
import { translateWithGoogleFallback } from './googleTranslate.js';

interface KeyState {
  key: string;
  isBusy: boolean;
  cooldownUntil: number;
  disabledReason?: string;
}

export class TranslationScheduler {
  private static instance: TranslationScheduler | null = null;
  private activeJobs = new Set<string>();
  private keyStates: KeyState[] = [];
  private leaseCheckTimer: NodeJS.Timeout | null = null;
  private progressTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.refreshKeys();
    this.startPeriodicRecovery();
    this.startPeriodicProgress();
  }

  static getInstance(): TranslationScheduler {
    if (!this.instance) {
      this.instance = new TranslationScheduler();
    }
    return this.instance;
  }

  refreshKeys(): void {
    const configuredKeys = Store.getKeys();
    const now = Date.now();
    this.keyStates = configuredKeys.map((key) => {
      const existing = this.keyStates.find((k) => k.key === key);
      if (existing) {
        if (existing.cooldownUntil <= now) {
          existing.cooldownUntil = 0;
        }
        return existing;
      }
      return { key, isBusy: false, cooldownUntil: 0 };
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

  // Periodic 5-minute progress notification via Telegram
  private startPeriodicProgress(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = setInterval(async () => {
      for (const jobId of this.activeJobs) {
        const status = await Store.getJobStatus(jobId);
        if (status && status.status === 'translating') {
          sendTelegramNotification(
            `📊 <b>Translation Progress Update (5 min)</b>\n<b>Novel:</b> ${status.filename}\n<b>Progress:</b> ${status.completedChunks}/${status.totalChunks} Chunks (${status.percentage}%)\n<b>Completed Chapters:</b> ${status.completedChapters}/${status.totalChapters}\n<b>English Words Translated:</b> ${status.translatedWords.toLocaleString()}\n<b>Contiguous Words Ready:</b> ${status.contiguousTranslatedWords.toLocaleString()}\n<b>Contiguous Chapters Ready:</b> ${status.exportableChapters}`,
            'progress'
          );
        }
      }
    }, 5 * 60 * 1000);
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

    const configuredKeys = Store.getKeys();
    this.refreshKeys();
    if (configuredKeys.length === 0) {
      console.warn(`[Omni Scheduler] Cannot start job ${jobId}: No Gemini API keys configured`);
      await Store.updateJob(jobId, {
        status: 'paused',
        error: 'No Gemini API keys configured. Please configure keys or secrets.',
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
    const job = await Store.getJob(jobId);
    if (!job) return false;
    // A user-initiated resume is an explicit request to retry previously
    // failed chunks, but completed chunks remain untouched.
    const chunks = await Store.getChunks(jobId);
    for (const chunk of chunks) {
      if (chunk.status === 'failed') {
        chunk.status = 'pending';
        chunk.retries = 0;
        chunk.error = null;
        chunk.validationError = null;
        chunk.claimedBy = null;
        chunk.leaseExpiresAt = null;
        chunk.updatedAt = Date.now();
        await Store.updateChunk(chunk);
      }
    }
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

    // Key states are refreshed only when keys are configured/started.
    // Re-reading keys.json on every dispatch would perform synchronous disk I/O
    // between every Gemini batch and can throttle a five-key worker pool.
    const now = Date.now();

    // Check all keys
    const availableKeys = this.keyStates.filter(
      (k) => !k.isBusy && !k.disabledReason && k.cooldownUntil <= now
    );

    if (availableKeys.length === 0) {
      const busyCount = this.keyStates.filter((k) => k.isBusy).length;
      if (busyCount === 0 && this.keyStates.length > 0) {
        const activeStates = this.keyStates.filter((k) => !k.disabledReason);
        const allPermanentlyUnavailable = activeStates.length === 0;
        if (allPermanentlyUnavailable) {
          const reasons = this.keyStates.map((k, i) => `Key ${i + 1}: ${k.disabledReason || 'unavailable'}`).join(' | ');
          const waitingMessage = `All configured Gemini keys are currently unavailable. ${reasons}`;
          console.warn(`[Omni Scheduler] ${waitingMessage}`);
          this.activeJobs.delete(jobId);
          Store.updateJob(jobId, { status: 'paused', error: waitingMessage });
          sendTelegramNotification(
            `⏳ <b>Gemini Capacity Unavailable</b>\n<b>Job:</b> ${jobId}\n<b>Reason:</b> ${waitingMessage}`,
            'waiting'
          );
          return;
        }

        const minCooldown = Math.min(...activeStates.map((k) => k.cooldownUntil));
        const waitMs = Math.max(1000, minCooldown - now);
        // Never turn a long transient cooldown into a generic "invalid key" message.
        // Daily quota/permission/auth keys are marked disabled above; transient 429/503
        // states remain active and are retried when their cooldown expires.
        setTimeout(() => this.dispatch(jobId), waitMs);
      }
      return;
    }

    // Try to claim and dispatch a chunk for each available key
    for (const keyState of availableKeys) {
      if (!this.activeJobs.has(jobId)) break;

      // Mark key busy synchronously to prevent racing/double dispatch
      keyState.isBusy = true;
      const workerId = `worker_${keyState.key.slice(-6)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Execute dispatch step asynchronously
      (async () => {
        // Atomically claim chunk with 5-minute lease
        const chunk = await Store.claimPendingChunk(jobId, workerId, 300000);
        if (!chunk) {
          keyState.isBusy = false; // Release key since no pending work was available
          // Check if job is fully completed
          const status = await Store.getJobStatus(jobId);
          if (status && status.completedChunks === status.totalChunks) {
            // Several idle workers can observe the same completed job at nearly
            // the same time. Only the first worker that still owns the active-job
            // slot may finalize it and send the completion notification.
            if (this.activeJobs.has(jobId)) {
              this.activeJobs.delete(jobId);
              await Store.updateJob(jobId, { status: 'completed', error: null });
              console.log(`[Omni Scheduler] Job ${jobId} FULLY COMPLETED!`);
              sendTelegramNotification(
                `🎉 <b>Translation Completed 100%!</b>\n<b>Novel:</b> ${status.filename}\n<b>Chapters:</b> ${status.completedChapters}/${status.totalChapters}\n<b>Translated Words:</b> ${status.translatedWords.toLocaleString()} words`,
                'complete'
              );
            }
          } else {
            const chunks = await Store.getChunks(jobId);
            const failed = chunks.filter((c) => c.status === 'failed');
            const pending = chunks.filter((c) => c.status === 'pending' || c.status === 'translating');
            if (failed.length > 0 && pending.length === 0 && this.activeJobs.has(jobId)) {
              this.activeJobs.delete(jobId);
              const message = `Translation stopped: ${failed.length} chunk(s) failed validation or exhausted retries. No incomplete content was exported.`;
              await Store.updateJob(jobId, { status: 'failed', error: message });
              sendTelegramNotification(
                `❌ <b>Translation Stopped</b>\n<b>Novel:</b> ${status?.filename || jobId}\n<b>Failed Chunks:</b> ${failed.length}\n<b>English Words:</b> ${(status?.translatedWords || 0).toLocaleString()}\n<b>Reason:</b> ${message}`,
                'error'
              );
            }
          }
          return;
        }

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
      // Safety-blocked chunks are permanently routed to Google Translate.
      // They never go back to Gemini, preventing repeated policy-block retries.
      const useGoogleFallback = chunk.translationProvider === 'google_translate_fallback';
      let translatedText: string;

      if (useGoogleFallback) {
        translatedText = await translateWithGoogleFallback(chunk.originalText);
      } else {
        translatedText = await translateChunkSafely(chunk.originalText, keyState.key);
      }

      // Complete chunk atomically (validates worker claim to prevent duplicate finalization)
      const completed = await Store.completeChunk(jobId, chunk.id, workerId, translatedText);
      if (!completed) {
        const current = await Store.getChunk(jobId, chunk.id);
        if (current?.validationError) {
          keyState.cooldownUntil = Date.now() + 5000;
          console.warn(`[Omni Scheduler] Chunk ${chunk.id} failed translation validation: ${current.validationError}`);
        } else {
          console.warn(`[Omni Scheduler] Worker ${workerId} could not finalize chunk ${chunk.id}`);
        }
      }
    } catch (err: any) {
      console.error(`[Omni Scheduler] Error translating chunk ${chunk.id}:`, err);

      if (err instanceof GeminiSafetyError && chunk.translationProvider !== 'google_translate_fallback') {
        // Explicit Gemini content blocks are never retried against Gemini.
        // Permanently switch this chunk to the no-key Google Translate fallback.
        await Store.withLock(`claim_${jobId}`, async () => {
          const blocked = await Store.getChunk(jobId, chunk.id);
          if (blocked && blocked.status !== 'completed') {
            blocked.status = 'pending';
            blocked.translationProvider = 'google_translate_fallback';
            blocked.claimedBy = null;
            blocked.leaseExpiresAt = null;
            blocked.error = `Gemini safety block; switched to Google Translate fallback: ${err.message}`;
            blocked.validationError = null;
            blocked.updatedAt = Date.now();
            await Store.updateChunk(blocked);
          }
        });

        console.warn(`[Omni Scheduler] Chunk ${chunk.id} was safety-blocked by Gemini; permanently switching it to Google Translate fallback.`);
        sendTelegramNotification(
          `🔄 <b>Google Translate Fallback</b>\n<b>Novel:</b> ${(await Store.getJob(jobId))?.filename || jobId}\n<b>Chunk:</b> ${chunk.chunkIndex + 1}\n<b>Reason:</b> ${err.message}\n<b>Action:</b> Gemini will not retry this blocked chunk.`,
          'error'
        );
      } else if (err instanceof GeminiAuthError) {
        keyState.cooldownUntil = Date.now() + 86400000;
        keyState.disabledReason = '401 authentication failed';
        console.warn(`[Omni Scheduler] Key ${keyState.key.slice(0, 6)}... authentication failed. Key disabled.`);
        await Store.releaseChunk(jobId, chunk.id, err.message, false);
      } else if (err instanceof GeminiPermissionError) {
        keyState.cooldownUntil = Date.now() + 86400000;
        keyState.disabledReason = '403 permission denied / key restriction';
        console.warn(`[Omni Scheduler] Key ${keyState.key.slice(0, 6)}... permission denied. Key disabled.`);
        await Store.releaseChunk(jobId, chunk.id, err.message, false);
      } else if (err instanceof GeminiModelError) {
        // A 404 is a configuration/model problem, not a bad API key. Stop safely
        // with an actionable message rather than disabling every key.
        const message = `Gemini model/configuration error: ${err.message}`;
        await Store.releaseChunk(jobId, chunk.id, message, false);
        this.activeJobs.delete(jobId);
        await Store.updateJob(jobId, { status: 'paused', error: message });
        sendTelegramNotification(`⚠️ <b>Gemini Configuration Error</b>\n<b>Novel:</b> ${(await Store.getJob(jobId))?.filename || jobId}\n<b>Reason:</b> ${message}`, 'error');
      } else if (err instanceof GeminiRequestError) {
        const message = err.message;
        await Store.releaseChunk(jobId, chunk.id, message, false);
        this.activeJobs.delete(jobId);
        await Store.updateJob(jobId, { status: 'paused', error: message });
        sendTelegramNotification(`⚠️ <b>Gemini Request Error</b>\n<b>Novel:</b> ${(await Store.getJob(jobId))?.filename || jobId}\n<b>Reason:</b> ${message}`, 'error');
      } else if (err instanceof GeminiRateLimitError) {
        const cooldownMs = (err.retryAfterSeconds || 30) * 1000;
        keyState.cooldownUntil = Date.now() + cooldownMs;
        if (err.quotaKind === 'daily_quota') {
          keyState.disabledReason = `429 daily quota exhausted (retry in ${err.retryAfterSeconds}s)`;
        }
        const label = err.quotaKind === 'daily_quota' ? 'daily quota' : 'temporary rate limit';
        console.warn(`[Omni Scheduler] Key ${keyState.key.slice(-6)} received ${label}. Backing off for ${err.retryAfterSeconds}s.`);
        await Store.releaseChunk(
          jobId,
          chunk.id,
          `429 ${label} (cooldown ${err.retryAfterSeconds}s)`,
          false
        );
      } else {
        // Other error (timeout, network, 5xx): bounded retry. Never mark the
        // source as translated when the provider failed.
        await Store.releaseChunk(jobId, chunk.id, err.message || String(err));
      }

      const afterError = await Store.getChunk(jobId, chunk.id);
      if (afterError?.status === 'failed') {
        const status = await Store.getJobStatus(jobId);
        const message = `Chunk ${chunk.chunkIndex + 1} failed after ${afterError.retries} attempts: ${afterError.error || 'unknown error'}`;
        this.activeJobs.delete(jobId);
        await Store.updateJob(jobId, { status: 'failed', error: message });
        sendTelegramNotification(
          `❌ <b>Translation Failed</b>\n<b>Novel:</b> ${status?.filename || jobId}\n<b>Chunk:</b> ${chunk.chunkIndex + 1}/${status?.totalChunks || '?'}\n<b>English Words:</b> ${(status?.translatedWords || 0).toLocaleString()}\n<b>Reason:</b> ${message}`,
          'error'
        );
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
