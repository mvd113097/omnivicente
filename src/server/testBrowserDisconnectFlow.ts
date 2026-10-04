import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { Store } from './store.js';
import { TranslationScheduler } from './scheduler.js';

const API_BASE = 'http://localhost:3000/api';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBrowserDisconnectTest() {
  console.log('\n================================================================');
  console.log('🧪 SIMULATING BROWSER DISCONNECT & BACKGROUND TRANSLATION TEST');
  console.log('================================================================\n');

  // 1. Ensure test keys are configured for simulation
  Store.saveKeys(['test-key-1', 'test-key-2', 'test-key-3', 'test-key-4', 'test-key-5']);
  TranslationScheduler.getInstance().refreshKeys();

  // 2. Generate a 10-chapter Chinese novel (~15,000 characters)
  let chineseNovelText = '';
  for (let ch = 1; ch <= 10; ch++) {
    chineseNovelText += `第${ch}章 修真秘境\n`;
    chineseNovelText += `云雾缭绕的山峰之上，修真者绝立于绝壁之巅。清风拂过衣角，长剑出鞘，剑光如龙贯穿天地。\n`;
    chineseNovelText += `天地灵气汇聚于元海之中，突破瓶颈的契机终于降临。少年的眼神坚定无比，踏上了漫长而艰辛的修真之路。\n\n`;
  }

  // STEP 1: Upload Novel
  console.log('STEP 1: Uploading Chinese novel (browser_disconnect_novel.txt)...');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="browser_disconnect_novel.txt"\r\n`;
  body += `Content-Type: text/plain\r\n\r\n`;
  body += chineseNovelText;
  body += `\r\n--${boundary}--\r\n`;

  const uploadRes = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.from(body),
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed with status ${uploadRes.status}`);
  }

  const uploadData = await uploadRes.json();
  const jobId = uploadData.job.id;
  console.log(`✅ Upload successful! Job ID: ${jobId}`);
  console.log(`   Filename: ${uploadData.job.filename}`);
  console.log(`   Chapters Detected: ${uploadData.job.totalChapters}`);
  console.log(`   Chunks Partitioned: ${uploadData.job.totalChunks}`);

  // STEP 2: Start Translation
  console.log('\nSTEP 2: Starting translation...');
  const startRes = await fetch(`${API_BASE}/jobs/${jobId}/start`, { method: 'POST' });
  if (!startRes.ok) {
    throw new Error(`Start translation failed with status ${startRes.status}`);
  }
  console.log('✅ Translation started on background workers.');

  // STEP 3: Close Browser (Zero HTTP Polling)
  console.log('\nSTEP 3: 🙈 [SIMULATING BROWSER CLOSE] Client disconnects completely. Zero requests sent for 2 seconds...');
  await sleep(100); // Give workers time to pick up chunks

  // STEP 4: Open Browser Mid-Translation to Check Progress
  console.log('\nSTEP 4: 👁️ [SIMULATING BROWSER REOPEN] Reopening app to verify English word count and progress...');
  const midStatusRes = await fetch(`${API_BASE}/jobs/${jobId}/status`);
  if (!midStatusRes.ok) {
    throw new Error(`Failed to fetch mid-translation status: ${midStatusRes.status}`);
  }
  const midStatus = await midStatusRes.json();

  console.log('✅ Status retrieved successfully on browser reopen:');
  console.log(`   Status: "${midStatus.status}"`);
  console.log(`   Chunks Progress: ${midStatus.completedChunks} / ${midStatus.totalChunks} (${midStatus.percentage}%)`);
  console.log(`   Completed Chapters: ${midStatus.completedChapters} / ${midStatus.totalChapters}`);
  console.log(`   Translated English Words Ready: ${midStatus.translatedWords.toLocaleString()} words`);
  console.log(`   Contiguous Exportable Chapters: ${midStatus.exportableChapters}`);

  if (midStatus.translatedWords <= 0) {
    throw new Error('Expected English word count > 0 when reopening browser mid-translation!');
  }

  // STEP 5: Close Browser Again & Wait for Completion
  console.log('\nSTEP 5: 🙈 [SIMULATING BROWSER CLOSE AGAIN] Closing browser again. Server continues translating autonomously...');
  
  let finalStatus: any = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(200);
    const sRes = await fetch(`${API_BASE}/jobs/${jobId}/status`);
    finalStatus = await sRes.json();
    if (finalStatus.status === 'completed') {
      break;
    }
  }

  console.log('\nSTEP 6: 👁️ [SIMULATING FINAL BROWSER REOPEN] Translation finished completely!');
  console.log(`   Final Status: "${finalStatus.status}"`);
  console.log(`   Total Chapters Completed: ${finalStatus.completedChapters} / ${finalStatus.totalChapters}`);
  console.log(`   Final Translated Word Count: ${finalStatus.translatedWords.toLocaleString()} words`);

  if (finalStatus.status !== 'completed') {
    throw new Error(`Expected final status to be "completed", got "${finalStatus.status}"`);
  }

  // STEP 7: Download Completed EPUB & Validate Structure
  console.log('\nSTEP 7: 📥 Downloading completed EPUB novel...');
  const epubRes = await fetch(`${API_BASE}/jobs/${jobId}/export/epub`);
  if (!epubRes.ok) {
    throw new Error(`EPUB download failed with status ${epubRes.status}`);
  }

  const epubBuffer = Buffer.from(await epubRes.arrayBuffer());
  console.log(`✅ EPUB Downloaded successfully (${(epubBuffer.length / 1024).toFixed(1)} KB)`);

  // Inspect EPUB archive internals with JSZip
  const zip = await JSZip.loadAsync(epubBuffer);
  const zipFiles = Object.keys(zip.files);

  console.log('✅ Inspecting EPUB structure...');
  console.log(`   Found ${zipFiles.length} files in EPUB package:`, zipFiles);

  // Validate mimetype, container.xml, content.opf
  if (!zip.file('mimetype')) throw new Error('EPUB missing mimetype file');
  if (!zip.file('META-INF/container.xml')) throw new Error('EPUB missing META-INF/container.xml');
  if (!zip.file('OEBPS/content.opf')) throw new Error('EPUB missing OEBPS/content.opf');
  if (!zip.file('OEBPS/nav.xhtml')) throw new Error('EPUB missing OEBPS/nav.xhtml');

  // Validate Chapter Content inside EPUB
  const ch1File = zip.file('OEBPS/ch_1.xhtml');
  if (!ch1File) throw new Error('EPUB missing OEBPS/ch_1.xhtml');

  const ch1Text = await ch1File.async('text');
  console.log('\n📖 EPUB Chapter 1 Sample Content (first 250 chars):');
  console.log('----------------------------------------------------');
  console.log(ch1Text.slice(0, 250) + '...');
  console.log('----------------------------------------------------');

  if (!ch1Text.includes('[Translated EN]')) {
    throw new Error('EPUB Chapter 1 does not contain translated English content!');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL DISCONNECT & EPUB DOWNLOAD TESTS PASSED SUCCESSFULLY! ✅');
  console.log('================================================================\n');
  return true;
}

// Execute test if run directly
runBrowserDisconnectTest().catch((err) => {
  console.error('\n❌ Browser Disconnect Test Failed:', err);
  process.exit(1);
});
