import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatImageUploadService } from './chat-image-upload.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ChatSender } from '../entities/chat-message.entity';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: jest.Mocked<Partial<ChatService>>;
  let imageUploadService: { getPublicUrl: jest.Mock };

  const currentUser = { id: 'user-1', email: 'test@example.com', role: 'user' };

  beforeEach(async () => {
    chatService = {
      findAllSessions: jest.fn(),
      createSession: jest.fn(),
      findOneSession: jest.fn(),
      removeSession: jest.fn(),
      sendMessage: jest.fn(),
      processImageQuestion: jest.fn(),
    };
    imageUploadService = { getPublicUrl: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: chatService },
        { provide: ChatImageUploadService, useValue: imageUploadService },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  describe('findAllSessions', () => {
    it('채팅 세션 목록 반환', async () => {
      chatService.findAllSessions.mockResolvedValue([{ id: 's-1', title: '세션1' } as any]);
      const result = await controller.findAllSessions(currentUser as any);
      expect(result).toHaveLength(1);
    });
  });

  describe('createSession', () => {
    it('채팅 세션 생성', async () => {
      chatService.createSession.mockResolvedValue({ session: { id: 's-1' } } as any);
      const result = await controller.createSession(currentUser as any, {
        subjectId: 'subj-1', title: '새 채팅',
      });
      expect(result).toHaveProperty('session');
    });
  });

  describe('findOneSession', () => {
    it('채팅 세션 조회', async () => {
      chatService.findOneSession.mockResolvedValue({ id: 's-1', messages: [] } as any);
      const result = await controller.findOneSession(currentUser as any, 's-1');
      expect(result.id).toBe('s-1');
    });
  });

  describe('removeSession', () => {
    it('채팅 세션 삭제', async () => {
      chatService.removeSession.mockResolvedValue({ message: '삭제됨' });
      const result = await controller.removeSession(currentUser as any, 's-1');
      expect(result).toEqual({ message: '삭제됨' });
    });
  });

  describe('sendMessage', () => {
    it('메시지 전송', async () => {
      const userMsg = { id: 'm-1', sender: ChatSender.USER, message: 'hi' };
      const aiMsg = { id: 'm-2', sender: ChatSender.AI, message: 'hello' };
      chatService.sendMessage.mockResolvedValue({ userMessage: userMsg, aiMessage: aiMsg } as any);

      const result = await controller.sendMessage(currentUser as any, 's-1', { message: 'hi' });
      expect(result.userMessage.sender).toBe(ChatSender.USER);
      expect(result.aiMessage.sender).toBe(ChatSender.AI);
    });
  });

  describe('imageQuestion', () => {
    it('이미지 바이트와 MIME 타입을 분석 서비스에 전달한다', async () => {
      chatService.processImageQuestion.mockResolvedValue({ userMessage: {}, aiMessage: {} } as any);
      const file = { buffer: Buffer.from('image'), mimetype: 'image/png' } as Express.Multer.File;

      await controller.imageQuestion(currentUser as any, 's-1', file);

      expect(chatService.processImageQuestion).toHaveBeenCalledWith(
        'user-1',
        's-1',
        file.buffer,
        'image/png',
      );
    });
  });

  describe('getImage', () => {
    it('인증 없이 이미지 URL로 리다이렉트할 수 있다', () => {
      imageUploadService.getPublicUrl.mockReturnValue('https://storage.example/chat-images/image.png');
      const response = { setHeader: jest.fn(), redirect: jest.fn() } as any;

      controller.getImage('image.png', response);

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller.getImage)).toBe(true);
      expect(response.setHeader).toHaveBeenCalledWith(
        'Cross-Origin-Resource-Policy',
        'cross-origin',
      );
      expect(response.redirect).toHaveBeenCalledWith('https://storage.example/chat-images/image.png');
    });
  });
});
