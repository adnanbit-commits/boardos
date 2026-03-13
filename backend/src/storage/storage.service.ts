import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

// Prefix structure: {companyId}/{folder}/{uuid}.{ext}
export type StorageFolder = 'vault' | 'compliance' | 'meeting-docs';

@Injectable()
export class StorageService {
  private storage: Storage;
  private bucket: string;

  constructor() {
    // On GCP VMs with the right IAM role, Storage() uses ADC automatically.
    // For local dev, set GOOGLE_APPLICATION_CREDENTIALS env var.
    this.storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
    });
    this.bucket = process.env.GCS_BUCKET_NAME ?? 'boardos-vault';
  }

  // ── Generate a presigned PUT URL — frontend uploads directly to GCS ──────────
  async getUploadUrl(
    companyId: string,
    folder: StorageFolder,
    originalFileName: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; objectPath: string }> {
    try {
      const ext = originalFileName.split('.').pop() ?? 'bin';
      const objectPath = `${companyId}/${folder}/${uuidv4()}.${ext}`;

      const [uploadUrl] = await this.storage
        .bucket(this.bucket)
        .file(objectPath)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + 15 * 60 * 1000, // 15 minutes
          contentType,
        });

      return { uploadUrl, objectPath };
    } catch (err) {
      console.error('StorageService.getUploadUrl error:', err);
      throw new InternalServerErrorException('Could not generate upload URL');
    }
  }

  // ── Generate a presigned GET URL — time-limited download ─────────────────────
  async getDownloadUrl(
    objectPath: string,
    expiresInMinutes = 60,
  ): Promise<string> {
    try {
      const [url] = await this.storage
        .bucket(this.bucket)
        .file(objectPath)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + expiresInMinutes * 60 * 1000,
        });
      return url;
    } catch (err) {
      console.error('StorageService.getDownloadUrl error:', err);
      throw new InternalServerErrorException('Could not generate download URL');
    }
  }

  // ── Generate a longer-lived URL for public share links (7 days) ──────────────
  async getShareUrl(objectPath: string): Promise<string> {
    return this.getDownloadUrl(objectPath, 7 * 24 * 60);
  }

  // ── Delete an object ──────────────────────────────────────────────────────────
  async deleteObject(objectPath: string): Promise<void> {
    try {
      await this.storage.bucket(this.bucket).file(objectPath).delete();
    } catch (err: any) {
      // If file doesn't exist (404), ignore — already gone
      if (err?.code !== 404) {
        console.error('StorageService.deleteObject error:', err);
      }
    }
  }
}
