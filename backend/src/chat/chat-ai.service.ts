import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { ChatMessage, ChatSender } from '../entities/chat-message.entity';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';
import { TextbookService } from '../textbook/textbook.service';

const HISTORY_LIMIT = 10;

@Injectable()
export class ChatAiService {
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly logger = new Logger(ChatAiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly textbookService: TextbookService,
    private readonly embeddingService: TextbookEmbeddingService,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepo: Repository<AiUsageLog>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
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

    // RAG: 질문과 유사한 청크 검색
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
          const keywordChunks = await this.embeddingService.searchChunksByKeyword(
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
        textbookContext = chunks
          .map((chunk, i) => `[참고 자료 ${i + 1}]\n${chunk}`)
          .join('\n\n');
        this.logger.debug(`RAG 검색 완료: ${chunks.length}개 청크 사용`);
        this.logger.debug(
          `청크 미리보기:\n${chunks.map((c, i) => `[${i + 1}] ${c.slice(0, 80)}...`).join('\n')}`,
        );
      } else {
        // 임베딩이 없으면 fallback: summation MD 사용 (단원 범위 제한)
        this.logger.warn(
          `임베딩 없음 — summation fallback 사용: ${subjectSlug}`,
        );
        textbookContext = this.loadSummationFallback(
          subjectSlug,
          effectiveStartUnit,
          effectiveEndUnit,
        );
      }
    } catch (err) {
      this.logger.warn(`RAG 검색 실패, fallback 사용: ${err}`);
      textbookContext = this.loadSummationFallback(
        subjectSlug,
        effectiveStartUnit,
        effectiveEndUnit,
      );
    }

    const unitRequestGuidance = isUnitSummaryRequest
      ? [
          `# [Unit Summary Instruction]`,
          `- 사용자의 요청은 특정 단원(${mentionedUnit}단원)에 대한 설명 또는 요약이다.`,
          `- [Knowledge Base]에 포함된 ${mentionedUnit}단원 자료 전체를 종합하여 핵심 개념, 주요 내용, 주의할 점을 구조적으로 설명하라.`,
          `- 단원명, 핵심 개념, 세부 내용, 기억할 포인트 순서로 정리하라.`,
          `- [Knowledge Base]에 ${mentionedUnit}단원 자료가 이미 포함되어 있으므로, 범위 밖이라고 거절하지 말고 제공된 자료를 요약해 답변하라.`,
          ``,
        ]
      : [];

    const systemPrompt = [
      `# Role: ${subjectTitle} 전문 튜터`,
      `# Persona:`,
      `- 너는 ${subjectTitle} 분야의 최고 권위자로서, 학생의 질문에 대해 논리적이고 체계적으로 답변한다.`,
      `- 불필요한 미사여구는 배제하고, 핵심 개념과 원리를 꿰뚫는 통찰력 있는 답변을 제공한다.`,
      `- 학생이 혼동하기 쉬운 지점을 미리 짚어주는 깐깐하면서도 친절한 멘토의 톤앤매너를 유지한다.`,
      ``,
      `# [Strict Grounding Rule: 범위 폐쇄 참조]`,
      `1. 모든 답변은 오직 아래 [Knowledge Base]의 내용만을 근거로 작성해야 한다. (현재 범위: ${unitRange})`,
      `2. 만약 질문에 대한 답이 [Knowledge Base]에 명시되어 있지 않다면, Knowledge Base의 내용을 바탕으로 추론하여 답변할 수 있다. 단, 추론임을 명시하라.`,
      `3. Knowledge Base와 완전히 무관한 질문에는 "제공된 학습 범위 밖의 내용입니다. 해당 범위 내에서는 안내가 어렵습니다."라고 정중히 거절하라.`,
      `4. 외부 지식이나 AI가 학습한 일반적인 상식을 답변에 섞는 것을 금지한다.`,
      ``,
      ...unitRequestGuidance,
      `# [Interaction Guidelines]`,
      `1. **단계별 설명 (Chain of Thought):** 복잡한 개념은 논리적 단계로 나누어 설명하라.`,
      `2. **의미적 치환 (Paraphrasing):** 단순 복사 대신, 학생이 이해하기 쉬운 전문 용어로 재구성하여 설명하라.`,
      `3. **확인 질문:** 답변 끝에는 학생이 제대로 이해했는지 확인할 수 있는 간단한 질문이나 핵심 포인트를 덧붙여라.`,
      ``,
      `# [Knowledge Base]`,
      textbookContext,
      ``,
      `# [Final Command]`,
      `설정된 페르소나를 유지하며, 주입된 지식 범위 내에서 가장 전문적인 답변을 생성하라. Markdown 형식을 사용하여 가독성을 높여라.`,
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

    const response = await this.openai.chat.completions.create({
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

  // 임베딩 없을 때 fallback: summation MD 최대 3단원
  private loadSummationFallback(
    subjectSlug: string,
    startUnit?: number,
    endUnit?: number,
  ): string {
    try {
      const from = startUnit ?? 1;
      const to = Math.min(endUnit ?? from + 2, from + 2); // 최대 3단원
      const results: string[] = [];

      for (let u = from; u <= to; u++) {
        try {
          const md = this.textbookService.getSummationMd(subjectSlug, u);
          // 앞 2000자만 사용
          results.push(`[${u}단원]\n${md.slice(0, 2000)}`);
        } catch {
          // 해당 단원 없으면 스킵
        }
      }

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
    const cleaned = message.replace(/[?!.]/g, ' ').trim();
    const quotedMatch = cleaned.match(/["'“”‘’]([^"'“”‘’]{2,30})["'“”‘’]/);
    if (quotedMatch) {
      return quotedMatch[1].trim();
    }

    const candidates = cleaned
      .split(/\s+/)
      .map((token) => token.replace(/[.,()[\]{}]/g, '').trim())
      .filter((token) => token.length >= 2)
      .filter(
        (token) =>
          !/^(그|그거|그런거|있잖아|아|뭐지|뭐더라|대해서|설명해봐|설명|요약|정리|알려줘|말해줘)$/.test(
            token,
          ),
      );

    return candidates.sort((a, b) => b.length - a.length)[0];
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
}
