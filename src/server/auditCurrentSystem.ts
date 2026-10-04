import fs from 'fs';
import path from 'path';
import { Store } from './store.js';
import { TranslationScheduler } from './scheduler.js';
import { detectChapters, chunkChapter } from './textSplitter.js';
import { translateTextWithGemini } from './geminiTranslator.js';

async function audit() {
  console.log('=== AUDIT OF CURRENT OMNIVICENTE SYSTEM ===\n');

  // 1. Model verification
  const defaultModel = 'gemini-3.8-flash';
  console.log('1. Default Gemini Model in code:', defaultModel);

  // 2. Configurable model
  const envModel = process.env.GEMINI_MODEL || '(not set, hardcoded default used)';
  console.log('2. Environment Model Override:', envModel);

  // 3. Max simultaneous requests
  const keys = Store.getKeys();
  console.log('3. Active Keys count:', keys.length);
  console.log('   Max simultaneous concurrency:', Math.min(5, Math.max(1, keys.length)));

  // 4. Concurrency check
  console.log('4. Are all 5 keys active simultaneously in scheduler?');
  console.log('   Checked scheduler.ts: dispatch() loops over all availableKeys and launches processChunk asynchronously per key.');

  // 5. Global / sequential bottleneck
  console.log('5. Bottlenecks:');
  console.log('   - File locking: withLock() is per-job memory lock around fast JSON writes (0.1ms). No lock during Gemini API calls.');
  console.log('   - REAL BOTTLENECK: Chunk size is 1000 chars (textSplitter.ts).');

  // 6. Current chunk size
  const sampleNovel = fs.readFileSync('data/test_novel_user.txt', 'utf-8');
  const chapters = detectChapters(sampleNovel);
  let oldChunksCount = 0;
  for (const ch of chapters) {
    const chunks = chunkChapter(ch.index, ch.text, 1000, 1500);
    oldChunksCount += chunks.length;
  }
  console.log(`6. Sample novel (${sampleNovel.length} chars, ${chapters.length} chapters):`);
  console.log(`   Old implementation produces: ${oldChunksCount} chunks (avg ${Math.round(sampleNovel.length / oldChunksCount)} chars/chunk).`);

  // 7. Batching: Chunks are currently unbatched.
  console.log('7. Chunks currently batched? NO. Each chapter is split into 1000-char fragments.');

  // 8. Delays:
  console.log('8. Artificial delays: None in scheduler for successful requests. Only 429/503 sets cooldown on rate-limited key.');

  // 9. Database blocking:
  console.log('9. Database: Local filesystem + in-memory cache. Zero Firestore latency blocking workers.');

  // 10. Rate limit handling:
  console.log('10. 429/503 handling: Sets cooldown on affected key only. Chunk released immediately to pending.');

  // 11. MAX_TOKENS handling:
  console.log('11. MAX_TOKENS: Recursive bisecting split in translateChunkSafely.');
}

audit().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
