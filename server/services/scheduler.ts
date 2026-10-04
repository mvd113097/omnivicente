import { TranslationChunk } from '../types.js';
import { countWords } from './textSplitter.js';
import {
  translateChunkWithGemini,
  SafetyBlockError,
  RateLimitError,
} from './geminiTranslator.js';
import { translateWithGoogleTranslate } from './googleTranslator.js';

export interface KeyState {
  index: number;
  key: string;
  isBusy: boolean;
  cooldownUntil: number;
  consecutiveErrors: number;
}

export interface SchedulerCallbacks {
  onChunkCompleted: (
    chunk: TranslationChunk,
    translatedText: string,
    translatorUsed: 'gemini' | 'google_translate',
    fallbackReason?: string
  ) => Promise<void>;
  onProgressUpdate: () => Promise<void>;
  onAllCompleted: () => Promise<void>;
  onError: (err: string) => Promise<void>;
}

export class TranslationScheduler {
  private jobId: string;
  private model: string;
  private sourceLang: string;
  private targetLang: string;
  private glossary: Record<string, string>;
  private keys: KeyState[] = [];
  private chunks: TranslationChunk[] = [];
  private callbacks: SchedulerCallbacks;
  private isRunning: boolean = false;
  private activeStreams: number = 0;
  private maxConcurrency: number = 5;
  private runLoopInterval: NodeJS.Timeout | null = null;

  constructor(
    jobId: string,
    keys: string[],
    chunks: TranslationChunk[],
    options: {
      model: string;
      sourceLang: string;
      targetLang: string;
      glossary?: Record<string, string>;
    },
    callbacks: SchedulerCallbacks
  ) {
    this.jobId = jobId;
    this.model = options.model;
    this.sourceLang = options.sourceLang;
    this.targetLang = options.targetLang;
    this.glossary = options.glossary || {};
    this.callbacks = callbacks;
    this.chunks = chunks;

    this.setKeys(keys);
  }

  public setKeys(rawKeys: string[]) {
    const cleanKeys = rawKeys.map(k => k.trim()).filter(Boolean);
    this.keys = cleanKeys.map((key, idx) => ({
      index: idx,
      key,
      isBusy: false,
      cooldownUntil: 0,
      consecutiveErrors: 0,
    }));
  }

  public updateChunks(chunks: TranslationChunk[]) {
    this.chunks = chunks;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextLoop();
  }

  public pause() {
    this.isRunning = false;
    if (this.runLoopInterval) {
      clearTimeout(this.runLoopInterval);
      this.runLoopInterval = null;
    }
  }

  public getActiveKeyIndex(): number {
    const active = this.keys.find(k => k.isBusy);
    return active ? active.index : 0;
  }

  public getTotalKeys(): number {
    return this.keys.length;
  }

  private scheduleNextLoop(delayMs: number = 100) {
    if (!this.isRunning) return;
    if (this.runLoopInterval) clearTimeout(this.runLoopInterval);
    this.runLoopInterval = setTimeout(() => this.dispatchWorkers(), delayMs);
  }

  /**
   * Main scheduler dispatch loop.
   * Manages up to 5 concurrent worker streams, 1 per key, with atomic lease & rate-limit rotation.
   */
  private async dispatchWorkers() {
    if (!this.isRunning) return;

    // 1. Check for stale leases (> 60s) and recover them
    const now = Date.now();
    for (const chunk of this.chunks) {
      if (
        chunk.status === 'translating' &&
        chunk.leaseTimestamp &&
        now - chunk.leaseTimestamp > 60000
      ) {
        chunk.status = 'pending';
        chunk.leaseWorkerId = undefined;
        chunk.leaseTimestamp = undefined;
      }
    }

    // 2. Check if all chunks are completed
    const pendingChunks = this.chunks.filter(c => c.status === 'pending');
    const inFlightChunks = this.chunks.filter(c => c.status === 'translating');

    if (pendingChunks.length === 0 && inFlightChunks.length === 0) {
      this.pause();
      await this.callbacks.onAllCompleted();
      return;
    }

    // 3. Find available non-busy keys whose cooldown has passed
    const availableKeys = this.keys.filter(
      k => !k.isBusy && k.cooldownUntil <= now
    );

    if (availableKeys.length === 0) {
      // If all keys are in cooldown, schedule wake-up when earliest cooldown expires
      const earliestCooldown = Math.min(...this.keys.map(k => k.cooldownUntil));
      const waitTime = Math.max(1000, earliestCooldown - now);
      this.scheduleNextLoop(waitTime);
      return;
    }

    // 4. Dispatch a worker for each available key up to max concurrency
    for (const keyState of availableKeys) {
      if (this.activeStreams >= this.maxConcurrency) break;

      // Find next pending chunk
      const nextChunk = this.chunks.find(c => c.status === 'pending');
      if (!nextChunk) break;

      // Atomic claim / lease
      nextChunk.status = 'translating';
      nextChunk.leaseWorkerId = `key_${keyState.index}`;
      nextChunk.leaseTimestamp = Date.now();

      keyState.isBusy = true;
      this.activeStreams++;

      // Run translation stream
      this.executeTranslation(keyState, nextChunk)
        .catch(err => {
          console.error(`Worker stream error [Key ${keyState.index}]:`, err);
        })
        .finally(() => {
          keyState.isBusy = false;
          this.activeStreams--;
          this.scheduleNextLoop(50);
        });
    }

    this.scheduleNextLoop(200);
  }

  /**
   * Executes translation for a single claimed chunk.
   */
  private async executeTranslation(keyState: KeyState, chunk: TranslationChunk) {
    let translated = '';
    let translatorUsed: 'gemini' | 'google_translate' = 'gemini';
    let fallbackReason: string | undefined = undefined;
    let success = false;

    try {
      // 1. Try Gemini
      translated = await translateChunkWithGemini(chunk.sourceText, keyState.key, {
        model: this.model,
        sourceLang: this.sourceLang,
        targetLang: this.targetLang,
        glossary: this.glossary,
      });

      success = true;
      keyState.consecutiveErrors = 0;
    } catch (err: any) {
      if (err instanceof SafetyBlockError) {
        // STRICT RULE (Requirement 16):
        // Only explicit Gemini Safety blocks trigger Google Translate for THAT chapter/chunk!
        console.warn(
          `[Job ${this.jobId}] Safety filter triggered on chunk ${chunk.id}. Invoking Google Translate for this chunk ONLY.`
        );
        try {
          translated = await translateWithGoogleTranslate(
            chunk.sourceText,
            this.targetLang
          );
          translatorUsed = 'google_translate';
          fallbackReason = 'Gemini safety/content-policy block';
          success = true;
        } catch (gtErr: any) {
          console.error(
            `Google Translate fallback also failed for chunk ${chunk.id}:`,
            gtErr
          );
          chunk.status = 'failed';
          chunk.error = `Safety block on Gemini, and Google Translate fallback failed: ${gtErr?.message || gtErr}`;
        }
      } else if (err instanceof RateLimitError || err?.status === 429) {
        // Quota exhaustion / 429: Apply cooldown to this key
        const retrySec = err instanceof RateLimitError && err.retryDelaySeconds ? err.retryDelaySeconds : 25;
        const cooldownMs = (retrySec + 2) * 1000;
        console.warn(
          `[Job ${this.jobId}] Key ${keyState.index + 1}/${this.keys.length} rate limited (429). Cooling down for ${Math.round(cooldownMs / 1000)}s. Rotating key...`
        );
        keyState.cooldownUntil = Date.now() + cooldownMs;
        keyState.consecutiveErrors++;

        // If this key or all keys failed repeatedly (>= 2), fallback to Google Translate so user translation completes
        if (keyState.consecutiveErrors >= 2) {
          console.warn(
            `[Job ${this.jobId}] Multiple Gemini quota/rate limits on chunk ${chunk.id}. Invoking Google Translate fallback.`
          );
          try {
            translated = await translateWithGoogleTranslate(
              chunk.sourceText,
              this.targetLang
            );
            translatorUsed = 'google_translate';
            fallbackReason = 'Gemini quota/rate limit exceeded';
            success = true;
          } catch (gtErr: any) {
            console.error(`Google Translate fallback failed:`, gtErr);
            chunk.status = 'pending';
            chunk.leaseWorkerId = undefined;
            chunk.leaseTimestamp = undefined;
            return;
          }
        } else {
          chunk.status = 'pending';
          chunk.leaseWorkerId = undefined;
          chunk.leaseTimestamp = undefined;
          return;
        }
      } else {
        // Transient network or server error (e.g. 503 UNAVAILABLE / 500)
        console.warn(
          `[Job ${this.jobId}] Gemini service error on key ${keyState.index + 1}: ${err?.message || err}. Rotating...`
        );
        keyState.consecutiveErrors++;
        keyState.cooldownUntil = Date.now() + 5000;

        if (keyState.consecutiveErrors >= 2) {
          console.warn(
            `[Job ${this.jobId}] Gemini service temporarily unavailable (503/errors). Invoking fallback translator for chunk ${chunk.id}.`
          );
          try {
            translated = await translateWithGoogleTranslate(
              chunk.sourceText,
              this.targetLang
            );
            translatorUsed = 'google_translate';
            fallbackReason = 'Gemini 503 high demand / service unavailable';
            success = true;
          } catch (gtErr: any) {
            console.error(`Google Translate fallback failed:`, gtErr);
            chunk.status = 'pending';
            chunk.leaseWorkerId = undefined;
            chunk.leaseTimestamp = undefined;
            return;
          }
        } else {
          chunk.status = 'pending';
          chunk.leaseWorkerId = undefined;
          chunk.leaseTimestamp = undefined;
          return;
        }
      }
    }

    if (success && translated) {
      // Requirement 19: Durable persistence must succeed before marking completed!
      try {
        await this.callbacks.onChunkCompleted(
          chunk,
          translated,
          translatorUsed,
          fallbackReason
        );
        // After durable write succeeds:
        chunk.englishText = translated;
        chunk.translatedWordCount = countWords(translated);
        chunk.status =
          translatorUsed === 'google_translate'
            ? 'fallback_google'
            : 'completed';
        chunk.translatorUsed = translatorUsed;
        chunk.fallbackReason = fallbackReason;
        chunk.completedAt = Date.now();
        chunk.leaseWorkerId = undefined;
        chunk.leaseTimestamp = undefined;

        await this.callbacks.onProgressUpdate();
      } catch (saveErr: any) {
        console.error(
          `Failed to persist completed chunk ${chunk.id} to Firestore:`,
          saveErr
        );
        // Release chunk so it is retried and not falsely declared completed
        chunk.status = 'pending';
        chunk.leaseWorkerId = undefined;
        chunk.leaseTimestamp = undefined;
      }
    }
  }
}
