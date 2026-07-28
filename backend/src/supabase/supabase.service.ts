import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private _client: SupabaseClient | null = null;
  private _enabled = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (process.env.DB_PROVIDER !== 'supabase') {
      this.logger.log('DB_PROVIDER is not supabase — skipping Supabase client init');
      return;
    }

    const url = this.configService.get<string>('SUPABASE_URL');
    const serviceKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');

    if (!url || !serviceKey) {
      this.logger.warn('Supabase credentials missing — skipping');
      return;
    }

    this._client = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    this._enabled = true;
    this.logger.log('Supabase client initialized');
  }

  get client(): SupabaseClient {
    if (!this._client) {
      throw new Error('Supabase client not available (DB_PROVIDER is not supabase)');
    }
    return this._client;
  }

  get storage() {
    return this.client.storage;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  async uploadFile(bucket: string, path: string, file: Buffer | Blob, contentType?: string): Promise<string> {
    const { data, error } = await this.storage.from(bucket).upload(path, file, { contentType, upsert: true });
    if (error) throw error;
    const { data: urlData } = this.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  }

  async downloadFile(bucket: string, path: string): Promise<Buffer> {
    const { data, error } = await this.storage.from(bucket).download(path);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteFile(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.storage.from(bucket).remove(paths);
    if (error) throw error;
  }
}
