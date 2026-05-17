import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { TextbookService, UnitPayload } from '../textbook/textbook.service';
import { PromptsService } from '../prompts/prompts.service';
import { Question } from '../entities/question.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';
import { Difficulty } from '../entities/exam-record.entity';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';

export interface GeneratedQuestion {
  targetConcept: string;
  itemType: string;
  difficulty: Difficulty;
  recommendedTemplate: string;
  questionStem: string;
  stimulusData: object;
  optionsList: string[];
  explanation: object;
  correctAnswer: number;
  unitName: string;
}

export interface ExamGenerationProgressUpdate {
  stage: string;
  progress: number;
  message: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  detail?: string;
}

export type ExamGenerationProgressReporter = (
  update: ExamGenerationProgressUpdate,
) => void | Promise<void>;

@Injectable()
export class ExamGeneratorService {
  private readonly logger = new Logger(ExamGeneratorService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepo: Repository<AiUsageLog>,
    private readonly textbookService: TextbookService,
    private readonly promptsService: PromptsService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * 문항 생성 메인 파이프라인
   */
  async generate(
    subjectId: string,
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
    difficulty: Difficulty,
    questionCount: number,
    customPrompt?: string,
    targetConcepts?: string[],
    reportProgress?: ExamGenerationProgressReporter,
  ): Promise<Question[]> {
    await this.reportProgress(reportProgress, {
      stage: 'loading_textbook',
      progress: 15,
      message: '교과서 단원 텍스트를 불러오는 중입니다.',
    });

    // 1. 텍스트북 로딩
    const units = this.textbookService.getUnits(
      subjectSlug,
      startUnitNum,
      endUnitNum,
    );
    this.logger.log(`텍스트북 로딩 완료: ${units.length}개 단원`);

    await this.reportProgress(reportProgress, {
      stage: 'loading_textbook',
      progress: 25,
      status: 'success',
      message: `교과서 ${units.length}개 단원 로딩 완료`,
    });

    // 2. Step 1: Blueprint 생성
    const blueprint = await this.runStep1(
      units,
      difficulty,
      questionCount,
      customPrompt,
      0,
      targetConcepts,
      reportProgress,
    );
    this.logger.log(`Step 1 완료: ${blueprint.length}개 Blueprint`);

    // 3. Step 2: 실제 문항 데이터 생성
    const rawItems = await this.runStep2(blueprint, units, 0, reportProgress);
    this.logger.log(`Step 2 완료: ${rawItems.length}개 문항`);

    await this.reportProgress(reportProgress, {
      stage: 'validating',
      progress: 75,
      message: '생성된 문항 구조를 검증하는 중입니다.',
    });

    // 4. 파싱 + 구조 검증
    const validated = this.validateItems(rawItems);

    await this.reportProgress(reportProgress, {
      stage: 'validating',
      progress: 78,
      status: 'success',
      message: `구조 검증 완료: ${validated.length}개 유효`,
    });

    // 4.5. 의미적 검증 + 부족분 재생성 (최대 2회)
    let semanticValid = await this.runSemanticValidation(
      validated,
      reportProgress,
    );
    let retryRound = 0;
    const maxRetries = 2;

    while (semanticValid.length < questionCount && retryRound < maxRetries) {
      retryRound++;
      const deficit = questionCount - semanticValid.length;
      this.logger.log(
        `의미적 검증 후 ${deficit}개 부족, 재생성 시도 (${retryRound}/${maxRetries})`,
      );

      await this.reportProgress(reportProgress, {
        stage: 'semantic_regeneration',
        progress: 80,
        message: `부족한 ${deficit}개 문항 재생성 중 (${retryRound}/${maxRetries})`,
      });

      const extraBlueprint = await this.runStep1(
        units,
        difficulty,
        deficit,
        customPrompt,
        0,
        targetConcepts,
      );
      const extraRaw = await this.runStep2(extraBlueprint, units, 0);
      const extraValidated = this.validateItems(extraRaw);
      const extraSemantic = await this.runSemanticValidation(extraValidated);

      semanticValid = [...semanticValid, ...extraSemantic];
    }

    if (semanticValid.length > questionCount) {
      semanticValid = semanticValid.slice(0, questionCount);
    }

    await this.reportProgress(reportProgress, {
      stage: 'semantic_validation',
      progress: 82,
      status: 'success',
      message: `최종 ${semanticValid.length}개 문항 확정`,
    });

    // 5. DB 저장 (재사용 체크)
    const questions = await this.saveQuestions(
      semanticValid,
      subjectId,
      subjectSlug,
      reportProgress,
    );

    return questions;
  }

  // ============================================================
  // Step 1: Blueprint 생성
  // ============================================================
  private async runStep1(
    units: UnitPayload[],
    difficulty: Difficulty,
    questionCount: number,
    customPrompt?: string,
    retryCount = 0,
    targetConcepts?: string[],
    reportProgress?: ExamGenerationProgressReporter,
  ): Promise<any[]> {
    if (retryCount === 0) {
      await this.reportProgress(reportProgress, {
        stage: 'step1',
        progress: 35,
        message: 'Step 1 Blueprint 생성을 요청하는 중입니다.',
      });
    }

    const step1Prompt = this.promptsService.getStep1Prompt(
      questionCount,
      difficulty,
    );

    const userContent = [
      step1Prompt,
      '',
      `# [Input Data]`,
      `- total_item_count: ${questionCount}`,
      `- units: ${JSON.stringify(units)}`,
      targetConcepts && targetConcepts.length > 0
        ? `- target_concepts: ${JSON.stringify(targetConcepts)} (반드시 이 개념들 중심으로 blueprint를 생성하라. 각 개념당 최소 1개 이상의 문항을 설계하라.)`
        : '',
      customPrompt ? `- additional_instructions: ${customPrompt}` : '',
      '',
      `# [수량 엄수 - 최우선]`,
      `출력 JSON 배열의 원소 수는 반드시 ${questionCount}개여야 한다. ${questionCount}개 미만이면 시스템 오류로 간주한다.`,
    ]
      .filter(Boolean)
      .join('\n');

    this.logger.log(
      `Step 1 프롬프트 전송 내용 (앞 1000자):\n${userContent.slice(0, 1000)}`,
    );

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o',
        messages: [
          { role: 'system', content: this.promptsService.getPersona() },
          { role: 'user', content: userContent },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content ?? '';
      this.logger.log(
        `Step 1 raw 응답 (앞 1000자):\n${content.slice(0, 1000)}`,
      );

      // 토큰 사용량 DB 저장
      if (response.usage) {
        await this.aiUsageLogRepo.save(
          this.aiUsageLogRepo.create({
            source: AiUsageSource.EXAM_STEP1,
            model: process.env.OPENAI_MODEL ?? 'gpt-4o',
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0,
          }),
        );
      }

      const parsed = this.extractJson(content);

      // 배열 또는 { items: [] / blueprints: [] } 형태 모두 처리
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed.items ?? parsed.blueprints ?? []);
      if (!Array.isArray(arr) || arr.length === 0) {
        const topLevelKeys =
          parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? Object.keys(parsed as Record<string, unknown>)
            : [];
        throw new Error(
          `Step 1 결과가 빈 배열입니다.${
            topLevelKeys.length > 0
              ? ` top-level keys: ${topLevelKeys.join(', ')}`
              : ''
          }`,
        );
      }

      await this.reportProgress(reportProgress, {
        stage: 'step1',
        progress: 50,
        status: 'success',
        message: `Step 1 완료: ${arr.length}개 Blueprint 생성`,
      });

      this.logger.log(
        `Step 1 결과 샘플 (첫 번째 항목):\n${JSON.stringify(arr[0], null, 2)}`,
      );

      return arr;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (retryCount < 3) {
        this.logger.warn(`Step 1 재시도 (${retryCount + 1}/3): ${message}`);
        await this.reportProgress(reportProgress, {
          stage: 'step1_retry',
          progress: 38,
          status: 'warning',
          message: `Step 1 재시도 (${retryCount + 1}/3)`,
          detail: message,
        });
        return this.runStep1(
          units,
          difficulty,
          questionCount,
          customPrompt,
          retryCount + 1,
          targetConcepts,
          reportProgress,
        );
      }

      await this.reportProgress(reportProgress, {
        stage: 'step1',
        progress: 50,
        status: 'error',
        message: 'Step 1에서 오류가 발생했습니다.',
        detail: message,
      });

      throw new InternalServerErrorException(`Step 1 실패: ${message}`);
    }
  }

  // ============================================================
  // Step 2: 실제 문항 데이터 생성
  // ============================================================
  private async runStep2(
    blueprint: any[],
    units: UnitPayload[],
    retryCount = 0,
    reportProgress?: ExamGenerationProgressReporter,
  ): Promise<any[]> {
    if (retryCount === 0) {
      await this.reportProgress(reportProgress, {
        stage: 'step2',
        progress: 55,
        message: 'Step 2 실제 문항 생성을 요청하는 중입니다.',
      });
    }

    const promoBlueprints = blueprint.filter(
      (bp) => bp.metadata?.recommended_template === 'TPL_PROMOTIONAL_CANVAS',
    );
    const otherBlueprints = blueprint.filter(
      (bp) => bp.metadata?.recommended_template !== 'TPL_PROMOTIONAL_CANVAS',
    );

    const results: any[] = [];

    if (otherBlueprints.length > 0) {
      const step2Prompt = this.promptsService.getStep2Prompt();
      const userContent = [
        step2Prompt,
        '',
        `# [Input Data]`,
        `- Blueprint Array: ${JSON.stringify(otherBlueprints)}`,
        `- units: ${JSON.stringify(units)}`,
        '',
        `# [수량 엄수 - 최우선]`,
        `Blueprint 배열의 원소 수는 ${otherBlueprints.length}개다. 출력 JSON 배열도 반드시 ${otherBlueprints.length}개여야 한다.`,
      ].join('\n');

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o',
        messages: [
          { role: 'system', content: this.promptsService.getPersona() },
          { role: 'user', content: userContent },
        ],
        temperature: 0.7,
      });

      if (response.usage) {
        await this.aiUsageLogRepo.save(
          this.aiUsageLogRepo.create({
            source: AiUsageSource.EXAM_STEP2,
            model: process.env.OPENAI_MODEL ?? 'gpt-4o',
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0,
          }),
        );
      }

      const content = response.choices[0]?.message?.content ?? '';
      const parsed = this.extractJson(content);
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed.items ?? parsed.questions ?? []);
      results.push(...arr);
    }

    if (promoBlueprints.length > 0) {
      const promoPrompt = this.promptsService.getStep2PromotionalCanvasPrompt();

      for (const bp of promoBlueprints) {
        const userContent = [
          promoPrompt,
          '',
          `# [Input Data]`,
          `- Blueprint: ${JSON.stringify(bp)}`,
          `- units: ${JSON.stringify(units)}`,
        ].join('\n');

        const response = await this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL ?? 'gpt-4o',
          messages: [
            { role: 'system', content: this.promptsService.getPersona() },
            { role: 'user', content: userContent },
          ],
          temperature: 0.7,
        });

        if (response.usage) {
          await this.aiUsageLogRepo.save(
            this.aiUsageLogRepo.create({
              source: AiUsageSource.EXAM_STEP2,
              model: process.env.OPENAI_MODEL ?? 'gpt-4o',
              promptTokens: response.usage.prompt_tokens ?? 0,
              completionTokens: response.usage.completion_tokens ?? 0,
              totalTokens: response.usage.total_tokens ?? 0,
            }),
          );
        }

        const content = response.choices[0]?.message?.content ?? '';
        const parsed = this.extractJson(content);
        if (Array.isArray(parsed)) {
          results.push(...parsed);
        } else if (parsed && typeof parsed === 'object') {
          results.push(parsed);
        }
      }
    }

    await this.reportProgress(reportProgress, {
      stage: 'step2',
      progress: 70,
      status: 'success',
      message: `Step 2 완료: ${results.length}개 문항 생성`,
    });

    if (results.length === 0) {
      if (retryCount < 3) {
        this.logger.warn(`Step 2 결과 비어있음, 재시도 (${retryCount + 1}/3)`);
        return this.runStep2(blueprint, units, retryCount + 1, reportProgress);
      }
      throw new InternalServerErrorException(
        'Step 2 실패: 결과가 비어있습니다.',
      );
    }

    return results;
  }

  // ============================================================
  // 파싱 + 검증
  // ============================================================
  private validateItems(rawItems: any[]): GeneratedQuestion[] {
    const valid: GeneratedQuestion[] = [];

    for (const item of rawItems) {
      try {
        const meta = item.metadata ?? {};
        const rr = item.render_ready ?? {};
        const exp = item.explanation ?? {};

        const optionsList: string[] =
          rr.options_list ??
          (rr.options ?? []).map((o: any) => o.text ?? String(o));

        const correctAnswer = Number(
          item.correct_answer ?? rr.correct_answer ?? 1,
        );

        // 검증
        if (!Array.isArray(optionsList) || optionsList.length !== 5) {
          this.logger.warn(`선택지 5개 아님 (${optionsList.length}개), 스킵`);
          continue;
        }
        if (correctAnswer < 1 || correctAnswer > 5) {
          this.logger.warn(`정답 범위 오류 (${correctAnswer}), 스킵`);
          continue;
        }

        const difficultyMap: Record<string, Difficulty> = {
          하: Difficulty.LOW,
          중: Difficulty.MIDDLE,
          상: Difficulty.HIGH,
          LOW: Difficulty.LOW,
          MIDDLE: Difficulty.MIDDLE,
          HIGH: Difficulty.HIGH,
          INTERGRATE: Difficulty.INTERGRATE,
        };

        valid.push({
          targetConcept: meta.target_concept ?? '',
          itemType: meta.item_type ?? '',
          difficulty:
            difficultyMap[meta.difficulty ?? meta.item_type] ??
            Difficulty.MIDDLE,
          recommendedTemplate: meta.recommended_template ?? '',
          questionStem: rr.question_stem ?? '',
          stimulusData: rr.stimulus_data ?? {},
          optionsList,
          explanation: typeof exp === 'string' ? { judgment: exp } : exp,
          correctAnswer,
          unitName: meta.unit_name ?? '',
        });
      } catch (e) {
        this.logger.warn(`문항 파싱 오류, 스킵: ${e.message}`);
      }
    }

    if (valid.length === 0) {
      throw new InternalServerErrorException(
        '유효한 문항이 생성되지 않았습니다.',
      );
    }

    return valid;
  }

  // ============================================================
  // 의미적 정합성 검증 (LLM-as-Judge)
  // ============================================================
  private async runSemanticValidation(
    items: GeneratedQuestion[],
    reportProgress?: ExamGenerationProgressReporter,
  ): Promise<GeneratedQuestion[]> {
    if (items.length === 0) return items;

    const validationInput = items.map((item, idx) => ({
      index: idx,
      target_concept: item.targetConcept,
      question_stem: item.questionStem,
      stimulus_data: item.stimulusData,
      options: item.optionsList,
      correct_answer: item.correctAnswer,
    }));

    const prompt = `You are an expert exam quality reviewer for Korean CSAT-style questions. Evaluate each question strictly.

For each question, check ALL of the following:
1. STEM-OPTION MATCH: Does the question stem logically match what the options are answering? (e.g., if stem asks "which is NOT correct", options should be statements that can be true/false)
2. CORRECT ANSWER VALIDITY: Is the marked correct answer actually the best answer given the stem?
3. OPTION CATEGORY UNITY: Are all options in the same grammatical/semantic category? (all noun phrases, all statements, etc.)
4. DISTRACTOR PLAUSIBILITY: Are wrong answers plausible but clearly distinguishable from the correct one?
5. PLACEHOLDER DETECTION: Does stimulus_data or options contain unfilled placeholders, meta-instructions, or guide text instead of actual content? Examples of FAIL: "사례를 채워야 한다", "여기에 예시 삽입", "{{placeholder}}", empty strings where content should be, descriptions of what should be there instead of actual data. Any field that reads like an instruction to a writer rather than actual exam content is a FAIL.
6. CONTENT COMPLETENESS: Is every field in stimulus_data filled with concrete, specific content (names, numbers, scenarios, statements)? Generic or abstract filler like "적절한 사례", "해당 내용", "관련 설명" without actual substance is a FAIL.
7. STIMULUS-STEM RELEVANCE: Is the stimulus_data (table, diagram, conversation, etc.) actually relevant to what the question_stem is asking? If the stimulus shows a comparison table of A vs B but the stem asks about an unrelated concept C that doesn't require the table to answer, that's a FAIL. The stimulus must be NECESSARY to answer the question — if removing it doesn't change the difficulty, it's decorative and that's a FAIL.
8. STEM CONCEPT LEAKAGE: Does the question_stem directly name the target concept that should only be revealed through stimulus_data? If the stem says "다음 중 유한회사의 특징으로 옳은 것은?" while the stimulus already describes 유한회사's characteristics, the concept is redundantly exposed in both places — that's a FAIL. The stem should reference the stimulus material generically (e.g., "다음 자료에 대한 설명으로 옳은 것은?") rather than naming the concept directly.
9. CONCEPT LEAKAGE (STRICT): Check if question_stem contains the target_concept string OR any specific domain terminology/concept names (Korean nouns like 직업의 사회적 인정, 기준 금리, 유한회사, etc.). The stem MUST start with a stimulus-referencing phrase like "다음 자료에 대한", "위 표의", "다음 상황에", "다음에서 설명하는". If the stem directly names ANY concept instead of referencing the stimulus material, that's a FAIL. Examples of FAIL: "직업의 사회적 인정과 직업의 안정성이 충돌할 때...", "기준 금리에 대한 설명으로...", "유한회사의 특징으로..."

Input questions:
${JSON.stringify(validationInput, null, 2)}

Output ONLY a JSON array with this schema:
[{ "index": <number>, "verdict": "PASS" | "FAIL", "reason": "<brief explanation if FAIL, empty string if PASS>" }]

Be strict:
- If the stem asks about topic A but options discuss topic B, that's a FAIL.
- If options mix different grammatical forms (some are nouns, some are full sentences), that's a FAIL.
- If stimulus_data contains ANY placeholder text, guide instructions, or unfilled template markers, that's a FAIL.
- If options contain vague descriptions instead of concrete statements, that's a FAIL.
Output JSON only.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });

      if (response.usage) {
        await this.aiUsageLogRepo.save(
          this.aiUsageLogRepo.create({
            source: AiUsageSource.EXAM_VALIDATION,
            model: 'gpt-4o-mini',
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0,
          }),
        );
      }

      const content = response.choices[0]?.message?.content ?? '';
      const parsed = this.extractJson(content);
      const verdicts: { index: number; verdict: string; reason: string }[] =
        Array.isArray(parsed) ? parsed : [];

      const passedIndices = new Set<number>();
      for (const v of verdicts) {
        if (v.verdict === 'PASS') {
          passedIndices.add(v.index);
        } else {
          this.logger.warn(`문항 ${v.index + 1} 의미적 검증 실패: ${v.reason}`);
        }
      }

      const passed = items.filter((_, idx) => passedIndices.has(idx));

      if (passed.length === 0) {
        this.logger.warn(
          '모든 문항이 의미적 검증에 실패. 구조 검증 통과분 그대로 사용.',
        );
        return items;
      }

      this.logger.log(`의미적 검증: ${passed.length}/${items.length}개 통과`);
      return passed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`의미적 검증 호출 실패, 스킵: ${message}`);
      return items;
    }
  }

  // ============================================================
  // DB 저장 (재사용 체크)
  // ============================================================
  private async saveQuestions(
    items: GeneratedQuestion[],
    subjectId: string,
    subjectSlug: string,
    reportProgress?: ExamGenerationProgressReporter,
  ): Promise<Question[]> {
    const saved: Question[] = [];

    await this.reportProgress(reportProgress, {
      stage: 'saving_questions',
      progress: 86,
      message: `문항 저장을 시작합니다. (${items.length}개)`,
    });

    for (const [index, item] of items.entries()) {
      const currentProgress =
        87 + Math.floor((index / Math.max(items.length, 1)) * 9);
      await this.reportProgress(reportProgress, {
        stage: 'saving_questions',
        progress: currentProgress,
        message: `문항 저장/재사용 처리 중 (${index + 1}/${items.length})`,
        detail: item.targetConcept || item.recommendedTemplate,
      });

      // 단원 찾기
      const unitNumber =
        parseInt(item.unitName.replace(/[^0-9]/g, ''), 10) || 1;
      let unit = await this.unitRepo.findOne({
        where: { subjectId, unitNumber },
      });

      // 단원이 없으면 생성
      if (!unit) {
        unit = this.unitRepo.create({
          subjectId,
          unitNumber,
          title: item.unitName,
        });
        await this.unitRepo.save(unit);
      }

      // 재사용 체크
      const existing = await this.questionRepo.findOne({
        where: {
          subjectId,
          unitId: unit.id,
          targetConcept: item.targetConcept,
          recommendedTemplate: item.recommendedTemplate,
        },
      });

      if (existing) {
        this.logger.log(
          `재사용: ${item.targetConcept} (${item.recommendedTemplate})`,
        );
        saved.push(existing);
        continue;
      }

      // 새 문항 저장
      const question = this.questionRepo.create({
        subjectId,
        unitId: unit.id,
        targetConcept: item.targetConcept,
        itemType: item.itemType,
        difficulty: item.difficulty,
        recommendedTemplate: item.recommendedTemplate,
        questionStem: item.questionStem,
        stimulusData: item.stimulusData,
        optionsList: item.optionsList,
        explanation: item.explanation,
        correctAnswer: item.correctAnswer,
      });

      await this.questionRepo.save(question);
      saved.push(question);
    }

    await this.reportProgress(reportProgress, {
      stage: 'saving_questions',
      progress: 96,
      status: 'success',
      message: `문항 ${saved.length}개 저장/재사용 완료`,
    });

    return saved;
  }

  private async reportProgress(
    reportProgress: ExamGenerationProgressReporter | undefined,
    update: ExamGenerationProgressUpdate,
  ) {
    if (!reportProgress) {
      return;
    }

    await reportProgress(update);
  }

  private extractJson(text: string): any {
    // 마크다운 코드블록(```json ... ``` 또는 ``` ... ```) 안에 있으면 그 안만 파싱
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = codeBlock ? codeBlock[1].trim() : text.trim();
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`JSON 파싱 실패. 응답 앞부분: ${raw.slice(0, 200)}`);
    }
  }
}
