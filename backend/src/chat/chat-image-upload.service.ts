import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ChatImageUploadService {
  private readonly BUCKET = 'chat-images';
  private bucketInitialization: Promise<void> | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async uploadImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
    await this.ensureBucket();

    const filename = `${crypto.randomUUID()}${this.getExtension(mimeType)}`;
    const { data, error } = await this.supabase.storage
      .from(this.BUCKET)
      .upload(filename, imageBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
    if (!data) throw new Error('이미지 업로드에 실패했습니다.');

    return filename;
  }

  getPublicUrl(filename: string): string {
    const { data } = this.supabase.storage
      .from(this.BUCKET)
      .getPublicUrl(filename);
    return data.publicUrl;
  }

  private async ensureBucket() {
    if (!this.bucketInitialization) {
      this.bucketInitialization = this.initializeBucket();
    }

    try {
      await this.bucketInitialization;
    } catch (error) {
      this.bucketInitialization = null;
      throw error;
    }
  }

  private async initializeBucket() {
    const { data: buckets, error } = await this.supabase.storage.listBuckets();
    if (error) throw new Error(`이미지 저장소 확인 실패: ${error.message}`);

    if (buckets?.some((bucket) => bucket.name === this.BUCKET)) return;

    const { error: createError } = await this.supabase.storage.createBucket(
      this.BUCKET,
      { public: true },
    );
    if (createError) throw new Error(`이미지 저장소 생성 실패: ${createError.message}`);
  }

  private getExtension(mimeType: string) {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return extensions[mimeType] ?? '.jpg';
  }
}
