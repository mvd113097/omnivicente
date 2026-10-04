import fs from 'fs';
import path from 'path';
import { Store } from './store.js';
import { TranslationScheduler } from './scheduler.js';

const API_BASE = 'http://localhost:3000/api';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runReuploadTest() {
  console.log('\n================================================================');
  console.log('🧪 TESTING RE-UPLOADING PREVIOUSLY TRANSLATED NOVEL');
  console.log('================================================================\n');

  // Configure test keys over HTTP
  const keysRes = await fetch(`${API_BASE}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: ['test-key-1', 'test-key-2', 'test-key-3', 'test-key-4', 'test-key-5'] }),
  });
  if (!keysRes.ok) throw new Error('Failed to set test keys via API');

  const novelText = `
第一章 破茧成蝶
少年屹立于绝壁之上，手握寒铁长剑，剑指苍穹。风云在四周奔涌，灵力如潮水般注入九霄。

第二章 剑起风云
剑光化作九道长龙，破开云雾，斩断了束缚多年的修真桎梏。

第三章 踏入沧海
漫漫修真路，唯有初心不可负。少年踏浪而行，迎向浩瀚沧海。
`;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="reupload_novel.txt"\r\n`;
  body += `Content-Type: text/plain\r\n\r\n`;
  body += novelText;
  body += `\r\n--${boundary}--\r\n`;

  // STEP 1: First Upload & Full Translation
  console.log('STEP 1: Uploading novel for the 1st time...');
  const uploadRes1 = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.from(body),
  });
  if (!uploadRes1.ok) throw new Error(`Upload 1 failed: ${uploadRes1.status}`);
  const uploadData1 = await uploadRes1.json();
  const job1Id = uploadData1.job.id;

  console.log(`✅ Job 1 created with ID: ${job1Id}`);
  console.log(`   Job 1 initial completed chunks: ${uploadData1.job.completedChunks} / ${uploadData1.job.totalChunks}`);

  console.log('\nStarting translation for Job 1...');
  await fetch(`${API_BASE}/jobs/${job1Id}/start`, { method: 'POST' });

  // Wait for Job 1 to complete
  let job1Status: any = null;
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    const res = await fetch(`${API_BASE}/jobs/${job1Id}/status`);
    job1Status = await res.json();
    if (job1Status.status === 'completed') break;
  }

  console.log(`✅ Job 1 Translation Completed! Status: "${job1Status.status}", Words: ${job1Status.translatedWords}`);
  if (job1Status.status !== 'completed') {
    throw new Error('Job 1 failed to reach completed status');
  }

  // STEP 2: Re-upload the exact same novel again
  console.log('\nSTEP 2: Re-uploading the EXACT SAME novel (reupload_novel.txt) for the 2nd time...');
  const uploadRes2 = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.from(body),
  });
  if (!uploadRes2.ok) throw new Error(`Upload 2 failed: ${uploadRes2.status}`);
  const uploadData2 = await uploadRes2.json();
  const job2Id = uploadData2.job.id;

  console.log(`✅ Job 2 created with NEW Unique ID: ${job2Id}`);
  console.log(`   Job 1 ID: ${job1Id}`);
  console.log(`   Job 2 ID: ${job2Id}`);

  // Assert unique IDs
  if (job1Id === job2Id) {
    throw new Error('Re-upload failed: Job 2 received the same ID as Job 1!');
  }

  // Assert fresh initial status (0% complete)
  console.log(`   Job 2 initial status: "${uploadData2.job.status}"`);
  console.log(`   Job 2 initial completed chunks: ${uploadData2.job.completedChunks} / ${uploadData2.job.totalChunks}`);
  console.log(`   Job 2 initial translated words: ${uploadData2.job.translatedWords}`);

  if (uploadData2.job.status !== 'pending') {
    throw new Error(`Expected Job 2 status "pending", got "${uploadData2.job.status}"`);
  }
  if (uploadData2.job.completedChunks !== 0) {
    throw new Error(`Expected Job 2 completedChunks to be 0, got ${uploadData2.job.completedChunks}`);
  }

  // STEP 3: Translate Job 2 from beginning to end
  console.log('\nSTEP 3: Starting translation for Job 2 from scratch (beginning to end)...');
  await fetch(`${API_BASE}/jobs/${job2Id}/start`, { method: 'POST' });

  let job2Status: any = null;
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    const res = await fetch(`${API_BASE}/jobs/${job2Id}/status`);
    job2Status = await res.json();
    if (job2Status.status === 'completed') break;
  }

  console.log(`✅ Job 2 Translation Completed from scratch!`);
  console.log(`   Job 2 Final Status: "${job2Status.status}"`);
  console.log(`   Job 2 Final Completed Chunks: ${job2Status.completedChunks} / ${job2Status.totalChunks}`);
  console.log(`   Job 2 Final Translated Words: ${job2Status.translatedWords}`);

  if (job2Status.status !== 'completed' || job2Status.completedChunks !== job2Status.totalChunks) {
    throw new Error('Job 2 failed to translate cleanly from beginning to end!');
  }

  // STEP 4: Verify Both Jobs Persist Independently on Server
  console.log('\nSTEP 4: Verifying both Job 1 and Job 2 remain stored independently...');
  const checkJob1 = await (await fetch(`${API_BASE}/jobs/${job1Id}/status`)).json();
  const checkJob2 = await (await fetch(`${API_BASE}/jobs/${job2Id}/status`)).json();

  console.log(`   Job 1 Status on disk: "${checkJob1.status}", Words: ${checkJob1.translatedWords}`);
  console.log(`   Job 2 Status on disk: "${checkJob2.status}", Words: ${checkJob2.translatedWords}`);

  if (checkJob1.status !== 'completed' || checkJob2.status !== 'completed') {
    throw new Error('Jobs failed independent storage verification!');
  }

  console.log('\n================================================================');
  console.log('🎉 RE-UPLOAD TEST PASSED 100%! FRESH TRANSLATION VERIFIED! ✅');
  console.log('================================================================\n');
  return true;
}

runReuploadTest().catch((err) => {
  console.error('\n❌ Re-upload Test Failed:', err);
  process.exit(1);
});
