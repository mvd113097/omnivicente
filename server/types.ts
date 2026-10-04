export interface TranslationChunk {
  id: string; // e.g. "ch_53_sub_0"
  jobId: string;
  parentChapterId: string;
  parentChapterIndex: number;
  parentChapterTitle: string;
  subChunkIndex: number;
  sourceText: string;
  sourceCharStart: number;
  sourceCharEnd: number;
  status: 'pending' | 'translating' | 'completed' | 'failed' | 'fallback_google';
  englishText: string;
  translatedWordCount: number;
  translatorUsed: 'gemini' | 'google_translate';
  fallbackReason?: string;
  error?: string;
  leaseWorkerId?: string;
  leaseTimestamp?: number;
  completedAt?: number;
  updatedAt: number;
}

export interface ParentChapter {
  id: string; // e.g. "ch_53"
  jobId: string;
  index: number;
  title: string;
  originalText?: string; // Stored server-side only
  originalWordCount: number;
  subChunkCount: number;
  subChunkIds: string[];
  status: 'pending' | 'translating' | 'completed' | 'failed' | 'fallback_google';
  translatedWordCount: number;
  translatorUsed?: string;
  fallbackReason?: string;
  error?: string;
}

export interface TranslationJob {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  model: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  createdAt: number;
  updatedAt: number;
  totalChapters: number;
  completedChapters: number;
  contiguousCompletedChapters: number;
  totalChunks: number;
  completedChunks: number;
  totalOriginalWords: number;
  translatedWords: number;
  activeKeyIndex: number;
  apiKeys: string[];
  glossary: Record<string, string>;
  targetChunkChars: number;
  contentHash: string;
  currentChapterIndex?: number;
  currentChapterTitle?: string;
  lastError?: string;
  telegramConfig?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
}

export interface JobStatusSummary {
  id: string;
  title: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  sourceLang: string;
  targetLang: string;
  totalChapters: number;
  completedChapters: number;
  contiguousCompletedChapters: number;
  totalChunks: number;
  completedChunks: number;
  totalOriginalWords: number;
  translatedWords: number;
  activeKeyIndex: number;
  totalKeys: number;
  currentChapterTitle?: string;
  currentChapterIndex?: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  readyForEpub: boolean;
  sensitiveChaptersCount: number;
}

export interface ChapterSummaryHeader {
  index: number;
  title: string;
  wordCount: number;
  subChunkCount: number;
  preview: string;
}

export interface ChapterDetailHeader {
  index: number;
  title: string;
  status: string;
  subChunkCount: number;
  completedSubChunks: number;
  originalWordCount: number;
  translatedWordCount: number;
  translatorUsed?: string;
  fallbackReason?: string;
  error?: string;
}
