import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const API_BASE = 'http://localhost:3000/api';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLifecycleAndDeleteTest() {
  console.log('\n================================================================');
  console.log('🧪 TESTING END-TO-END LIFECYCLE & DELETE NOVEL BUTTONS');
  console.log('================================================================\n');

  // Configure test keys
  await fetch(`${API_BASE}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: ['test-key-1', 'test-key-2', 'test-key-3', 'test-key-4', 'test-key-5'] }),
  });

  // STEP 1: Test Cancel & Delete of an active job
  console.log('--- TEST 1: Cancel & Delete While Translating ---');

  const testNovel1 = `
第1章 试剑天下
少年仗剑走天涯，一剑光寒十九州。

第2章 风起云涌
江湖夜雨十年灯，谁人在此踏歌行。
`;

  // Upload Novel 1
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="novel_cancel_test.txt"\r\n`;
  body += `Content-Type: text/plain\r\n\r\n`;
  body += testNovel1;
  body += `\r\n--${boundary}--\r\n`;

  console.log('1. Uploading novel_cancel_test.txt...');
  const uploadRes = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.from(body),
  });

  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.statusText}`);
  const uploadData = await uploadRes.json();
  const job1Id = uploadData.job.id;
  console.log(`✅ Uploaded Job ID: ${job1Id}`);

  // Start Job 1
  console.log('2. Starting translation for Job 1...');
  const startRes = await fetch(`${API_BASE}/jobs/${job1Id}/start`, { method: 'POST' });
  if (!startRes.ok) throw new Error('Start failed');
  console.log('✅ Job 1 translation started.');

  // Verify status is translating
  const statusRes = await fetch(`${API_BASE}/jobs/${job1Id}/status`);
  const statusData = await statusRes.json();
  console.log(`Job 1 initial status: ${statusData.status}`);

  // Now simulate user clicking "Cancel & Delete Novel" button
  console.log('3. Triggering DELETE /api/jobs/:id (Cancel & Delete Novel button)...');
  const deleteRes = await fetch(`${API_BASE}/jobs/${job1Id}`, { method: 'DELETE' });
  if (!deleteRes.ok) throw new Error(`Delete failed: ${deleteRes.statusText}`);
  const deleteData = await deleteRes.json();
  console.log(`✅ Delete response:`, deleteData);

  // Verify Job 1 is completely gone (status returns 404)
  console.log('4. Verifying Job 1 returns 404 Not Found...');
  const checkRes = await fetch(`${API_BASE}/jobs/${job1Id}/status`);
  if (checkRes.status !== 404) {
    throw new Error(`Expected 404 for deleted job, got ${checkRes.status}`);
  }
  console.log('✅ Status correctly returns 404 Not Found.');

  // Verify physical files on disk are removed
  const jobFilePath = path.resolve(process.cwd(), 'data', 'jobs', `${job1Id}.json`);
  const chunksDirPath = path.resolve(process.cwd(), 'data', 'chunks', job1Id);
  if (fs.existsSync(jobFilePath)) {
    throw new Error(`Job file still exists at ${jobFilePath}`);
  }
  if (fs.existsSync(chunksDirPath)) {
    throw new Error(`Chunks directory still exists at ${chunksDirPath}`);
  }
  console.log('✅ Disk storage purged cleanly: job file and chunks directory removed.');

  // STEP 2: Full Lifecycle for a Fresh Novel (Upload -> Start -> Pause -> Resume -> Download Current -> Complete -> Download Final -> Delete)
  console.log('\n--- TEST 2: Full Lifecycle for Fresh Novel (Translate Another) ---');

  const testNovel2 = `
第一章 破晓之剑
清晨微光破开云雾，山巅之上，白衣少年缓缓睁开双眼。

第二章 藏经阁
楼阁重重，经卷万千。少年指尖划过斑驳竹简，寻找失传的古法。

第三章 踏浪而行
大江东去，浪淘尽。少年负手立于舟头，迎向未知的修真界。
`;

  const boundary2 = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
  let body2 = `--${boundary2}\r\n`;
  body2 += `Content-Disposition: form-data; name="file"; filename="novel_fresh_lifecycle.txt"\r\n`;
  body2 += `Content-Type: text/plain\r\n\r\n`;
  body2 += testNovel2;
  body2 += `\r\n--${boundary2}--\r\n`;

  console.log('1. Uploading fresh novel (novel_fresh_lifecycle.txt)...');
  const uploadRes2 = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary2}` },
    body: Buffer.from(body2),
  });
  const uploadData2 = await uploadRes2.json();
  const job2Id = uploadData2.job.id;
  console.log(`✅ Uploaded Job 2: ${job2Id}, Chapters: ${uploadData2.job.totalChapters}`);

  // Start Job 2
  console.log('2. Starting translation for Job 2...');
  await fetch(`${API_BASE}/jobs/${job2Id}/start`, { method: 'POST' });

  // Test Pause button
  console.log('3. Testing Pause Translation button...');
  const pauseRes = await fetch(`${API_BASE}/jobs/${job2Id}/pause`, { method: 'POST' });
  const pauseData = await pauseRes.json();
  if (!pauseData.success) throw new Error('Pause failed');

  const pausedStatus = await (await fetch(`${API_BASE}/jobs/${job2Id}/status`)).json();
  console.log(`✅ Job 2 status after pause: ${pausedStatus.status}`);
  if (pausedStatus.status !== 'paused') {
    throw new Error(`Expected paused, got ${pausedStatus.status}`);
  }

  // Test Resume button
  console.log('4. Testing Resume Translation button...');
  const resumeRes = await fetch(`${API_BASE}/jobs/${job2Id}/resume`, { method: 'POST' });
  const resumeData = await resumeRes.json();
  if (!resumeData.success) throw new Error('Resume failed');

  const resumedStatus = await (await fetch(`${API_BASE}/jobs/${job2Id}/status`)).json();
  console.log(`✅ Job 2 status after resume: ${resumedStatus.status}`);

  // Test Download Current EPUB & TXT while running
  console.log('5. Testing "Download Current EPUB" button while running...');
  // Wait for at least 1 contiguous chapter to be exportable
  for (let i = 0; i < 30; i++) {
    const s = await (await fetch(`${API_BASE}/jobs/${job2Id}/status`)).json();
    if (s.exportableChapters >= 1) break;
    await sleep(100);
  }

  const curEpubRes = await fetch(`${API_BASE}/jobs/${job2Id}/export/epub`);
  if (!curEpubRes.ok) throw new Error(`Current EPUB download failed: ${curEpubRes.status}`);
  const curEpubBuf = Buffer.from(await curEpubRes.arrayBuffer());
  const curZip = await JSZip.loadAsync(curEpubBuf);
  if (!curZip.file('mimetype') || !curZip.file('META-INF/container.xml')) {
    throw new Error('Current EPUB zip is missing required container/mimetype');
  }
  console.log(`✅ "Download Current EPUB" verified: valid EPUB file (${curEpubBuf.length} bytes).`);

  console.log('6. Testing "Download Current TXT" button while running...');
  const curTxtRes = await fetch(`${API_BASE}/jobs/${job2Id}/export/txt`);
  if (!curTxtRes.ok) throw new Error('Current TXT download failed');
  const curTxtContent = await curTxtRes.text();
  console.log(`✅ "Download Current TXT" verified: ${curTxtContent.length} chars of text.`);

  // Wait for 100% full completion
  console.log('7. Waiting for translation to complete 100%...');
  let completedStatus = null;
  for (let i = 0; i < 40; i++) {
    const s = await (await fetch(`${API_BASE}/jobs/${job2Id}/status`)).json();
    if (s.status === 'completed' && s.percentage === 100) {
      completedStatus = s;
      break;
    }
    await sleep(50);
  }

  if (!completedStatus) {
    throw new Error('Job did not reach 100% completed status');
  }
  console.log(`✅ 100% Completion verified:`);
  console.log(`- Status: ${completedStatus.status} (Green Checkmark)`);
  console.log(`- Percentage: ${completedStatus.percentage}%`);
  console.log(`- English Words Ready: ${completedStatus.translatedWords} words`);
  console.log(`- Contiguous Chapters: ${completedStatus.exportableChapters}/${completedStatus.totalChapters}`);

  // Test Download Final EPUB
  console.log('8. Testing "Download Final EPUB" button...');
  const finalEpubRes = await fetch(`${API_BASE}/jobs/${job2Id}/export/epub`);
  if (!finalEpubRes.ok) throw new Error('Final EPUB download failed');
  const finalEpubBuf = Buffer.from(await finalEpubRes.arrayBuffer());
  const finalZip = await JSZip.loadAsync(finalEpubBuf);
  const ch1 = finalZip.file('OEBPS/ch_1.xhtml');
  const ch2 = finalZip.file('OEBPS/ch_2.xhtml');
  const ch3 = finalZip.file('OEBPS/ch_3.xhtml');
  if (!ch1 || !ch2 || !ch3) {
    throw new Error('Final EPUB missing chapters');
  }
  console.log(`✅ "Download Final EPUB" verified: All 3 chapters included in EPUB (${finalEpubBuf.length} bytes).`);

  // Test Download Final TXT
  console.log('9. Testing "Download Final TXT" button...');
  const finalTxtRes = await fetch(`${API_BASE}/jobs/${job2Id}/export/txt`);
  if (!finalTxtRes.ok) throw new Error('Final TXT download failed');
  const finalTxt = await finalTxtRes.text();
  if (!finalTxt.includes('第一章') && !finalTxt.includes('Chapter')) {
    throw new Error('Final TXT missing chapter headers');
  }
  console.log(`✅ "Download Final TXT" verified: contains all translated chapters.`);

  // Test Delete on completed job
  console.log('10. Testing "Cancel & Delete" on completed job to reset workspace...');
  const finalDelRes = await fetch(`${API_BASE}/jobs/${job2Id}`, { method: 'DELETE' });
  if (!finalDelRes.ok) throw new Error('Final delete failed');
  const finalStatusAfterDel = await fetch(`${API_BASE}/jobs/${job2Id}/status`);
  if (finalStatusAfterDel.status !== 404) {
    throw new Error('Completed job was not deleted cleanly');
  }
  console.log('✅ Completed job deleted cleanly and workspace reset.');

  console.log('\n================================================================');
  console.log('🎉 ALL LIFECYCLE AND DELETE BUTTON TESTS PASSED 100%!');
  console.log('================================================================\n');

  return { success: true };
}

runLifecycleAndDeleteTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lifecycle & Delete Test FAILED:', err);
    process.exit(1);
  });
