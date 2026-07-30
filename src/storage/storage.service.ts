import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtlSec: number;

  constructor(config: ConfigService) {
    const s3 = config.getOrThrow<{
      endpoint: string;
      region: string;
      accessKey: string;
      secretKey: string;
      bucket: string;
      forcePathStyle: boolean;
      signedUrlTtlSec: number;
    }>('s3');

    this.bucket = s3.bucket;
    this.signedUrlTtlSec = s3.signedUrlTtlSec;
    this.client = new S3Client({
      region: s3.region,
      endpoint: s3.endpoint,
      forcePathStyle: s3.forcePathStyle,
      credentials: {
        accessKeyId: s3.accessKey,
        secretAccessKey: s3.secretKey,
      },
    });
  }

  buildLessonKey(courseId: string, lessonId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `courses/${courseId}/lessons/${lessonId}/${randomUUID()}-${safe}`;
  }

  buildFileKey(
    courseId: string,
    ownerType: string,
    ownerId: string,
    filename: string,
  ): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `courses/${courseId}/files/${ownerType}/${ownerId}/${randomUUID()}-${safe}`;
  }

  async uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getSignedGetUrl(key: string, expiresSec?: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresSec ?? this.signedUrlTtlSec },
    );
  }
}
