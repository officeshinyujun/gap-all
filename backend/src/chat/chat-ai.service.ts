import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type OpenAI from 'openai';
import { ChatMessage, ChatSender } from '../entities/chat-message.entity';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';
import { TextbookService } from '../textbook/textbook.service';
import { getOpenAIClient } from '../lib/openai-keys';

const HISTORY_LIMIT = 10;

@Injectable()
export class ChatAiService {
  private readonly model: string;
  private readonly logger = new Logger(ChatAiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly textbookService: TextbookService,
    private readonly embeddingService: TextbookEmbeddingService,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepo: Repository<AiUsageLog>,
  ) {
    this.model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o';
  }

  async getResponse(
    subjectSlug: string,
    subjectTitle: string,
    history: ChatMessage[],
    userMessage: string,
    startUnit?: number,
    endUnit?: number,
  ): Promise<string> {
    const mentionedUnit = this.extractUnitNumber(userMessage);
    const effectiveStartUnit = mentionedUnit ?? startUnit;
    const effectiveEndUnit = mentionedUnit ?? endUnit;
    const unitRange =
      effectiveStartUnit && effectiveEndUnit
        ? `${effectiveStartUnit}단원 ~ ${effectiveEndUnit}단원`
        : effectiveStartUnit
          ? `${effectiveStartUnit}단원`
          : '전체 단원';
    const isUnitSummaryRequest =
      mentionedUnit !== undefined &&
      /설명해|정리해|요약해|알려줘|말해줘/.test(userMessage);

    const isConcept = this.isConceptQuestion(userMessage);
    const conceptCandidate = this.extractConceptCandidate(userMessage);
    let conceptContext = '';

    if (isConcept && conceptCandidate) {
      this.logger.debug('개념 질문 감지');
      conceptContext = await this.lookupConceptContext(
        subjectSlug,
        effectiveStartUnit,
        effectiveEndUnit,
        conceptCandidate,
      );
      if (conceptContext) {
        this.logger.debug(`개념 컨텍스트 매칭 성공`);
      } else {
        this.logger.debug(`개념 컨텍스트 매칭 실패 — RAG fallback 진행`);
      }
    }

    let textbookContext = '';
    try {
      let chunks: string[];
      if (mentionedUnit) {
        chunks = await this.embeddingService.getAllChunksForUnit(
          subjectSlug,
          mentionedUnit,
        );
      } else {
        chunks = await this.embeddingService.searchSimilarChunks(
          subjectSlug,
          userMessage,
          startUnit,
          endUnit,
        );

        const keyword = this.extractQuotedOrNounLikeKeyword(userMessage);
        if (keyword) {
          const keywordChunks =
            await this.embeddingService.searchChunksByKeyword(
              subjectSlug,
              keyword,
              startUnit,
              endUnit,
            );

          if (keywordChunks.length > 0) {
            chunks = this.mergeChunks(keywordChunks, chunks);
          }
        }
      }

      if (chunks.length > 0) {
        const chunkContext = chunks.join('\n\n');
        this.logger.debug(`RAG 검색 완료: ${chunks.length}개 청크 사용`);
        textbookContext = conceptContext
          ? `${conceptContext}\n\n${chunkContext}`
          : chunkContext;
      } else if (conceptContext) {
        textbookContext = conceptContext;
      } else {
        this.logger.warn(
          `임베딩 없음 — summation fallback 사용: ${subjectSlug}`,
        );
        textbookContext = await this.loadSummationFallback(
          subjectSlug,
          effectiveStartUnit,
          effectiveEndUnit,
        );
      }
    } catch {
      this.logger.warn('RAG 검색 실패, fallback 사용');
      textbookContext = conceptContext
        ? conceptContext
        : await this.loadSummationFallback(
            subjectSlug,
            effectiveStartUnit,
            effectiveEndUnit,
          );
    }

    const unitRequestGuidance = isUnitSummaryRequest
      ? [
          `## 특별 지시사항`,
          `사용자가 ${mentionedUnit}단원에 대한 설명/요약을 요청했습니다. 아래 제공된 ${mentionedUnit}단원 교과 내용을 종합하여:`,
          `1) 단원명과 핵심 주제`,
          `2) 주요 개념과 정의`,
          `3) 반드시 기억해야 할 포인트`,
          `4) 자주 실수하는 함정`,
          `순서로 체계적으로 정리해주세요. 절대 "범위 밖"이라며 거절하지 마세요.`,
          ``,
        ]
      : [];

    const systemPrompt = [
      `당신은 "${subjectTitle}" 과목의 전문 튜터입니다. 특성화고 학생들이 시험을 준비할 수 있도록 돕고 있습니다.`,
      ``,
      `## 성격과 말투`,
      `- 친근하고 편안한 반말을 사용하세요. "~야", "~거든", "~하는 게 좋아" 같은 자연스러운 문어체 반말로 대화하세요.`,
      `- 학생이 모르는 것을 부끄러워하지 않도록 격려하는 태도를 유지하세요.`,
      `- 길게 늘어지지 않고 핵심을 짧고 명확하게 전달하세요.`,
      `- 개념을 설명할 때는 실제 사례나 비유를 들어 쉽게 풀어주세요.`,
      ``,
      `## 답변 원칙`,
      `1. 아래 제공된 교과 내용을 바탕으로 답변하세요. 이것이 당신의 알고 있는 지식입니다.`,
      `2. 제공된 내용으로 답할 수 없는 질문이라도, 관련된 내용을 찾아 최대한 도움이 되는 답변을 시도하세요. "모르겠다"는 말 대신 "이 부분에 대해서는 다음과 같은 관련 내용이 있어"라고 연결해주세요.`,
      `3. 교과 내용과 정말 무관한 질문(예: 날씨, 연예인)에는 "이 과목과 관련된 질문을 부탁해!"라고 자연스럽게 안내하세요.`,
      `4. 당신의 답변에 "교과 내용", "지식 베이스", "참고 자료", "청크" 같은 시스템 용어를 절대 언급하지 마세요. 당신이 가진 지식인 것처럼 자연스럽게 답하세요.`,
      `5. "제공된 범위", "학습 범위" 같은 표현도 사용하지 마세요. 그냥 아는 대로 가르쳐주는 선생님처럼 행동하세요.`,
      ``,
      ...unitRequestGuidance,
      `## 학생과의 상호작용 방식`,
      `- 복잡한 개념은 논리적 단계로 차근차근 설명하세요.`,
      `- 교과서 문장을 그대로 옮기지 말고, 학생이 이해하기 쉽게 풀어서 설명하세요.`,
      `- 답변 마지막에는 "이해됐어?" 또는 간단한 확인 질문으로 학생의 이해도를 체크하세요.`,
      `- Markdown 형식(제목, 리스트, 강조)을 활용해 가독성 좋게 작성하세요.`,
      ``,
      `## 현재 수업 범위: ${unitRange}`,
      ``,
      `## 교과 내용`,
      textbookContext,
      ``,
      `위 내용을 바탕으로 학생의 질문에 답변해주세요.`,
    ].join('\n');

    const recentHistory = history.slice(-HISTORY_LIMIT);
    const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] =
      recentHistory.map((msg) => ({
        role: msg.sender === ChatSender.USER ? 'user' : 'assistant',
        content: msg.message,
      }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    this.logger.debug(
      `Chat AI 호출: subject=${subjectSlug}, historyCount=${recentHistory.length}`,
    );

    const response = await getOpenAIClient().chat.completions.create({
      model: this.model,
      messages,
    });

    const usage = response.usage;
    if (usage) {
      await this.aiUsageLogRepo.save(
        this.aiUsageLogRepo.create({
          source: AiUsageSource.CHAT,
          model: this.model,
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }),
      );
    }

    return (
      response.choices[0]?.message?.content ?? '응답을 생성할 수 없습니다.'
    );
  }

  // ============================================================
  // GPT-4o Vision: 이미지에서 문제 구조 추출
  // ============================================================
  async extractQuestionFromImage(imageBuffer: Buffer, mimeType = 'image/jpeg'): Promise<{
    source_exam: string | null;
    number: number | null;
    stem: string;
    stimulus: string;
    box_items: string[];
    options: string[];
    answer: string;
    target_concepts: string[];
  }> {
    const base64 = imageBuffer.toString('base64');

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `이 이미지는 한국 수능/모의고사 성공적인 직업생활 문제입니다.
다음 정보를 JSON으로 추출하세요. 없으면 null 또는 빈 배열로 설정하세요.

{
  "source_exam": "출처 시험명 (예: 2023학년도 대학수학능력시험 성공적인 직업생활) 또는 null",
  "number": 문항번호(숫자) 또는 null,
  "stem": "발문 텍스트 (문항번호 제외)",
  "stimulus": "지문/제시 자료 텍스트 (없으면 빈 문자열)",
  "box_items": ["ㄱ 보기 내용", "ㄴ 보기 내용"] 또는 [],
  "options": ["① 선택지 내용", "② 선택지 내용", ...],
  "answer": "정답 (①②③④⑤ 중 하나) 또는 빈 문자열",
  "target_concepts": ["관련 개념명1", "개념명2"] (이 문제에서 다루는 핵심 개념, 1~3개)
}

JSON만 반환하세요.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content);
      return {
        source_exam: parsed.source_exam ?? null,
        number: parsed.number ?? null,
        stem: parsed.stem ?? '',
        stimulus: parsed.stimulus ?? '',
        box_items: parsed.box_items ?? [],
        options: parsed.options ?? [],
        answer: parsed.answer ?? '',
        target_concepts: parsed.target_concepts ?? [],
      };
    } catch {
      return {
        source_exam: null,
        number: null,
        stem: '',
        stimulus: '',
        box_items: [],
        options: [],
        answer: '',
        target_concepts: [],
      };
    }
  }

  // ============================================================
  // GPT-4o: 새 문제 해설 생성
  // ============================================================
  async generateQuestionExplanation(extracted: {
    stem: string;
    stimulus: string;
    box_items: string[];
    options: string[];
    answer: string;
    target_concepts: string[];
  }): Promise<string> {
    const markers = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'];
    const prompt = `다음 수능/모의고사 문제를 분석하고 상세한 해설을 작성하세요.

발문: ${extracted.stem}

지문:
${extracted.stimulus || '(없음)'}

보기:
${extracted.box_items.length > 0 ? extracted.box_items.map((item, i) => `${markers[i] ?? i + 1}. ${item}`).join('\n') : '(없음)'}

선택지:
${extracted.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

정답: ${extracted.answer}

다음 형식으로 해설을 작성하세요:

## 문제 분석

**정답: ${extracted.answer}번**

### 풀이 흐름
1. ...
2. ...

### 선택지 분석
(각 보기 또는 선택지별 O/X와 근거)

### 핵심 교훈
(이 문제 유형에서 반드시 알아야 할 포인트)`;

    const response = await getOpenAIClient().chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });

    return (
      response.choices[0]?.message?.content ?? '해설을 생성할 수 없습니다.'
    );
  }

  // ============================================================
  // GPT-4o: 기출 스타일 문제 생성 + 해설
  // ============================================================
  async generateExamQuestion(
    subjectSlug: string,
    subjectTitle: string,
    topic: string,
    startUnit?: number,
    endUnit?: number,
    conversationHistory?: ChatMessage[],
    count: number = 1,
  ): Promise<string> {
    try {
    // ── 유닛 및 대화 컨텍스트 추출 ──
    // 1) 현재 메시지에서 언급된 단원 추출
    let mentionedUnit = this.extractUnitNumber(topic);

    // 2) 현재 메시지에 없으면 대화 이력에서 마지막으로 언급된 단원 찾기
    if (!mentionedUnit && conversationHistory) {
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const u = this.extractUnitNumber(conversationHistory[i].message);
        if (u) {
          mentionedUnit = u;
          break;
        }
      }
    }

    // 3) 모호한 지시어("이에 대한", "이걸로" 등)가 있으면 대화 컨텍스트 구성
    const isVagueReference =
      /이에\s*(대한|대해|관한|관해)|이걸로|이\s*문제|이\s*주제/.test(topic);
    let conversationContext = '';
    if (isVagueReference && conversationHistory && conversationHistory.length > 0) {
      const lastMessages = conversationHistory.slice(-4);
      conversationContext = [
        `## 최근 대화 컨텍스트 (이 대화에서 다루던 주제를 참고하세요)`,
        ...lastMessages.map(
          (m) =>
            `[${m.sender === 'USER' ? '학생' : '튜터'}]: ${m.message.slice(0, 300)}`,
        ),
      ].join('\n');
    }

    // 4) 단원 범위 결정: 특정 단원이 언급되었으면 그 주변으로 좁힘
    const effectiveStart = mentionedUnit ?? (startUnit ?? 1);
    const effectiveEnd = mentionedUnit ?? (endUnit ?? 20);
    const rangeText =
      effectiveStart === effectiveEnd
        ? `${effectiveStart}단원`
        : `${effectiveStart}단원 ~ ${effectiveEnd}단원`;

    // 교과 컨텍스트 로드: 언급된 단원 중심으로 최대 5단원 로드
    const textbookSections: string[] = [];
    if (mentionedUnit && (effectiveEnd - effectiveStart) > 4) {
      // 넓은 범위 + 특정 단원이 있으면, 그 단원 중심으로 ±2 단원 로드
      const halfWindow = 2;
      const loadStart = Math.max(startUnit ?? 1, mentionedUnit - halfWindow);
      const loadEnd = Math.min(endUnit ?? 20, mentionedUnit + halfWindow);
      for (let u = loadStart; u <= loadEnd; u++) {
        try {
          const raw = await this.textbookService.getSummationMd(subjectSlug, u);
          const text = this.textbookService.extractTextFromSummation(raw);
          textbookSections.push(`[${u}단원]\n${text.slice(0, 2000)}`);
        } catch (e) { /* skip unit */ }
      }
    } else {
      // 좁은 범위거나 특정 단원 없으면, start부터 최대 5단원
      for (let u = effectiveStart; u <= Math.min(effectiveEnd, effectiveStart + 4); u++) {
        try {
          const raw = await this.textbookService.getSummationMd(subjectSlug, u);
          const text = this.textbookService.extractTextFromSummation(raw);
          textbookSections.push(`[${u}단원]\n${text.slice(0, 2000)}`);
        } catch (e) { /* skip unit */ }
      }
    }

    const textbookContext = textbookSections.length > 0
      ? textbookSections.join('\n\n')
      : '교과 내용을 불러올 수 없습니다.';

    const systemPrompt = [
      `당신은 "${subjectTitle}" 과목의 수능/모의고사 문제 출제 전문가입니다.`,
      `특성화고 학생들의 사고력을 측정하는 객관식 문제를 출제합니다.`,
      ``,
      `## 핵심 출제 원칙`,
      `- 아래 [교과 내용]을 바탕으로 문제를 출제하세요.`,
      `- 문제 범위: ${rangeText} — 반드시 이 범위의 내용에서만 출제하세요.`,
      `- 사용자가 요청한 주제: "${topic}"`,
      ``,
      ...(conversationContext ? [conversationContext, ``] : []),
      `## ⚠️ 절대 금지 사항`,
      `1. 문제 발문, 지문, 선택지 어디에도 "${topic}"이나 개념명을 직접 언급하지 마세요.`,
      `2. "근로기준법", "근로계약", "해고" 등의 개념 용어 자체를 문제에 쓰지 마세요.`,
      `3. 학생이 개념을 스스로 도출할 수 있도록, 상황/사례/판례를 통해 간접적으로 물어보세요.`,
      `4. 예: "근로기준법"을 묻고 싶으면 → "다음 중 근로자의 권리를 침해한 사례로 옳은 것은?"`,
      `5. 위 [교과 내용]에 포함된 ${rangeText} 범위 밖의 내용은 절대 사용하지 마세요.`,
      ``,
      `## 문제 형식`,
      `- 수능 스타일: 발문 → 사례/지문 → 필요시 보기(ㄱㄴㄷ) → 5지선다`,
      `- 실제 시험 난이도로 출제`,
      `- 정답은 교과 내용에 근거`,
      `- 오답지는 학생들이 자주 헷갈리는 개념으로 구성`,
      ``,
      `## 교과 내용 (${rangeText})`,
      textbookContext,
      ``,
      ``,
      `## 해설 작성 지침`,
      `- 해설(explanation)에서 비로소 "${topic}" 개념을 밝히고 설명하세요.`,
      `- 왜 정답인지, 각 오답이 왜 틀렸는지 간결하게 설명하세요.`,
      `- "이 문제는 ~개념을 묻는 문제입니다"로 시작하세요.`,
      ``,
      ...(count > 1
        ? [
            `## 중요: ${count}개 문제 생성`,
            `- 서로 다른 개념/주제를 테스트하는 ${count}개의 문제를 생성하세요.`,
            `- 각 문제는 교과 내용의 다른 부분에서 출제해야 합니다.`,
            `- 난이도(하/중/상)가 골고루 분포되도록 하세요.`,
            `- 문제 유형도 다양하게(단순 지식, 사례 적용, 개념 비교 등) 구성하세요.`,
            ``,
            `## 출력 형식 (JSON ONLY, 코드블럭 없이 순수 JSON 배열)`,
            `[`,
            `  {`,
            `    "question_stem": "question text without mentioning the concept name",`,
            `    "stimulus": "case study or passage, empty string if none",`,
            `    "combo_title": "title for combo block, empty if none",`,
            `    "combo_items": [{"key": "ㄱ", "text": "item text"}],`,
            `    "options": ["(1) option1", "(2) option2", "(3) option3", "(4) option4", "(5) option5"],`,
            `    "correct_answer": 3,`,
            `    "explanation": "This question tests the concept of X. ...",`,
            `    "target_concept": "the core concept name being tested",`,
            `    "difficulty": "하 or 중 or 상"`,
            `  }`,
            `]`,
          ]
        : [
            `## 출력 형식 (JSON ONLY, 코드블럭 없이 순수 JSON)`,
            `{`,
            `  "question_stem": "question text without mentioning the concept name",`,
            `  "stimulus": "case study or passage, empty string if none",`,
            `  "combo_title": "title for combo block, empty if none",`,
            `  "combo_items": [{"key": "ㄱ", "text": "item text"}],`,
            `  "options": ["(1) option1", "(2) option2", "(3) option3", "(4) option4", "(5) option5"],`,
            `  "correct_answer": 3,`,
            `  "explanation": "This question tests the concept of X. explain why correct, why each wrong answer is wrong",`,
            `  "target_concept": "the core concept name being tested",`,
            `  "difficulty": "하 or 중 or 상"`,
            `}`,
          ]),
    ].join('\n');

    this.logger.log('generateExamQuestion: calling OpenAI');

    const response = await getOpenAIClient().chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: topic },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    this.logger.log(`generateExamQuestion: OpenAI response received (${content.length} chars)`);

    // 토큰 사용량 로깅
    const usage = response.usage;
    if (usage) {
      await this.aiUsageLogRepo.save(
        this.aiUsageLogRepo.create({
          source: AiUsageSource.CHAT,
          model: this.model,
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }),
      );
    }

    return content;
    } catch (err: unknown) {
      this.logger.error('generateExamQuestion failed');
      throw err;
    }
  }

  private async loadSummationFallback(
    subjectSlug: string,
    startUnit?: number,
    endUnit?: number,
  ): Promise<string> {
    try {
      const from = startUnit ?? 1;
      const to = Math.min(endUnit ?? from + 4, from + 4); // 최대 5단원
      const results: string[] = [];

      for (let u = from; u <= to; u++) {
        try {
          const rawMd = await this.textbookService.getSummationMd(subjectSlug, u);
          // extracted text 사용 (raw JSON 대신 구조화된 텍스트)
          const text =
            this.textbookService.extractTextFromSummation(rawMd);
          // 한 단원당 최대 4000자까지 (extractTextFromSummation으로 더 풍부해짐)
          results.push(
            `[${u}단원]\n${text.slice(0, 4000)}`,
          );
        } catch {
          // 해당 단원 없으면 스킵
        }
      }

      if (results.length === 0) return '';
      this.logger.debug(`Fallback: ${results.length}개 단원 로드됨`);
      return results.join('\n\n');
    } catch {
      this.logger.warn(`Fallback 교재 로드 실패: ${subjectSlug}`);
      return '';
    }
  }

  private extractUnitNumber(message: string): number | undefined {
    const match = message.match(/(\d+)\s*단원/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  private extractQuotedOrNounLikeKeyword(message: string): string | undefined {
    const cleaned = message.replace(/[?!.]+/g, ' ').trim();

    // 따옴표로 감싼 용어 추출 (일반 따옴표 + 스마트 따옴표)
    const allQuotes = '"\u201C\u201D\u2018\u2019\u300C\u300D';
    const quotedMatch = cleaned.match(
      new RegExp(`[${allQuotes}]([^${allQuotes}]{2,30})[${allQuotes}]`),
    );
    if (quotedMatch) {
      return quotedMatch[1].trim();
    }

    const stopWords = new Set([
      '은', '는', '이', '가', '을', '를', '에', '의', '로', '으로',
      '에서', '에게', '한테', '보다', '도', '만', '까지', '조차', '마저',
      '부터', '나', '이나', '든지', '든가', '라고', '이라', '라',
      '그', '그거', '그런거', '이거', '저거', '뭐', '어떤', '어떻게',
      '있잖아', '아', '뭐지', '뭐더라', '무엇', '어디', '언제', '누가',
      '대해서', '대해', '대한', '관해서', '관한',
      '설명해봐', '설명', '설명해줘', '설명해', '요약', '정리',
      '알려줘', '말해줘', '가르쳐줘', '알아', '몰라',
      '하는', '있는', '것', '수', '있다', '없다',
    ]);

    // 1차: 공백과 문장부호로 분할
    const rawTokens = cleaned
      .split(/[\s,.[\](){}<>/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    // 2차: 후치 조사 제거 (ex: "근로기준법은" → "근로기준법")
    const filteredTokens: string[] = [];
    for (const token of rawTokens) {
      const stripped = token.replace(
        /(은|는|이|가|을|를|에|의|로|으로|에서|에게|한테|보다|도|만|까지|조차|마저|부터|나|이나|든지|든가|라고|이라|라|란|라는|과|와|하고|하며|이고|이며)$/,
        '',
      );
      const candidate = stripped.length >= 2 ? stripped : token;
      if (!stopWords.has(candidate) && candidate.length >= 2) {
        filteredTokens.push(candidate);
      }
    }

    if (filteredTokens.length === 0) return undefined;

    // 3차: 연속된 의미 토큰을 복합 키워드로 병합
    // ex: ["근로", "기준법", "적용"] → "근로 기준법 적용"
    const phrases: string[] = [];
    const maxWindow = Math.min(3, filteredTokens.length);
    for (let w = maxWindow; w >= 1; w--) {
      for (let i = 0; i <= filteredTokens.length - w; i++) {
        const phrase = filteredTokens.slice(i, i + w).join(' ');
        if (phrase.length >= 3 && phrase.length <= 60) {
          phrases.push(phrase);
        }
      }
    }

    return phrases.sort((a, b) => b.length - a.length)[0];
  }

  private mergeChunks(primary: string[], secondary: string[]): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();

    for (const chunk of [...primary, ...secondary]) {
      if (!seen.has(chunk)) {
        seen.add(chunk);
        merged.push(chunk);
      }
    }

    return merged;
  }

  private isConceptQuestion(message: string): boolean {
    return /(?:가|이)\s*뭐야|란\?|뜻|정의|설명해줘|알려줘|(?:가|이)\s*뭔지/.test(
      message,
    );
  }

  private extractConceptCandidate(message: string): string | undefined {
    const cleaned = message.replace(/[?!.]/g, '').trim();

    const quotedMatch = cleaned.match(/["'""'']([^"'""'']{2,30})["'""'']/);
    if (quotedMatch) {
      return quotedMatch[1].trim();
    }

    const stripped = cleaned
      .replace(
        /(?:이|가)\s*뭔지.*$|(?:이|가)\s*뭐야.*$|란$|뜻$|정의$|설명해줘.*$|알려줘.*$|에\s*대해.*$/,
        '',
      )
      .replace(/\d+\s*단원/g, '')
      .trim();

    if (stripped.length >= 2) {
      return stripped;
    }
    return undefined;
  }

  private async lookupConceptContext(
    subjectSlug: string,
    startUnit?: number,
    endUnit?: number,
    conceptCandidate?: string,
  ): Promise<string> {
    if (!conceptCandidate) return '';

    const from = startUnit ?? 1;
    const to = endUnit ?? 20;

    for (let unit = from; unit <= to; unit++) {
      try {
        const unitConcepts = await this.textbookService.getConcepts(
          subjectSlug,
          unit,
          unit,
        );

        const hasMatch = unitConcepts.some((uc) =>
          uc.concepts.some(
            (name) =>
              name === conceptCandidate ||
              name.includes(conceptCandidate) ||
              conceptCandidate.includes(name),
          ),
        );

        if (!hasMatch) continue;

        const card = await this.parseConceptCardFromSummation(
          subjectSlug,
          unit,
          conceptCandidate,
        );
        if (!card) continue;

        const lines: string[] = [
          `[개념 사전 매칭]`,
          `단원: ${unit}단원`,
          `개념명: ${card.title}`,
          `설명: ${card.description}`,
        ];

        if (card.bulletPoints.length > 0) {
          lines.push(`핵심 포인트:`);
          card.bulletPoints.forEach((bp) => lines.push(`- ${bp}`));
        }

        if (card.trapPoints.length > 0) {
          lines.push(`주의 포인트:`);
          card.trapPoints.forEach((tp) => lines.push(`- ${tp}`));
        }

        if (card.logicFlow) {
          lines.push(`논리 흐름:`);
          lines.push(card.logicFlow);
        }

        return lines.join('\n');
      } catch {
        continue;
      }
    }

    return '';
  }

  private async parseConceptCardFromSummation(
    subjectSlug: string,
    unitNumber: number,
    targetConcept: string,
  ): Promise<{
    title: string;
    description: string;
    bulletPoints: string[];
    trapPoints: string[];
    logicFlow: string;
  } | null> {
    try {
      const rawMd = await this.textbookService.getSummationMd(
        subjectSlug,
        unitNumber,
      );

      const jsonMatch = rawMd.match(/```json\s*([\s\S]*?)```/);
      if (!jsonMatch) return null;

      const data = JSON.parse(jsonMatch[1]);
      const cards: any[] = data.cards ?? [];

      const card = cards.find((c: any) => {
        const content = c.content;
        if (!content) return false;
        const title: string = content.title ?? '';
        const description: string = content.description ?? '';
        const table: string = content.integrated_data?.table ?? '';
        const logicFlow: string = content.integrated_data?.logic_flow ?? '';
        const bulletPoints: string = (content.bullet_points ?? []).join(' ');
        const trapPoints: string = (content.trap_points ?? []).join(' ');
        const tags: string = (content.tags ?? []).join(' ');
        const searchable = `${title} ${description} ${table} ${logicFlow} ${bulletPoints} ${trapPoints} ${tags}`;

        return (
          title === targetConcept ||
          title.includes(targetConcept) ||
          targetConcept.includes(title) ||
          searchable.includes(targetConcept)
        );
      });

      if (!card) return null;

      return {
        title: card.content.title,
        description: card.content.description ?? '',
        bulletPoints: card.content.bullet_points ?? [],
        trapPoints: card.content.trap_points ?? [],
        logicFlow: card.content.integrated_data?.logic_flow ?? '',
      };
    } catch {
      return null;
    }
  }
}
