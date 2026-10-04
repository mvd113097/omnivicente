import React, { useState } from 'react';
import { X, CheckCircle2, Clock, ShieldAlert, AlertCircle, BookOpen, Search } from 'lucide-react';
import { ChapterDetail } from '../types/index.js';
import { formatNumber } from '../utils/formatters.js';

interface ChapterListModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: ChapterDetail[];
  onSelectChapter: (index: number) => void;
  title: string;
}

export const ChapterListModal: React.FC<ChapterListModalProps> = ({
  isOpen,
  onClose,
  chapters,
  onSelectChapter,
  title,
}) => {
  const [filter, setFilter] = useState<'all' | 'completed' | 'fallback' | 'pending'>('all');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = chapters.filter(c => {
    if (filter === 'completed' && c.status !== 'completed' && c.status !== 'fallback_google') return false;
    if (filter === 'fallback' && c.status !== 'fallback_google') return false;
    if (filter === 'pending' && (c.status === 'completed' || c.status === 'fallback_google')) return false;
    if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !`chapter ${c.index}`.includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 bg-neutral-950/70 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span>Chapters ({chapters.length})</span>
            </h2>
            <p className="text-xs text-neutral-400 truncate max-w-md">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-3 border-b border-neutral-800 bg-neutral-950/40 flex flex-col sm:flex-row gap-2 items-center justify-between">
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto text-xs font-mono">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              All ({chapters.length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === 'completed'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Ready ({chapters.filter(c => c.status === 'completed' || c.status === 'fallback_google').length})
            </button>
            <button
              onClick={() => setFilter('fallback')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === 'fallback'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Sensitive/Fallback ({chapters.filter(c => c.status === 'fallback_google').length})
            </button>
          </div>

          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter chapters..."
              className="w-full pl-8 pr-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-hidden focus:border-neutral-700"
            />
          </div>
        </div>

        {/* Chapter List */}
        <div className="p-3 overflow-y-auto space-y-1.5 flex-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-neutral-500 text-center py-8 font-mono">
              No chapters match current filter.
            </p>
          ) : (
            filtered.map(ch => {
              const isCompleted = ch.status === 'completed';
              const isFallback = ch.status === 'fallback_google';
              const isTranslating = ch.status === 'translating';
              const isFailed = ch.status === 'failed';

              return (
                <div
                  key={ch.index}
                  onClick={() => {
                    if (isCompleted || isFallback) {
                      onSelectChapter(ch.index);
                      onClose();
                    }
                  }}
                  className={`p-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                    isCompleted || isFallback
                      ? 'bg-neutral-950/80 border-neutral-800/80 hover:border-emerald-500/50 cursor-pointer'
                      : 'bg-neutral-950/40 border-neutral-800/40 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-xs text-neutral-500 w-8 shrink-0 text-right">
                      #{ch.index}
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-medium text-neutral-200 truncate">
                        {ch.title}
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        {ch.translatedWordCount > 0 ? (
                          <span>{formatNumber(ch.translatedWordCount)} words translated</span>
                        ) : (
                          <span>{formatNumber(ch.originalWordCount)} original words</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {isCompleted && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Gemini</span>
                      </span>
                    )}

                    {isFallback && (
                      <span
                        title={ch.fallbackReason || 'Gemini Safety Filter triggered - translated safely via Google Translate'}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800"
                      >
                        <ShieldAlert className="w-3 h-3 text-amber-400" />
                        <span>Google Fallback (Sensitive)</span>
                      </span>
                    )}

                    {isTranslating && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800 animate-pulse">
                        <Clock className="w-3 h-3 animate-spin" />
                        <span>Translating...</span>
                      </span>
                    )}

                    {isFailed && (
                      <span
                        title={ch.error}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800"
                      >
                        <AlertCircle className="w-3 h-3" />
                        <span>Failed</span>
                      </span>
                    )}

                    {ch.status === 'pending' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-900 text-neutral-500 border border-neutral-800">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-950/70 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
