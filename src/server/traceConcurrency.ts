import { detectChapters, createOptimizedBatches, MAX_BATCH_CHAR_BUDGET } from './textSplitter.js';
import { Store } from './store.js';
import { JobManager } from './jobManager.js';
import { TranslationScheduler } from './scheduler.js';

function generateSample(): string {
  const chapters: string[] = [];
  for (let i = 1; i <= 15; i++) {
    let ch = `第${i}章 剑动山河 ${i}\n`;
    for (let p = 0; p < 6; p++) {
      ch += `九天之上，风雷激荡。少年秦风手持青锋剑，傲立于绝巅之上，周身剑气冲霄，引动天地灵气滚滚汇聚。大荒深处的诸多凶兽尽皆匍匐颤抖，不敢撄其锋芒。\n\n`;
    }
    chapters.push(ch);
  }
  return chapters.join('\n');
}

async function trace() {
  console.log('--- RUNNING TIMELINE TRACE ACROSS 5 KEYS ---');
  const novel = generateSample();
  const keys = ['key-alpha-1', 'key-beta-2', 'key-gamma-3', 'key-delta-4', 'key-epsilon-5'];
  Store.saveKeys(keys);

  const parsed = detectChapters(novel);
  const batches = createOptimizedBatches(parsed, MAX_BATCH_CHAR_BUDGET);
  console.log(`Generated ${batches.length} batches across ${parsed.length} chapters.`);

  const job = await JobManager.createJobFromText('trace_novel.txt', novel);

  const startTime = Date.now();
  await JobManager.startJob(job.id);

  while (true) {
    await new Promise((r) => setTimeout(r, 20));
    const s = await Store.getJobStatus(job.id);
    if (s?.status === 'completed' && s.percentage === 100) break;
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`Trace complete in ${duration.toFixed(3)}s`);

  await Store.deleteJob(job.id);
}

trace().catch(console.error);
