import { TranslationScheduler } from './scheduler.js';
import { Store } from './store.js';
import { generateContiguousEpub } from './epubGenerator.js';
import JSZip from 'jszip';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function finishRealJob() {
  const jobId = 'job_1791109932416_z8am2';
  console.log(`\n--- RESUMING REAL TRANSLATION FOR ${jobId} ---`);

  const scheduler = TranslationScheduler.getInstance();
  await scheduler.startJob(jobId);

  // Monitor until complete
  console.log('Translating remaining chapters with real Gemini model...');
  let status: any = null;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    status = await Store.getJobStatus(jobId);
    if (!status) break;

    console.log(
      `Progress: ${status.completedChunks}/${status.totalChunks} chunks (${status.percentage}%) | Words: ${status.translatedWords} | Exportable: Ch 1-${status.exportableChapters}`
    );

    if (status.status === 'completed' && status.percentage === 100) {
      break;
    }
  }

  if (!status || status.status !== 'completed') {
    throw new Error('Translation did not complete');
  }

  console.log('\n================================================================');
  console.log('🎉 100% COMPLETE! INSPECTING FINAL GENERATED EPUB');
  console.log('================================================================');

  const epub = await generateContiguousEpub(jobId);
  console.log(`Final EPUB Size: ${epub.buffer.length} bytes`);
  console.log(`Total Contiguous Chapters: ${epub.chapterCount}`);

  const zip = await JSZip.loadAsync(epub.buffer);
  const mimetype = await zip.file('mimetype')?.async('string');
  console.log(`Mimetype: ${mimetype}`);

  const nav = await zip.file('OEBPS/nav.xhtml')?.async('string');
  console.log(`EPUB 3 Table of Contents Nav:\n${nav}\n`);

  for (let i = 1; i <= epub.chapterCount; i++) {
    const chFile = zip.file(`OEBPS/ch_${i}.xhtml`);
    if (chFile) {
      const text = await chFile.async('string');
      const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const words = clean.split(/\s+/).length;
      console.log(`\n--- CHAPTER ${i} (${words} words) ---`);
      console.log(clean.slice(0, 300) + '...\n');
    }
  }

  console.log('\n✅ VERIFICATION COMPLETE: REAL NOVEL TRANSLATION SUCCEEDED!');
}

finishRealJob().then(() => process.exit(0)).catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
