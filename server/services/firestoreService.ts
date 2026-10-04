import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { TranslationJob, TranslationChunk, ParentChapter } from '../types.js';

let dbInstance: Firestore | null = null;
let firestoreInitialized = false;

export function getFirestoreDb(): Firestore | null {
  if (dbInstance) return dbInstance;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const app = getApps().length > 0 ? getApp() : initializeApp(config);
      dbInstance = getFirestore(app, config.firestoreDatabaseId);
      firestoreInitialized = true;
      return dbInstance;
    }
  } catch (err) {
    console.error('Failed to initialize Firestore:', err);
  }
  return null;
}

function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeForFirestore) as any;
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean as T;
}

export class FirestoreService {
  private db: Firestore | null = null;

  constructor() {
    this.db = getFirestoreDb();
  }

  private ensureDb(): Firestore {
    if (!this.db) {
      this.db = getFirestoreDb();
    }
    if (!this.db) {
      throw new Error('Firestore is not available. Please verify firebase-applet-config.json.');
    }
    return this.db;
  }

  public isAvailable(): boolean {
    return !!this.db || !!getFirestoreDb();
  }

  /**
   * Saves or updates a TranslationJob document in Firestore.
   */
  public async saveJob(job: TranslationJob): Promise<void> {
    const db = this.ensureDb();
    const jobRef = doc(db, 'translation_jobs', job.id);

    // Save job metadata without raw API keys for security
    const { apiKeys, ...safeJob } = job;
    const payload = sanitizeForFirestore({
      ...safeJob,
      apiKeys: [], // Strip API keys from cloud persistence
      updatedAt: Date.now(),
    });
    await setDoc(jobRef, payload, { merge: true });
  }

  /**
   * Retrieves a single job metadata document.
   */
  public async getJob(jobId: string): Promise<TranslationJob | null> {
    const db = this.ensureDb();
    const jobRef = doc(db, 'translation_jobs', jobId);
    const snap = await getDoc(jobRef);
    if (!snap.exists()) return null;
    return snap.data() as TranslationJob;
  }

  /**
   * Lists all translation jobs (summaries only, minimal bandwidth).
   */
  public async getAllJobs(): Promise<TranslationJob[]> {
    const db = this.ensureDb();
    const colRef = collection(db, 'translation_jobs');
    const snap = await getDocs(colRef);
    const jobs: TranslationJob[] = [];
    snap.forEach(docSnap => {
      jobs.push(docSnap.data() as TranslationJob);
    });
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Finds an existing job by novel content hash.
   */
  public async findJobByContentHash(contentHash: string): Promise<TranslationJob | null> {
    if (!contentHash) return null;
    const db = this.ensureDb();
    const colRef = collection(db, 'translation_jobs');
    const q = query(colRef, where('contentHash', '==', contentHash));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as TranslationJob;
  }

  /**
   * Saves a chapter record to Firestore.
   */
  public async saveChapter(jobId: string, chapter: ParentChapter): Promise<void> {
    const db = this.ensureDb();
    const chRef = doc(db, 'translation_jobs', jobId, 'chapters', chapter.id);
    await setDoc(chRef, sanitizeForFirestore({
      ...chapter,
      updatedAt: Date.now(),
    }), { merge: true });
  }

  /**
   * Batch saves chapters for initial job creation.
   */
  public async saveChaptersBatch(jobId: string, chapters: ParentChapter[]): Promise<void> {
    const db = this.ensureDb();
    // Firestore batch limit is 500
    const chunkSize = 400;
    for (let i = 0; i < chapters.length; i += chunkSize) {
      const slice = chapters.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const ch of slice) {
        const chRef = doc(db, 'translation_jobs', jobId, 'chapters', ch.id);
        batch.set(chRef, sanitizeForFirestore({
          ...ch,
          updatedAt: Date.now(),
        }), { merge: true });
      }
      await batch.commit();
    }
  }

  /**
   * Loads all parent chapters for a job.
   */
  public async getChapters(jobId: string): Promise<ParentChapter[]> {
    const db = this.ensureDb();
    const colRef = collection(db, 'translation_jobs', jobId, 'chapters');
    const snap = await getDocs(colRef);
    const chapters: ParentChapter[] = [];
    snap.forEach(docSnap => {
      chapters.push(docSnap.data() as ParentChapter);
    });
    return chapters.sort((a, b) => a.index - b.index);
  }

  /**
   * Saves a single translation subchunk durably to Firestore.
   * Requirement 19: The durable database write MUST succeed before marking completed!
   */
  public async saveChunk(jobId: string, chunk: TranslationChunk): Promise<void> {
    const db = this.ensureDb();
    const chunkRef = doc(db, 'translation_jobs', jobId, 'chunks', chunk.id);
    await setDoc(chunkRef, sanitizeForFirestore({
      ...chunk,
      updatedAt: Date.now(),
    }), { merge: true });
  }

  /**
   * Batch saves chunks for initial job preparation.
   */
  public async saveChunksBatch(jobId: string, chunks: TranslationChunk[]): Promise<void> {
    const db = this.ensureDb();
    const chunkSize = 400;
    for (let i = 0; i < chunks.length; i += chunkSize) {
      const slice = chunks.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const chunk of slice) {
        const chunkRef = doc(db, 'translation_jobs', jobId, 'chunks', chunk.id);
        batch.set(chunkRef, sanitizeForFirestore({
          ...chunk,
          updatedAt: Date.now(),
        }), { merge: true });
      }
      await batch.commit();
    }
  }

  /**
   * Authoritative chunk hydration: Loads all subchunks for a job.
   */
  public async getAllChunks(jobId: string): Promise<TranslationChunk[]> {
    const db = this.ensureDb();
    const colRef = collection(db, 'translation_jobs', jobId, 'chunks');
    const snap = await getDocs(colRef);
    const chunks: TranslationChunk[] = [];
    snap.forEach(docSnap => {
      chunks.push(docSnap.data() as TranslationChunk);
    });
    return chunks;
  }

  /**
   * Deletes a job and its subcollections.
   */
  public async deleteJob(jobId: string): Promise<void> {
    const db = this.ensureDb();
    // 1. Delete all chunks
    const chunksRef = collection(db, 'translation_jobs', jobId, 'chunks');
    const chunkSnap = await getDocs(chunksRef);
    for (let i = 0; i < chunkSnap.docs.length; i += 400) {
      const batch = writeBatch(db);
      chunkSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // 2. Delete all chapters
    const chRef = collection(db, 'translation_jobs', jobId, 'chapters');
    const chSnap = await getDocs(chRef);
    for (let i = 0; i < chSnap.docs.length; i += 400) {
      const batch = writeBatch(db);
      chSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // 3. Delete job doc
    await deleteDoc(doc(db, 'translation_jobs', jobId));
  }
}

export const firestoreService = new FirestoreService();
