import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Sparkles,
  BookOpen,
  ArrowRight,
  BookA,
  Check,
  AlertCircle,
  Heart,
  FileText,
  RotateCcw,
  Languages,
} from 'lucide-react';
import { ChapterSummary } from '../types/index.js';
import { formatNumber } from '../utils/formatters.js';

interface UploadSectionProps {
  onJobCreated: (jobId: string) => void;
  apiKeys: string[];
  onOpenKeysModal: () => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onJobCreated,
  apiKeys,
  onOpenKeysModal,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [title, setTitle] = useState('');
  const [sourceLang, setSourceLang] = useState('Chinese');
  const [targetLang, setTargetLang] = useState('English');
  const [model] = useState('gemini-3.8-flash');
  const [targetChunkChars] = useState(2500);

  // Glossary / Terminology dictionary
  const [glossaryText, setGlossaryText] = useState('');
  const [showGlossary, setShowGlossary] = useState(false);
  const [showTextPaste, setShowTextPaste] = useState(false);

  // Parsing & Prepare state
  const [parsing, setParsing] = useState(false);
  const [prepareId, setPrepareId] = useState<string | null>(null);
  const [parsedChapters, setParsedChapters] = useState<ChapterSummary[] | null>(null);
  const [totalWords, setTotalWords] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const cleanTitle = selected.name.replace(/\.[^/.]+$/, '').replace(/[_+-]/g, ' ');
      if (!title) {
        setTitle(cleanTitle);
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setTextInput(content);
        triggerParse(content, title || cleanTitle);
      };
      reader.readAsText(selected);
    }
  };

  const triggerParse = async (content: string, bookTitle: string) => {
    if (!content || !content.trim()) {
      setErrorMsg('The selected file or text is empty.');
      return;
    }
    setParsing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          title: bookTitle || 'My Web Novel',
          targetChunkChars,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPrepareId(data.prepareId);
        setParsedChapters(data.chapters);
        setTotalWords(data.totalOriginalWords || data.totalWords);
      } else {
        setErrorMsg(data.error || 'Failed to detect chapters in this novel.');
      }
    } catch (e: any) {
      setErrorMsg('Parsing error: ' + (e?.message || 'Network error'));
    } finally {
      setParsing(false);
    }
  };

  const handleManualParse = () => {
    if (!textInput.trim()) {
      setErrorMsg('Please paste your novel text or choose a .txt file first 🌸');
      return;
    }
    triggerParse(textInput, title || 'My Web Novel');
  };

  const handleResetFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setTextInput('');
    setParsedChapters(null);
    setPrepareId(null);
    setTotalWords(0);
    setErrorMsg('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const parseGlossary = (): Record<string, string> => {
    const dict: Record<string, string> = {};
    if (!glossaryText.trim()) return dict;
    const lines = glossaryText.split('\n');
    for (const line of lines) {
      const parts = line.split(/[=:,->]+/);
      if (parts.length >= 2) {
        const k = parts[0].trim();
        const v = parts.slice(1).join('=').trim();
        if (k && v) dict[k] = v;
      }
    }
    return dict;
  };

  const handleStartTranslation = async () => {
    // If chapters haven't been parsed yet but text is entered, trigger parsing first
    if (!prepareId) {
      if (textInput.trim()) {
        await triggerParse(textInput, title || 'My Web Novel');
      } else {
        setErrorMsg('Please select a novel file or paste text first 🌸');
        return;
      }
    }

    if (apiKeys.length === 0) {
      onOpenKeysModal();
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prepareId,
          title: title || 'My Web Novel',
          sourceLang,
          targetLang,
          model,
          apiKeys,
          glossary: parseGlossary(),
          targetChunkChars,
          autoStart: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.job) {
        onJobCreated(data.job.id);
      } else {
        setErrorMsg(data.error || 'Failed to start translation job');
      }
    } catch (e: any) {
      setErrorMsg('Error creating translation job: ' + (e?.message || 'Network error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Aesthetic Card Container */}
      <div className="p-5 sm:p-7 rounded-3xl bg-[#19131d]/90 backdrop-blur-md border border-pink-500/20 shadow-2xl shadow-pink-950/20 space-y-6 relative overflow-hidden">
        {/* Cute background ambient accents */}
        <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        {/* Top Header Row with Cute Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-pink-900/30 pb-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🌸</span>
              <h1 className="text-lg sm:text-xl font-bold text-pink-100 flex items-center gap-2 tracking-tight">
                <span>Translate Chinese Novel</span>
                <span className="text-xs font-normal text-pink-300/80 px-2 py-0.5 rounded-full bg-pink-950/60 border border-pink-800/40 font-mono">
                  ✨ aesthetic & lite
                </span>
              </h1>
            </div>
            <p className="text-xs text-pink-200/70 mt-1 flex items-center gap-1.5">
              <span>Cloud background magic</span>
              <span>•</span>
              <span>Full text preservation</span>
              <span>•</span>
              <span className="text-pink-300">Zero mobile data waste 🎀</span>
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={onOpenKeysModal}
              className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                apiKeys.length > 0
                  ? 'bg-gradient-to-r from-pink-950/80 to-purple-950/80 text-pink-200 border border-pink-700/50 hover:border-pink-500'
                  : 'bg-rose-950 text-rose-200 border border-rose-600 animate-pulse'
              }`}
            >
              <span>🔑</span>
              <span>{apiKeys.length > 0 ? `${apiKeys.length} Gemini Keys` : 'Add Gemini Keys'}</span>
            </button>
          </div>
        </div>

        {/* Novel Title & Language Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 relative z-10">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-pink-200/90 flex items-center gap-1.5">
              <span>📖</span>
              <span>Novel Title</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Hidden Love, Lord of Mysteries, Heavenly Jewel Change 🌸"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#120d17] border border-pink-900/40 text-xs text-pink-100 placeholder:text-pink-300/30 focus:outline-hidden focus:border-pink-400 focus:ring-1 focus:ring-pink-400/40 transition-all font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-pink-200/90 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-pink-400" />
              <span>Target Language</span>
            </label>
            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#120d17] border border-pink-900/40 text-xs text-pink-100 focus:outline-hidden focus:border-pink-400 focus:ring-1 focus:ring-pink-400/40 transition-all font-sans cursor-pointer"
            >
              <option value="English">English 🇬🇧</option>
              <option value="Spanish">Spanish (Español) 🇪🇸</option>
              <option value="Indonesian">Indonesian (Bahasa) 🇮🇩</option>
              <option value="Portuguese">Portuguese (Português) 🇵🇹</option>
              <option value="French">French (Français) 🇫🇷</option>
              <option value="Russian">Russian (Русский) 🇷🇺</option>
              <option value="German">German (Deutsch) 🇩🇪</option>
              <option value="Vietnamese">Vietnamese (Tiếng Việt) 🇻🇳</option>
            </select>
          </div>
        </div>

        {/* Soft, Aesthetic File Picker Dropzone */}
        <div className="space-y-3 relative z-10">
          <input
            id="novel-file-input"
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".txt,.text"
            className="sr-only"
          />

          <label
            htmlFor="novel-file-input"
            className={`block border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-300 relative group overflow-hidden ${
              file
                ? 'border-pink-400/60 bg-gradient-to-b from-pink-950/30 to-[#150f1b]'
                : 'border-pink-400/30 hover:border-pink-400/70 bg-gradient-to-b from-pink-950/15 via-[#150f1b] to-purple-950/15 hover:bg-pink-950/25 shadow-lg shadow-pink-950/10'
            }`}
          >
            {/* Cute flower icon badge */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500/20 via-rose-400/20 to-purple-500/20 border border-pink-400/40 flex items-center justify-center mx-auto mb-3 shadow-inner group-hover:scale-105 transition-transform duration-300">
              {file ? (
                <FileText className="w-7 h-7 text-pink-300" />
              ) : (
                <UploadCloud className="w-7 h-7 text-pink-300" />
              )}
            </div>

            {file ? (
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-950/70 border border-pink-700/60 text-xs font-medium text-pink-200">
                  <span>🌸</span>
                  <span className="font-semibold truncate max-w-[220px] sm:max-w-md">{file.name}</span>
                  <span className="text-pink-400/80 font-mono text-[11px]">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <span className="text-[11px] text-pink-300/80">Tap to select a different file</span>
                  <button
                    type="button"
                    onClick={handleResetFile}
                    className="text-[11px] text-rose-300 hover:text-rose-100 underline flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-pink-100 flex items-center justify-center gap-1.5">
                  <span>Drop your Chinese novel file here</span>
                  <span>✨</span>
                </p>
                <p className="text-xs text-pink-300/70">
                  Tap to browse .txt files on your phone or computer
                </p>
                <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-pink-400/60 font-mono">
                  <span>🌸 1M+ characters</span>
                  <span>•</span>
                  <span>Auto chapter split</span>
                  <span>•</span>
                  <span>Background safe</span>
                </div>
              </div>
            )}
          </label>

          {/* Direct Text Paste Option Accordion */}
          <div className="pt-1">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowTextPaste(!showTextPaste)}
                className="text-xs text-pink-300/80 hover:text-pink-100 flex items-center gap-1.5 transition-colors font-medium cursor-pointer"
              >
                <span>{showTextPaste ? '▼ Hide text box' : '▶ Or paste raw novel text directly'}</span>
                <span className="text-[11px] text-pink-400/60 font-mono">({showTextPaste ? 'close' : 'paste mode'})</span>
              </button>

              {textInput && !parsedChapters && (
                <button
                  type="button"
                  onClick={handleManualParse}
                  disabled={parsing}
                  className="text-xs font-semibold px-3 py-1 rounded-full bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 border border-pink-500/40 transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                  <span>{parsing ? 'Detecting Chapters...' : 'Detect Chapters ✨'}</span>
                </button>
              )}
            </div>

            {showTextPaste && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  placeholder="Paste your Chinese novel chapters here (e.g. 第1章 天才陨落 / Chapter 1...)... 🌸"
                  rows={5}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#120d17] border border-pink-900/40 text-xs font-mono text-pink-100 placeholder:text-pink-300/30 focus:outline-hidden focus:border-pink-400 focus:ring-1 focus:ring-pink-400/40"
                />
                {textInput && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleManualParse}
                      disabled={parsing}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 border border-pink-500/50 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-pink-300" />
                      <span>{parsing ? 'Reading Chapters...' : 'Process Text into Chapters 🌸'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Glossary / Terms Drawer Toggle */}
        <div className="pt-1 border-t border-pink-900/20">
          <button
            type="button"
            onClick={() => setShowGlossary(!showGlossary)}
            className="flex items-center gap-1.5 text-xs text-pink-300/80 hover:text-pink-100 transition-colors cursor-pointer"
          >
            <BookA className="w-3.5 h-3.5 text-pink-400" />
            <span>Custom Name & Character Glossary ({Object.keys(parseGlossary()).length} terms)</span>
            <span className="text-[10px] text-pink-400/60 font-mono">[{showGlossary ? 'Hide' : 'Expand 🌸'}]</span>
          </button>

          {showGlossary && (
            <div className="mt-2.5 p-3.5 rounded-2xl bg-[#120d17] border border-pink-900/40 space-y-2">
              <p className="text-[11px] text-pink-200/70">
                Keep character names and martial techniques consistent throughout all chapters (one per line):
              </p>
              <textarea
                value={glossaryText}
                onChange={e => setGlossaryText(e.target.value)}
                placeholder={"Sang Zhi = Sang Zhi\nDuan Jiaxu = Duan Jiaxu\nQiankun Bag = Cosmos Bag"}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-[#19131d] border border-pink-900/40 text-xs font-mono text-pink-100 placeholder:text-pink-300/30 focus:outline-hidden"
              />
            </div>
          )}
        </div>

        {/* Error message banner */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-200 flex items-center gap-2.5 animate-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Parsing state loading card */}
        {parsing && (
          <div className="p-4 rounded-2xl bg-pink-950/30 border border-pink-500/30 text-center space-y-2">
            <div className="inline-block animate-spin text-pink-400">🌸</div>
            <p className="text-xs text-pink-200 font-medium">Reading novel structure and auto-detecting chapters...</p>
            <p className="text-[11px] text-pink-300/60 font-mono">Splitting long chapters into contiguous 2,500-char subchunks</p>
          </div>
        )}

        {/* Parsed Preview Card & Start Translation Button */}
        {parsedChapters && parsedChapters.length > 0 && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-pink-950/30 via-[#18121f] to-purple-950/30 border border-pink-500/40 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-300">
                  ✓
                </div>
                <span className="font-bold text-pink-100 text-sm">
                  {parsedChapters.length} Chapters Detected 🌸
                </span>
                <span className="text-pink-300/70 font-mono text-xs">
                  • {formatNumber(totalWords)} original characters
                </span>
              </div>
              <span className="text-[11px] text-pink-300 font-mono bg-pink-950/70 px-2.5 py-0.5 rounded-full border border-pink-700/40">
                Cloud Ready • Zero Client Overhead
              </span>
            </div>

            {/* Quick snippet list */}
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
              {parsedChapters.slice(0, 5).map(c => (
                <div
                  key={c.index}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#120d17]/80 border border-pink-900/30 text-pink-200 text-[11px]"
                >
                  <span className="font-medium text-pink-200 truncate max-w-[220px] sm:max-w-sm flex items-center gap-1.5">
                    <span className="text-pink-400">🌸</span>
                    <span>{c.title}</span>
                  </span>
                  <span className="text-pink-400/60 shrink-0 text-[10px]">
                    {formatNumber(c.wordCount)} chars
                  </span>
                </div>
              ))}
              {parsedChapters.length > 5 && (
                <p className="text-[11px] text-pink-300/60 text-center py-1">
                  ...and {parsedChapters.length - 5} more chapters
                </p>
              )}
            </div>

            {/* Start Translation Button - prominent, beautiful, easy to press */}
            <button
              type="button"
              onClick={handleStartTranslation}
              disabled={submitting}
              className="w-full min-h-[48px] flex items-center justify-center gap-2.5 py-3 px-5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold text-sm tracking-wide transition-all duration-200 shadow-lg shadow-pink-500/25 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Starting Cloud Worker...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-pink-100" />
                  <span>Start Cloud Translation 🌸 ({parsedChapters.length} Chapters)</span>
                  <ArrowRight className="w-4 h-4 ml-1 text-pink-100" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
