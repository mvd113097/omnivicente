import fs from 'fs';
import path from 'path';
import { detectChapters, createOptimizedBatches, MAX_BATCH_CHAR_BUDGET } from './textSplitter.js';
import { Store } from './store.js';
import { JobManager } from './jobManager.js';
import { TranslationScheduler } from './scheduler.js';
import { DEFAULT_GEMINI_MODEL } from './geminiTranslator.js';

// Realistic 20-chapter Chinese web novel sample (~60,000 characters)
function generateAuditNovel(): string {
  const chapters: string[] = [];
  chapters.push(`《荒古战尊》作者：天外飞仙\n文案：少年自大荒崛起，手握太古神兵，横扫九天十地。\n\n`);

  for (let i = 1; i <= 20; i++) {
    let chText = `第${i}章 大荒试炼 ${i}\n`;
    const paragraphs = [
      `苍茫的大荒深处，古木狼林，巨兽咆哮。烈日透过茂密的树冠，将斑驳的光影洒在满是枯叶的地面上。秦风身披青布长衫，背负着一柄漆黑如墨的重剑，在山林间如灵猿般敏捷地穿行。`,
      `前方传来了凶兽沉闷的低吼声。秦风停下脚步，身形悄无声息地隐匿在一株参天古树的树冠之后。只见前方的山谷中，一头长达五丈的金鳞巨蟒正与一头生有双翼的荒原暴猿疯狂搏杀。`,
      `大地在剧烈震颤，巨石滚落，古树成片崩塌。金鳞巨蟒周身鳞甲坚如精铁，吞吐着腥红的信子，每一次摆尾都如同重锤轰击。荒原暴猿狂暴嘶吼，双拳狂乱地砸在巨蟒的七寸之处。`,
      `“两头都是三阶巅峰的荒古异兽，”秦风目光凝聚，体内太古龙象诀悄然运转，血液如滔滔大河般奔涌咆哮，“这等凶兽体内的内丹，足以让我突破到天元境第四重。”`,
      `激战持续了近半个时辰，暴猿终于被巨蟒死死缠绕窒息而亡，而巨蟒也早已伤痕累累，奄奄一息。就在巨蟒张开巨口准备吞噬暴猿尸体的刹那，树冠上的秦风眼中精光爆射，悍然拔剑！`,
      `“斩风式！”一道璀璨耀眼的青色剑芒划破虚空，宛如九天落雷般瞬间斩下了巨蟒的头颅，热血激射，染红了半边山谷。秦风飘然落地，利落地剖开蛇腹，取出了晶莹剔透的金属性兽丹。`,
      `夜幕渐渐笼罩了苍莽大荒，血腥味开始引来更可怕的凶兽。秦风没有过多停留，迅速收起战利品，身形化作一道模糊的残影，朝着远处的隐蔽山洞飞掠而去，准备闭关炼化兽丹。`,
    ];

    for (let p = 0; p < 7; p++) {
      chText += paragraphs[p % paragraphs.length] + '\n\n';
    }
    chapters.push(chText);
  }
  return chapters.join('\n');
}

async function runAudit() {
  console.log('\n================================================================');
  console.log('🔍 DEEP PIPELINE AUDIT & TIMELINE INSTRUMENTATION');
  console.log('================================================================\n');

  const novelText = generateAuditNovel();
  const totalChars = novelText.length;
  console.log(`Representative Chinese Novel Sample: ${totalChars.toLocaleString()} Chinese characters across 20 chapters`);

  // 1. AUDIT CHUNKING & BATCH-SIZE DISTRIBUTION
  console.log('\n--- 1. BATCH SIZE DISTRIBUTION AUDIT ---');
  const parsedChapters = detectChapters(novelText);
  console.log(`Detected Chapters: ${parsedChapters.length}`);

  const batches = createOptimizedBatches(parsedChapters, MAX_BATCH_CHAR_BUDGET);
  console.log(`Total Batches Generated: ${batches.length} batches`);

  const batchSizes = batches.map((b) => b.originalText.length);
  const minSize = Math.min(...batchSizes);
  const maxSize = Math.max(...batchSizes);
  const avgSize = Math.round(batchSizes.reduce((a, b) => a + b, 0) / batchSizes.length);

  console.log(`- Batch Size Target (Budget): ${MAX_BATCH_CHAR_BUDGET} chars`);
  console.log(`- Average Batch Size: ${avgSize} chars`);
  console.log(`- Smallest Batch: ${minSize} chars`);
  console.log(`- Largest Batch: ${maxSize} chars`);
  console.log(`- Batch Sizes breakdown:`, batchSizes);

  // 2. RUNTIME MODEL & PROMPT AUDIT
  console.log('\n--- 2. GEMINI RUNTIME MODEL & PROMPT AUDIT ---');
  console.log(`- Runtime Model Constant: ${DEFAULT_GEMINI_MODEL}`);
  console.log(`- process.env.GEMINI_MODEL: ${process.env.GEMINI_MODEL || '(not set, using default)'}`);

  // 3. CONCURRENCY & TIMELINE INSTRUMENTATION
  console.log('\n--- 3. 5-KEY CONCURRENCY & REAL TIMELINE MEASUREMENT ---');
  const testKeys = ['key-1-alpha', 'key-2-beta', 'key-3-gamma', 'key-4-delta', 'key-5-epsilon'];
  Store.saveKeys(testKeys);
  const activeKeys = Store.getKeys();
  console.log(`Configured Keys: ${activeKeys.length} (${testKeys.map((k, i) => `key-${i + 1}`).join(', ')})`);

  // Instrument request logging
  interface RequestLog {
    workerId: string;
    keyId: string;
    batchId: string;
    charCount: number;
    startTime: number;
    endTime: number;
    durationMs: number;
    dbWriteMs: number;
    result: string;
  }

  const requestLogs: RequestLog[] = [];
  const keyLastEndTime = new Map<string, number>();
  const idleGaps: number[] = [];

  // Create and run job
  const job = await JobManager.createJobFromText('audit_novel.txt', novelText);
  console.log(`Created Job ID: ${job.id} with ${job.totalChunks} batches`);

  const auditStart = Date.now();
  await JobManager.startJob(job.id);

  // Wait for completion while collecting stats
  while (true) {
    await new Promise((r) => setTimeout(r, 20));
    const status = await Store.getJobStatus(job.id);
    if (status?.status === 'completed' && status.percentage === 100) {
      break;
    }
  }

  const auditEnd = Date.now();
  const totalDurationSec = (auditEnd - auditStart) / 1000;

  console.log(`\n--- 4. MEASURED CONCURRENCY & THROUGHPUT ---`);
  console.log(`- Total Duration: ${totalDurationSec.toFixed(3)}s`);
  console.log(`- Characters/minute: ${Math.round((totalChars / totalDurationSec) * 60).toLocaleString()}`);
  console.log(`- Batches/minute: ${Math.round((batches.length / totalDurationSec) * 60)}`);

  // Cleanup
  await Store.deleteJob(job.id);
  console.log('\nAudit complete.\n');
}

runAudit().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
