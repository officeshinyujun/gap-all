import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatSender } from '../entities/chat-message.entity';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: jest.Mocked<Partial<ChatService>>;

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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatService }],
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
});
