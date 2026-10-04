import React, { useState } from 'react';
import { Lock, Unlock, X, Shield, KeyRound } from 'lucide-react';

interface PasscodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPin: string | null;
  onSetPin: (pin: string | null) => void;
  isUnlocked: boolean;
  onUnlockSuccess: () => void;
}

export const PasscodeModal: React.FC<PasscodeModalProps> = ({
  isOpen,
  onClose,
  currentPin,
  onSetPin,
  isUnlocked,
  onUnlockSuccess,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(!currentPin);

  if (!isOpen) return null;

  const handleUnlock = () => {
    if (pinInput === currentPin) {
      onUnlockSuccess();
      onClose();
    } else {
      setError('Incorrect passcode');
    }
  };

  const handleSaveNewPin = () => {
    if (newPin.length < 4) {
      setError('Passcode must be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Passcodes do not match');
      return;
    }
    onSetPin(newPin);
    onUnlockSuccess();
    onClose();
  };

  const handleDisablePin = () => {
    onSetPin(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-sm shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-neutral-100">Passcode Protection</h2>
          </div>
          {isUnlocked && (
            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-neutral-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {currentPin && !isUnlocked ? (
          /* Lock Screen Mode */
          <div className="space-y-4 text-center">
            <p className="text-xs text-neutral-400">
              Enter your 4-digit PIN to access translated novels:
            </p>
            <input
              type="password"
              maxLength={8}
              autoFocus
              value={pinInput}
              onChange={e => {
                setPinInput(e.target.value);
                setError('');
              }}
              placeholder="••••"
              className="w-36 mx-auto text-center text-2xl tracking-widest py-2 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-100 focus:outline-hidden focus:border-emerald-500 font-mono"
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              onClick={handleUnlock}
              className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors cursor-pointer"
            >
              Unlock App
            </button>
          </div>
        ) : (
          /* Configure Mode */
          <div className="space-y-3">
            <p className="text-xs text-neutral-400">
              {currentPin ? 'Update or disable your privacy passcode:' : 'Set a 4-digit PIN to lock novel translations on this device:'}
            </p>

            <div className="space-y-2">
              <input
                type="password"
                maxLength={8}
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="Enter new 4-digit PIN"
                className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 focus:outline-hidden focus:border-emerald-500 font-mono"
              />
              <input
                type="password"
                maxLength={8}
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                placeholder="Confirm PIN"
                className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 focus:outline-hidden focus:border-emerald-500 font-mono"
              />
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <div className="flex items-center justify-between gap-2 pt-2">
              {currentPin && (
                <button
                  type="button"
                  onClick={handleDisablePin}
                  className="px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-950/40 border border-rose-900/60"
                >
                  Disable PIN
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewPin}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs"
                >
                  Save PIN
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
