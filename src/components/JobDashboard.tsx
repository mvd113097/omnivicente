import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Download,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  ListFilter,
  FileDown,
  Clock,
  KeyRound,
  X,
  AlertCircle,
} from 'lucide-react';
import { JobStatus } from '../types/index.js';
import { formatNumber, formatTimeAgo } from '../utils/formatters.js';

interface JobDashboardProps {
  status: JobStatus;
  dataSaver: boolean;
  onRefresh: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onOpenReader: () => void;
  onOpenChapterList: () => void;
  onOpenKeysModal: () => void;
  isRefreshing: boolean;
}

export const JobDashboard: React.FC<JobDashboardProps> = ({
  status,
  dataSaver,
  onRefresh,
  onPause,
  onResume,
  onDelete,
  onOpenReader,
  onOpenChapterList,
  onOpenKeysModal,
  isRefreshing,
}) => {
  const [downloadingEpub, setDownloadingEpub] = useState(false);
  const [downloadingTxt, setDownloadingTxt] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Accessible, visible inline confirmation for delete - NEVER uses window.confirm (which blocks in iframe)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto reset delete confirmation after 5 seconds if not confirmed
  useEffect(() => {
    if (!isConfirmingDelete) return;
    const timer = setTimeout(() => {
      setIsConfirmingDelete(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isConfirmingDelete]);

  const percent = status.totalChapters > 0
    ? Math.min(100, Math.round((status.completedChapters / status.totalChapters) * 100))
    : 0;

  const isRunning = status.status === 'running';
  const isCompleted = status.status === 'completed';
  const has20kWords = status.translatedWords >= 20000;
  const canDownloadPartial = status.completedChapters > 0;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    // Confirmed second tap
    setIsDeleting(true);
    onDelete();
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirmingDelete(false);
  };

  const handleDownloadEpub = async (partial: boolean) => {
    setDownloadingEpub(true);
    setDownloadError(null);
    try {
      const url = `/api/jobs/${status.id}/download/epub?partial=${partial}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('EPUB generation failed');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const sanitized = status.title.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
      const exportCount = status.contiguousCompletedChapters || status.completedChapters;
      a.download = partial
        ? `${sanitized}_ch1-${exportCount}.epub`
        : `${sanitized}_full.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setDownloadError('Download error: ' + (err?.message || 'Failed to download EPUB'));
    } finally {
      setDownloadingEpub(false);
    }
  };

  const handleDownloadTxt = async (partial: boolean) => {
    setDownloadingTxt(true);
    setDownloadError(null);
    try {
      const url = `/api/jobs/${status.id}/download/txt?partial=${partial}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('TXT export failed');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const sanitized = status.title.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
      a.download = `${sanitized}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setDownloadError('Download error: ' + (err?.message || 'Failed to export TXT'));
    } finally {
      setDownloadingTxt(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Main Status Container */}
      <div className="p-5 sm:p-7 rounded-3xl bg-[#19131d]/90 backdrop-blur-md border border-pink-500/20 shadow-2xl shadow-pink-950/20 space-y-5 relative overflow-hidden">
        {/* Soft background glow */}
        <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        {/* Title & Status Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-pink-900/30 pb-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                isRunning
                  ? 'bg-emerald-400 animate-ping'
                  : isCompleted
                  ? 'bg-emerald-400'
                  : 'bg-amber-400'
              }`} />
              <h2 className="text-base sm:text-lg font-bold text-pink-100 truncate max-w-[280px] sm:max-w-md">
                {status.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-pink-300/70">
              <span className="font-mono text-pink-200">{status.sourceLang} → {status.targetLang}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-pink-400/60" />
                Updated {formatTimeAgo(status.updatedAt)}
              </span>
              <span>•</span>
              <span className="text-[11px] text-pink-300/90 font-mono">
                ~0.2 KB check
              </span>
            </div>
          </div>

          {/* Top Quick Status & Refresh Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Manual status check (only ~200 bytes)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-[#120d17] border border-pink-900/40 hover:border-pink-500/50 text-pink-200 font-mono transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-pink-400' : 'text-pink-400'}`} />
              <span className="hidden sm:inline">Check Progress</span>
            </button>

            {isRunning ? (
              <button
                onClick={onPause}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 transition-colors cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : !isCompleted ? (
              <button
                onClick={onResume}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 border border-pink-500/50 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Big Progress Bar & Key Numbers */}
        <div className="space-y-2 relative z-10">
          <div className="flex items-baseline justify-between text-xs">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-pink-300">
                {percent}%
              </span>
              <span className="text-pink-300/70 font-mono">
                ({status.completedChapters} / {status.totalChapters} chapters)
              </span>
            </div>

            <div className="text-right">
              <span className="font-mono text-pink-100 font-semibold text-sm">
                {formatNumber(status.translatedWords)}
              </span>
              <span className="text-pink-300/70 text-xs ml-1 font-mono">words ready 🌸</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#120d17] rounded-full h-3.5 border border-pink-900/40 overflow-hidden relative shadow-inner">
            <div
              className="bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 h-full rounded-full transition-all duration-500 relative"
              style={{ width: `${percent}%` }}
            >
              {isRunning && (
                <div className="absolute inset-0 bg-white/25 animate-pulse rounded-full" />
              )}
            </div>
          </div>

          {/* Current chapter status ticker */}
          <div className="flex items-center justify-between text-[11px] text-pink-300/70 pt-1 font-mono">
            <span className="truncate max-w-[260px] sm:max-w-md">
              {isRunning ? (
                <>
                  <span className="text-pink-400 font-semibold">Currently translating:</span>{' '}
                  {status.currentChapterTitle || `Chapter ${status.currentChapterIndex || ''}`}
                </>
              ) : isCompleted ? (
                <span className="text-emerald-400 font-semibold">✓ All chapters translated successfully! 🌸</span>
              ) : (
                <span className="text-amber-400">Paused • Tap resume to continue translation</span>
              )}
            </span>

            {/* Key rotation badge */}
            <button
              onClick={onOpenKeysModal}
              className="flex items-center gap-1 hover:text-pink-200 transition-colors shrink-0 text-pink-400/90 font-mono cursor-pointer"
            >
              <KeyRound className="w-3 h-3 text-pink-400" />
              <span>Key #{status.activeKeyIndex + 1}/{Math.max(status.totalKeys, 1)}</span>
            </button>
          </div>
        </div>

        {/* Download error banner */}
        {downloadError && (
          <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-700/70 text-xs text-rose-200 flex items-center justify-between gap-2 relative z-10 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{downloadError}</span>
            </div>
            <button
              onClick={() => setDownloadError(null)}
              className="p-1 hover:bg-rose-900/60 rounded text-rose-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Sensitive Chapters Notification (Google Translate Fallback) */}
        {status.sensitiveChaptersCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300 flex items-start gap-2.5 relative z-10">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-amber-200">
                {status.sensitiveChaptersCount} Sensitive Chapter(s) Translated with Google Translate
              </span>
              <p className="text-pink-200/60 text-[11px] leading-relaxed">
                Gemini content filters flagged sensitive scenes. As instructed, only those sensitive chapters were automatically translated via Google Translate without missing a single sentence, while all other chapters continue using Gemini.
              </p>
            </div>
          </div>
        )}

        {/* 20k Words Notice & Instant Download Highlight */}
        {canDownloadPartial && (
          <div className={`p-4 sm:p-5 rounded-2xl border transition-all relative z-10 ${
            has20kWords
              ? 'bg-gradient-to-r from-pink-950/40 via-[#18121f] to-purple-950/40 border-pink-500/50 shadow-pink-950/30 shadow-lg'
              : 'bg-[#120d17] border-pink-900/30'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span className="text-xs sm:text-sm font-bold text-pink-100">
                    {has20kWords ? '🔥 Milestone: Over 20k English Words Ready!' : 'Chapters Ready for Immediate Reading 🌸'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-950/80 text-pink-300 border border-pink-700/60">
                    Live Stream
                  </span>
                </div>
                <p className="text-xs text-pink-200/70">
                  Download chapters 1 through {status.contiguousCompletedChapters || status.completedChapters} right now into your e-reader or phone without stopping the ongoing background translation! (Never-Skip Contiguous)
                </p>
              </div>

              {/* Download Partial EPUB Button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDownloadEpub(true)}
                  disabled={downloadingEpub}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 ${downloadingEpub ? 'animate-bounce' : ''}`} />
                  <span>
                    {downloadingEpub
                      ? 'Building EPUB...'
                      : `Download EPUB (${status.contiguousCompletedChapters || status.completedChapters} Ch)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Primary Action Buttons: Read in App, Chapter List, TXT Download */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 relative z-10">
          <button
            onClick={onOpenReader}
            disabled={status.completedChapters === 0}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-[#120d17] hover:bg-pink-950/30 border border-pink-900/40 text-xs font-semibold text-pink-200 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-pink-400" />
            <span>Read in App (Offline 🌸)</span>
          </button>

          <button
            onClick={onOpenChapterList}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-[#120d17] hover:bg-pink-950/30 border border-pink-900/40 text-xs font-semibold text-pink-200 transition-colors cursor-pointer"
          >
            <ListFilter className="w-4 h-4 text-pink-400/80" />
            <span>View Chapters ({status.totalChapters})</span>
          </button>

          <button
            onClick={() => handleDownloadTxt(true)}
            disabled={downloadingTxt || status.completedChapters === 0}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-[#120d17] hover:bg-pink-950/30 border border-pink-900/40 text-xs font-semibold text-pink-200 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-pink-400/80" />
            <span>Download .TXT</span>
          </button>
        </div>

        {/* REPOSITIONED, PROMINENT & HIGH-VISIBILITY DELETE NOVEL BUTTON */}
        {/* User requested: 'make the delete button more visible..do not make another button but reposition it for easier access' */}
        {/* 'the button is not working ..it does nothing when pressed' -> Fixed with inline two-step confirmation (no blocked window.confirm) */}
        <div className="pt-3 border-t border-pink-900/30 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-rose-950/20 border border-rose-900/30">
            <div className="flex items-center gap-2 text-xs text-rose-300/80">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400/60" />
              <span>Finished or want to remove this novel?</span>
            </div>

            <div className="flex items-center gap-2">
              {isConfirmingDelete ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/60 border border-rose-400 transition-all cursor-pointer animate-pulse"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeleting ? 'Deleting Novel...' : 'Confirm Delete Novel'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    className="px-3 py-2 rounded-xl text-xs font-medium bg-[#120d17] text-pink-200 border border-pink-900/50 hover:bg-pink-950/40 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  title="Delete this novel and its translation state"
                  className="w-full sm:w-auto min-h-[38px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-700/60 hover:border-rose-500 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete Novel</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cloud Persistence Guarantee Card */}
        <div className="p-3 rounded-2xl bg-[#120d17]/60 border border-pink-900/30 flex items-center justify-between text-xs text-pink-300/70 relative z-10">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Cloud background worker is active. You can safely close this tab or your phone.</span>
          </div>
          <span className="font-mono text-[11px] text-pink-400/60 hidden sm:inline">
            Status checks: ~0.2 KB
          </span>
        </div>
      </div>
    </div>
  );
};
