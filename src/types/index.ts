export interface ChapterSummary {
  index: number;
  title: string;
  wordCount: number;
  subChunkCount?: number;
  preview: string;
}

export interface ChapterDetail {
  index: number;
  title: string;
  status: 'pending' | 'translating' | 'completed' | 'failed' | 'fallback_google';
  subChunkCount?: number;
  completedSubChunks?: number;
  translatorUsed?: 'gemini' | 'google_translate';
  originalWordCount: number;
  translatedWordCount: number;
  fallbackReason?: string;
  error?: string;
}

export interface JobStatus {
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

export interface JobDetail extends JobStatus {
  model: string;
  chapters: ChapterDetail[];
  glossary: Record<string, string>;
  telegramConfig?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
}

export interface FullChapter {
  index: number;
  title: string;
  originalText: string;
  translatedText?: string;
  status: string;
  translatorUsed?: string;
  originalWordCount: number;
  translatedWordCount: number;
  fallbackReason?: string;
  error?: string;
}
