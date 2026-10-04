import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Type,
  Sun,
  Moon,
  Columns,
  List,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { FullChapter } from '../types/index.js';

interface LightweightReaderProps {
  jobId: string;
  bookTitle: string;
  initialChapterIndex: number;
  totalChapters: number;
  onClose: () => void;
  onOpenChapterList: () => void;
}

export const LightweightReader: React.FC<LightweightReaderProps> = ({
  jobId,
  bookTitle,
  initialChapterIndex,
  totalChapters,
  onClose,
  onOpenChapterList,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialChapterIndex);
  const [chapter, setChapter] = useState<FullChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reader Customization settings
  const [fontSize, setFontSize] = useState<number>(() => {
    return parseInt(localStorage.getItem('reader_font_size') || '16', 10);
  });
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'oled'>(() => {
    return (localStorage.getItem('reader_theme') as any) || 'dark';
  });
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans'>('serif');
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    localStorage.setItem('reader_font_size', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('reader_theme', theme);
  }, [theme]);

  // Load chapter text on demand
  useEffect(() => {
    let isCancelled = false;
    async function fetchChapter() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/jobs/${jobId}/chapter/${currentIndex}`);
        const data = await res.json();
        if (isCancelled) return;
        if (data.success && data.chapter) {
          setChapter(data.chapter);
        } else {
          setError(data.error || 'Failed to load chapter');
        }
      } catch (e: any) {
        if (!isCancelled) setError(e.message || 'Network error');
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchChapter();
    return () => {
      isCancelled = true;
    };
  }, [jobId, currentIndex]);

  const handlePrev = () => {
    if (currentIndex > 1) {
      setCurrentIndex(currentIndex - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNext = () => {
    if (currentIndex < totalChapters) {
      setCurrentIndex(currentIndex + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Theme styles
  const themeClasses = {
    dark: 'bg-neutral-950 text-neutral-200 border-neutral-800',
    sepia: 'bg-[#fbf0d9] text-[#2c2214] border-[#e4d3b6]',
    oled: 'bg-black text-neutral-300 border-neutral-900',
  }[theme];

  const fontClass = fontFamily === 'serif' ? 'font-serif' : 'font-sans';

  return (
    <div className={`min-h-screen ${themeClasses} flex flex-col transition-colors`}>
      {/* Reader Navbar */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md px-4 py-2.5 flex items-center justify-between gap-2 ${
        theme === 'sepia' ? 'bg-[#fbf0d9]/90 border-[#e4d3b6]' : 'bg-neutral-950/90 border-neutral-800'
      }`}>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium hover:bg-neutral-800/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </button>
          <span className="text-xs text-neutral-500 hidden md:inline">•</span>
          <span className="text-xs font-semibold truncate max-w-[180px] sm:max-w-xs">
            {bookTitle}
          </span>
        </div>

        {/* Reader Controls: Font size, Theme, TOC */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Compare with Original */}
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            title="Toggle Original vs Translated"
            className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
              showOriginal
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                : 'hover:bg-neutral-800/20 border-transparent'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
          </button>

          {/* Font Toggle */}
          <button
            onClick={() => setFontFamily(fontFamily === 'serif' ? 'sans' : 'serif')}
            className="px-2 py-1 rounded text-xs font-mono border border-transparent hover:bg-neutral-800/20"
            title="Toggle Serif / Sans"
          >
            {fontFamily === 'serif' ? 'Serif' : 'Sans'}
          </button>

          {/* Font Size */}
          <div className="flex items-center gap-0.5 border rounded px-1 text-xs">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              className="px-1.5 py-0.5 hover:opacity-70"
            >
              A-
            </button>
            <span className="text-[10px] font-mono px-1">{fontSize}</span>
            <button
              onClick={() => setFontSize(Math.min(28, fontSize + 2))}
              className="px-1.5 py-0.5 hover:opacity-70"
            >
              A+
            </button>
          </div>

          {/* Theme Switcher */}
          <button
            onClick={() => {
              if (theme === 'dark') setTheme('sepia');
              else if (theme === 'sepia') setTheme('oled');
              else setTheme('dark');
            }}
            className="p-1 rounded text-xs hover:bg-neutral-800/20"
            title="Cycle theme (Dark, Sepia, OLED)"
          >
            {theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>

          {/* Chapter Table of Contents */}
          <button
            onClick={onOpenChapterList}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-neutral-700 hover:bg-neutral-800/30"
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ch. {currentIndex}</span>
          </button>
        </div>
      </header>

      {/* Reader Body */}
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-8 py-8 flex-1">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono text-neutral-400">Loading Chapter {currentIndex}...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 text-center space-y-2">
            <p>{error}</p>
            <button
              onClick={() => setCurrentIndex(currentIndex)}
              className="px-3 py-1 bg-rose-900 rounded font-semibold text-xs"
            >
              Retry
            </button>
          </div>
        ) : chapter ? (
          <article className="space-y-6">
            {/* Chapter Header */}
            <div className="border-b pb-4 text-center space-y-2">
              <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
                Chapter {chapter.index} of {totalChapters}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {chapter.title}
              </h1>

              {/* Translation Badge */}
              <div className="flex items-center justify-center gap-2 pt-1">
                {chapter.translatorUsed === 'google_translate' ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/70 text-amber-300 border border-amber-800">
                    <ShieldAlert className="w-3 h-3 text-amber-400" />
                    <span>Translated via Google Translate (Gemini Safety Filter refusal)</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/70 text-emerald-300 border border-emerald-800">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Translated via Gemini AI</span>
                  </span>
                )}
              </div>
            </div>

            {/* Chapter Text */}
            <div
              className={`leading-relaxed space-y-4 ${fontClass}`}
              style={{ fontSize: `${fontSize}px` }}
            >
              {showOriginal ? (
                /* Original Raw Text View */
                <div className="space-y-4">
                  <div className="p-2 rounded bg-neutral-900/50 border border-neutral-800 text-xs text-neutral-400 font-mono">
                    Showing Original Raw Chapter Text:
                  </div>
                  {(chapter.originalText || '').split(/\n+/).map((para, idx) => (
                    <p key={idx} className="indent-6 leading-relaxed">
                      {para.trim()}
                    </p>
                  ))}
                </div>
              ) : (
                /* Translated Novel View */
                (chapter.translatedText || chapter.originalText || '')
                  .split(/\n+/)
                  .map((para, idx) => (
                    <p key={idx} className="indent-6 leading-relaxed">
                      {para.trim()}
                    </p>
                  ))
              )}
            </div>

            {/* Bottom Chapter Navigation */}
            <div className="border-t pt-8 mt-12 flex items-center justify-between gap-3">
              <button
                onClick={handlePrev}
                disabled={currentIndex <= 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous Chapter</span>
              </button>

              <span className="text-xs font-mono text-neutral-500">
                {currentIndex} / {totalChapters}
              </span>

              <button
                onClick={handleNext}
                disabled={currentIndex >= totalChapters}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-30 cursor-pointer"
              >
                <span>Next Chapter</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </article>
        ) : null}
      </main>
    </div>
  );
};
