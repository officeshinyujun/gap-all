import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ChatImageUploadService {
  private readonly BUCKET = 'chat-images';

  constructor(private readonly supabase: SupabaseService) {}

  async uploadImage(imageBuffer: Buffer): Promise<string> {
    const filename = `${crypto.randomUUID()}.jpg`;
    const { data, error } = await this.supabase.storage
      .from(this.BUCKET)
      .upload(filename, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);

    const { data: urlData } = this.supabase.storage
      .from(this.BUCKET)
      .getPublicUrl(filename);

    return urlData.publicUrl;
  }

  getPublicUrl(filename: string): string {
    const { data } = this.supabase.storage
      .from(this.BUCKET)
      .getPublicUrl(filename);
    return data.publicUrl;
  }
}
