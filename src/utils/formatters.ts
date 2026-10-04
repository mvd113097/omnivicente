export function formatNumber(num: number = 0): string {
  return num.toLocaleString();
}

export function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'never';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateRemainingTime(
  completed: number,
  total: number,
  elapsedMs: number
): string {
  if (completed <= 0 || total <= completed) return '--';
  const avgPerChapter = elapsedMs / completed;
  const remainingChapters = total - completed;
  const remainingMs = remainingChapters * avgPerChapter;
  const minutes = Math.ceil(remainingMs / 60000);
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `~${hours}h ${remMin}m`;
}
