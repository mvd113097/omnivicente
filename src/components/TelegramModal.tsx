import React, { useState } from 'react';
import { Bell, X, Check, Send, AlertCircle } from 'lucide-react';
import { getStoredTelegramConfig, saveStoredTelegramConfig } from '../utils/storage.js';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: (cfg: { botToken: string; chatId: string; enabled: boolean }) => void;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const [config, setConfig] = useState(getStoredTelegramConfig());
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    saveStoredTelegramConfig(config);
    onConfigSaved(config);
    onClose();
  };

  const handleTest = async () => {
    if (!config.botToken || !config.chatId) {
      setErrorMessage('Please fill in both Bot Token and Chat ID 🌸');
      return;
    }
    setTesting(true);
    setTestStatus('idle');
    setErrorMessage(null);
    try {
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: '🔔 <b>MegaTXT Translator Alert</b>\nTest connection successful! You will receive notifications when novel translations complete or reach 20k word milestones.',
          parse_mode: 'HTML',
        }),
      });
      if (res.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setErrorMessage('Failed to send test message. Please verify Bot Token and Chat ID.');
      }
    } catch {
      setTestStatus('error');
      setErrorMessage('Connection failed. Please check network or Telegram credentials.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-neutral-100">Telegram Background Alerts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-neutral-400 leading-relaxed">
          Receive an instant Telegram message on your phone when translation finishes or when 20k words are ready for EPUB download, even with your browser closed.
        </p>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-mono text-neutral-300">Telegram Bot Token</label>
            <input
              type="text"
              value={config.botToken}
              onChange={e => setConfig({ ...config, botToken: e.target.value })}
              placeholder="123456789:ABCdefGHI..."
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 font-mono focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-neutral-300">Telegram Chat ID</label>
            <input
              type="text"
              value={config.chatId}
              onChange={e => setConfig({ ...config, chatId: e.target.value })}
              placeholder="e.g. 987654321"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 font-mono focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="tgEnable"
              checked={config.enabled}
              onChange={e => setConfig({ ...config, enabled: e.target.checked })}
              className="accent-emerald-500 rounded"
            />
            <label htmlFor="tgEnable" className="text-xs text-neutral-300 cursor-pointer">
              Enable Telegram alerts for this device
            </label>
          </div>

          {testStatus === 'success' && (
            <p className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
              <Check className="w-3.5 h-3.5" /> Test message sent to your Telegram!
            </p>
          )}

          {testStatus === 'error' && (
            <p className="text-xs text-rose-400 flex items-center gap-1 font-mono">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage || 'Could not send test message. Check token & chat ID.'}</span>
            </p>
          )}

          {errorMessage && testStatus !== 'error' && (
            <p className="text-xs text-rose-400 flex items-center gap-1 font-mono">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-800 pt-3">
          <button
            onClick={handleTest}
            disabled={testing || !config.botToken || !config.chatId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{testing ? 'Sending...' : 'Test Alert'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
