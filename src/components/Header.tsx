import React from 'react';
import { KeyRound, Shield, Wifi, Bell, PlusCircle, Lock, Sparkles } from 'lucide-react';

interface HeaderProps {
  apiKeysCount: number;
  dataSaver: boolean;
  onToggleDataSaver: () => void;
  onOpenKeysModal: () => void;
  onOpenTelegramModal: () => void;
  onOpenPasscodeModal: () => void;
  onNewTranslation: () => void;
  isLocked: boolean;
  passcodeConfigured: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  apiKeysCount,
  dataSaver,
  onToggleDataSaver,
  onOpenKeysModal,
  onOpenTelegramModal,
  onOpenPasscodeModal,
  onNewTranslation,
  isLocked,
  passcodeConfigured,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#150f1c]/90 backdrop-blur-md border-b border-pink-900/30 px-3 sm:px-5 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500/20 to-purple-500/20 border border-pink-400/40 flex items-center justify-center text-pink-300 font-bold text-sm tracking-wider shadow-inner">
            🌸
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-pink-100">
                MegaTXT <span className="text-pink-300 font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-pink-950/80 border border-pink-800/60">LITE</span>
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" title="Cloud Worker Ready" />
            </div>
            <p className="text-[11px] text-pink-300/60 hidden sm:block">
              Web Novel Translator • Continuous Subchunking • Ultra Lite ✨
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Data Saver Mode Toggle */}
          <button
            onClick={onToggleDataSaver}
            title={dataSaver ? "Data Saver: ON (Polls 0.2 KB every 30s)" : "Data Saver: OFF (Polls every 10s)"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors border cursor-pointer ${
              dataSaver
                ? 'bg-pink-950/50 text-pink-200 border-pink-700/60'
                : 'bg-[#19121f] text-pink-300/60 border-pink-900/40 hover:text-pink-100'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-pink-400" />
            <span className="hidden md:inline">Data Saver:</span>
            <span>{dataSaver ? 'ON' : 'OFF'}</span>
          </button>

          {/* API Keys Manager */}
          <button
            onClick={onOpenKeysModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-[#19121f] border border-pink-900/40 text-pink-200 hover:text-pink-100 hover:border-pink-500/50 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-pink-400" />
            <span className="font-mono text-pink-300">{apiKeysCount}</span>
            <span className="hidden sm:inline">Keys</span>
          </button>

          {/* Telegram Alerts */}
          <button
            onClick={onOpenTelegramModal}
            title="Configure Telegram Notifications"
            className="p-2 rounded-xl text-pink-300/70 hover:text-pink-100 bg-[#19121f] border border-pink-900/40 hover:border-pink-500/40 transition-colors cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>

          {/* PIN Lock */}
          <button
            onClick={onOpenPasscodeModal}
            title={passcodeConfigured ? "Passcode Lock Active" : "Configure PIN Lock"}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              passcodeConfigured
                ? 'bg-pink-950/60 text-pink-200 border-pink-600/70'
                : 'bg-[#19121f] text-pink-300/70 border-pink-900/40 hover:border-pink-500/40'
            }`}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Shield className="w-3.5 h-3.5" />}
          </button>

          {/* New Translation Button */}
          <button
            onClick={onNewTranslation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white shadow-md shadow-pink-500/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
        </div>
      </div>
    </header>
  );
};
