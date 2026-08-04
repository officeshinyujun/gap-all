import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage, ChatSender } from '../entities/chat-message.entity';
import { Subject } from '../entities/subject.entity';
import { Question } from '../entities/question.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatAiService } from './chat-ai.service';
import { StudyService } from '../study/study.service';
import { ChatImageUploadService } from './chat-image-upload.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    private readonly chatAiService: ChatAiService,
    private readonly studyService: StudyService,
    private readonly imageUploadService: ChatImageUploadService,
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
  // 생성된 문제에 대한 사용자 답변 저장
  // ============================================================
  async saveAnswer(userId: string, messageId: string, answer: number) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['chatSession'],
    });
    if (!message) throw new NotFoundException('메시지를 찾을 수 없습니다.');
    if (message.chatSession?.userId !== userId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    // similarQuestions JSONB에 userAnswer 추가
    const existing = (message.similarQuestions as any) ?? {};
    await this.messageRepo.update(messageId, {
      similarQuestions: { ...existing, userAnswer: answer },
    });

    return { messageId, answer };
  }

  async getImageUrl(userId: string, filename: string) {
    const message = await this.messageRepo.findOne({
      where: { message: `[IMAGE:${filename}]` },
      relations: ['chatSession'],
    });
    if (!message || message.chatSession?.userId !== userId) {
      throw new NotFoundException('이미지를 찾을 수 없습니다.');
    }

    return this.imageUploadService.createSignedUrl(filename);
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

    // ── 이전 대화 히스토리 조회 (현재 메시지 저장 전에 — 이전 대화만 포함)
    const history = await this.messageRepo.find({
      where: { chatSessionId: sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    history.reverse();

    // 유저 메시지 저장
    const userMessage = await this.messageRepo.save(
      this.messageRepo.create({
        chatSessionId: sessionId,
        sender: ChatSender.USER,
        message: dto.message,
      }),
    );

    let aiText: string;
    let generatedQuestion: any = undefined;

    // ── 문제 생성 의도 감지 (채팅 모드에서도 "N문제 생성/출제해줘" 감지)
    const questionGenCountMatch = dto.message.match(
      /(\d+)\s*(?:문제|개)\s*(?:만들|생성|출제|내줘|줘|내|풀어)/,
    );
    const isQuestionGenRequest =
      questionGenCountMatch ||
      /(?:문제|문제들?)\s*(?:여러|많이|몇\s*개|만들|생성|출제|내줘|줘|내|풀어|좀)/.test(
        dto.message,
      );
    const effectiveMode =
      isQuestionGenRequest ? 'generate' : (dto.mode ?? 'chat');
    const questionCount = questionGenCountMatch
      ? Math.min(parseInt(questionGenCountMatch[1], 10), 5)
      : 1;

    if (effectiveMode === 'generate') {
      // ── AI 문제 생성 모드 ──

      let rawJson: string;
      try {
        rawJson = await this.chatAiService.generateExamQuestion(
          session.subject!.slug,
          session.subject!.title,
          dto.message,
          session.startUnit ?? undefined,
          session.endUnit ?? undefined,
          history,
          questionCount,
        );
      } catch (err: any) {
        aiText = `문제 생성 중 오류가 발생했어요.\n\n(${err?.message ?? '알 수 없는 오류'})`;
        const aiMessage = await this.messageRepo.save(
          this.messageRepo.create({ chatSessionId: sessionId, sender: ChatSender.AI, message: aiText }),
        );
        return { userMessage, aiMessage };
      }

      // JSON 파싱
      let parsed: any;
      try {
        const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawJson.trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        aiText = rawJson;
        const aiMessage = await this.messageRepo.save(
          this.messageRepo.create({ chatSessionId: sessionId, sender: ChatSender.AI, message: aiText }),
        );
        return { userMessage, aiMessage };
      }

      // 배열/단일 객체 모두 정규화
      const questions = Array.isArray(parsed) ? parsed : [parsed];

      if (questions.length === 0) {
        aiText = `문제를 생성하지 못했어요. 다시 시도해주세요.`;
        const aiMessage = await this.messageRepo.save(
          this.messageRepo.create({ chatSessionId: sessionId, sender: ChatSender.AI, message: aiText }),
        );
        return { userMessage, aiMessage };
      }

      if (questions.length === 1) {
        const q = questions[0];
        generatedQuestion = {
          question_stem: q.question_stem ?? '',
          stimulus: q.stimulus ?? '',
          combo_title: q.combo_title ?? '',
          combo_items: q.combo_items ?? [],
          options: q.options ?? [],
          correct_answer: q.correct_answer ?? null,
          explanation: q.explanation ?? '',
          target_concept: q.target_concept ?? '',
          difficulty: q.difficulty ?? '중',
        };
        aiText = `📝 이 문제를 풀어보세요.\n\n(출제 의도와 해설은 정답 선택 후 확인할 수 있어요)`;
      } else {
        // 여러 문제: 정규화해서 배열로 저장
        generatedQuestion = questions.map((q: any) => ({
          question_stem: q.question_stem ?? '',
          stimulus: q.stimulus ?? '',
          combo_title: q.combo_title ?? '',
          combo_items: q.combo_items ?? [],
          options: q.options ?? [],
          correct_answer: q.correct_answer ?? null,
          explanation: q.explanation ?? '',
          target_concept: q.target_concept ?? '',
          difficulty: q.difficulty ?? '중',
        }));
        const concepts = generatedQuestion
          .map((q: any) => q.target_concept)
          .filter(Boolean);
        const conceptLine =
          concepts.length > 0
            ? `\n다루는 개념: ${concepts.join(', ')}`
            : '';
        aiText = `📝 ${generatedQuestion.length}개의 문제를 생성했어요!${conceptLine}\n\n각 문제를 차례로 풀어보세요. 정답 선택 후 해설을 확인할 수 있어요.`;
      }
    } else {
      // ── 일반 채팅 모드 ──
      aiText = await this.chatAiService.getResponse(
        session.subject!.slug,
        session.subject!.title,
        history,
        dto.message,
        session.startUnit ?? undefined,
        session.endUnit ?? undefined,
      );
    }

    // AI 메시지 저장
    const aiMessage = await this.messageRepo.save(
      this.messageRepo.create({
        chatSessionId: sessionId,
        sender: ChatSender.AI,
        message: aiText,
        similarQuestions: generatedQuestion ?? null,
      }),
    );

    return { userMessage, aiMessage, generatedQuestion };
  }

  // ============================================================
  // 이미지 문제 처리
  // ============================================================
  async processImageQuestion(
    userId: string,
    sessionId: string,
    imageBuffer: Buffer,
    imageMimeType: string,
  ) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['subject'],
    });
    if (!session) throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    if (session.userId !== userId)
      throw new ForbiddenException('접근 권한이 없습니다.');

    // 1. GPT-4o Vision OCR
    const extracted =
      await this.chatAiService.extractQuestionFromImage(imageBuffer, imageMimeType);

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
      const lines = [`## 문제 분석`, ``, `**정답: ${extracted.answer}**`, ``];
      if (v2.solvingFlow?.length > 0) {
        lines.push(`### 풀이 흐름`);
        v2.solvingFlow.forEach((s: any) =>
          lines.push(`${s.step}. ${s.action}`),
        );
        lines.push('');
      }
      if (v2.optionAnalysis?.length > 0) {
        lines.push(`### 선택지 분석`);
        v2.optionAnalysis.forEach((o: any) => {
          const label =
            extracted.box_items.length > 0
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
      explanationText =
        await this.chatAiService.generateQuestionExplanation(extracted);
    }

    // 4. 유사 문제 검색
    const similarQuestions =
      (await this.studyService.findSimilarByConceptNames(
        extracted.target_concepts,
        5,
      )) ?? [];

    // 5. 이미지 Supabase Storage 저장
    const imageFilename = await this.imageUploadService.uploadImage(
      imageBuffer,
      imageMimeType,
    );
    const imageUrlMsg = `[IMAGE:${imageFilename}]`;

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
