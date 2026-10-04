export type JobStatus = 'pending' | 'translating' | 'paused' | 'completed' | 'failed';
export type ChunkStatus = 'pending' | 'translating' | 'completed' | 'failed';

export interface ChapterInfo {
  index: number;
  title: string;
  chunkCount: number;
}

export interface Job {
  id: string;
  filename: string;
  totalChapters: number;
  totalChunks: number;
  completedChunks: number;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  chapters: ChapterInfo[];
  error?: string | null;
}

export interface Chunk {
  id: string;
  jobId: string;
  chapterIndex: number;
  chapterIndices?: number[];
  chapterTitles?: string[];
  chunkIndex: number;
  pieceIndex?: number;
  totalPieces?: number;
  originalText: string;
  translatedText: string;
  status: ChunkStatus;
  claimedBy: string | null;
  leaseExpiresAt: number | null;
  retries: number;
  error?: string | null;
  updatedAt: number;
}

export interface JobStatusResponse {
  id: string;
  filename: string;
  status: JobStatus;
  totalChapters: number;
  completedChapters: number;
  exportableChapters: number;
  totalChunks: number;
  completedChunks: number;
  percentage: number;
  translatedWords: number;
  error?: string | null;
  updatedAt: number;
}

export interface KeyConfig {
  keys: string[];
}

export interface TelegramSettings {
  botToken: string;
  chatIds: string[];
  notifyStart: boolean;
  notifyProgress: boolean;
  notifyComplete: boolean;
}
