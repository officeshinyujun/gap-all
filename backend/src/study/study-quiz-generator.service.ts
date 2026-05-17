import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { TextbookService } from '../textbook/textbook.service';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';
import type { BlankQuestion, ConceptPair } from '../textbook/textbook.service';

export type QuizCount = 10 | 20;
export type CacheType = 'blank' | 'concept';

@Injectable()
export class StudyQuizGeneratorService {
  private readonly logger = new Logger(StudyQuizGeneratorService.name);
  private readonly openai: OpenAI;

  // 과목 slug → summation 폴더명
  private readonly SUBJECT_FOLDER_MAP: Record<string, string> = {
    success: 'sungjik',
    industry: 'kongil',
  };

  constructor(
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepo: Repository<AiUsageLog>,
    private readonly textbookService: TextbookService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // ============================================================
  // Public API
  // ============================================================

  getSummationMd(subjectSlug: string, unitNumber: number): string {
    return this.textbookService.getSummationMd(subjectSlug, unitNumber);
  }

  async generateBlankQuestions(
    subjectSlug: string,
    unitNumber: number,
    count: QuizCount = 10,
  ): Promise<BlankQuestion[]> {
    const cached = this.readCache<BlankQuestion[]>(
      subjectSlug,
      unitNumber,
      'blank',
      count,
    );
    if (cached) {
      this.logger.log(
        `캐시 히트: ${subjectSlug} ${unitNumber}단원 blank ${count}개`,
      );
      return cached;
    }

    this.logger.log(
      `AI 생성 시작: ${subjectSlug} ${unitNumber}단원 blank ${count}개`,
    );
    const raw = this.textbookService.getSummationMd(subjectSlug, unitNumber);
    let md: string;
    try {
      md = this.textbookService.extractTextFromSummation(raw);
    } catch {
      md = raw;
    }
    const items = await this.callOpenAiForBlank(md, count);
    this.writeCache(subjectSlug, unitNumber, 'blank', count, items);
    return items;
  }

  async generateConceptPairs(
    subjectSlug: string,
    unitNumber: number,
    count: QuizCount = 10,
  ): Promise<ConceptPair[]> {
    const cached = this.readCache<ConceptPair[]>(
      subjectSlug,
      unitNumber,
      'concept',
      count,
    );
    if (cached) {
      this.logger.log(
        `캐시 히트: ${subjectSlug} ${unitNumber}단원 concept ${count}개`,
      );
      return cached;
    }

    this.logger.log(
      `AI 생성 시작: ${subjectSlug} ${unitNumber}단원 concept ${count}개`,
    );
    const raw = this.textbookService.getSummationMd(subjectSlug, unitNumber);
    let md: string;
    try {
      md = this.textbookService.extractTextFromSummation(raw);
    } catch {
      md = raw;
    }
    const items = await this.callOpenAiForConcept(md, count);
    this.writeCache(subjectSlug, unitNumber, 'concept', count, items);
    return items;
  }

  clearCache(
    subjectSlug: string,
    unitNumber: number,
    type?: CacheType,
    count?: QuizCount,
  ): void {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) return;

    const cacheDir = this.getCacheDir(folder);
    const counts: QuizCount[] = count ? [count] : [10, 20];
    const types: CacheType[] = type ? [type] : ['blank', 'concept'];

    for (const t of types) {
      for (const c of counts) {
        const filePath = path.join(cacheDir, `${unitNumber}_${t}_${c}.json`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`캐시 삭제: ${filePath}`);
        }
      }
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
아래 [교재 내용]에서 설명문(정의, 특징, 분류 등을 서술하는 문장)을 찾아 핵심 용어를 [blank]로 처리한 빈칸 문제를 만들어라.

# Rules
1. 반드시 [교재 내용]에 실제로 등장하는 설명문을 그대로 또는 최소한으로 다듬어서 사용하라.
2. [blank]로 처리할 단어는 교재에 명시된 전문 용어, 학자명, 제도명, 분류명이어야 한다.
3. "~를 설명하라", "~의 특징을 서술하라" 같은 서술형 문제를 만들지 마라. 오직 빈칸 채우기만 출제하라.
4. sentence_template는 반드시 서술문(~이다, ~한다, ~된다)이어야 한다. 의문문이나 명령문을 사용하지 마라.
5. [blank]는 문장의 중간에 위치해야 한다. 문장 맨 끝이나 맨 앞에 [blank]를 배치하지 마라.
6. 교재에 없는 내용을 추가하거나 추론하지 마라.
7. options는 같은 교재 내에 등장하는 다른 용어 3개 + 정답 1개 = 총 4개로 구성하라.
8. explanation은 교재에 적힌 내용만으로 간결하게 작성하라.

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

    const response = await this.openai.chat.completions.create({
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

    return arr;
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

    const response = await this.openai.chat.completions.create({
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

  private getCacheDir(folder: string): string {
    const textbookBase =
      process.env.TEXTBOOK_BASE_PATH ??
      path.resolve(__dirname, '..', '..', '..', 'textbook');
    return path.join(textbookBase, `${folder}_summation`, 'cache');
  }

  private readCache<T>(
    subjectSlug: string,
    unitNumber: number,
    type: CacheType,
    count: QuizCount,
  ): T | null {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) return null;

    const filePath = path.join(
      this.getCacheDir(folder),
      `${unitNumber}_${type}_${count}.json`,
    );

    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private writeCache<T>(
    subjectSlug: string,
    unitNumber: number,
    type: CacheType,
    count: QuizCount,
    data: T,
  ): void {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) return;

    const cacheDir = this.getCacheDir(folder);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const filePath = path.join(cacheDir, `${unitNumber}_${type}_${count}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.logger.log(`캐시 저장: ${filePath}`);
  }

  // ============================================================
  // 공통 유틸
  // ============================================================

  private getPersona(): string {
    return "너는 한국 교육과정평가원(KICE)에서 15년 이상 근무한 전공 서적 기반 수능 출제 전문위원이다. 너의 목표는 단순히 정보를 전달하는 것이 아니라, 지문의 텍스트를 고도로 추상화하여 '매력적인 오답'과 '다단계 추론'을 설계하는 것이다. 너는 지문의 단어를 그대로 사용하는 것을 수치로 여기며, 모든 핵심 개념을 유의어로 치환(Paraphrasing)하여 수험생의 인지 부하를 극대화한다. 너의 모든 문항은 원문에 근거한 폐쇄적 논리 체계 안에서만 작동해야 한다.";
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
