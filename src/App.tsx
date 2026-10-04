import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Play,
  Pause,
  Download,
  Settings,
  Send,
  Bell,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sliders,
  Check,
  ChevronRight,
  ShieldCheck,
  BookOpen,
  Trash2
} from 'lucide-react';

interface JobStatus {
  id: string;
  filename: string;
  status: 'pending' | 'translating' | 'paused' | 'completed' | 'failed';
  totalChapters: number;
  completedChapters: number;
  exportableChapters: number;
  totalChunks: number;
  completedChunks: number;
  percentage: number;
  translatedWords: number;
  contiguousTranslatedWords: number;
  error?: string | null;
  updatedAt: number;
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export default function App() {
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    return localStorage.getItem('omni_active_job_id');
  });
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settings & Telegram State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatIds, setTelegramChatIds] = useState('');
  const [notifyStart, setNotifyStart] = useState(true);
  const [notifyProgress, setNotifyProgress] = useState(true);
  const [notifyComplete, setNotifyComplete] = useState(true);
  const [notifyPause, setNotifyPause] = useState(true);
  const [notifyResume, setNotifyResume] = useState(true);
  const [notifyError, setNotifyError] = useState(true);
  const [notifyWaiting, setNotifyWaiting] = useState(true);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestStatus, setTelegramTestStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState<'epub' | 'txt' | null>(null);
  const [testsModalOpen, setTestsModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastEtagRef = useRef<string | null>(null);

  // Fetch configured Telegram notification settings
  const fetchTelegramSettings = async () => {
    try {
      const res = await fetch('/api/telegram');
      if (res.ok) {
        const data = await res.json();
        setTelegramToken(data.botToken || '');
        setTelegramChatIds(Array.isArray(data.chatIds) ? data.chatIds.join(', ') : '');
        setNotifyStart(data.notifyStart !== false);
        setNotifyProgress(data.notifyProgress !== false);
        setNotifyComplete(data.notifyComplete !== false);
        setNotifyPause(data.notifyPause !== false);
        setNotifyResume(data.notifyResume !== false);
        setNotifyError(data.notifyError !== false);
        setNotifyWaiting(data.notifyWaiting !== false);
      }
    } catch (err) {
      console.error('Failed to fetch Telegram settings:', err);
    }
  };

  useEffect(() => {
    fetchTelegramSettings();
  }, []);

  const handleSaveTelegram = async () => {
    setIsSavingTelegram(true);
    setTelegramTestStatus(null);
    try {
      const chatIdsArr = telegramChatIds
        .split(/[\s,;]+/)
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 2);

      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: telegramToken.trim(),
          chatIds: chatIdsArr,
          notifyStart,
          notifyProgress,
          notifyComplete,
          notifyPause,
          notifyResume,
          notifyError,
          notifyWaiting,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save Telegram settings');
      }

      setTelegramTestStatus({
        success: true,
        message: 'Telegram settings saved successfully!',
      });
      setTimeout(() => {
        setSettingsModalOpen(false);
      }, 1200);
    } catch (err: any) {
      setTelegramTestStatus({
        success: false,
        message: err.message || 'Failed to save settings',
      });
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramTestStatus(null);
    try {
      const chatIdsArr = telegramChatIds
        .split(/[\s,;]+/)
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 2);

      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: telegramToken.trim(),
          chatIds: chatIdsArr,
        }),
      });

      const data = await res.json();
      setTelegramTestStatus({
        success: data.success,
        message: data.message || (data.success ? 'Test message sent!' : 'Test message failed.'),
      });
    } catch (err: any) {
      setTelegramTestStatus({
        success: false,
        message: err.message || 'Failed to send test message',
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // Lightweight status polling with ETag mobile-data saving
  const fetchStatus = useCallback(async (jobId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (lastEtagRef.current) {
        headers['If-None-Match'] = lastEtagRef.current;
      }

      const res = await fetch(`/api/jobs/${jobId}/status`, { headers });
      if (res.status === 304) {
        // Not modified! Zero unnecessary data downloaded.
        return;
      }

      if (res.ok) {
        const etag = res.headers.get('ETag');
        if (etag) lastEtagRef.current = etag;

        const data: JobStatus = await res.json();
        setJobStatus(data);
      } else if (res.status === 404) {
        // Job not found on server
        localStorage.removeItem('omni_active_job_id');
        setActiveJobId(null);
        setJobStatus(null);
      }
    } catch (err) {
      console.warn('Status fetch error:', err);
    }
  }, []);

  // Polling loop with document visibility awareness (Pauses when screen off / tab hidden)
  useEffect(() => {
    if (!activeJobId) return;

    let timer: NodeJS.Timeout | null = null;
    let isVisible = document.visibilityState === 'visible';

    const poll = async () => {
      if (isVisible && activeJobId) {
        await fetchStatus(activeJobId);
      }
    };

    // Initial fetch
    poll();

    // Set interval for polling (5 seconds while translating, 15 seconds otherwise)
    const intervalMs = jobStatus?.status === 'translating' ? 5000 : 15000;
    timer = setInterval(poll, intervalMs);

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible && activeJobId) {
        // Just returned to screen: perform immediate fresh fetch
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeJobId, jobStatus?.status, fetchStatus]);

  // Upload handler
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setErrorMessage('Please upload a plain text (.txt) Chinese novel file.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      let res: Response;

      // Compress large TXT uploads in the browser when gzip is supported.
      // Falls back to the normal multipart upload on older browsers.
      if ('CompressionStream' in window && file.size > 256 * 1024) {
        const CompressionStreamCtor = (window as any).CompressionStream;
        const compressedStream = file.stream().pipeThrough(new CompressionStreamCtor('gzip'));
        const compressedBlob = await new Response(compressedStream).blob();
        res = await fetch('/api/upload-compressed', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Omni-Content-Encoding': 'gzip',
            'X-Omni-Filename': encodeURIComponent(file.name),
          },
          body: compressedBlob,
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process file');
      }

      setActiveJobId(data.job.id);
      localStorage.setItem('omni_active_job_id', data.job.id);
      lastEtagRef.current = null;
      await fetchStatus(data.job.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Job Controls: Start, Pause, Resume
  const handleStart = async () => {
    if (!activeJobId) return;
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start translation');
      }
      lastEtagRef.current = null;
      await fetchStatus(activeJobId);
    } catch (err: any) {
      setErrorMessage(err.message);
      if (err.message.includes('Gemini API keys')) {
        setSettingsModalOpen(true);
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePause = async () => {
    if (!activeJobId) return;
    setIsActionLoading(true);
    try {
      await fetch(`/api/jobs/${activeJobId}/pause`, { method: 'POST' });
      lastEtagRef.current = null;
      await fetchStatus(activeJobId);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResume = async () => {
    if (!activeJobId) return;
    setIsActionLoading(true);
    try {
      await fetch(`/api/jobs/${activeJobId}/resume`, { method: 'POST' });
      lastEtagRef.current = null;
      await fetchStatus(activeJobId);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const executeCancelNovel = async () => {
    if (!activeJobId) return;
    setIsActionLoading(true);
    setDeleteConfirmOpen(false);
    try {
      await fetch(`/api/jobs/${activeJobId}`, { method: 'DELETE' });
      localStorage.removeItem('omni_active_job_id');
      setActiveJobId(null);
      setJobStatus(null);
      lastEtagRef.current = null;
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to cancel novel');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Safe client-side blob download (prevents iframe cookie_check.html interception)
  const handleDownload = async (format: 'epub' | 'txt') => {
    if (!jobStatus) return;
    setIsDownloading(format);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobStatus.id}/export/${format}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error || `Failed to download ${format.toUpperCase()}`);
      }

      const blob = await res.blob();
      const safeTitle = (jobStatus.filename.replace(/\.txt$/i, '') || 'novel')
        .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
      const filename = `${safeTitle}_Ch1-${jobStatus.exportableChapters}.${format}`;

      const blobUrl = window.URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();

      // Clean up after slight delay
      setTimeout(() => {
        if (downloadLink.parentNode) {
          downloadLink.parentNode.removeChild(downloadLink);
        }
        window.URL.revokeObjectURL(blobUrl);
      }, 500);
    } catch (err: any) {
      console.error('Download error:', err);
      setErrorMessage(err.message || `Failed to download ${format.toUpperCase()}`);
    } finally {
      setIsDownloading(null);
    }
  };



  // Run Test Suite
  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const res = await fetch('/api/test/run', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTestResults(data.results);
      }
    } catch (err) {
      console.error('Test run failed:', err);
    } finally {
      setIsRunningTests(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              Ω
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900">Omni Translator</h1>
                <span className="hidden xs:inline text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                  ZH → EN
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Chinese Web-Novel to Natural English EPUB/TXT
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setTestsModalOpen(true);
                if (!testResults) handleRunTests();
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              title="Run Automated Verification Tests"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Tests</span>
            </button>

            <button
              onClick={() => {
                setSettingsModalOpen(true);
                fetchTelegramSettings();
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Telegram Notifications & Settings"
            >
              <Settings className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Telegram</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5">
        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-3 text-sm text-rose-800">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-semibold px-2 py-0.5 rounded"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View 1: No Active Job - Upload TXT */}
        {!jobStatus && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-7 shadow-xs text-center">
            <div className="max-w-md mx-auto">
              <div className="w-11 h-11 mx-auto mb-2.5 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Upload className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1.5">Upload Chinese Novel TXT</h2>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Drop a TXT novel to start translating.
              </p>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-5 sm:p-6 cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/20"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                  }}
                />
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs sm:text-sm font-semibold text-slate-800">
                  {isUploading ? 'Ingesting and parsing chapters...' : 'Click to select or drag & drop TXT file'}
                </p>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-1">1M+ characters · compressed upload</p>
              </div>


            </div>
          </div>
        )}

        {/* View 2: Active Novel Job Dashboard */}
        {jobStatus && (
          <div className="space-y-3 sm:space-y-4">
            {/* Novel Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 truncate max-w-sm sm:max-w-md">
                      {jobStatus.filename}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      <span>{jobStatus.totalChapters} Chapters</span>
                      <span>·</span>
                      <span>{jobStatus.totalChunks} Chunks</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                      jobStatus.status === 'translating'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : jobStatus.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : jobStatus.status === 'paused'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {jobStatus.status === 'translating' && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    )}
                    {jobStatus.status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                    {jobStatus.status === 'paused' && <Pause className="w-3.5 h-3.5 text-amber-600" />}
                    {jobStatus.status === 'translating'
                      ? 'Translating'
                      : jobStatus.status === 'completed'
                      ? 'Complete'
                      : jobStatus.status === 'paused'
                      ? 'Paused'
                      : 'Ready'}
                  </span>
                </div>
              </div>

              {jobStatus.error && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  <strong>Server status:</strong> {jobStatus.error}
                </div>
              )}

              {/* Progress Bar & Tabular Numerals */}
              <div className="py-3">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-2 font-mono">
                  <span className="font-semibold text-slate-900">
                    {jobStatus.percentage}% TRANSLATED
                  </span>
                  <span>
                    {jobStatus.completedChunks} / {jobStatus.totalChunks} Chunks
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(2, jobStatus.percentage)}%` }}
                  />
                </div>

                {/* Contiguous Export & Word Count Info */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">English Words</span>
                    <span className="text-sm font-semibold font-mono text-blue-700">
                      {jobStatus.translatedWords ? jobStatus.translatedWords.toLocaleString() : '0'} words
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">Completed Chapters</span>
                    <span className="text-sm font-semibold font-mono text-slate-800">
                      {jobStatus.completedChapters} / {jobStatus.totalChapters}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">Contiguous</span>
                    <span className="text-sm font-semibold font-mono text-emerald-700">
                      {jobStatus.exportableChapters > 0
                        ? `Ch 1 – ${jobStatus.exportableChapters}`
                        : 'Translating Ch 1...'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">Server</span>
                    <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Persistent
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-3 text-center sm:text-left">
                  Server translation continues if you close the tab.
                </p>
              </div>

              {/* Primary Action Controls */}
              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2">
                  {jobStatus.status === 'pending' && (
                    <button
                      onClick={handleStart}
                      disabled={isActionLoading}
                      className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start Translation
                    </button>
                  )}

                  {jobStatus.status === 'translating' && (
                    <button
                      onClick={handlePause}
                      disabled={isActionLoading}
                      className="flex-1 sm:flex-none px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      Pause Translation
                    </button>
                  )}

                  {(jobStatus.status === 'paused' || jobStatus.status === 'failed') && (
                    <button
                      onClick={handleResume}
                      disabled={isActionLoading}
                      className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Resume Translation
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isActionLoading}
                  className="ml-auto px-2.5 py-2 text-xs text-rose-600 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200/80 rounded-xl transition-colors font-medium cursor-pointer flex items-center gap-1.5"
                  title="Delete this novel and reset workspace"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  Delete Novel
                </button>
              </div>
            </div>

            {/* DOWNLOAD SECTION (Prominent and clearly visible) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {jobStatus.status === 'completed'
                      ? 'Final Download'
                      : 'Current Progress'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {jobStatus.status === 'completed'
                      ? 'All chapters ready.'
                      : 'Only validated contiguous chapters are included.'}
                  </p>
                </div>

                <div className="text-[10px] sm:text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-200 shrink-0">
                  {jobStatus.exportableChapters} Contiguous Chapters Ready
                </div>
              </div>

              {jobStatus.exportableChapters === 0 ? (
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-center text-[10px] sm:text-xs text-slate-500">
                  Waiting for the first complete chapter.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownload('epub')}
                    disabled={isDownloading !== null}
                    className="p-2.5 sm:p-3 bg-blue-50/60 hover:bg-blue-100/60 border border-blue-200 rounded-xl flex items-center justify-between text-blue-900 transition-colors group cursor-pointer text-left disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                        {isDownloading === 'epub' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] sm:text-xs font-bold block truncate">
                          {jobStatus.status === 'completed'
                            ? 'Final EPUB'
                            : `EPUB · Ch 1–${jobStatus.exportableChapters}`}
                        </span>
                        <span className="text-[10px] text-blue-700/80">
                          {isDownloading === 'epub'
                            ? 'Preparing EPUB file...'
                            : 'Reader-ready'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload('txt')}
                    disabled={isDownloading !== null}
                    className="p-2.5 sm:p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-slate-900 transition-colors group cursor-pointer text-left disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0">
                        {isDownloading === 'txt' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] sm:text-xs font-bold block truncate">
                          {jobStatus.status === 'completed'
                            ? 'Final TXT'
                            : `TXT · Ch 1–${jobStatus.exportableChapters}`}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {isDownloading === 'txt'
                            ? 'Preparing TXT file...'
                            : 'Plain text'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Delete / Cancel Novel In-App Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center mb-1">
              Delete Novel?
            </h3>
            <p className="text-xs text-slate-500 text-center mb-5 leading-relaxed">
              This will stop background translation, remove this novel from the server, and clear your workspace so you can upload a new novel.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeCancelNovel}
                disabled={isActionLoading}
                className="flex-1 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isActionLoading ? 'Deleting...' : 'Delete Novel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Telegram Settings Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Telegram Notification Settings</h3>
                  <p className="text-[10px] text-slate-500">Configure bot notifications for translation updates</p>
                </div>
              </div>
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Telegram Bot Token Input */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Telegram Bot Token
                </label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 bg-slate-50/50 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block leading-tight">
                  Get your bot token from <strong>@BotFather</strong> on Telegram.
                </span>
              </div>

              {/* Telegram Chat IDs Input */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Telegram Chat IDs (Up to 2 IDs separated by comma)
                </label>
                <input
                  type="text"
                  placeholder="123456789, 987654321"
                  value={telegramChatIds}
                  onChange={(e) => setTelegramChatIds(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 bg-slate-50/50 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block leading-tight">
                  Separate 2 user/group IDs with a comma (e.g. <code>123456789, 987654321</code>).
                </span>
              </div>

              {/* Toggles Section */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="font-semibold text-slate-800 block text-[11px] mb-1">
                  Notification Triggers
                </span>

                <label className="flex items-center justify-between text-slate-700 cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-blue-600" />
                    Notify when translation starts
                  </span>
                  <input
                    type="checkbox"
                    checked={notifyStart}
                    onChange={(e) => setNotifyStart(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-slate-700 cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                    Status update every 5 minutes
                  </span>
                  <input
                    type="checkbox"
                    checked={notifyProgress}
                    onChange={(e) => setNotifyProgress(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-slate-700 cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Notify when translation completes
                  </span>
                  <input
                    type="checkbox"
                    checked={notifyComplete}
                    onChange={(e) => setNotifyComplete(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between text-slate-700 cursor-pointer">
                  <span className="flex items-center gap-1.5"><Pause className="w-3.5 h-3.5 text-amber-600" /> Notify when paused</span>
                  <input type="checkbox" checked={notifyPause} onChange={(e) => setNotifyPause(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 cursor-pointer" />
                </label>
                <label className="flex items-center justify-between text-slate-700 cursor-pointer">
                  <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5 text-blue-600" /> Notify when resumed</span>
                  <input type="checkbox" checked={notifyResume} onChange={(e) => setNotifyResume(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 cursor-pointer" />
                </label>
                <label className="flex items-center justify-between text-slate-700 cursor-pointer">
                  <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Notify on errors or blocked chunks</span>
                  <input type="checkbox" checked={notifyError} onChange={(e) => setNotifyError(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 cursor-pointer" />
                </label>
                <label className="flex items-center justify-between text-slate-700 cursor-pointer">
                  <span className="flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 text-amber-600" /> Notify when free capacity is exhausted</span>
                  <input type="checkbox" checked={notifyWaiting} onChange={(e) => setNotifyWaiting(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 cursor-pointer" />
                </label>

              </div>

              {/* Status Banner */}
              {telegramTestStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    telegramTestStatus.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {telegramTestStatus.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-snug">{telegramTestStatus.message}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={isTestingTelegram || !telegramToken}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5 text-blue-600" />
                  {isTestingTelegram ? 'Sending...' : 'Send Test Message'}
                </button>

                <button
                  type="button"
                  onClick={handleSaveTelegram}
                  disabled={isSavingTelegram}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isSavingTelegram ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verification Tests Modal */}
      {testsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Automated Verification Tests</h3>
              </div>
              <button
                onClick={() => setTestsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2 mb-3 shrink-0">
              All 15 required core tests verifying concurrency, Never-Skip logic, 429 recovery, and 1M+ character parsing.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {isRunningTests && (
                <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  Running automated verification suite...
                </div>
              )}

              {testResults &&
                testResults.map((t, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      t.passed
                        ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                        : 'bg-rose-50/50 border-rose-100 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {t.passed ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      )}
                      <span className="font-medium">{t.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      {t.durationMs}ms
                    </span>
                  </div>
                ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-mono">
                {testResults
                  ? `${testResults.filter((r) => r.passed).length} / ${testResults.length} Passed`
                  : ''}
              </span>
              <button
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningTests ? 'animate-spin' : ''}`} />
                Re-run Tests
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Footer */}
      <footer className="hidden sm:block mt-auto border-t border-slate-200 bg-white py-2">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <span>Omni Translator · Server Persistent Chinese Web-Novel Engine</span>
          <span>Contiguous Export Guaranteed</span>
        </div>
      </footer>
    </div>
  );
}
