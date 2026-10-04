import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { JobManager } from './src/server/jobManager.js';
import { Store } from './src/server/store.js';
import { TranslationScheduler } from './src/server/scheduler.js';
import { generateContiguousEpub, generateContiguousTxt } from './src/server/epubGenerator.js';
import { runAllAutomatedTests } from './src/server/tests.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Configure multer for TXT file uploads (up to 50MB for 1M+ character novels)
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

app.use(express.json());

// API Routes

// 1. Upload TXT Novel
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please upload a .txt file.' });
    }

    const filename = req.file.originalname || 'novel.txt';
    // Decode Chinese text (UTF-8 or GB18030/GBK fallback)
    let content = req.file.buffer.toString('utf-8');

    // Remove BOM if present
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }

    if (!content.trim()) {
      return res.status(400).json({ error: 'The uploaded file is empty.' });
    }

    const job = await JobManager.createJobFromText(filename, content);
    res.json({ success: true, job });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process file' });
  }
});

// 2. Start Translation
app.post('/api/jobs/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await JobManager.startJob(id);
    if (!success) {
      const keys = Store.getKeys();
      if (keys.length === 0) {
        return res.status(400).json({
          error: 'No Gemini API keys configured. Please add at least one Gemini key in Settings.',
        });
      }
      return res.status(400).json({ error: 'Failed to start translation job.' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Pause Translation
app.post('/api/jobs/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await JobManager.pauseJob(id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Resume Translation
app.post('/api/jobs/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await JobManager.resumeJob(id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4.1 Delete / Cancel Job
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await JobManager.deleteJob(id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Lightweight Status Polling (Mobile-Data Saving with ETag & 304 Not Modified)
app.get('/api/jobs/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const status = await Store.getJobStatus(id);
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Generate ETag based on completed count, status, exportable count, updatedAt
    const etag = `"${status.id}-${status.status}-${status.completedChunks}-${status.exportableChapters}-${status.updatedAt}"`;

    if (req.headers['if-none-match'] === etag) {
      // Data hasn't changed -> save mobile data!
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. List Recent Jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Store.listJobs();
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Download Never-Skip EPUB (Current or Final)
app.get('/api/jobs/:id/export/epub', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Store.getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { buffer, chapterCount } = await generateContiguousEpub(id);
    if (chapterCount === 0) {
      return res.status(400).json({ error: 'No completed contiguous chapters are available yet.' });
    }

    const safeTitle = (job.filename.replace(/\.txt$/i, '') || 'novel')
      .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    const downloadName = `${safeTitle}_Ch1-${chapterCount}.epub`;

    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: any) {
    console.error('EPUB Export error:', err);
    res.status(500).json({ error: err.message || 'Failed to export EPUB' });
  }
});

// 8. Download Never-Skip TXT (Current or Final)
app.get('/api/jobs/:id/export/txt', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Store.getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { text, chapterCount } = await generateContiguousTxt(id);
    if (chapterCount === 0) {
      return res.status(400).json({ error: 'No completed contiguous chapters are available yet.' });
    }

    const safeTitle = (job.filename.replace(/\.txt$/i, '') || 'novel')
      .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    const downloadName = `${safeTitle}_Ch1-${chapterCount}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    res.send(text);
  } catch (err: any) {
    console.error('TXT Export error:', err);
    res.status(500).json({ error: err.message || 'Failed to export TXT' });
  }
});

import { sendTelegramTest } from './src/server/telegram.js';

// 9. Get Configured Keys (Masked)
app.get('/api/keys', (req, res) => {
  const keys = Store.getKeys();
  const masked = keys.map((k, index) => {
    if (k.length <= 8) return `Key ${index + 1} (••••••••)`;
    return `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
  });
  res.json({
    count: keys.length,
    keys: masked,
  });
});

// 10. Update Configured Keys (Up to 5)
app.post('/api/keys', (req, res) => {
  const { keys } = req.body;
  if (!Array.isArray(keys)) {
    return res.status(400).json({ error: 'keys must be an array of strings' });
  }
  const validKeys = keys.filter((k) => typeof k === 'string' && k.trim().length > 0).slice(0, 5);
  Store.saveKeys(validKeys);
  TranslationScheduler.getInstance().refreshKeys();
  res.json({ success: true, count: validKeys.length });
});

// 11. Get Telegram Notification Settings
app.get('/api/telegram', (req, res) => {
  const settings = Store.getTelegramSettings();
  res.json(settings);
});

// 12. Save Telegram Notification Settings
app.post('/api/telegram', (req, res) => {
  const { botToken, chatIds, notifyStart, notifyProgress, notifyComplete } = req.body;
  const ids = Array.isArray(chatIds)
    ? chatIds
    : typeof chatIds === 'string'
    ? chatIds.split(/[\s,;]+/).filter(Boolean)
    : [];

  Store.saveTelegramSettings({
    botToken: botToken || '',
    chatIds: ids.slice(0, 2),
    notifyStart: notifyStart !== false,
    notifyProgress: notifyProgress !== false,
    notifyComplete: notifyComplete !== false,
  });

  res.json({ success: true, settings: Store.getTelegramSettings() });
});

// 13. Test Telegram Notification Connection
app.post('/api/telegram/test', async (req, res) => {
  try {
    const { botToken, chatIds } = req.body;
    const ids = Array.isArray(chatIds)
      ? chatIds
      : typeof chatIds === 'string'
      ? chatIds.split(/[\s,;]+/).filter(Boolean)
      : [];

    const result = await sendTelegramTest(botToken || '', ids);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Test failed' });
  }
});

// 11. Run Automated Test Suite
app.post('/api/test/run', async (req, res) => {
  try {
    const results = await runAllAutomatedTests();
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start dev or production server
async function bootstrap() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Omni Translator] Server running on http://0.0.0.0:${PORT}`);
    // Recover any interrupted jobs from previous run (Crash/restart recovery)
    await TranslationScheduler.getInstance().recoverOnStartup();
  });
}

bootstrap().catch((err) => {
  console.error('[Omni Translator] Bootstrap failed:', err);
  process.exit(1);
});
