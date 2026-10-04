export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export async function sendTelegramNotification(
  message: string,
  config?: TelegramConfig
): Promise<boolean> {
  const token = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return false; // Not configured, silently ignore
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Telegram Notification Error]:', err);
    return false;
  }
}
