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
    const md = this.textbookService.getSummationMd(subjectSlug, unitNumber);
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
    const md = this.textbookService.getSummationMd(subjectSlug, unitNumber);
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
    const prompt = `# Role: 수능형 문항 검토 위원 (High-Density Concept Architect)
# Mission: [text_payload]에서 학술적 정의와 논리적 근거가 풍부하게 뒷받침된 '핵심 개념'만을 추출하여 빈칸 문항을 설계하라.

# [Selection Logic: The Conceptual Anchor Rule]
아래 3가지 조건을 **모두 충족**하는 단어만 빈칸(Target)으로 선정하라:
1. **정의의 존재:** 지문 내에서 해당 단어에 대한 정의(Definition)나 핵심 성질이 명시적으로 서술되어 있는가?
2. **논리적 중추:** 해당 단어를 가렸을 때, 지문 전체의 논리 전개나 학자 간의 비교가 불가능해지는가?
3. **학술적 범주:** 고유 학설, 전문 용어, 메커니즘 명칭인가? (일반 명사 '회식', '과정', '결과' 등은 무조건 탈락)

# [Implementation Rules]
1. **Context-Heavy Sentence:** 단순히 단어가 포함된 문장이 아니라, 그 단어의 '핵심 원리'를 설명하는 문장을 문항으로 채택하라.
2. **Distractor Sophistication:** 오답 칩은 지문 내의 '다른 핵심 개념'으로 구성하여, 개념을 대충 알면 틀리도록 설계하라.
3. **Negative Constraints:** '특징', '영향', '관점' 등 지문 내 설명 밀도가 낮은 일반적 추상 명사는 절대 추출하지 마라.

# [JSON Output Schema]
[
  {
    "id": "number",
    "sentence_template": "학술적 정의가 포함된 문장의 핵심 키워드를 [blank] 처리",
    "correct_answer": "설명 밀도가 높은 학술 용어",
    "options": ["정답 포함, 지문 내 다른 학술 용어들로 구성된 4개 배열"],
    "explanation": "해당 용어가 지문에서 어떤 정의(Definition)를 갖는지 구체적으로 서술"
  }
]

# [QUANTITY REQUIREMENT]
- 반드시 최소 ${count}개 이상의 문항을 생성하라. ${count}개 미만은 절대 허용하지 않는다.
- 지문에 등장하는 모든 핵심 개념을 빠짐없이 포함하라. 개념이 ${count}개 이상이면 전부 출제하라.
- 개념이 부족할 경우, 동일 개념을 다른 문맥/문장으로 변형하여 추가 문항을 만들어라.

# [Input Data]
- text_payload: ${md}
- count: ${count}

# [FINAL COMMAND]
지문에서 2번 이상 언급되거나 상세 설명이 붙은 '무거운 단어'만 골라라. 가벼운 단어 추출 시 출제 오류로 간주한다. 반드시 ${count}개 이상 출력하라. JSON만 출력하라.`;

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
    const prompt = `# Role: 학술 용어 매핑 전문가 (Expert Definitional Mapper)
# Mission: [text_payload]에서 '명시적 정의'가 존재하는 학술 전문 용어만 추출하여 뜻 풀이 문항을 생성하라.

# [Extraction Protocol]
1. **Definition-First Search:** 먼저 지문에서 "~란 ~이다", "~를 의미한다", "~라고 부른다"와 같은 정의 구문을 찾아라.
2. **Key Term Mapping:** 위 구문이 가리키는 주체인 '학술 용어'를 concept으로 추출하라.
3. **Weight Filtering:** 지문에서 별도의 설명 없이 스치듯 지나가는 단어(예: 취미, 거주지)나 일상적 명사는 추출 목록에서 즉시 삭제하라.

# [Implementation Rules]
1. **Functional Definition:** 정의(definition) 작성 시, 단순히 사전적 의미가 아니라 해당 지문이 강조하는 특수한 맥락적 의미를 반드시 포함하라.
2. **Standardization:** 수능 기출 지문 특유의 단정적이고 명료한 문체를 유지하라.
3. **Zero-Inference:** 지문에 없는 내용을 AI의 상식으로 보충하지 마라. 오직 text_payload에 적힌 대로만 정의하라.
4. **hidden_field 고정:** hidden_field는 항상 "definition"으로 고정하라. 학습자는 단어를 보고 뜻을 서술한다.
5. **correct_value:** definition과 동일한 값을 넣어라.

# [JSON Output Schema]
[
  {
    "id": "number",
    "concept": "지문에서 정의를 내린 핵심 학술 용어",
    "definition": "지문에 명시된 해당 용어의 정교한 정의 (1~2문장)",
    "hidden_field": "definition",
    "correct_value": "definition과 동일",
    "explanation": "이 개념이 지문에서 설명하는 핵심 원리와 어떻게 연결되는지 서술"
  }
]

# [Input Data]
- text_payload: ${md}
- count: ${count}

# [QUANTITY REQUIREMENT]
- 반드시 최소 ${count}개 이상의 문항을 생성하라. ${count}개 미만은 절대 허용하지 않는다.
- 지문에 등장하는 모든 핵심 개념을 빠짐없이 포함하라. 개념이 ${count}개 이상이면 전부 출제하라.
- 개념이 부족할 경우, 동일 개념을 다른 문맥/문장으로 변형하여 추가 문항을 만들어라.

# [FINAL COMMAND]
부연 설명 없이 오직 유효한 JSON 배열 코드 블록만 출력하라. 설명을 부실한 단어는 버리고, 오직 '지문이 공들여 설명한 단어'만 추출하여 반드시 ${count}개 이상 반환하라.`;

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
