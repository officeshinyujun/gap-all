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
import { PatternMatcherService } from './pattern-matcher.service';
import { SimilarityValidatorService } from './similarity-validator.service';
import { Question } from '../entities/question.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';
import { Difficulty } from '../entities/exam-record.entity';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';

// OpenAI 호출 타임아웃 (ms) — 환경변수로 오버라이드 가능
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 120_000;

// 단원 텍스트 최대 길이 (문자 수) — 이 이상은 잘라서 전송
const MAX_UNIT_TEXT_LENGTH = Number(process.env.MAX_UNIT_TEXT_LENGTH) || 12_000;

// 실제 수능/모의평가 11개 시험 분석 기반 단원별 출제 비중 (%)
const UNIT_REAL_WEIGHTS: Record<number, number> = {
  1: 7.41,
  2: 4.17,
  3: 7.87,
  4: 4.63,
  5: 1.85,
  6: 6.94,
  7: 4.17,
  8: 6.02,
  9: 0.5,
  10: 5.56,
  11: 5.09,
  12: 0.93,
  13: 4.17,
  14: 7.41,
  15: 5.09,
  16: 2.31,
  17: 4.63,
  18: 5.09,
  19: 6.94,
  20: 9.72,
};

// 숫자놀음(수치/계산) 단원 — TPL_QUANTITATIVE_CHART, TPL_COMPARATIVE_MATRIX 적극 권장
const NUMBER_PLAY_UNITS = new Set([5, 6, 9, 16, 17]);

const NUMBER_PLAY_PROMPT_SNIPPET = `\n## [수치 데이터 활용 지시 — 해당 단원]
이 단원은 실제 수능에서 수치 데이터/계산 문제가 자주 출제되는 단원입니다:
- 가능한 TPL_QUANTITATIVE_CHART(차트), TPL_COMPARATIVE_MATRIX(비교표)를 활용하라.
- 임금/근로시간/생산량/급여/보험료 등 구체적인 숫자 데이터를 자료에 포함하라.
- '…을 계산하시오' 또는 '…을 구하시오' 형태의 발문을 적극 허용한다.
- 표 안의 수치를 비교/분석하여 답을 도출하는 문제 유형을 권장한다.`;

/**
 * 선택된 단원 범위 내에서 실제 기출 비중을 기준으로
 * 각 단원에 할당할 문항 수를 계산한다.
 */
function computeUnitWeights(
  startUnit: number,
  endUnit: number,
  questionCount: number,
): Map<number, number> {
  const range: number[] = [];
  for (let u = startUnit; u <= endUnit; u++) {
    if (UNIT_REAL_WEIGHTS[u] !== undefined) range.push(u);
  }

  const totalWeight = range.reduce((sum, u) => sum + UNIT_REAL_WEIGHTS[u], 0);
  if (totalWeight <= 0) {
    const perUnit = Math.floor(questionCount / range.length);
    const rem = questionCount % range.length;
    const map = new Map<number, number>();
    range.forEach((u, i) => map.set(u, perUnit + (i < rem ? 1 : 0)));
    return map;
  }

  const raw = range.map((u) => ({
    unit: u,
    raw: (UNIT_REAL_WEIGHTS[u] / totalWeight) * questionCount,
  }));

  // 정수 할당 (largest remainder method)
  let allocated = 0;
  const result = raw.map((r) => {
    const floor = Math.floor(r.raw);
    allocated += floor;
    return { unit: r.unit, base: floor, frac: r.raw - floor };
  });

  result.sort((a, b) => b.frac - a.frac);
  for (let i = 0; allocated < questionCount && i < result.length; i++) {
    result[i].base++;
    allocated++;
  }

  const map = new Map<number, number>();
  for (const r of result) {
    if (r.base > 0) map.set(r.unit, r.base);
  }
  return map;
}

function buildItemFamilyQuotaPrompt(
  subjectSlug: string,
  questionCount: number,
): string {
  if (questionCount <= 1) {
    return `# [문항 유형 강제 비율]\n1문항 생성이므로 비율 규칙 대신 발문/자료 구조에 가장 자연스러운 item_family 1개만 선택하라. 조합형(combination_judgment)을 자동 기본값으로 사용하지 마라.`;
  }

  const nonComboMin = Math.max(1, Math.ceil(questionCount * 0.4));
  const comboMax = questionCount - nonComboMin;

  if (subjectSlug === 'success') {
    const singleMin = Math.max(1, Math.ceil(questionCount * 0.2));
    const directMin = Math.max(1, Math.ceil(questionCount * 0.1));
    const workflowMin = questionCount >= 5 ? 1 : 0;
    return [
      '# [문항 유형 강제 비율 — 성직]',
      `총 ${questionCount}문항 중 combination_judgment는 최대 ${comboMax}문항까지만 허용한다.`,
      `나머지 최소 ${nonComboMin}문항은 non-조합형(single_selection, direct_statement, blank_workflow)으로 설계하라.`,
      `single_selection은 최소 ${singleMin}문항 포함하라.`,
      `direct_statement는 최소 ${directMin}문항 포함하라.`,
      workflowMin > 0
        ? `blank_workflow는 최소 ${workflowMin}문항 포함하라.`
        : '',
      '채용 공고, 면접 장면, NCS 화면, 기사/칼럼, 취업 프로그램 안내는 single_selection 또는 direct_statement를 우선 사용하라.',
      '발문에 <보기>가 없는 경우 combination_judgment를 사용하지 마라.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const singleMin = Math.max(1, Math.ceil(questionCount * 0.15));
  const directMin = Math.max(1, Math.ceil(questionCount * 0.15));
  const workflowMin = questionCount >= 5 ? 1 : 0;
  return [
    '# [문항 유형 강제 비율 — 공일]',
    `총 ${questionCount}문항 중 combination_judgment는 최대 ${comboMax}문항까지만 허용한다.`,
    `나머지 최소 ${nonComboMin}문항은 non-조합형(single_selection, direct_statement, blank_workflow)으로 설계하라.`,
    `single_selection은 최소 ${singleMin}문항 포함하라.`,
    `direct_statement는 최소 ${directMin}문항 포함하라.`,
    workflowMin > 0 ? `blank_workflow는 최소 ${workflowMin}문항 포함하라.` : '',
    '시스템명(MES/SCM/CRM/JIT/POP), 공정/기법/분류 중 하나를 고르는 문제는 single_selection을 우선 사용하라.',
    '보고서/표/기사/점검표를 읽고 하나의 판단을 내리는 문제는 direct_statement를 우선 사용하라.',
    '발문에 <보기>가 없는 경우 combination_judgment를 사용하지 마라.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface GeneratedQuestion {
  targetConcept: string;
  itemType: string;
  difficulty: Difficulty;
  recommendedTemplate: string;
  questionStem: string;
  stimulusData: object;
  optionsList: string[];
  comboBlock: {
    title: string;
    items: Array<{ key: string; text: string }>;
  } | null;
  explanation: object;
  correctAnswer: number;
  unitName: string;
  setGroupId: string | null;
  setPosition: number | null;
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
    private readonly patternMatcher: PatternMatcherService,
    private readonly similarityValidator: SimilarityValidatorService,
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

    // 2. 단원별 문항 할당량 계산
    const unitWeights = computeUnitWeights(startUnitNum, endUnitNum, questionCount);
    this.logger.log(
      `단원 할당: ${[...unitWeights.entries()].map(([u, c]) => `${u}단원=${c}문항`).join(', ')}`,
    );

    await this.reportProgress(reportProgress, {
      stage: 'loading_textbook',
      progress: 25,
      status: 'success',
      message: `교과서 ${units.length}개 단원 로딩 완료 (${unitWeights.size}개 단원에 분배)`,
    });

    // 3. 단원별 개별 생성
    const allValid: GeneratedQuestion[] = [];
    let unitIdx = 0;
    const totalUnits = unitWeights.size;

    for (const [unitNum, count] of unitWeights) {
      unitIdx++;
      const unitPayload = units.find(
        (u) => u.unit_name === `${unitNum}단원` || u.unit_name.includes(`Unit_${String(unitNum).padStart(2, '0')}`),
      ) || { unit_name: `${unitNum}단원`, text_payload: '' };
      const singleUnits = [unitPayload];

      const isNumberPlay = NUMBER_PLAY_UNITS.has(unitNum);
      const numPlayHint = isNumberPlay ? NUMBER_PLAY_PROMPT_SNIPPET : '';

      this.logger.log(
        `--- ${unitNum}단원 ${count}문항 생성 시작 (${unitIdx}/${totalUnits})${isNumberPlay ? ' [숫자놀음]' : ''} ---`,
      );

      await this.reportProgress(reportProgress, {
        stage: 'generating',
        progress: 30 + Math.round((unitIdx / totalUnits) * 40),
        message: `${unitNum}단원 ${count}문항 생성 중...`,
      });

      // 3a. Step 1: Blueprint 생성 (단원별)
      const blueprint = await this.runStep1(
        singleUnits,
        difficulty,
        count,
        subjectSlug,
        customPrompt ? `${customPrompt}\n${numPlayHint}` : numPlayHint,
        0,
        targetConcepts,
        undefined,
        unitNum,
        unitNum,
      );

      // 3b. Step 2: 실제 문항 데이터 생성
      const rawItems = await this.runStep2(
        blueprint,
        singleUnits,
        subjectSlug,
        0,
      );

      // 3c. 구조 검증
      const validated = this.validateItems(rawItems);

      // 3d. 의미적 검증 + 부족분 재생성 (최대 2회)
      let semValid = await this.runSemanticValidation(validated);
      let retryRound = 0;
      while (semValid.length < count && retryRound < 2) {
        retryRound++;
        const deficit = count - semValid.length;
        const extraBp = await this.runStep1(
          singleUnits, difficulty, deficit, subjectSlug,
          numPlayHint, 0, targetConcepts, undefined, unitNum, unitNum,
        );
        const extraRaw = await this.runStep2(extraBp, singleUnits, subjectSlug, 0);
        const extraVal = this.validateItems(extraRaw);
        const extraSem = await this.runSemanticValidation(extraVal);
        semValid = [...semValid, ...extraSem];
      }
      if (semValid.length > count) semValid = semValid.slice(0, count);

      // 3e. 유사도 검증
      for (const item of semValid) {
        const ct = item.comboBlock
          ? `${item.comboBlock.title}: ${item.comboBlock.items.map((i) => i.text).join(' ')}`
          : '';
        const result = await this.similarityValidator.validate(
          item.questionStem, item.stimulusData, item.optionsList, ct,
        );
        if (result.passed) allValid.push(item);
      }

      this.logger.log(
        `--- ${unitNum}단원 완료: ${semValid.length}개 → 유사도 통과 ${allValid.length - allValid.filter(i => !semValid.includes(i)).length}개 ---`,
      );
    }

    if (allValid.length === 0) {
      this.logger.warn('모든 문항이 유사도/검증에 탈락했습니다.');
    }

    await this.reportProgress(reportProgress, {
      stage: 'similarity_check',
      progress: 85,
      status: 'success',
      message: `전체 유사도 검증 완료: ${allValid.length}개 통과`,
    });

    // 4. 부족분 채움 (전체 questionCount보다 적으면 추가 생성)
    let finalItems = allValid;
    if (finalItems.length < questionCount) {
      const deficit = questionCount - finalItems.length;
      this.logger.log(`전체 ${deficit}개 부족, 통합 재생성`);
      const fallbackBp = await this.runStep1(
        units, difficulty, deficit, subjectSlug,
        customPrompt, 0, targetConcepts, undefined,
        startUnitNum, endUnitNum,
      );
      const fallbackRaw = await this.runStep2(fallbackBp, units, subjectSlug, 0);
      const fallbackVal = this.validateItems(fallbackRaw);
      const fallbackSem = await this.runSemanticValidation(fallbackVal);
      for (const item of fallbackSem) {
        const ct = item.comboBlock ? `${item.comboBlock.title}: ${item.comboBlock.items.map((i) => i.text).join(' ')}` : '';
        const r = await this.similarityValidator.validate(item.questionStem, item.stimulusData, item.optionsList, ct);
        if (r.passed) finalItems.push(item);
        if (finalItems.length >= questionCount) break;
      }
    }

    if (finalItems.length > questionCount) {
      finalItems = finalItems.slice(0, questionCount);
    }

    // 5. DB 저장
    const questions = await this.saveQuestions(
      finalItems,
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
    subjectSlug: string,
    customPrompt?: string,
    retryCount = 0,
    targetConcepts?: string[],
    reportProgress?: ExamGenerationProgressReporter,
    startUnitNum?: number,
    endUnitNum?: number,
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
      subjectSlug,
    );

    const truncatedUnits = units.map((u) => ({
      unit_name: u.unit_name,
      text_payload:
        u.text_payload.length > MAX_UNIT_TEXT_LENGTH
          ? u.text_payload.slice(0, MAX_UNIT_TEXT_LENGTH) + '\n...(truncated)'
          : u.text_payload,
    }));

    const patternContext =
      startUnitNum != null && endUnitNum != null
        ? this.patternMatcher.formatPatternContext(
            subjectSlug,
            startUnitNum,
            endUnitNum,
            targetConcepts,
          )
        : '';

    const userContent = [
      step1Prompt,
      '',
      buildItemFamilyQuotaPrompt(subjectSlug, questionCount),
      '',
      ...(patternContext ? [patternContext, ''] : []),
      `# [Input Data]`,
      `- total_item_count: ${questionCount}`,
      `- units: ${JSON.stringify(truncatedUnits)}`,
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
      `Step 1 요청: prompt=${step1Prompt.length}자, units=${JSON.stringify(truncatedUnits).length}자, total=${userContent.length}자`,
    );

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

      const response = await this.openai.chat.completions.create(
        {
          model: process.env.OPENAI_STEP1_MODEL ?? 'gpt-4o',
          messages: [
            { role: 'system', content: this.promptsService.getPersona() },
            { role: 'user', content: userContent },
          ],
          temperature: 0.7,
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

      const content = response.choices[0]?.message?.content ?? '';
      this.logger.log(
        `Step 1 raw 응답 (앞 1000자):\n${content.slice(0, 1000)}`,
      );

      // 토큰 사용량 DB 저장
      if (response.usage) {
        await this.aiUsageLogRepo.save(
          this.aiUsageLogRepo.create({
            source: AiUsageSource.EXAM_STEP1,
            model: process.env.OPENAI_STEP1_MODEL ?? 'gpt-4o',
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0,
          }),
        );
      }

      const parsed = this.extractJson(content);

      let arr: any[];
      if (Array.isArray(parsed)) {
        arr = parsed;
      } else if (parsed.items ?? parsed.blueprints) {
        arr = parsed.items ?? parsed.blueprints;
      } else if (parsed && typeof parsed === 'object' && parsed.metadata) {
        arr = [parsed];
      } else {
        const topLevelKeys =
          parsed && typeof parsed === 'object'
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

      if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('Step 1 결과가 빈 배열입니다.');
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
      const isTimeout =
        message.includes('abort') || message.includes('timeout');
      this.logger.warn(
        `Step 1 실패 (${retryCount + 1}/3): ${isTimeout ? '[TIMEOUT] ' : ''}${message}`,
      );
      if (retryCount < 3) {
        await this.reportProgress(reportProgress, {
          stage: 'step1_retry',
          progress: 38,
          status: 'warning',
          message: `Step 1 재시도 (${retryCount + 1}/3)${isTimeout ? ' — 타임아웃' : ''}`,
          detail: message,
        });
        return this.runStep1(
          units,
          difficulty,
          questionCount,
          subjectSlug,
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
    subjectSlug: string,
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
      const step2Prompt = this.promptsService.getStep2Prompt(subjectSlug);
      const truncatedUnitsForStep2 = units.map((u) => ({
        unit_name: u.unit_name,
        text_payload:
          u.text_payload.length > MAX_UNIT_TEXT_LENGTH
            ? u.text_payload.slice(0, MAX_UNIT_TEXT_LENGTH) + '\n...(truncated)'
            : u.text_payload,
      }));
      const userContent = [
        step2Prompt,
        '',
        `# [Input Data]`,
        `- Blueprint Array: ${JSON.stringify(otherBlueprints)}`,
        `- units: ${JSON.stringify(truncatedUnitsForStep2)}`,
        '',
        `# [수량 엄수 - 최우선]`,
        `Blueprint 배열의 원소 수는 ${otherBlueprints.length}개다. 출력 JSON 배열도 반드시 ${otherBlueprints.length}개여야 한다.`,
      ].join('\n');

      this.logger.log(
        `Step 2 요청: prompt=${step2Prompt.length}자, blueprint=${JSON.stringify(otherBlueprints).length}자, units=${JSON.stringify(truncatedUnitsForStep2).length}자`,
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

      const response = await this.openai.chat.completions.create(
        {
          model: process.env.OPENAI_STEP2_MODEL ?? 'gpt-4o',
          messages: [
            { role: 'system', content: this.promptsService.getPersona() },
            { role: 'user', content: userContent },
          ],
          temperature: 0.7,
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

      if (response.usage) {
        await this.aiUsageLogRepo.save(
          this.aiUsageLogRepo.create({
            source: AiUsageSource.EXAM_STEP2,
            model: process.env.OPENAI_STEP2_MODEL ?? 'gpt-4o',
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

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

        const response = await this.openai.chat.completions.create(
          {
            model: process.env.OPENAI_STEP2_MODEL ?? 'gpt-4o',
            messages: [
              { role: 'system', content: this.promptsService.getPersona() },
              { role: 'user', content: userContent },
            ],
            temperature: 0.7,
          },
          { signal: controller.signal },
        );

        clearTimeout(timer);

        if (response.usage) {
          await this.aiUsageLogRepo.save(
            this.aiUsageLogRepo.create({
              source: AiUsageSource.EXAM_STEP2,
              model: process.env.OPENAI_STEP2_MODEL ?? 'gpt-4o',
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
        return this.runStep2(
          blueprint,
          units,
          subjectSlug,
          retryCount + 1,
          reportProgress,
        );
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

        const rawAnswer = item.correct_answer ?? rr.correct_answer;
        if (rawAnswer == null) {
          this.logger.warn(`correct_answer 누락, 스킵`);
          continue;
        }
        const correctAnswer = Number(rawAnswer);

        if (!Array.isArray(optionsList) || optionsList.length !== 5) {
          this.logger.warn(`선택지 5개 아님 (${optionsList.length}개), 스킵`);
          continue;
        }
        if (correctAnswer < 1 || correctAnswer > 5) {
          this.logger.warn(`정답 범위 오류 (${correctAnswer}), 스킵`);
          continue;
        }

        const combCheck = this.validateCombinationEncoding(item);
        if (!combCheck.valid) {
          this.logger.warn(`조합형 검증 실패: ${combCheck.reason}, 스킵`);
          continue;
        }

        const stemCheck = this.validateStemPattern(item);
        if (!stemCheck.valid) {
          this.logger.warn(`줄기 패턴 검증 실패: ${stemCheck.reason}, 스킵`);
          continue;
        }

        const logicCheck = this.validateItemLogic(item);
        if (!logicCheck.valid) {
          this.logger.warn(`논리 정합성 검증 실패: ${logicCheck.reason}, 스킵`);
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

        let comboBlock: GeneratedQuestion['comboBlock'] = null;
        const jm = item.judgment_map;
        const rrCombo = rr.combo_block;

        if (
          rrCombo &&
          Array.isArray(rrCombo.items) &&
          rrCombo.items.length > 0
        ) {
          comboBlock = rrCombo;
        } else if (jm && typeof jm === 'object') {
          const keyMap: Record<string, string> = {
            ga: 'ㄱ',
            na: 'ㄴ',
            da: 'ㄷ',
            ra: 'ㄹ',
          };
          const cbItems = Object.entries(jm)
            .filter(([k]) => keyMap[k])
            .map(([k, v]: [string, any]) => ({
              key: keyMap[k],
              text:
                typeof v === 'object' ? (v.claim ?? v.text ?? '') : String(v),
            }))
            .filter((ci) => ci.text.length > 0);
          if (cbItems.length > 0) {
            comboBlock = { title: '<보기>', items: cbItems };
          }
        }

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
          comboBlock,
          explanation: typeof exp === 'string' ? { judgment: exp } : exp,
          correctAnswer,
          unitName: meta.unit_name ?? '',
          setGroupId: meta.set_group_id ?? null,
          setPosition: meta.set_position ?? null,
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
  // Logic-aware validation
  // ============================================================
  private validateCombinationEncoding(item: any): {
    valid: boolean;
    reason?: string;
  } {
    const itemStructure = item.item_structure;
    if (
      !itemStructure ||
      itemStructure.choice_encoding_type !== 'truth_combination'
    ) {
      return { valid: true };
    }

    const rr = item.render_ready ?? {};
    const optionsList: string[] =
      rr.options_list ??
      (rr.options ?? []).map((o: any) => o.text ?? String(o));

    if (!Array.isArray(optionsList) || optionsList.length !== 5) {
      return {
        valid: false,
        reason: `조합형 문항의 선택지가 5개가 아님 (${optionsList?.length ?? 0}개)`,
      };
    }

    const combinationPattern = /[ㄱ-ㅎ]/;
    const combLikeCount = optionsList.filter((opt) =>
      combinationPattern.test(opt),
    ).length;
    if (combLikeCount < 3) {
      return {
        valid: false,
        reason: `조합형 문항이지만 선택지가 조합 패턴이 아님 (${combLikeCount}/5개만 매칭)`,
      };
    }

    const judgmentMap = item.judgment_map;
    const choiceEncodingPlan = item.choice_encoding_plan;
    if (judgmentMap && choiceEncodingPlan?.correct_combination) {
      const correctIdx =
        Number(item.correct_answer ?? rr.correct_answer ?? 0) - 1;
      if (correctIdx >= 0 && correctIdx < optionsList.length) {
        const trueStatements = Object.entries(judgmentMap)
          .filter(
            ([, v]) => v === true || v === 'T' || v === '옳음' || v === '참',
          )
          .map(([k]) => k);

        if (trueStatements.length > 0) {
          const correctOption = optionsList[correctIdx];
          const allPresent = trueStatements.every((s) =>
            correctOption.includes(s),
          );
          if (!allPresent) {
            return {
              valid: false,
              reason: `정답 선택지가 judgment_map의 참인 진술과 불일치`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  private validateStemPattern(item: any): { valid: boolean; reason?: string } {
    const rr = item.render_ready ?? {};
    const questionStem: string = rr.question_stem ?? '';
    const meta = item.metadata ?? {};

    if (questionStem.length < 10) {
      return {
        valid: false,
        reason: `문항 줄기가 너무 짧음 (${questionStem.length}자)`,
      };
    }

    const questionEndings =
      /(?:것은\?|고른\s*것은\?|고르시오|옳은\s*것은\?|않은\s*것은\?|무엇인가\?|서술하시오|설명으로.*옳은|대한.*설명|맞는\s*것)$/;
    if (!questionEndings.test(questionStem.trim())) {
      return {
        valid: false,
        reason: `문항 줄기가 적절한 질문 형식으로 끝나지 않음`,
      };
    }

    const targetConcept: string = meta.target_concept ?? '';
    const itemStructure = item.item_structure;
    if (
      targetConcept.length > 1 &&
      questionStem.includes(targetConcept) &&
      itemStructure?.item_family &&
      itemStructure.item_family !== 'direct_statement'
    ) {
      return {
        valid: false,
        reason: `문항 줄기에 target_concept("${targetConcept}")이 직접 노출됨`,
      };
    }

    return { valid: true };
  }

  private validateItemLogic(item: any): { valid: boolean; reason?: string } {
    const itemStructure = item.item_structure;
    const rr = item.render_ready ?? {};
    const optionsList: string[] =
      rr.options_list ??
      (rr.options ?? []).map((o: any) => o.text ?? String(o));
    const rawAnswer = item.correct_answer ?? rr.correct_answer;
    if (rawAnswer == null) {
      return {
        valid: false,
        reason: 'correct_answer 누락',
      };
    }
    const correctAnswer = Number(rawAnswer);

    if (correctAnswer < 1 || correctAnswer > 5) {
      return {
        valid: false,
        reason: `정답 번호가 1~5 범위 밖 (${correctAnswer})`,
      };
    }

    if (!itemStructure) {
      return { valid: true };
    }

    const combinationPattern = /[ㄱ-ㅎ]/;
    const combLikeCount = Array.isArray(optionsList)
      ? optionsList.filter(
          (opt) => combinationPattern.test(opt) && opt.length < 30,
        ).length
      : 0;

    if (itemStructure.choice_encoding_type === 'truth_combination') {
      const fullSentenceCount = Array.isArray(optionsList)
        ? optionsList.filter(
            (opt) => opt.length > 40 && !combinationPattern.test(opt),
          ).length
        : 0;
      if (fullSentenceCount >= 3) {
        return {
          valid: false,
          reason: `조합형(truth_combination)이지만 선택지가 완전한 문장 형태`,
        };
      }
    }

    if (itemStructure.choice_encoding_type === 'independent_options') {
      if (combLikeCount >= 4) {
        return {
          valid: false,
          reason: `독립형(independent_options)이지만 선택지가 조합 패턴`,
        };
      }
    }

    const itemFamily = itemStructure.item_family;
    const questionStem: string = rr.question_stem ?? '';

    if (itemFamily === 'single_selection') {
      const longSentenceCount = Array.isArray(optionsList)
        ? optionsList.filter(
            (opt) => /[.?!]$/.test(opt.trim()) || opt.length > 45,
          ).length
        : 0;
      if (longSentenceCount >= 3) {
        return {
          valid: false,
          reason:
            'single_selection인데 선지가 후보명이 아니라 장문 서술 중심임',
        };
      }
      const singleSelectionStem =
        /(가장\s*적절한\s*것은\?|옳은\s*것은\?|옳지\s*않은\s*것은\?|무엇인가\?)/;
      if (!singleSelectionStem.test(questionStem)) {
        return {
          valid: false,
          reason: 'single_selection인데 발문이 단일 선택형 질문 패턴이 아님',
        };
      }
    }

    if (itemFamily === 'direct_statement') {
      const directStemRef =
        /(다음|위|아래).*(자료|표|기사|보고서|공고문|화면|설문|저널|내용)/;
      if (!directStemRef.test(questionStem)) {
        return {
          valid: false,
          reason: 'direct_statement인데 발문이 자료 직접 참조형이 아님',
        };
      }
      const stimulusText = JSON.stringify(rr.stimulus_data ?? {});
      if (stimulusText.length < 40) {
        return {
          valid: false,
          reason: 'direct_statement인데 stimulus_data 정보량이 너무 적음',
        };
      }
    }

    if (itemFamily === 'blank_workflow') {
      const workflowStem = /(\(가\)|\(나\)|단계|절차|순서|흐름)/;
      if (!workflowStem.test(questionStem)) {
        return {
          valid: false,
          reason: 'blank_workflow인데 발문에 빈칸/단계/절차 단서가 없음',
        };
      }
      const stimulus = rr.stimulus_data ?? {};
      const hasWorkflow =
        Array.isArray(stimulus.steps) || /steps/.test(JSON.stringify(stimulus));
      if (!hasWorkflow) {
        return {
          valid: false,
          reason: 'blank_workflow인데 stimulus_data에 단계 정보가 없음',
        };
      }
    }

    return { valid: true };
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

    const prompt = `You are an expert exam quality reviewer for Korean CSAT-style questions (EBS 수능특강 style). Evaluate each question.

For each question, check ALL of the following:
1. STEM-OPTION MATCH: Does the question stem logically match what the options are answering? (e.g., if stem asks "which is NOT correct", options should be statements that can be true/false)
2. CORRECT ANSWER VALIDITY: Is the marked correct answer actually the best answer given the stem?
3. OPTION CATEGORY UNITY: Are all options in the same grammatical/semantic category? (all noun phrases, all statements, etc.)
4. DISTRACTOR PLAUSIBILITY: Are wrong answers plausible but clearly distinguishable from the correct one?
5. PLACEHOLDER DETECTION: Does stimulus_data or options contain unfilled placeholders, meta-instructions, or guide text instead of actual content? Examples of FAIL: "사례를 채워야 한다", "여기에 예시 삽입", "{{placeholder}}", empty strings where content should be, descriptions of what should be there instead of actual data. Any field that reads like an instruction to a writer rather than actual exam content is a FAIL.
6. CONTENT COMPLETENESS: Is every field in stimulus_data filled with concrete, specific content (names, numbers, scenarios, statements)? Generic or abstract filler like "적절한 사례", "해당 내용", "관련 설명" without actual substance is a FAIL.
7. STIMULUS-STEM RELEVANCE: Is the stimulus_data (table, diagram, conversation, etc.) actually relevant to what the question_stem is asking? If the stimulus shows a comparison table of A vs B but the stem asks about an unrelated concept C that doesn't require the table to answer, that's a FAIL. The stimulus must be NECESSARY to answer the question — if removing it doesn't change the difficulty, it's decorative and that's a FAIL.
8. CONCEPT USAGE (BALANCED): Using curriculum concept terms in the stem IS ALLOWED in EBS-style questions. The stem MAY name concepts like "직업 가치관", "유연 근무제", "홀랜드 유형" etc. This is NOT a failure. However, if the stem names the concept AND the answer can be determined purely from knowing the concept name without reading the stimulus_data at all, that's a FAIL. The test is: "Does the student still need to read and interpret the stimulus to answer correctly?" If yes → PASS. If the stimulus is unnecessary because the stem already gives away everything → FAIL.

Input questions:
${JSON.stringify(validationInput, null, 2)}

Output ONLY a JSON array with this schema:
[{ "index": <number>, "verdict": "PASS" | "FAIL", "reason": "<brief explanation if FAIL, empty string if PASS>" }]

Be strict on rules 1-7. For rule 8, only fail if the stimulus becomes completely unnecessary.
- If the stem asks about topic A but options discuss topic B, that's a FAIL.
- If options mix different grammatical forms (some are nouns, some are full sentences), that's a FAIL.
- If stimulus_data contains ANY placeholder text, guide instructions, or unfilled template markers, that's a FAIL.
- If options contain vague descriptions instead of concrete statements, that's a FAIL.
Output JSON only.`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

      const response = await this.openai.chat.completions.create(
        {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

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
        comboBlock: item.comboBlock,
        explanation: item.explanation,
        correctAnswer: item.correctAnswer,
        setGroupId: item.setGroupId,
        setPosition: item.setPosition,
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
