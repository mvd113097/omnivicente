import React, { useState, useEffect } from 'react';
import { KeyRound, CheckCircle2, AlertCircle, RefreshCw, X, Plus, Trash2, ShieldCheck, Sparkles, Copy } from 'lucide-react';

interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  keys: string[];
  onSaveKeys: (newKeys: string[]) => void;
  activeKeyIndex?: number;
}

interface KeyTestResult {
  index: number;
  status: 'valid' | 'rate_limited' | 'invalid' | 'empty';
  prefix: string;
  message: string;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({
  isOpen,
  onClose,
  keys,
  onSaveKeys,
  activeKeyIndex = 0,
}) => {
  const [keyInputList, setKeyInputList] = useState<string[]>(['', '', '', '', '']);
  const [bulkInput, setBulkInput] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<KeyTestResult[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Initialize with provided keys, filling up to 5 slots
      const initial = [...keys];
      while (initial.length < 5) {
        initial.push('');
      }
      setKeyInputList(initial.slice(0, 5));
      setTestResults(null);
      setTestError(null);
    }
  }, [isOpen, keys]);

  if (!isOpen) return null;

  const handleKeyChange = (index: number, val: string) => {
    const next = [...keyInputList];
    next[index] = val;
    setKeyInputList(next.slice(0, 5));
  };

  const handleApplyBulk = () => {
    const extracted = bulkInput
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (extracted.length > 0) {
      const next = [...extracted];
      while (next.length < 5) {
        next.push('');
      }
      setKeyInputList(next.slice(0, 5));
      setShowBulk(false);
      setBulkInput('');
    }
  };

  const handleTestKeys = async () => {
    const validCandidates = keyInputList.map((k) => k.trim()).filter(Boolean);
    if (validCandidates.length === 0) {
      setTestError('Please enter at least one Gemini API key to test.');
      return;
    }

    setTesting(true);
    setTestResults(null);
    setTestError(null);
    try {
      const res = await fetch('/api/test-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: validCandidates }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.results);
      } else {
        setTestError(data.error || 'Failed to test keys');
      }
    } catch (e: any) {
      setTestError('Key test failed: ' + (e?.message || 'Network error'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const cleaned = keyInputList.map((k) => k.trim()).filter(Boolean).slice(0, 5);
    onSaveKeys(cleaned);
    onClose();
  };

  const activeCount = keyInputList.filter((k) => k.trim().length > 0).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[90vh] flex flex-col antialiased">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Gemini API Keys Manager</h3>
                <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {activeCount}/5 Slots Configured
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Rotates across 5 independent keys for high-speed continuous translation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1 text-xs">
          {/* Info Card */}
          <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 text-blue-950 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-blue-900">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>5-Key Rotation System</span>
            </div>
            <p className="text-[11px] text-blue-800/80 leading-relaxed">
              Configure your 5 free Gemini API keys (from 5 Google accounts/projects). The scheduler round-robins across all 5 keys simultaneously to prevent 429 rate limit pauses.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center justify-between pt-1 pb-0.5">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              {showBulk ? 'Bulk Paste Mode' : '5 Worker Slots'}
            </span>
            <button
              type="button"
              onClick={() => setShowBulk(!showBulk)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {showBulk ? '← Switch to 5 Slots View' : '⚡ Bulk Paste All Keys'}
            </button>
          </div>

          {showBulk ? (
            <div className="space-y-2">
              <p className="text-slate-500 text-[11px]">
                Paste up to 5 Gemini keys (one per line, comma, or space separated):
              </p>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={"AIzaSy...\nAIzaSy...\nAIzaSy...\nAIzaSy...\nAIzaSy..."}
                rows={6}
                className="w-full p-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:outline-hidden focus:border-blue-500 bg-slate-50/50"
              />
              <button
                type="button"
                onClick={handleApplyBulk}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Apply to 5 Slots
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {keyInputList.map((keyVal, idx) => {
                const isActive = idx === activeKeyIndex && keyVal.trim().length > 0;
                const result = testResults?.find((r) => r.index === idx);

                return (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold w-6 text-slate-400 text-right shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="relative flex-1">
                      <input
                        type="password"
                        value={keyVal}
                        onChange={(e) => handleKeyChange(idx, e.target.value)}
                        placeholder={`Gemini API Key #${idx + 1} (AIzaSy... or AQ...)`}
                        className={`w-full py-2 px-3 pr-14 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden ${
                          isActive
                            ? 'border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/20'
                            : 'border-slate-200 focus:border-blue-500 bg-slate-50/40'
                        }`}
                      />
                      {keyVal.trim().length > 0 && (
                        <span className="absolute right-2 top-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          Set
                        </span>
                      )}
                    </div>

                    {result && (
                      <span
                        title={result.message}
                        className={`text-[10px] px-2 py-1 rounded-md font-mono shrink-0 border ${
                          result.status === 'valid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : result.status === 'rate_limited'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {result.status === 'valid' ? '✓ OK' : result.status === 'rate_limited' ? '429' : 'Error'}
                      </span>
                    )}

                    {keyVal.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleKeyChange(idx, '')}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors shrink-0 cursor-pointer"
                        title="Clear slot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Test Error Message */}
          {testError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{testError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTestKeys}
            disabled={testing || activeCount === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Testing...' : 'Test Connectivity'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              Save 5 Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
