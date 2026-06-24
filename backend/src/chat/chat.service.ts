import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, ChatSender } from '../entities/chat-message.entity';
import { Subject } from '../entities/subject.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatAiService } from './chat-ai.service';
import { StudyService } from '../study/study.service';

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
    private readonly studyService: StudyService,
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

  // ============================================================
  // 이미지 문제 처리
  // ============================================================
  async processImageQuestion(userId: string, sessionId: string, imageBuffer: Buffer) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['subject'],
    });
    if (!session) throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    if (session.userId !== userId) throw new ForbiddenException('접근 권한이 없습니다.');

    // 1. GPT-4o Vision OCR
    const extracted = await this.chatAiService.extractQuestionFromImage(imageBuffer);

    // 2. 기존 문제 매칭
    const matched = this.studyService.findQuestionBySourceAndNumber(
      extracted.source_exam,
      extracted.number,
    );

    // 3. 해설 생성
    let explanationText: string;
    if (matched?.conceptHighlightV2) {
      const v2 = matched.conceptHighlightV2;
      const markers = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'];
      const lines = [
        `## 문제 분석`,
        ``,
        `**정답: ${extracted.answer}**`,
        ``,
      ];
      if (v2.solvingFlow?.length > 0) {
        lines.push(`### 풀이 흐름`);
        v2.solvingFlow.forEach((s: any) => lines.push(`${s.step}. ${s.action}`));
        lines.push('');
      }
      if (v2.optionAnalysis?.length > 0) {
        lines.push(`### 선택지 분석`);
        v2.optionAnalysis.forEach((o: any) => {
          const label = extracted.box_items.length > 0
            ? (markers[o.optionNum - 1] ?? o.optionNum)
            : `${o.optionNum}번`;
          lines.push(`- **${label}(${o.verdict})**: ${o.reasoning}`);
        });
        lines.push('');
      }
      if (v2.takeaway) {
        lines.push(`### 핵심 교훈`);
        lines.push(v2.takeaway);
      }
      explanationText = lines.join('\n');
    } else {
      explanationText = await this.chatAiService.generateQuestionExplanation(extracted);
    }

    // 4. 유사 문제 검색
    console.log('[DEBUG] GPT extracted concepts:', extracted.target_concepts);
    const similarQuestions = this.studyService.findSimilarByConceptNames(
      extracted.target_concepts,
      5,
    );
    console.log('[DEBUG] Found similar questions count:', similarQuestions.length);

    // 5. 이미지 로컬 저장 (프론트엔드 표시용)
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filename = `${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(uploadsDir, filename), imageBuffer);
    const imageUrlMsg = `[IMAGE:${filename}]`;

    // 6. 메시지 저장
    const userMessage = await this.messageRepo.save(
      this.messageRepo.create({
        chatSessionId: sessionId,
        sender: ChatSender.USER,
        message: imageUrlMsg,
      }),
    );
    const aiMessage = await this.messageRepo.save(
      this.messageRepo.create({
        chatSessionId: sessionId,
        sender: ChatSender.AI,
        message: explanationText,
        similarQuestions: similarQuestions.length > 0 ? similarQuestions : null,
      }),
    );

    return { userMessage, aiMessage, similarQuestions };
  }
}
