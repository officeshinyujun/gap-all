import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, ChatSender } from '../entities/chat-message.entity';
import { Subject } from '../entities/subject.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatAiService } from './chat-ai.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    private readonly chatAiService: ChatAiService,
  ) {}

  // ============================================================
  // 세션 목록 조회
  // ============================================================
  async findAllSessions(userId: string) {
    return this.sessionRepo.find({
      where: { userId },
      relations: ['subject'],
      order: { createdAt: 'DESC' },
    });
  }

  // ============================================================
  // 세션 생성
  // ============================================================
  async createSession(userId: string, dto: CreateSessionDto) {
    const subject = await this.subjectRepo.findOne({
      where: { id: dto.subjectId },
    });
    if (!subject) {
      throw new NotFoundException(`과목을 찾을 수 없습니다: ${dto.subjectId}`);
    }

    const session = this.sessionRepo.create({
      userId,
      subjectId: dto.subjectId,
      title: dto.title,
      startUnit: dto.startUnit ?? null,
      endUnit: dto.endUnit ?? null,
    });
    const saved = await this.sessionRepo.save(session);

    return { session: { ...saved, subject } };
  }

  // ============================================================
  // 세션 상세 조회 (메시지 포함)
  // ============================================================
  async findOneSession(userId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['subject', 'messages'],
      order: { messages: { createdAt: 'ASC' } },
    });
    if (!session) {
      throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }
    return session;
  }

  // ============================================================
  // 세션 삭제 (메시지 cascade)
  // ============================================================
  async removeSession(userId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }
    await this.sessionRepo.remove(session);
    return { message: '채팅 세션이 삭제되었습니다.' };
  }

  // ============================================================
  // 메시지 전송 + AI 응답
  // ============================================================
  async sendMessage(userId: string, sessionId: string, dto: SendMessageDto) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['subject'],
    });
    if (!session) {
      throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    // 히스토리 조회 (최근 10개 — AI 서비스에서도 슬라이싱하지만 DB 부하 줄이기 위해 여기서도 제한)
    const history = await this.messageRepo.find({
      where: { chatSessionId: sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    history.reverse(); // 오래된 순으로 정렬

    // AI 응답 생성
    const aiText = await this.chatAiService.getResponse(
      session.subject!.slug,
      session.subject!.title,
      history,
      dto.message,
      session.startUnit ?? undefined,
      session.endUnit ?? undefined,
    );

    // 유저 메시지 저장
    const userMessage = await this.messageRepo.save(
      this.messageRepo.create({
        chatSessionId: sessionId,
        sender: ChatSender.USER,
        message: dto.message,
      }),
    );

    // AI 메시지 저장
    const aiMessage = await this.messageRepo.save(
      this.messageRepo.create({
        chatSessionId: sessionId,
        sender: ChatSender.AI,
        message: aiText,
      }),
    );

    return { userMessage, aiMessage };
  }
}
