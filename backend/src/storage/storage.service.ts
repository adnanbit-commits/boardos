import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

export type StorageFolder = 'vault' | 'compliance' | 'meeting-docs';

// Archive objects go into a dedicated GCS path prefix.
// The bucket should have a retention policy set at the bucket level in GCP Console:
//   gcloud storage buckets update gs://boardos-vault \
//     --retention-period=3153600000s   (100 years — effectively permanent)
// Once set, GCS enforces this at storage layer regardless of any application code.
// No code path — including deleteObject() — can remove files under this prefix
// before the retention period expires.
export const ARCHIVE_PREFIX = 'archive/';

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

  // Build an archive object path — always under the ARCHIVE_PREFIX so bucket
  // retention policy covers it automatically.
  buildArchivePath(companyId: string, subfolder: string, fileName: string): string {
    return `${ARCHIVE_PREFIX}${companyId}/${subfolder}/${uuidv4()}-${fileName}`;
  }

  // Standard upload — for operational files (vault docs, compliance forms, meeting papers).
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

  // Archive upload — for immutable statutory records (signed minutes PDFs,
  // certified copies). Sets a per-object temporary hold as a second line of
  // defence on top of the bucket retention policy.
  //
  // A temporary hold prevents deletion/overwrite until explicitly released.
  // In practice we never release it — the hold + bucket retention policy together
  // mean the file cannot be removed by any application code path.
  async uploadArchiveFile(
    objectPath: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    if (!objectPath.startsWith(ARCHIVE_PREFIX)) {
      throw new Error(
        `Archive uploads must use buildArchivePath(). Got: ${objectPath}`,
      );
    }
    try {
      const file = this.storage.bucket(this.bucket).file(objectPath);

      // Upload the file
      await file.save(buffer, {
        contentType,
        resumable: false,
        metadata: {
          cacheControl: 'private, max-age=0',
          // Custom metadata for audit trail
          'x-boardos-archive': 'true',
          'x-boardos-uploaded-at': new Date().toISOString(),
          ...metadata,
        },
      });

      // Set a temporary hold — prevents deletion even by bucket admins
      // until explicitly released (which we never do for archive files).
      await file.setMetadata({ temporaryHold: true });

    } catch (err) {
      console.error('StorageService.uploadArchiveFile error:', err);
      throw new InternalServerErrorException('Archive file upload failed');
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
      return `__proxy__:${objectPath}`;
    }
  }

  async getShareUrl(objectPath: string): Promise<string> {
    return this.getDownloadUrl(objectPath, 7 * 24 * 60);
  }

  async getReadStream(objectPath: string) {
    return this.storage.bucket(this.bucket).file(objectPath).createReadStream();
  }

  // Operational files only — will throw at GCS level if called on an archive
  // path that has a temporary hold set.
  async deleteObject(objectPath: string): Promise<void> {
    if (objectPath.startsWith(ARCHIVE_PREFIX)) {
      // Hard block in application code as a first line of defence.
      throw new InternalServerErrorException(
        'Archive objects cannot be deleted. The statutory record must be preserved.',
      );
    }
    try {
      await this.storage.bucket(this.bucket).file(objectPath).delete();
    } catch (err: any) {
      if (err?.code !== 404) console.error('StorageService.deleteObject error:', err);
    }
  }
}
