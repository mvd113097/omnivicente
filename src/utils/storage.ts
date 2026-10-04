// Safe local storage utility with fallback for incognito/restricted modes

const KEYS_STORAGE_KEY = 'megatxt_gemini_keys';
const PASSCODE_STORAGE_KEY = 'megatxt_passcode_hash';
const PASSCODE_ENABLED_KEY = 'megatxt_passcode_enabled';
const DATA_SAVER_KEY = 'megatxt_data_saver';
const RECENT_JOB_ID_KEY = 'megatxt_last_active_job';
const TELEGRAM_CONFIG_KEY = 'megatxt_telegram_config';

export function getStoredApiKeys(): string[] {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveStoredApiKeys(keys: string[]) {
  try {
    const clean = keys.map(k => k.trim()).filter(Boolean);
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    console.error('Failed to save API keys to localStorage', e);
  }
}

export function getDataSaverMode(): boolean {
  try {
    const val = localStorage.getItem(DATA_SAVER_KEY);
    return val === null ? true : val === 'true'; // Default ON for mobile data saving
  } catch {
    return true;
  }
}

export function setDataSaverMode(enabled: boolean) {
  try {
    localStorage.setItem(DATA_SAVER_KEY, String(enabled));
  } catch (e) {
    console.error('Failed to save data saver preference', e);
  }
}

export function getPasscode(): string | null {
  try {
    const enabled = localStorage.getItem(PASSCODE_ENABLED_KEY) === 'true';
    if (!enabled) return null;
    return localStorage.getItem(PASSCODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setPasscode(pin: string | null) {
  try {
    if (!pin) {
      localStorage.setItem(PASSCODE_ENABLED_KEY, 'false');
      localStorage.removeItem(PASSCODE_STORAGE_KEY);
    } else {
      localStorage.setItem(PASSCODE_ENABLED_KEY, 'true');
      localStorage.setItem(PASSCODE_STORAGE_KEY, pin);
    }
  } catch (e) {
    console.error('Failed to update passcode', e);
  }
}

export function getLastActiveJobId(): string | null {
  try {
    return localStorage.getItem(RECENT_JOB_ID_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveJobId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(RECENT_JOB_ID_KEY, id);
    } else {
      localStorage.removeItem(RECENT_JOB_ID_KEY);
    }
  } catch (e) {
    console.error('Failed to set last active job', e);
  }
}

export function getStoredTelegramConfig(): { botToken: string; chatId: string; enabled: boolean } {
  try {
    const raw = localStorage.getItem(TELEGRAM_CONFIG_KEY);
    if (!raw) return { botToken: '', chatId: '', enabled: false };
    return JSON.parse(raw);
  } catch {
    return { botToken: '', chatId: '', enabled: false };
  }
}

export function saveStoredTelegramConfig(cfg: { botToken: string; chatId: string; enabled: boolean }) {
  try {
    localStorage.setItem(TELEGRAM_CONFIG_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.error('Failed to save telegram config', e);
  }
}
