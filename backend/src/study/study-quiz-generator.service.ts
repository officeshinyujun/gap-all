import {
  BadGatewayException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type OpenAI from 'openai';
import { TextbookService } from '../textbook/textbook.service';
import { getOpenAIClient } from '../lib/openai-keys';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';
import type { BlankQuestion, ConceptPair } from '../textbook/textbook.service';
import { SupabaseService } from '../supabase/supabase.service';

export type QuizCount = 10 | 20;
export type CacheType = 'blank' | 'concept';

@Injectable()
export class StudyQuizGeneratorService {
  private readonly logger = new Logger(StudyQuizGeneratorService.name);

  // 과목 slug → summation 폴더명
  private readonly SUBJECT_MAP: Record<string, string> = {
    success: 'sungjik',
    industry: 'kongil',
  };

  constructor(
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepo: Repository<AiUsageLog>,
    private readonly textbookService: TextbookService,
    private readonly supabase: SupabaseService,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================
  // Public API
  // ============================================================

  async getSummationMd(subjectSlug: string, unitNumber: number): Promise<string> {
    return await this.textbookService.getSummationMd(subjectSlug, unitNumber);
  }

  async generateBlankQuestions(
    subjectSlug: string,
    unitNumber: number,
    count: QuizCount = 10,
  ): Promise<BlankQuestion[]> {
    const cached = await this.readCache<BlankQuestion[]>(subjectSlug, unitNumber, 'blank', count);
    if (cached) {
      this.logger.log(`캐시 히트: ${subjectSlug} ${unitNumber}단원 blank ${count}개`);
      return cached;
    }

    try {
      this.logger.log(`AI 생성 시작: ${subjectSlug} ${unitNumber}단원 blank ${count}개`);
      const raw = await this.textbookService.getSummationMd(subjectSlug, unitNumber);
      let md: string;
      try { md = this.textbookService.extractTextFromSummation(raw); } catch { md = raw; }
      const items = await this.callOpenAiForBlank(md, count);
      await this.writeCache(subjectSlug, unitNumber, 'blank', count, items);
      return items;
    } catch (err: any) {
      this.logger.error(`Blank question generation failed: ${err?.stack ?? err?.message}`);
      if (err instanceof HttpException) throw err;
      throw new BadGatewayException('빈칸 문제 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  async generateConceptPairs(
    subjectSlug: string,
    unitNumber: number,
    count: QuizCount = 10,
  ): Promise<ConceptPair[]> {
    const cached = await this.readCache<ConceptPair[]>(subjectSlug, unitNumber, 'concept', count);
    if (cached) {
      this.logger.log(`캐시 히트: ${subjectSlug} ${unitNumber}단원 concept ${count}개`);
      return cached;
    }

    try {
      this.logger.log(`AI 생성 시작: ${subjectSlug} ${unitNumber}단원 concept ${count}개`);
      const raw = await this.textbookService.getSummationMd(subjectSlug, unitNumber);
      let md: string;
      try { md = this.textbookService.extractTextFromSummation(raw); } catch { md = raw; }
      const items = await this.callOpenAiForConcept(md, count);
      await this.writeCache(subjectSlug, unitNumber, 'concept', count, items);
      return items;
    } catch (err: any) {
      this.logger.error(`Concept pair generation failed: ${err?.stack ?? err?.message}`);
      if (err instanceof HttpException) throw err;
      throw new BadGatewayException('개념 페어 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  async clearCache(
    subjectSlug: string,
    unitNumber: number,
    type?: CacheType,
    count?: QuizCount,
  ): Promise<void> {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) return;

    if (process.env.DB_PROVIDER === 'local') {
      const clauses = ['subject = $1', 'unit_number = $2'];
      const params: Array<string | number> = [subject, unitNumber];
      if (type) {
        params.push(type);
        clauses.push(`cache_type = $${params.length}`);
      }
      if (count) {
        params.push(count);
        clauses.push(`quiz_count = $${params.length}`);
      }

      await this.dataSource.query(
        `DELETE FROM quiz_cache WHERE ${clauses.join(' AND ')}`,
        params,
      );
      this.logger.log(`캐시 삭제: ${subject} ${unitNumber}단원 ${type ?? 'all'}`);
      return;
    }

    let query = this.supabase.client
      .from('quiz_cache')
      .delete()
      .eq('subject', subject)
      .eq('unit_number', unitNumber);

    if (type) query = query.eq('cache_type', type);
    if (count) query = query.eq('quiz_count', count);

    const { error } = await query;
    if (error) {
      this.logger.error(`캐시 삭제 실패: ${error.message}`);
    } else {
      this.logger.log(`캐시 삭제: ${subject} ${unitNumber}단원 ${type ?? 'all'}`);
    }
  }

  // ============================================================
  // OpenAI 호출
  // ============================================================

  private async callOpenAiForBlank(
    md: string,
    count: QuizCount,
  ): Promise<BlankQuestion[]> {
    const prompt = `# Role: 교과서 빈칸 문제 출제자

# Mission
아래 [교재 내용]에서 핵심 개념을 설명하는 서술문을 찾아, 그 핵심 용어를 [blank]로 처리한 빈칸 문제를 만들어라.

# 🎯 좋은 문제 vs 나쁜 문제
## ✅ 좋은 문제의 조건
- [blank]가 교재의 핵심 개념어(전문 용어, 학자명, 제도명, 분류명)이다.
- 문장 자체가 하나의 완결된 설명/정의를 담고 있어서, 문맥을 이해하면 답을 도출할 수 있다.
- 오답이 "그것도 맞을 것 같은데?"라는 생각이 들 만큼 그럴듯하다.
- 교재 원문을 거의 그대로 사용하여 신뢰도가 높다.

## ❌ 나쁜 문제의 예시 (절대 이렇게 만들지 마라)
- "컴퓨터는 [blank]을 처리하는 기계이다" → "정보" (일상적인 단어를 blank 처리함)
- "근로기준법은 [blank]을 보호하기 위한 법이다" → "근로자" (문장 구조만으로 답이 너무 뻔함)
- 오답으로 "김치", "축구", "우주" 등 전혀 관련 없는 단어를 넣음

## ✅ 좋은 문제의 예시
[교재 내용]: "산업재해보상보험법은 업무상 재해를 입은 근로자에게 신속하고 공정한 보상을 제공하기 위해 제정된 사회보험 법률이다."
→ sentence_template: "산업재해보상보험법은 업무상 재해를 입은 근로자에게 신속하고 공정한 [blank]을 제공하기 위해 제정된 사회보험 법률이다."
→ correct_answer: "보상"
→ options: ["보상", "치료", "고용", "교육"]  // 모두 사회보험 맥락에서 등장할 법한 용어들

# Rules
1. 반드시 [교재 내용]에 실제로 등장하는 설명문을 그대로 사용하거나, 의미를 유지하는 선에서 최소한으로만 다듬어라.
2. [blank]로 처리할 단어는 교재에 명시된 전문 용어, 학자명, 제도명, 분류명, 핵심 개념어여야 한다. 일반 동사, 조사, 형용사, 일상 명사는 절대 blank 처리하지 마라.
3. sentence_template는 [blank]를 제외하면 완전한 서술문(~이다, ~한다, ~된다)이어야 한다. 의문문이나 "~를 쓰시오" 같은 명령문을 사용하지 마라.
4. [blank]는 문장의 중간에 위치해야 한다. 문장 맨 끝이나 맨 앞에 [blank]를 배치하지 마라.
5. 교재에 없는 내용을 추가하거나 추론하지 마라.
6. options는 반드시 4개(정답 1개 + 오답 3개)로 구성하라. 오답은 같은 교재 내에 등장하는 같은 카테고리의 용어에서 선정하라. 모든 선택지는 동일한 품사/형태여야 한다.
7. options에는 정답과 완전히 동일한 단어를 중복해서 포함하지 마라.
8. explanation은 교재에 적힌 내용만으로 간결하게 1-2문장으로 작성하라.

# Self-Check (출력 전에 스스로 확인할 것)
각 문항에 대해:
- [ ] 이 [blank]는 핵심 개념어인가? (일반 단어가 아님)
- [ ] 오답 3개는 "틀렸지만 그럴듯한" 수준인가?
- [ ] 문장이 교재 원문과 의미상 차이가 없는가?
- [ ] 정답을 모르는 학생이 문장의 문맥만으로 충분히 추론할 수 있는가?

위 4개 항목을 모두 만족하는 문항만 최종 출력하라.

# JSON Output
[
  {
    "id": number,
    "sentence_template": "교재 원문 설명문에서 핵심 용어를 [blank]로 처리한 문장",
    "correct_answer": "빈칸에 들어갈 정답",
    "options": ["정답 포함 4개 선택지"],
    "explanation": "교재 기반 간결한 설명"
  }
]

# Quantity
- 반드시 ${count}개를 생성하라.

# [교재 내용]
${md}

JSON만 출력하라.`;

    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: [
        { role: 'system', content: this.getPersona() },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    await this.logUsage(response.usage, AiUsageSource.STUDY_BLANK);

    const content = response.choices[0]?.message?.content ?? '';
    const parsed = this.extractJson(content);
    const arr: BlankQuestion[] = Array.isArray(parsed)
      ? parsed
      : (parsed.items ?? []);

    if (!Array.isArray(arr) || arr.length === 0) {
      throw new InternalServerErrorException(
        'AI가 빈칸 문항을 생성하지 못했습니다.',
      );
    }

    // Post-processing: validate and clean generated questions
    const validated = this.validateBlankQuestions(arr);
    if (validated.length === 0) {
      throw new InternalServerErrorException(
        '생성된 빈칸 문항이 품질 검증을 통과하지 못했습니다.',
      );
    }

    return validated;
  }

  private async callOpenAiForConcept(
    md: string,
    count: QuizCount,
  ): Promise<ConceptPair[]> {
    const prompt = `# Role: 교과서 개념 정리 출제자

# Mission
아래 [교재 내용]에서 "~란 ~이다", "~를 의미한다", "~라고 한다" 등의 정의문을 찾아 용어-정의 매칭 문제를 만들어라.

# Rules
1. 교재에 명시적으로 정의가 적혀 있는 용어만 추출하라.
2. definition은 교재 원문의 정의 문장을 그대로 또는 최소한으로 다듬어서 사용하라. 직접 작성하거나 추론하지 마라.
3. "~를 설명하라", "~의 특징을 서술하라" 같은 서술형 문제를 만들지 마라. 오직 용어와 정의의 매칭만 출제하라.
4. hidden_field는 항상 "definition"으로 고정하라.
5. correct_value는 definition과 동일한 값을 넣어라.
6. explanation은 교재에 적힌 내용만으로 1문장 이내로 작성하라.
7. 교재에 없는 내용을 추가하거나 추론하지 마라.

# JSON Output
[
  {
    "id": number,
    "concept": "교재에 정의가 명시된 용어",
    "definition": "교재 원문에서 발췌한 해당 용어의 정의",
    "hidden_field": "definition",
    "correct_value": "definition과 동일",
    "explanation": "교재 기반 간결한 보충 설명"
  }
]

# Quantity
- 반드시 ${count}개를 생성하라.

# [교재 내용]
${md}

JSON만 출력하라.`;

    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: [
        { role: 'system', content: this.getPersona() },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    await this.logUsage(response.usage, AiUsageSource.STUDY_CONCEPT);

    const content = response.choices[0]?.message?.content ?? '';
    const parsed = this.extractJson(content);
    const arr: ConceptPair[] = Array.isArray(parsed)
      ? parsed
      : (parsed.items ?? []);

    if (!Array.isArray(arr) || arr.length === 0) {
      throw new InternalServerErrorException(
        'AI가 개념 쌍을 생성하지 못했습니다.',
      );
    }

    return arr;
  }

  // ============================================================
  // 캐시 유틸
  // ============================================================

  private async readCache<T>(
    subjectSlug: string,
    unitNumber: number,
    type: CacheType,
    count: QuizCount,
  ): Promise<T | null> {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) return null;

    if (process.env.DB_PROVIDER === 'local') {
      const rows = (await this.dataSource.query(
        `SELECT data FROM quiz_cache
         WHERE subject = $1 AND unit_number = $2 AND cache_type = $3 AND quiz_count = $4`,
        [subject, unitNumber, type, count],
      )) as Array<{ data: T }>;
      return rows[0]?.data ?? null;
    }

    const { data, error } = await this.supabase.client
      .from('quiz_cache')
      .select('data')
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .eq('cache_type', type)
      .eq('quiz_count', count)
      .single();

    if (error || !data) return null;
    return data.data as T;
  }

  private async writeCache<T>(
    subjectSlug: string,
    unitNumber: number,
    type: CacheType,
    count: QuizCount,
    data: T,
  ): Promise<void> {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) return;

    if (process.env.DB_PROVIDER === 'local') {
      await this.dataSource.query(
        `INSERT INTO quiz_cache (subject, unit_number, cache_type, quiz_count, data)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (subject, unit_number, cache_type, quiz_count)
         DO UPDATE SET data = EXCLUDED.data, generated_at = now()`,
        [subject, unitNumber, type, count, JSON.stringify(data)],
      );
      this.logger.log(`캐시 저장: ${subject} ${unitNumber}단원 ${type} ${count}개`);
      return;
    }

    const { error } = await this.supabase.client
      .from('quiz_cache')
      .upsert({
        subject,
        unit_number: unitNumber,
        cache_type: type,
        quiz_count: count,
        data,
      }, { onConflict: 'subject, unit_number, cache_type, quiz_count' });

    if (error) {
      this.logger.error(`캐시 저장 실패: ${error.message}`);
    } else {
      this.logger.log(`캐시 저장: ${subject} ${unitNumber}단원 ${type} ${count}개`);
    }
  }

  // ============================================================
  // 품질 검증
  // ============================================================

  private validateBlankQuestions(questions: BlankQuestion[]): BlankQuestion[] {
    const genericWords = new Set([
      '것', '수', '때', '등', '및', '그', '이', '저', '뿐',
      '하기', '있는', '하는', '있다', '한다', '된다',
    ]);

    const validated = questions.filter((q, index) => {
      // 1. sentence_template must contain [blank]
      if (!q.sentence_template?.includes('[blank]')) {
        this.logger.warn(`Blank question #${q.id ?? index} rejected: missing [blank] in sentence_template`);
        return false;
      }

      // 2. correct_answer must be non-empty and non-trivial
      const answer = q.correct_answer?.trim() ?? '';
      if (answer.length === 0 || answer.length > 50) {
        this.logger.warn(`Blank question #${q.id ?? index} rejected: invalid correct_answer length (${answer.length})`);
        return false;
      }

      // 3. correct_answer must not be a generic grammatical word
      if (genericWords.has(answer)) {
        this.logger.warn(`Blank question #${q.id ?? index} rejected: correct_answer is a generic word ("${answer}")`);
        return false;
      }

      // 4. options must contain exactly 4 unique items including correct_answer
      const options = Array.isArray(q.options) ? q.options : [];
      const uniqueOptions = [...new Set(options.map((o: string) => o.trim()))];
      if (uniqueOptions.length !== 4) {
        this.logger.warn(`Blank question #${q.id ?? index} rejected: options must have exactly 4 unique items (got ${uniqueOptions.length})`);
        return false;
      }

      if (!uniqueOptions.includes(answer)) {
        this.logger.warn(`Blank question #${q.id ?? index} rejected: correct_answer not found in options`);
        return false;
      }

      // 5. sentence_template must have minimum meaningful length
      const templateWithoutBlank = q.sentence_template.replace(/\[blank\]/g, '').trim();
      if (templateWithoutBlank.length < 10) {
        this.logger.warn(`Blank question #${q.id ?? index} rejected: sentence too short (${templateWithoutBlank.length} chars)`);
        return false;
      }

      return true;
    });

    const rejected = questions.length - validated.length;
    if (rejected > 0) {
      this.logger.warn(`${rejected}/${questions.length} blank questions rejected by validation`);
    }

    return validated;
  }

  // ============================================================
  // 공통 유틸
  // ============================================================

  private getPersona(): string {
    return `너는 특성화고등학교 전공 교과서를 가르치는 베테랑 교사다. 너의 목표는 학생들이 교과서의 핵심 개념을 정확하게 이해하고 기억하도록 돕는 것이다. 다음 원칙을 철저히 지켜라:

1. 교과서 원문을 최우선으로 존중하라. 문장은 교재에 실제로 등장하는 서술문을 그대로 사용하거나, 의미를 훼손하지 않는 선에서 최소한으로만 다듬어라.
2. 절대로 지어내지 마라. 교재에 없는 개념, 용어, 설명을 추가하거나 추론하지 마라.
3. [blank]는 반드시 교재에서 명시적으로 정의되거나 핵심 개념으로 다뤄지는 전문 용어여야 한다. 조사, 접속사, 일반 동사 등 문법적 요소나 일상어를 blank 처리하지 마라.
4. 오답(오선지)은 같은 교재 내에 등장하는 유사한 수준의 용어로만 구성하라. 오답은 "그럴듯하지만 틀린" 수준이어야 하며, 명백히 틀린 답이나 문법적으로 맞지 않는 답을 포함하지 마라.
5. 정답이 문장의 문맥 속에서 논리적으로 추론 가능해야 한다. 단순히 단어를 맞추는 것이 아니라, 문장의 의미를 이해했을 때 비로소 답을 고를 수 있어야 한다.
6. 모든 문항은 "이 교과서를 공부한 학생이라면 맞힐 수 있는" 수준으로 출제하라.`;
  }

  private extractJson(text: string): any {
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = codeBlock ? codeBlock[1].trim() : text.trim();
    try {
      return JSON.parse(raw);
    } catch {
      throw new InternalServerErrorException(
        `JSON 파싱 실패. 응답 앞부분: ${raw.slice(0, 200)}`,
      );
    }
  }

  private async logUsage(
    usage: OpenAI.CompletionUsage | undefined,
    source: AiUsageSource,
  ): Promise<void> {
    if (!usage) return;
    await this.aiUsageLogRepo.save(
      this.aiUsageLogRepo.create({
        source,
        model: process.env.OPENAI_MODEL ?? 'gpt-4o',
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      }),
    );
  }
}
