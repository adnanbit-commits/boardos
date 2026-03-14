import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

export type StorageFolder = 'vault' | 'compliance' | 'meeting-docs';

@Injectable()
export class StorageService {
  private storage: Storage;
  private bucket: string;

  constructor() {
    this.storage = new Storage({ projectId: process.env.GCS_PROJECT_ID });
    this.bucket  = process.env.GCS_BUCKET_NAME ?? 'boardos-vault';
  }

  buildObjectPath(companyId: string, folder: StorageFolder, originalFileName: string): string {
    const ext = originalFileName.split('.').pop()?.toLowerCase() ?? 'bin';
    return `${companyId}/${folder}/${uuidv4()}.${ext}`;
  }

  async uploadFile(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      await this.storage.bucket(this.bucket).file(objectPath).save(buffer, {
        contentType,
        resumable: false,
        metadata: { cacheControl: 'private, max-age=0' },
      });
    } catch (err) {
      console.error('StorageService.uploadFile error:', err);
      throw new InternalServerErrorException('File upload to storage failed');
    }
  }

  async getDownloadUrl(objectPath: string, expiresInMinutes = 60): Promise<string> {
    try {
      const [url] = await this.storage.bucket(this.bucket).file(objectPath).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresInMinutes * 60 * 1000,
      });
      return url;
    } catch {
      // Return proxy path — frontend will append ?token= for authenticated access
      return `__proxy__:${objectPath}`;
    }
  }

  async getShareUrl(objectPath: string): Promise<string> {
    return this.getDownloadUrl(objectPath, 7 * 24 * 60);
  }

  async getReadStream(objectPath: string) {
    return this.storage.bucket(this.bucket).file(objectPath).createReadStream();
  }

  async deleteObject(objectPath: string): Promise<void> {
    try {
      await this.storage.bucket(this.bucket).file(objectPath).delete();
    } catch (err: any) {
      if (err?.code !== 404) console.error('StorageService.deleteObject error:', err);
    }
  }
}
