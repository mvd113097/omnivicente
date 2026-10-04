import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Play,
  Pause,
  Download,
  Key,
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
  const [keysModalOpen, setKeysModalOpen] = useState(false);
  const [keys, setKeys] = useState<string[]>(['', '', '', '', '']);
  const [keysCount, setKeysCount] = useState<number>(0);
  const [bulkKeysText, setBulkKeysText] = useState<string>('');
  const [keysInputMode, setKeysInputMode] = useState<'bulk' | 'individual'>('bulk');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState<'epub' | 'txt' | null>(null);
  const [testsModalOpen, setTestsModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastEtagRef = useRef<string | null>(null);

  // Fetch configured keys count
  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeysCount(data.count || 0);
      }
    } catch (err) {
      console.error('Failed to fetch keys:', err);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

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

    // Set interval for polling (every 3 seconds when translating, 8 seconds otherwise)
    const intervalMs = jobStatus?.status === 'translating' ? 3000 : 8000;
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
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

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
        setKeysModalOpen(true);
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

  // Save Keys
  const handleSaveKeys = async () => {
    setIsActionLoading(true);
    try {
      const valid = keys.filter((k) => k.trim().length > 0);
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: valid }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeysCount(data.count);
        setKeysModalOpen(false);
        setErrorMessage(null);
      }
    } catch (err: any) {
      setErrorMessage('Failed to save API keys');
    } finally {
      setIsActionLoading(false);
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              Ω
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900">Omni Translator</h1>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
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
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              title="Run Automated Verification Tests"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Verification Tests</span>
            </button>

            <button
              onClick={() => setKeysModalOpen(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5 text-amber-600" />
              <span>{keysCount > 0 ? `${keysCount}/5 Keys Active` : 'Configure Keys'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-3 text-sm text-rose-800">
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
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-xs text-center">
            <div className="max-w-md mx-auto">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Upload className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Upload Chinese Novel TXT</h2>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Automatic chapter boundary detection, paragraph-aware chunking, and persistent server-side background translation.
              </p>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/20"
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
                <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-800">
                  {isUploading ? 'Ingesting and parsing chapters...' : 'Click to select or drag & drop TXT file'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Supports large novels with 1,000,000+ Chinese characters</p>
              </div>

              {keysCount === 0 && (
                <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs text-amber-800 flex items-center justify-between">
                  <span>No Gemini API keys configured yet.</span>
                  <button
                    onClick={() => setKeysModalOpen(true)}
                    className="font-semibold underline text-amber-900 ml-2"
                  >
                    Add Keys
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* View 2: Active Novel Job Dashboard */}
        {jobStatus && (
          <div className="space-y-6">
            {/* Novel Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <BookOpen className="w-5 h-5" />
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
                      ? 'Translating in Background (Safe to Close)'
                      : jobStatus.status === 'completed'
                      ? 'Completed (100%)'
                      : jobStatus.status === 'paused'
                      ? 'Paused'
                      : 'Ready to Start'}
                  </span>
                </div>
              </div>

              {/* Live Background Running Banner: Visible when translating */}
              {jobStatus.status === 'translating' && (
                <div className="mt-4 p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
                    </span>
                    <div>
                      <span className="font-bold">Translation Actively Running on Server</span>
                      <span className="text-emerald-800 ml-1.5">
                        — You can safely close your browser or lock your phone. The translation continues in the background.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Bar & Tabular Numerals */}
              <div className="py-5">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-2 font-mono">
                  <span className="font-semibold text-slate-900">
                    {jobStatus.percentage}% TRANSLATED
                  </span>
                  <span>
                    {jobStatus.completedChunks} / {jobStatus.totalChunks} Chunks
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(2, jobStatus.percentage)}%` }}
                  />
                </div>

                {/* Never-Skip Contiguous Export & Word Count Info */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">English Words Ready</span>
                    <span className="text-sm font-semibold font-mono text-blue-700">
                      {jobStatus.translatedWords ? jobStatus.translatedWords.toLocaleString() : '0'} words
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">Completed Chapters</span>
                    <span className="text-sm font-semibold font-mono text-slate-800">
                      {jobStatus.completedChapters} / {jobStatus.totalChapters}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">Never-Skip Contiguous</span>
                    <span className="text-sm font-semibold font-mono text-emerald-700">
                      {jobStatus.exportableChapters > 0
                        ? `Ch 1 – ${jobStatus.exportableChapters}`
                        : 'Translating Ch 1...'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">Server Engine</span>
                    <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Persistent
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-3 text-center sm:text-left">
                  Translation runs entirely on the server. You can safely lock your screen or close this tab anytime.
                </p>
              </div>

              {/* Primary Action Controls */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {jobStatus.status === 'pending' && (
                    <button
                      onClick={handleStart}
                      disabled={isActionLoading}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start Translation
                    </button>
                  )}

                  {jobStatus.status === 'translating' && (
                    <button
                      onClick={handlePause}
                      disabled={isActionLoading}
                      className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      Pause Translation
                    </button>
                  )}

                  {jobStatus.status === 'paused' && (
                    <button
                      onClick={handleResume}
                      disabled={isActionLoading}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
                  className="px-3.5 py-2 text-xs text-rose-600 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200/80 rounded-xl transition-colors font-medium cursor-pointer flex items-center gap-1.5"
                  title="Delete this novel and reset workspace"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  Delete Novel
                </button>
              </div>
            </div>

            {/* DOWNLOAD SECTION (Prominent and clearly visible) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {jobStatus.status === 'completed'
                      ? 'Download Final Translated Novel'
                      : 'Download Current Progress (Never-Skip)'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {jobStatus.status === 'completed'
                      ? 'All chapters have completed translation successfully.'
                      : 'Download contiguous chapters right now while translation continues uninterrupted.'}
                  </p>
                </div>

                <div className="text-xs font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                  {jobStatus.exportableChapters} Contiguous Chapters Ready
                </div>
              </div>

              {jobStatus.exportableChapters === 0 ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center text-xs text-slate-500">
                  First chapter is currently translating. Current EPUB/TXT download will become available as soon as Chapter 1 completes.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleDownload('epub')}
                    disabled={isDownloading !== null}
                    className="p-4 bg-blue-50/60 hover:bg-blue-100/60 border border-blue-200 rounded-xl flex items-center justify-between text-blue-900 transition-colors group cursor-pointer text-left disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                        {isDownloading === 'epub' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-bold block">
                          {jobStatus.status === 'completed'
                            ? 'Download Final EPUB'
                            : `Download Current EPUB (Ch 1–${jobStatus.exportableChapters})`}
                        </span>
                        <span className="text-[11px] text-blue-700/80">
                          {isDownloading === 'epub'
                            ? 'Preparing EPUB file...'
                            : 'Ready for Moon+ Reader, Kindle, Apple Books'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload('txt')}
                    disabled={isDownloading !== null}
                    className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-slate-900 transition-colors group cursor-pointer text-left disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0">
                        {isDownloading === 'txt' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-bold block">
                          {jobStatus.status === 'completed'
                            ? 'Download Final TXT'
                            : `Download Current TXT (Ch 1–${jobStatus.exportableChapters})`}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {isDownloading === 'txt'
                            ? 'Preparing TXT file...'
                            : 'Clean plain-text format'}
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

      {/* Keys Configuration Modal */}
      {keysModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Gemini API Keys Pool (Up to 5)</h3>
              </div>
              <button
                onClick={() => setKeysModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 mb-4 p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
              <span className="font-semibold">Supported Keys:</span> Paste up to 5 Gemini API keys (keys starting with <strong>AQ...</strong> or <strong>AIzaSy...</strong> from{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline font-bold text-blue-800 hover:text-blue-900"
              >
                aistudio.google.com/apikey
              </a>
              ). Omni Translator runs all 5 keys simultaneously in background with automatic 429 rate-limit failover.
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setKeysInputMode('bulk')}
                className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  keysInputMode === 'bulk'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Paste All 5 at Once
              </button>
              <button
                type="button"
                onClick={() => setKeysInputMode('individual')}
                className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  keysInputMode === 'individual'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Individual Key Slots ({keys.filter((k) => k.trim().length > 0).length}/5)
              </button>
            </div>

            {/* Bulk Paste View */}
            {keysInputMode === 'bulk' && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Paste all keys (1 per line or separated by commas/spaces):
                    </label>
                    <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {keys.filter((k) => k.trim().length > 0).length} / 5 keys recognized
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    placeholder={`AIzaSy...key1\nAIzaSy...key2\nAIzaSy...key3\nAIzaSy...key4\nAIzaSy...key5`}
                    value={bulkKeysText}
                    onChange={(e) => {
                      const text = e.target.value;
                      setBulkKeysText(text);
                      // Split by newlines, commas, semicolons, or spaces
                      const extracted = text
                        .split(/[\r\n,;\s]+/)
                        .map((k) => k.trim())
                        .filter((k) => k.length > 0)
                        .slice(0, 5);

                      const updated = ['', '', '', '', ''];
                      extracted.forEach((k, i) => {
                        if (i < 5) updated[i] = k;
                      });
                      setKeys(updated);
                    }}
                    className="w-full p-3 text-xs font-mono border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 bg-slate-50/50 leading-relaxed"
                  />
                </div>

                {/* Parsed Keys Preview */}
                {keys.some((k) => k.trim().length > 0) && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Detected Keys Preview:
                    </span>
                    {keys
                      .map((k, idx) => ({ key: k, idx }))
                      .filter((item) => item.key.trim().length > 0)
                      .map((item) => (
                        <div
                          key={item.idx}
                          className="flex items-center justify-between text-[11px] font-mono text-slate-700 bg-white px-2.5 py-1 rounded border border-slate-100"
                        >
                          <span className="font-semibold text-blue-700">Key {item.idx + 1}:</span>
                          <span>
                            {item.key.length <= 10
                              ? item.key
                              : `${item.key.slice(0, 5)}••••••••${item.key.slice(-4)}`}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Individual Slots View */}
            {keysInputMode === 'individual' && (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div key={idx}>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      API Key {idx + 1} {idx === 0 && <span className="text-slate-400 font-normal">(Primary Pool)</span>}
                    </label>
                    <input
                      type="password"
                      placeholder="AQ... or AIzaSy..."
                      value={keys[idx] || ''}
                      onChange={(e) => {
                        const updated = [...keys];
                        updated[idx] = e.target.value;
                        setKeys(updated);
                        // Also update bulk text
                        setBulkKeysText(updated.filter((k) => k.trim().length > 0).join('\n'));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 bg-slate-50/50"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setKeys(['', '', '', '', '']);
                  setBulkKeysText('');
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium"
              >
                Clear All
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKeysModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveKeys}
                  disabled={isActionLoading || keys.every((k) => !k.trim())}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save {keys.filter((k) => k.trim().length > 0).length} Keys
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
      <footer className="mt-auto border-t border-slate-200 bg-white py-4">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <span>Omni Translator · Server Persistent Chinese Web-Novel Engine</span>
          <span>Never-Skip Contiguous Export Guaranteed</span>
        </div>
      </footer>
    </div>
  );
}
