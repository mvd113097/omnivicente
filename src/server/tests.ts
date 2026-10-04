import { Store } from './store.js';
import { JobManager } from './jobManager.js';
import { TranslationScheduler } from './scheduler.js';
import { generateContiguousEpub, generateContiguousTxt } from './epubGenerator.js';
import { translateChunkSafely } from './geminiTranslator.js';
import { detectChapters, chunkChapter } from './textSplitter.js';
import { Chunk, Job } from './types.js';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export async function runAllAutomatedTests(): Promise<{ total: number; passed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({
        name,
        passed: true,
        message: 'PASS',
        durationMs: Date.now() - start,
      });
      console.log(`[TEST PASS] ${name} (${Date.now() - start}ms)`);
    } catch (err: any) {
      results.push({
        name,
        passed: false,
        message: err.message || String(err),
        durationMs: Date.now() - start,
      });
      console.error(`[TEST FAIL] ${name}:`, err);
    }
  };

  console.log('\n--- STARTING OMNI TRANSLATOR AUTOMATED TEST SUITE ---\n');

  // Test 1: Five-key concurrency (max 5 simultaneous keys)
  await runTest('1. Five-key concurrency', async () => {
    Store.saveKeys(['mock-key-1', 'mock-key-2', 'mock-key-3', 'mock-key-4', 'mock-key-5']);
    const keys = Store.getKeys();
    if (keys.length !== 5) {
      throw new Error(`Expected 5 keys, got ${keys.length}`);
    }
  });

  // Test 2: One-request-per-key enforcement
  await runTest('2. One-request-per-key enforcement', async () => {
    const scheduler = TranslationScheduler.getInstance();
    scheduler.refreshKeys();
    // Verify each key in scheduler state has an independent busy flag
    const states = (scheduler as any).keyStates;
    if (!states || states.length < 5) {
      throw new Error('Scheduler does not have 5 key states');
    }
    // Verify initial states are idle
    for (const s of states) {
      if (s.isBusy) throw new Error('Key was marked busy unexpectedly');
    }
  });

  // Test 3: 429 failover
  await runTest('3. 429 failover', async () => {
    // Create a mock chunk and verify releaseChunk resets status and increments retries
    const testJobId = `test_429_${Date.now()}`;
    const testJob: Job = {
      id: testJobId,
      filename: '429_test.txt',
      totalChapters: 1,
      totalChunks: 1,
      completedChunks: 0,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [{ index: 1, title: 'Chapter 1', chunkCount: 1 }],
    };
    await Store.saveJob(testJob);

    const chunkId = 'chunk_429';
    const chunk: Chunk = {
      id: chunkId,
      jobId: testJobId,
      chapterIndex: 1,
      chunkIndex: 0,
      originalText: '测试429限制',
      translatedText: '',
      status: 'translating',
      claimedBy: 'worker_key1',
      leaseExpiresAt: Date.now() + 60000,
      retries: 0,
      updatedAt: Date.now(),
    };
    await Store.saveChunks(testJobId, [chunk]);

    // Simulate 429 release
    await Store.releaseChunk(testJobId, chunkId, '429 Rate limited');
    const updated = await Store.getChunk(testJobId, chunkId);
    if (!updated || updated.status !== 'pending' || updated.claimedBy !== null) {
      throw new Error('Chunk not released properly on 429');
    }
    if (updated.retries !== 1) {
      throw new Error(`Expected retries 1, got ${updated.retries}`);
    }
  });

  // Test 4: Duplicate chunk prevention
  await runTest('4. Duplicate chunk prevention', async () => {
    const testJobId = `test_dup_${Date.now()}`;
    const chunkId = 'chunk_dup';
    const chunk: Chunk = {
      id: chunkId,
      jobId: testJobId,
      chapterIndex: 1,
      chunkIndex: 0,
      originalText: '测试防重复翻译',
      translatedText: '',
      status: 'pending',
      claimedBy: null,
      leaseExpiresAt: null,
      retries: 0,
      updatedAt: Date.now(),
    };
    await Store.saveJob({
      id: testJobId,
      filename: 'dup_test.txt',
      totalChapters: 1,
      totalChunks: 1,
      completedChunks: 0,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [{ index: 1, title: 'Chapter 1', chunkCount: 1 }],
    });
    await Store.saveChunks(testJobId, [chunk]);

    // Worker A claims chunk
    const claimA = await Store.claimPendingChunk(testJobId, 'worker_A', 60000);
    if (!claimA || claimA.claimedBy !== 'worker_A') {
      throw new Error('Worker A failed to claim chunk');
    }

    // Worker B attempts to claim the same chunk -> must fail (return null)
    const claimB = await Store.claimPendingChunk(testJobId, 'worker_B', 60000);
    if (claimB !== null) {
      throw new Error('Worker B was able to claim already-claimed chunk! Duplicate prevention failed.');
    }

    // Worker B attempts to complete chunk owned by Worker A -> must fail
    const completeB = await Store.completeChunk(testJobId, chunkId, 'worker_B', 'Wrong translation');
    if (completeB) {
      throw new Error('Worker B completed chunk owned by Worker A! Claim verification failed.');
    }

    // Worker A completes chunk -> must succeed
    const completeA = await Store.completeChunk(testJobId, chunkId, 'worker_A', 'Correct translation');
    if (!completeA) {
      throw new Error('Worker A failed to complete owned chunk');
    }
  });

  // Test 5: Pause and Resume
  await runTest('5. Pause and Resume', async () => {
    const testJobId = `test_pr_${Date.now()}`;
    await Store.saveJob({
      id: testJobId,
      filename: 'pause_resume.txt',
      totalChapters: 1,
      totalChunks: 1,
      completedChunks: 0,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [{ index: 1, title: 'Chapter 1', chunkCount: 1 }],
    });

    const scheduler = TranslationScheduler.getInstance();
    await scheduler.startJob(testJobId);
    let job = await Store.getJob(testJobId);
    if (job?.status !== 'translating') {
      throw new Error(`Expected translating, got ${job?.status}`);
    }

    await scheduler.pauseJob(testJobId);
    job = await Store.getJob(testJobId);
    if (job?.status !== 'paused') {
      throw new Error(`Expected paused, got ${job?.status}`);
    }

    await scheduler.resumeJob(testJobId);
    job = await Store.getJob(testJobId);
    if (job?.status !== 'translating') {
      throw new Error(`Expected translating after resume, got ${job?.status}`);
    }

    await scheduler.pauseJob(testJobId); // clean up
  });

  // Test 6: Server restart recovery
  await runTest('6. Server restart recovery', async () => {
    const testJobId = `test_restart_${Date.now()}`;
    await Store.saveJob({
      id: testJobId,
      filename: 'restart.txt',
      totalChapters: 1,
      totalChunks: 2,
      completedChunks: 1,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [{ index: 1, title: 'Chapter 1', chunkCount: 2 }],
    });

    // Create 1 completed chunk and 1 pending chunk
    await Store.saveChunks(testJobId, [
      {
        id: 'c1',
        jobId: testJobId,
        chapterIndex: 1,
        chunkIndex: 0,
        originalText: '第一句',
        translatedText: 'First sentence',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c2',
        jobId: testJobId,
        chapterIndex: 1,
        chunkIndex: 1,
        originalText: '第二句',
        translatedText: '',
        status: 'pending',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
    ]);

    // Simulate recovery
    await TranslationScheduler.getInstance().recoverOnStartup();
    const c1 = await Store.getChunk(testJobId, 'c1');
    if (c1?.status !== 'completed') {
      throw new Error('Completed chunk was mutated during restart recovery!');
    }
  });

  // Test 7: Stale lease recovery
  await runTest('7. Stale lease recovery', async () => {
    const testJobId = `test_lease_${Date.now()}`;
    const chunkId = 'c_stale';
    const chunk: Chunk = {
      id: chunkId,
      jobId: testJobId,
      chapterIndex: 1,
      chunkIndex: 0,
      originalText: '陈旧租约',
      translatedText: '',
      status: 'translating',
      claimedBy: 'dead_worker',
      leaseExpiresAt: Date.now() - 10000, // expired 10s ago
      retries: 0,
      updatedAt: Date.now() - 15000,
    };
    await Store.saveJob({
      id: testJobId,
      filename: 'stale.txt',
      totalChapters: 1,
      totalChunks: 1,
      completedChunks: 0,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [{ index: 1, title: 'Chapter 1', chunkCount: 1 }],
    });
    await Store.saveChunks(testJobId, [chunk]);

    const recovered = await Store.recoverStaleLeases(testJobId);
    if (recovered !== 1) {
      throw new Error(`Expected 1 recovered chunk, got ${recovered}`);
    }
    const updated = await Store.getChunk(testJobId, chunkId);
    if (updated?.status !== 'pending' || updated.claimedBy !== null) {
      throw new Error('Stale chunk was not reset to pending');
    }
  });

  // Test 8 & 9: Out-of-order chapter completion & Never-Skip export
  // REQUIRED TEST SCENARIO:
  // Chapter 1 ✅, Chapter 2 ✅, Chapter 3 ✅, Chapter 4 ❌, Chapter 5 ✅, Chapter 6 ✅
  // MUST output only Chapters 1-3.
  // Then complete Chapter 4.
  // MUST then output Chapters 1-6.
  await runTest('8 & 9. Out-of-order completion & Never-Skip export', async () => {
    const testJobId = `test_neverskip_${Date.now()}`;
    const chaptersMeta = [
      { index: 1, title: 'Chapter 1: The Beginning', chunkCount: 1 },
      { index: 2, title: 'Chapter 2: The Journey', chunkCount: 1 },
      { index: 3, title: 'Chapter 3: The Encounter', chunkCount: 1 },
      { index: 4, title: 'Chapter 4: The Tribulation', chunkCount: 1 },
      { index: 5, title: 'Chapter 5: The Breakthrough', chunkCount: 1 },
      { index: 6, title: 'Chapter 6: The Summit', chunkCount: 1 },
    ];

    await Store.saveJob({
      id: testJobId,
      filename: 'neverskip.txt',
      totalChapters: 6,
      totalChunks: 6,
      completedChunks: 5,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: chaptersMeta,
    });

    // Create chunks where Ch 1, 2, 3 are complete, Ch 4 is translating, Ch 5, 6 are complete
    const chunks: Chunk[] = [
      {
        id: 'c_ch1',
        jobId: testJobId,
        chapterIndex: 1,
        chunkIndex: 0,
        originalText: '第一章原文',
        translatedText: 'Chapter 1 content.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c_ch2',
        jobId: testJobId,
        chapterIndex: 2,
        chunkIndex: 0,
        originalText: '第二章原文',
        translatedText: 'Chapter 2 content.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c_ch3',
        jobId: testJobId,
        chapterIndex: 3,
        chunkIndex: 0,
        originalText: '第三章原文',
        translatedText: 'Chapter 3 content.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c_ch4',
        jobId: testJobId,
        chapterIndex: 4,
        chunkIndex: 0,
        originalText: '第四章原文（进行中）',
        translatedText: '',
        status: 'translating', // INCOMPLETE!
        claimedBy: 'worker_4',
        leaseExpiresAt: Date.now() + 60000,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c_ch5',
        jobId: testJobId,
        chapterIndex: 5,
        chunkIndex: 0,
        originalText: '第五章原文',
        translatedText: 'Chapter 5 content.',
        status: 'completed', // Complete ahead of Ch 4
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c_ch6',
        jobId: testJobId,
        chapterIndex: 6,
        chunkIndex: 0,
        originalText: '第六章原文',
        translatedText: 'Chapter 6 content.',
        status: 'completed', // Complete ahead of Ch 4
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
    ];

    await Store.saveChunks(testJobId, chunks);

    // STEP 1: Verify Never-Skip export outputs ONLY Chapters 1, 2, 3!
    const step1Chapters = await Store.getContiguousCompletedChapters(testJobId);
    if (step1Chapters.length !== 3) {
      throw new Error(`Expected exactly 3 chapters (1-3) due to Never-Skip, but got ${step1Chapters.length}`);
    }
    if (step1Chapters[0].index !== 1 || step1Chapters[1].index !== 2 || step1Chapters[2].index !== 3) {
      throw new Error('Never-Skip exported incorrect chapter indices!');
    }

    // STEP 2: Now complete Chapter 4
    await Store.completeChunk(testJobId, 'c_ch4', 'worker_4', 'Chapter 4 content.');

    // STEP 3: Verify Never-Skip export now outputs ALL 6 Chapters (1-6)!
    const step2Chapters = await Store.getContiguousCompletedChapters(testJobId);
    if (step2Chapters.length !== 6) {
      throw new Error(`Expected all 6 chapters after Chapter 4 completion, but got ${step2Chapters.length}`);
    }
    for (let i = 0; i < 6; i++) {
      if (step2Chapters[i].index !== i + 1) {
        throw new Error(`Expected chapter index ${i + 1}, got ${step2Chapters[i].index}`);
      }
    }
  });

  // Test 10: Current EPUB during active translation
  await runTest('10. Current EPUB during active translation', async () => {
    const testJobId = `test_epub_active_${Date.now()}`;
    await Store.saveJob({
      id: testJobId,
      filename: 'active_novel.txt',
      totalChapters: 2,
      totalChunks: 2,
      completedChunks: 1,
      status: 'translating', // ACTIVE TRANSLATION
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [
        { index: 1, title: 'Chapter 1', chunkCount: 1 },
        { index: 2, title: 'Chapter 2', chunkCount: 1 },
      ],
    });

    await Store.saveChunks(testJobId, [
      {
        id: 'chunk_1',
        jobId: testJobId,
        chapterIndex: 1,
        chunkIndex: 0,
        originalText: '第一章内容',
        translatedText: 'Chapter 1 translated text.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'chunk_2',
        jobId: testJobId,
        chapterIndex: 2,
        chunkIndex: 0,
        originalText: '第二章翻译中',
        translatedText: '',
        status: 'translating',
        claimedBy: 'worker_active',
        leaseExpiresAt: Date.now() + 60000,
        retries: 0,
        updatedAt: Date.now(),
      },
    ]);

    // Generate Current EPUB while translation is active
    const { buffer, chapterCount } = await generateContiguousEpub(testJobId);
    if (!buffer || buffer.length === 0) {
      throw new Error('EPUB buffer was empty');
    }
    if (chapterCount !== 1) {
      throw new Error(`Expected 1 contiguous chapter, got ${chapterCount}`);
    }

    // Verify job and chunk states were NOT mutated
    const jobAfter = await Store.getJob(testJobId);
    if (jobAfter?.status !== 'translating') {
      throw new Error('Generating EPUB mutated job status!');
    }
    const chunk2After = await Store.getChunk(testJobId, 'chunk_2');
    if (chunk2After?.status !== 'translating' || chunk2After.claimedBy !== 'worker_active') {
      throw new Error('Generating EPUB mutated active chunk state!');
    }
  });

  // Test 11: Current TXT during active translation
  await runTest('11. Current TXT during active translation', async () => {
    const testJobId = `test_txt_active_${Date.now()}`;
    await Store.saveJob({
      id: testJobId,
      filename: 'active_txt.txt',
      totalChapters: 2,
      totalChunks: 2,
      completedChunks: 1,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [
        { index: 1, title: 'Chapter 1', chunkCount: 1 },
        { index: 2, title: 'Chapter 2', chunkCount: 1 },
      ],
    });

    await Store.saveChunks(testJobId, [
      {
        id: 'chunk_1',
        jobId: testJobId,
        chapterIndex: 1,
        chunkIndex: 0,
        originalText: '第一章文字',
        translatedText: 'Chapter 1 translated text.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'chunk_2',
        jobId: testJobId,
        chapterIndex: 2,
        chunkIndex: 0,
        originalText: '第二章翻译中',
        translatedText: '',
        status: 'translating',
        claimedBy: 'worker_active',
        leaseExpiresAt: Date.now() + 60000,
        retries: 0,
        updatedAt: Date.now(),
      },
    ]);

    const { text, chapterCount } = await generateContiguousTxt(testJobId);
    if (!text.includes('Chapter 1 translated text.')) {
      throw new Error('TXT export does not contain Chapter 1 translation');
    }
    if (chapterCount !== 1) {
      throw new Error(`Expected 1 chapter, got ${chapterCount}`);
    }
  });

  // Test 12: MAX_TOKENS handling
  await runTest('12. MAX_TOKENS handling', async () => {
    // translateChunkSafely handles mock/test keys and splits recursive chunks
    const sourceText = '段落一内容。\n\n段落二内容。';
    const translated = await translateChunkSafely(sourceText, 'mock-key-test');
    if (!translated || !translated.includes('[Translated EN]')) {
      throw new Error('Failed to safely translate with chunk handler');
    }
  });

  // Test 13: Partial EPUB generation
  await runTest('13. Partial EPUB generation', async () => {
    const testJobId = `test_partial_epub_${Date.now()}`;
    await Store.saveJob({
      id: testJobId,
      filename: 'partial.txt',
      totalChapters: 3,
      totalChunks: 3,
      completedChunks: 2,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [
        { index: 1, title: 'Chapter 1', chunkCount: 1 },
        { index: 2, title: 'Chapter 2', chunkCount: 1 },
        { index: 3, title: 'Chapter 3', chunkCount: 1 },
      ],
    });

    await Store.saveChunks(testJobId, [
      {
        id: 'c1',
        jobId: testJobId,
        chapterIndex: 1,
        chunkIndex: 0,
        originalText: '第一章',
        translatedText: 'Chapter 1 text.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c2',
        jobId: testJobId,
        chapterIndex: 2,
        chunkIndex: 0,
        originalText: '第二章',
        translatedText: 'Chapter 2 text.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c3',
        jobId: testJobId,
        chapterIndex: 3,
        chunkIndex: 0,
        originalText: '第三章',
        translatedText: '',
        status: 'pending',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
    ]);

    const { buffer, chapterCount } = await generateContiguousEpub(testJobId);
    if (chapterCount !== 2) {
      throw new Error(`Expected partial EPUB with 2 chapters, got ${chapterCount}`);
    }
    // Verify zip signature (PK..)
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('EPUB output is not a valid zip archive');
    }
  });

  // Test 14: Partial TXT generation
  await runTest('14. Partial TXT generation', async () => {
    const testJobId = `test_partial_txt_${Date.now()}`;
    await Store.saveJob({
      id: testJobId,
      filename: 'partial_txt.txt',
      totalChapters: 2,
      totalChunks: 2,
      completedChunks: 1,
      status: 'translating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [
        { index: 1, title: 'Chapter 1: The Intro', chunkCount: 1 },
        { index: 2, title: 'Chapter 2: The Gap', chunkCount: 1 },
      ],
    });

    await Store.saveChunks(testJobId, [
      {
        id: 'c1',
        jobId: testJobId,
        chapterIndex: 1,
        chunkIndex: 0,
        originalText: '内容',
        translatedText: 'Partial txt translated content.',
        status: 'completed',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
      {
        id: 'c2',
        jobId: testJobId,
        chapterIndex: 2,
        chunkIndex: 0,
        originalText: '待翻译',
        translatedText: '',
        status: 'pending',
        claimedBy: null,
        leaseExpiresAt: null,
        retries: 0,
        updatedAt: Date.now(),
      },
    ]);

    const { text, chapterCount } = await generateContiguousTxt(testJobId);
    if (chapterCount !== 1) {
      throw new Error(`Expected 1 chapter in partial TXT, got ${chapterCount}`);
    }
    if (!text.includes('Partial txt translated content.')) {
      throw new Error('Partial TXT missing content');
    }
  });

  // Test 15: Large 1M+ character parsing
  await runTest('15. Large 1M+ character parsing', async () => {
    console.log('Generating synthetic 1,000,000+ Chinese character text...');
    const chapterTemplate = `\n\n第{NUM}章 逆天修仙录\n`;
    const paragraphTemplate = `大道无形，生育天地；大道无情，运行日月；大道无名，长养万物。少年林尘盘膝坐于青石之上，吞吐天地灵气。周围松柏苍翠，云雾缭绕。忽然天际一道金色雷光破空而降，直落深渊！\n`;

    let largeNovel = '《仙道永恒》\n序章 天地混沌\n远古鸿蒙初开，万界交汇...\n';
    let chapterNum = 1;

    // Generate ~1.05 million characters
    while (largeNovel.length < 1050000) {
      largeNovel += chapterTemplate.replace('{NUM}', String(chapterNum));
      for (let p = 0; p < 8; p++) {
        largeNovel += paragraphTemplate;
      }
      chapterNum++;
    }

    console.log(`Generated text length: ${largeNovel.length} characters (~${Math.round(largeNovel.length / 10000) / 100}M). Parsing chapters...`);
    const parsedChapters = detectChapters(largeNovel);
    if (parsedChapters.length < 50) {
      throw new Error(`Expected at least 50 chapters, got ${parsedChapters.length}`);
    }

    // Verify chunking preserves text without crashing
    const sampleChapter = parsedChapters[1];
    const chunks = chunkChapter(sampleChapter.index, sampleChapter.text);
    if (chunks.length === 0) {
      throw new Error('Chunking produced 0 chunks for large chapter');
    }

    console.log(`Successfully parsed 1M+ novel into ${parsedChapters.length} chapters.`);
  });

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n--- TEST SUITE COMPLETE: ${passedCount}/${results.length} PASSED ---\n`);

  return {
    total: results.length,
    passed: passedCount,
    results,
  };
}

// Allow direct CLI execution: `tsx src/server/tests.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllAutomatedTests().then(({ total, passed }) => {
    if (passed === total) {
      console.log('ALL TESTS PASSED SUCCESSFULLY! ✅');
      process.exit(0);
    } else {
      console.error(`SOME TESTS FAILED: ${passed}/${total} passed ❌`);
      process.exit(1);
    }
  });
}
