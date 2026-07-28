import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ChatService } from './chat.service';
import { ChatAiService } from './chat-ai.service';
import { StudyService } from '../study/study.service';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, ChatSender } from '../entities/chat-message.entity';
import { Subject } from '../entities/subject.entity';

describe('ChatService', () => {
  let service: ChatService;
  let sessionRepo: jest.Mocked<Repository<ChatSession>>;
  let messageRepo: jest.Mocked<Repository<ChatMessage>>;
  let subjectRepo: jest.Mocked<Repository<Subject>>;
  let chatAiService: jest.Mocked<ChatAiService>;

  const mockSubject: Subject = {
    id: 'subj-1',
    slug: 'success',
    title: '성공적인 직업생활',
    units: [],
    exams: [],
    studyProgressList: [],
    incorrectRecords: [],
  };

  const mockSession: ChatSession = {
    id: 'session-1',
    userId: 'user-1',
    subjectId: 'subj-1',
    title: '테스트 채팅',
    startUnit: 1,
    endUnit: 3,
    subject: mockSubject,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserMessage: ChatMessage = {
    id: 'msg-1',
    chatSessionId: 'session-1',
    sender: ChatSender.USER,
    message: '안녕하세요',
    createdAt: new Date(),
  };

  const mockAiMessage: ChatMessage = {
    id: 'msg-2',
    chatSessionId: 'session-1',
    sender: ChatSender.AI,
    message: '안녕하세요! 무엇을 도와드릴까요?',
    similarQuestions: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockSessionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const mockMessageRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const mockSubjectRepo = { findOne: jest.fn() };
    const mockChatAiService = { getResponse: jest.fn(), extractQuestionFromImage: jest.fn(), generateQuestionExplanation: jest.fn() };
    const mockStudyService = { findQuestionBySourceAndNumber: jest.fn(), findSimilarByConceptNames: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(ChatSession), useValue: mockSessionRepo },
        { provide: getRepositoryToken(ChatMessage), useValue: mockMessageRepo },
        { provide: getRepositoryToken(Subject), useValue: mockSubjectRepo },
        { provide: ChatAiService, useValue: mockChatAiService },
        { provide: StudyService, useValue: mockStudyService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    sessionRepo = module.get(getRepositoryToken(ChatSession));
    messageRepo = module.get(getRepositoryToken(ChatMessage));
    subjectRepo = module.get(getRepositoryToken(Subject));
    chatAiService = module.get(ChatAiService);
  });

  describe('findAllSessions', () => {
    it('사용자의 모든 채팅 세션 반환', async () => {
      sessionRepo.find.mockResolvedValue([mockSession] as any);
      const result = await service.findAllSessions('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('테스트 채팅');
    });
  });

  describe('createSession', () => {
    it('과목 존재 시 세션 생성', async () => {
      subjectRepo.findOne.mockResolvedValue(mockSubject);
      sessionRepo.create.mockReturnValue(mockSession);
      sessionRepo.save.mockResolvedValue(mockSession);

      const result = await service.createSession('user-1', {
        subjectId: 'subj-1',
        title: '테스트 채팅',
      });

      expect(result.session.title).toBe('테스트 채팅');
    });

    it('없는 과목이면 NotFoundException', async () => {
      subjectRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createSession('user-1', { subjectId: 'invalid', title: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneSession', () => {
    it('내 세션 조회 성공', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...mockSession, messages: [] } as any);
      const result = await service.findOneSession('user-1', 'session-1');
      expect(result.title).toBe('테스트 채팅');
    });

    it('다른 사용자 세션이면 ForbiddenException', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...mockSession, userId: 'other-user' } as any);
      await expect(service.findOneSession('user-1', 'session-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('없는 세션이면 NotFoundException', async () => {
      sessionRepo.findOne.mockResolvedValue(null);
      await expect(service.findOneSession('user-1', 'none')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeSession', () => {
    it('내 세션 삭제 성공', async () => {
      sessionRepo.findOne.mockResolvedValue(mockSession as any);
      sessionRepo.remove.mockResolvedValue(mockSession);
      const result = await service.removeSession('user-1', 'session-1');
      expect(result.message).toBe('채팅 세션이 삭제되었습니다.');
    });

    it('다른 사용자 세션이면 ForbiddenException', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...mockSession, userId: 'other' } as any);
      await expect(service.removeSession('user-1', 'session-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('sendMessage', () => {
    it('메시지 전송 및 AI 응답 저장', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...mockSession, subject: mockSubject } as any);
      messageRepo.find.mockResolvedValue([]);
      chatAiService.getResponse.mockResolvedValue('AI 응답입니다.');
      messageRepo.create.mockReturnValueOnce(mockUserMessage).mockReturnValueOnce(mockAiMessage);
      messageRepo.save
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAiMessage);

      const result = await service.sendMessage('user-1', 'session-1', { message: '안녕하세요' });

      expect(result.userMessage.sender).toBe(ChatSender.USER);
      expect(result.aiMessage.sender).toBe(ChatSender.AI);
    });

    it('다른 사용자 세션이면 ForbiddenException', async () => {
      sessionRepo.findOne.mockResolvedValue({
        ...mockSession, userId: 'other', subject: mockSubject,
      } as any);
      await expect(
        service.sendMessage('user-1', 'session-1', { message: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
