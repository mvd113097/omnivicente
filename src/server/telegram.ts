import { Store } from './store.js';

export async function sendTelegramNotification(
  message: string,
  event: 'start' | 'progress' | 'complete' = 'start'
): Promise<boolean> {
  const settings = Store.getTelegramSettings();

  // Verify event preference toggles
  if (event === 'start' && !settings.notifyStart) return false;
  if (event === 'progress' && !settings.notifyProgress) return false;
  if (event === 'complete' && !settings.notifyComplete) return false;

  const token = settings.botToken;
  const chatIds = settings.chatIds || [];

  if (!token || chatIds.length === 0) {
    return false; // Silently skip if not configured
  }

  let successCount = 0;
  for (const chatId of chatIds) {
    if (!chatId.trim()) continue;
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: message,
          parse_mode: 'HTML',
        }),
      });
      if (res.ok) successCount++;
    } catch (err) {
      console.warn(`[Telegram Notification Error for chatId ${chatId}]:`, err);
    }
  }

  return successCount > 0;
}

/**
 * Sends a direct test notification to verify Telegram Bot Token and Chat IDs
 */
export async function sendTelegramTest(
  botToken: string,
  chatIds: string[]
): Promise<{ success: boolean; message: string }> {
  if (!botToken.trim()) {
    return { success: false, message: 'Please enter a valid Telegram Bot Token.' };
  }
  const validIds = chatIds.map((id) => id.trim()).filter(Boolean);
  if (validIds.length === 0) {
    return { success: false, message: 'Please enter at least 1 Telegram Chat ID.' };
  }

  let deliveredCount = 0;
  const errors: string[] = [];

  for (const chatId of validIds) {
    try {
      const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `🤖 <b>Omni Translator Test Notification</b>\nYour Telegram integration is connected successfully!`,
          parse_mode: 'HTML',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        deliveredCount++;
      } else {
        errors.push(`Chat ID ${chatId}: ${data.description || 'Failed to send'}`);
      }
    } catch (err: any) {
      errors.push(`Chat ID ${chatId}: ${err.message || String(err)}`);
    }
  }

  if (deliveredCount === validIds.length) {
    return { success: true, message: `Test message sent successfully to ${deliveredCount} Telegram Chat ID(s)!` };
  } else if (deliveredCount > 0) {
    return {
      success: true,
      message: `Delivered to ${deliveredCount} ID(s). Issues with remaining: ${errors.join('; ')}`,
    };
  } else {
    return { success: false, message: `Failed to deliver test message. Error: ${errors.join('; ')}` };
  }
}
