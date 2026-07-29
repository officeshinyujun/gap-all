import { ChatImageUploadService } from './chat-image-upload.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('ChatImageUploadService', () => {
  const upload = jest.fn();
  const listBuckets = jest.fn();
  const createBucket = jest.fn();
  const getPublicUrl = jest.fn();
  const from = jest.fn();

  beforeEach(() => {
    upload.mockResolvedValue({ data: { path: 'image.png' }, error: null });
    listBuckets.mockResolvedValue({ data: [{ name: 'chat-images' }], error: null });
    createBucket.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example/chat-images/image.png' } });
    from.mockReturnValue({ upload, getPublicUrl });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('원본 MIME 타입과 확장자로 이미지를 저장하고 파일명을 반환한다', async () => {
    const service = new ChatImageUploadService({
      storage: { listBuckets, createBucket, from },
    } as unknown as SupabaseService);

    const filename = await service.uploadImage(Buffer.from('image'), 'image/png');

    expect(filename).toMatch(/\.png$/);
    expect(upload).toHaveBeenCalledWith(
      filename,
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/png' }),
    );
  });

  it('버킷이 없으면 공개 chat-images 버킷을 생성한다', async () => {
    listBuckets.mockResolvedValue({ data: [], error: null });
    const service = new ChatImageUploadService({
      storage: { listBuckets, createBucket, from },
    } as unknown as SupabaseService);

    await service.uploadImage(Buffer.from('image'), 'image/jpeg');

    expect(createBucket).toHaveBeenCalledWith('chat-images', { public: true });
  });
});
