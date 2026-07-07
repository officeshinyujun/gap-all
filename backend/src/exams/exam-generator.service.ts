import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import * as fs from 'fs';
import { TextbookService, UnitPayload } from '../textbook/textbook.service';
import { PromptsService } from '../prompts/prompts.service';
import { PatternMatcherService } from './pattern-matcher.service';
import { SimilarityValidatorService } from './similarity-validator.service';
import { StimulusNormalizer } from './stimulus-normalizer';
import { getTplSchema } from './tpl-schemas';
import { Question } from '../entities/question.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';
import { Difficulty } from '../entities/exam-record.entity';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';
import { getOpenAIApiKey } from '../lib/openai-keys';

// OpenAI 호출 타임아웃 (ms) — 환경변수로 오버라이드 가능
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 180_000;

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
  private readonly stimulusNormalizer = new StimulusNormalizer();

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
      apiKey: getOpenAIApiKey(),
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
    const seenConceptKeys = new Set<string>();
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
      const normalizedItems = this.stimulusNormalizer.normalizeItems(rawItems);

      // 3c. 구조 검증
      const validated = this.validateItems(normalizedItems);

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
        const extraNorm = this.stimulusNormalizer.normalizeItems(extraRaw);
        const extraVal = this.validateItems(extraNorm);
        const extraSem = await this.runSemanticValidation(extraVal);
        semValid = [...semValid, ...extraSem];
      }
      if (semValid.length > count) semValid = semValid.slice(0, count);

      // 3e. 유사도 검증 + 파이프라인 내 중복 체크 (병렬 실행 + 공용 함수)
      const addedCount = await this.filterAndDeduplicate(semValid, allValid, seenConceptKeys);

      this.logger.log(
        `--- ${unitNum}단원 완료: ${semValid.length}개 → 유사도 통과 ${addedCount}개 ---`,
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
      const fallbackNorm = this.stimulusNormalizer.normalizeItems(fallbackRaw);
      const fallbackVal = this.validateItems(fallbackNorm);
      const fallbackSem = await this.runSemanticValidation(fallbackVal);
      const fbAdded = await this.filterAndDeduplicate(fallbackSem, finalItems, seenConceptKeys);
      if (finalItems.length >= questionCount) {
        finalItems = finalItems.slice(0, questionCount);
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
      const maxRetries = isTimeout ? 1 : 3;
      if (retryCount < maxRetries) {
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
    const usageLogs: any[] = [];

    if (otherBlueprints.length > 0) {
      const truncatedUnitsForStep2 = units.map((u) => ({
        unit_name: u.unit_name,
        text_payload:
          u.text_payload.length > MAX_UNIT_TEXT_LENGTH
            ? u.text_payload.slice(0, MAX_UNIT_TEXT_LENGTH) + '\n...(truncated)'
            : u.text_payload,
      }));

      const step2Prompt = this.promptsService.getStep2Prompt(subjectSlug);
      const unitsJson = JSON.stringify(truncatedUnitsForStep2);

      for (const bp of otherBlueprints) {
        const tpl = bp.metadata?.recommended_template ?? '';
        const tplSchema = getTplSchema(tpl);
        const userContent = [
          step2Prompt,
          '',
          `# [단일 문항 생성 지시]`,
          `아래 1개의 Blueprint만을 바탕으로 정확히 1개의 문항을 생성하라. 수량 엄수: 반드시 1개만 출력.`,
          ``,
          `# [Blueprint]`,
          `${JSON.stringify(bp)}`,
          `- units: ${unitsJson}`,
        ].join('\n');

        let item: any | null = null;
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
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
              ...(tplSchema
                ? {
                    response_format: {
                      type: 'json_schema' as const,
                      json_schema: { name: tplSchema.name, schema: tplSchema.schema, strict: true },
                    },
                  }
                : {}),
            },
            { signal: controller.signal },
          );

          clearTimeout(timer);

          if (response.usage) {
            usageLogs.push(this.aiUsageLogRepo.create({
              source: AiUsageSource.EXAM_STEP2,
              model: process.env.OPENAI_STEP2_MODEL ?? 'gpt-4o',
              promptTokens: response.usage.prompt_tokens ?? 0,
              completionTokens: response.usage.completion_tokens ?? 0,
              totalTokens: response.usage.total_tokens ?? 0,
            }));
          }

          const content = response.choices[0]?.message?.content ?? '';
          const parsed = this.extractJson(content);
          const singleItem = Array.isArray(parsed) ? parsed[0] : parsed;
          if (singleItem && singleItem.render_ready) {
            item = singleItem;
            break;
          }
          this.logger.warn(
            `Step 2 재시도 (${attempt + 1}/${maxRetries}): ${tpl} — 유효하지 않은 응답`,
          );
        }

        if (item) {
          results.push(item);
        } else {
          this.logger.warn(
            `Step 2 최종 실패 (3/3): ${tpl} — fallback Blueprint 데이터로 대체`,
          );
          // fallback: Blueprint의 render_ready가 있으면 사용, 없으면 최소 구조 생성
          results.push(bp.render_ready ? {
            metadata: bp.metadata,
            render_ready: bp.render_ready,
            correct_answer: 1,
            explanation: { judgment: '', distractors: { '2': '', '3': '', '4': '', '5': '' } },
          } : {
            metadata: bp.metadata,
            render_ready: {
              question_stem: bp.metadata?.target_concept ? `${bp.metadata.target_concept}에 대한 설명으로 옳은 것은?` : '',
              stimulus_data: {},
              options_list: ['① 선택지 1', '② 선택지 2', '③ 선택지 3', '④ 선택지 4', '⑤ 선택지 5'],
            },
            correct_answer: 1,
            explanation: { judgment: '', distractors: { '2': '', '3': '', '4': '', '5': '' } },
          });
        }
      }
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

    // Step 2 토큰 사용량 배치 저장
    if (usageLogs.length > 0) {
      await this.aiUsageLogRepo.save(usageLogs);
    }

    await this.reportProgress(reportProgress, {
      stage: 'step2',
      progress: 70,
      status: 'success',
      message: `Step 2 완료: ${results.length}개 문항 생성`,
    });

    if (results.length === 0) {
      if (retryCount < 2) {
        this.logger.warn(`Step 2 결과 비어있음, 재시도 (${retryCount + 1}/2)`);
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

        // TPL 스키마 검증 (비 blocking — 로그만 남기고 통과)
        const tplErrors = this.stimulusNormalizer.validateTplSchema(
          rr.stimulus_data ?? {},
          meta.recommended_template ?? '',
          item,
        );
        if (tplErrors.length > 0) {
          this.logger.warn(
            `TPL 스키마 오류 (${meta.recommended_template}): ${tplErrors.join('; ')}`,
          );
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
  // 파이프라인 내 중복 체크 + 유사도 검증 (공용)
  // ============================================================
  private async filterAndDeduplicate(
    items: GeneratedQuestion[],
    targetArray: GeneratedQuestion[],
    seenKeys: Set<string>,
  ): Promise<number> {
    const ctCache = new Map<any, string>();
    const results = await Promise.all(
      items.map(async (item) => {
        let ct = ctCache.get(item);
        if (ct === undefined) {
          ct = item.comboBlock
            ? `${item.comboBlock.title}: ${item.comboBlock.items.map((i) => i.text).join(' ')}`
            : '';
          ctCache.set(item, ct);
        }
        const result = await this.similarityValidator.validate(
          item.questionStem, item.stimulusData, item.optionsList, ct,
        );
        return { item, passed: result.passed };
      }),
    );
    let added = 0;
    for (const { item, passed } of results) {
      if (!passed) continue;
      const conceptKey = `${item.targetConcept}::${item.itemType}`;
      if (seenKeys.has(conceptKey)) {
        this.logger.warn(`개념 중복 필터링: targetConcept=${item.targetConcept}`);
        continue;
      }
      if (this.isDuplicateInPipeline(item, targetArray)) {
        this.logger.warn(`유사도 중복 필터링: targetConcept=${item.targetConcept}, stem=${item.questionStem.slice(0, 50)}...`);
        continue;
      }
      seenKeys.add(conceptKey);
      targetArray.push(item);
      added++;
    }
    return added;
  }

  private isDuplicateInPipeline(
    item: GeneratedQuestion,
    existingItems: GeneratedQuestion[],
  ): boolean {
    const itemStimKey = JSON.stringify(item.stimulusData);
    const hasStimulus = Object.keys(item.stimulusData).length > 0;
    for (const existing of existingItems) {
      if (this.isSimilarText(existing.questionStem, item.questionStem, 0.8)) {
        return true;
      }
      if (hasStimulus && JSON.stringify(existing.stimulusData) === itemStimKey) {
        return true;
      }
    }
    return false;
  }

  private isSimilarText(text1: string, text2: string, threshold: number): boolean {
    if (!text1 || !text2) return false;
    const s1 = text1.replace(/\s+/g, '').toLowerCase();
    const s2 = text2.replace(/\s+/g, '').toLowerCase();
    if (s1 === s2) return true;

    // 간단한 Jaccard similarity
    const set1 = new Set(s1);
    const set2 = new Set(s2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    const similarity = intersection.size / union.size;
    return similarity >= threshold;
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
      const safeTemplate = this.stimulusNormalizer.resolveTemplate(item.recommendedTemplate);
      // 저장 전 stimulus_data 정규화: 빈 구조 채움 + viewItems 오염 제거
      const safeStimulus = this.stimulusNormalizer.normalizeStimulusData(
        item.stimulusData ?? {},
        safeTemplate,
      );
      // 저장 전 TPL 재탐지: data 구조에 더 적합한 TPL이 있으면 변환
      let finalTemplate = safeTemplate;
      let finalStimulus = safeStimulus;
      const detectedTpl = this.stimulusNormalizer.detectTpl(safeStimulus);
      if (detectedTpl && detectedTpl !== safeTemplate) {
        this.logger.log(`저장 전 TPL 재탐지: ${safeTemplate} → ${detectedTpl}`);
        const { stimulusData } = this.stimulusNormalizer.normalizeStimulusWithTemplate(
          item.stimulusData ?? {},
          detectedTpl,
        );
        finalTemplate = detectedTpl;
        finalStimulus = stimulusData;
      }
      const question = this.questionRepo.create({
        subjectId,
        unitId: unit.id,
        targetConcept: item.targetConcept,
        itemType: item.itemType,
        difficulty: item.difficulty,
        recommendedTemplate: finalTemplate,
        questionStem: item.questionStem,
        stimulusData: finalStimulus,
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


  private async verifyBatch(items: any[]): Promise<number[]> {
    if (items.length === 0) return [];

    const promptLines = items.map((item, i) => {
      const stem = item.render_ready?.question_stem || '';
      const stimRaw = item.render_ready?.stimulus_data;
      const stim = typeof stimRaw === 'string' ? stimRaw : JSON.stringify(stimRaw || '');
      const choices = (item.render_ready?.options_list || []).join(' | ');
      const viewItems = item.render_ready?.combo_block?.items || [];
      const viewText = viewItems.map((v: any) => v.key + '. ' + v.text).join(' | ');
      const answer = item.correct_answer || '';
      return `[Item ${i}]\nstem: ${stem.slice(0, 200)}\nstimulus: ${stim.slice(0, 500)}\nchoices: ${choices.slice(0, 300)}\nviewItems: ${viewText.slice(0, 200)}\nanswer: ${answer}`;
    }).join('\n\n');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You verify Korean CSAT questions. Focus on these CRITICAL issues only:\n\nFAIL (reject the item):\n1. stimulus is empty ({} or "")\n2. stem topic and viewItems topic are COMPLETELY DIFFERENT — e.g., stem is about bank loans but viewItems are about labor law\n3. Person names in viewItems (A, B, C, D) do NOT match person names in the stimulus — e.g., stimulus talks about C,D but viewItems reference A,B\n4. correctAnswer is out of 1-5 range\n5. The STEM topic is from a COMPLETELY DIFFERENT SUBJECT than the reference — e.g., reference concepts are about labor law (근로기준법, 임금) but generated stem is about environmental law (환경보호법)\n6. stimulus contains "viewItems:" text or combo block items (ㄱ. ㄴ. patterns separated by |) in a document field — the stimulus should have actual content, not viewItems/combo_block text\n\nPASS everything else, even if there are minor issues.\nReturn JSON array: [{itemIndex, passed: true/false, reason: "..."}]' },
        { role: 'user', content: 'Verify:\n\n' + promptLines },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    try {
      const parsed = JSON.parse(content);
      const results = parsed.results || parsed.verifications || parsed.items || (Array.isArray(parsed) ? parsed : [parsed]);
      const arr = Array.isArray(results) ? results : [results];
      const failed: number[] = [];

      for (const r of arr) {
        if (r.itemIndex === undefined) continue;
        if (!r.passed) {
          failed.push(r.itemIndex);
          this.logger.warn('[VERIFY] item ' + r.itemIndex + ' FAIL: ' + (r.reason || '').slice(0, 150));
        }
      }

      return failed;
    } catch (e: any) {
      this.logger.warn('[VERIFY] parse failed: ' + e.message);
      return [];
    }
  }



  async regenerate(
    subjectId: string,
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
    difficulty: Difficulty,
    questionCount: number,
    targetConcepts?: string[],
    reportProgress?: ExamGenerationProgressReporter,
    customPrompt?: string,
  ): Promise<Question[]> {
    await this.reportProgress(reportProgress, { stage: 'loading_references', progress: 5, message: '참조 문항을 불러오는 중입니다.' });

    const subjectEn = subjectSlug === 'success' ? 'sungjik' : 'kongil';
    const subjectKor = subjectEn === 'sungjik' ? '성공적인 직업생활' : '공업 일반';
    const subjectPrefix = subjectEn === 'sungjik' ? '성직' : '공일';
    const allDir = '/Users/yjshin/projects/gap/textbook/parsed/' + subjectEn + '/all';

    let references: any[] = [];
    for (let unit = startUnitNum; unit <= endUnitNum; unit++) {
      const fp = allDir + '/' + unit + '단원.json';
      if (fs.existsSync(fp)) {
        try {
          const qs = JSON.parse(fs.readFileSync(fp, 'utf-8'));
          references.push(...qs);
        } catch {}
      }
    }

    if (references.length === 0) {
      this.logger.warn('No reference questions found for units ' + startUnitNum + '-' + endUnitNum);
      return [];
    }

    if (targetConcepts && targetConcepts.length > 0) {
      references = references.filter((r: any) => {
        return targetConcepts!.some((tc) =>
          r.targetConcepts?.some((rc: string) => rc.includes(tc) || tc.includes(rc)),
        );
      });
    }

    references.sort(() => Math.random() - 0.5);

    await this.reportProgress(reportProgress, { stage: 'regenerating', progress: 20, message: questionCount + '개 문항 재생성 중...' });

    // 문항 유형 분포 퀀텀 프롬프트 조각
    const itemFamilyQuota = subjectSlug ? buildItemFamilyQuotaPrompt(subjectSlug, questionCount) : '';

    const CHUNK_SIZE = 15;
    const result: any[] = [];
    let remaining = [...references];
    let attempts = 0;

    while (result.length < questionCount && attempts < 10) {
      attempts++;
      const need = questionCount - result.length;
      const chunk = remaining.splice(0, Math.min(need + 5, CHUNK_SIZE));

      if (chunk.length === 0) {
        remaining = [...references];
        continue;
      }

      const chunkResult: any[] = [];
      const batchPrompt = this.buildBatchRegenPrompt(chunk, difficulty, itemFamilyQuota, customPrompt);
      await this.regenerateBatch(batchPrompt, chunk, chunkResult, difficulty, startUnitNum, reportProgress);

      if (chunkResult.length < chunk.length) {
        remaining.unshift(...chunk.slice(chunkResult.length));
      }
      if (chunkResult.length === 0) continue;

      await this.convertBatchToTpl(chunkResult);
      const failedIndices = await this.verifyBatch(chunkResult);
      const passed = chunkResult.filter((_, i) => !failedIndices.includes(i));

      if (passed.length > 0) {
        result.push(...passed);
        this.logger.log('[REGEN] attempt ' + attempts + ': got ' + passed.length + '/' + need);
      }
    }

    if (result.length === 0) return [];

    const generated: GeneratedQuestion[] = result.map((item: any) => ({
      targetConcept: item.metadata?.target_concept || '',
      itemType: item.metadata?.item_type || 'reference_variant',
      difficulty: item.metadata?.difficulty || difficulty,
      recommendedTemplate: item.metadata?.recommended_template || 'TPL_EXAM_REFERENCE',
      questionStem: item.render_ready?.question_stem || '',
      stimulusData: item.render_ready?.stimulus_data ?? {},
      optionsList: item.render_ready?.options_list || [],
      comboBlock: item.render_ready?.combo_block || null,
      explanation: item.explanation || {},
      correctAnswer: Number(item.correct_answer) || 1,
      unitName: item.metadata?.unit_name || startUnitNum + '단원',
      setGroupId: null,
      setPosition: null,
    }));

    const allValid: GeneratedQuestion[] = [];
    for (const item of generated) {
      const ct = item.comboBlock
        ? item.comboBlock.title + ' ' + item.comboBlock.items.map((x: any) => x.text).join(' ')
        : '';
      const simResult = await this.similarityValidator.validate(
        item.questionStem, item.stimulusData, item.optionsList, ct,
      );
      if (simResult.passed) allValid.push(item);
    }

    await this.reportProgress(reportProgress, { stage: 'saving', progress: 85, message: allValid.length + '개 문항 저장 중...' });

    return this.saveQuestions(
      allValid.slice(0, questionCount),
      subjectId,
      subjectSlug,
      reportProgress,
    );
  }

  private async regenerateBatch(
    batchPrompt: string,
    selected: any[],
    result: any[],
    difficulty: Difficulty,
    startUnitNum: number,
    reportProgress?: ExamGenerationProgressReporter,
    attempt = 1,
  ): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a Korean CSAT question generator. Given reference questions below, create NEW questions with DIFFERENT content but SAME structure. Output in json format.' },
          { role: 'user', content: batchPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.9,
      });
      clearTimeout(timeoutId);

      const content2 = response.choices[0]?.message?.content;
      if (!content2) {
        if (attempt < 2) {
          await this.regenerateBatch(batchPrompt, selected, result, difficulty, startUnitNum, reportProgress, attempt + 1);
        }
        return;
      }

      const parsed = JSON.parse(content2);
      let items: any[] = parsed.questions || parsed.items || (Array.isArray(parsed) ? parsed : []);
      if (!Array.isArray(items) || (items.length === 0 && parsed.stem)) {
        items = [parsed];
      }
      if (items.length === 0) {
        this.logger.warn('[REGEN] no items in response');
        return;
      }

      this.logger.log('[REGEN] batch returned ' + items.length + ' items (requested ' + selected.length + ')');

      for (let i = 0; i < items.length && i < selected.length; i++) {
        const gen = items[i];
        const ref = selected[i];
        const unitNum = ref.source?.unitNumber || startUnitNum;

        let rawChoices = gen.choices;
        if (!rawChoices || !Array.isArray(rawChoices) || rawChoices.length !== 5) {
          rawChoices = ref.choices || [];
        }
        if (rawChoices.length > 0 && typeof rawChoices[0] === 'string' && !rawChoices[0].startsWith('①')) {
          rawChoices = ref.choices || [];
        }

        const rawAnswer = gen.correctAnswer ?? gen.correct_answer ?? (i + 1);

        const viewItems: string[] = (Array.isArray(gen.viewItems) && gen.viewItems.length > 0)
          ? gen.viewItems
          : (ref.viewItems || []);

        const comboBlock = viewItems.length > 0
          ? { title: '<보기>', items: viewItems.map((v: string) => {
              const m = v.match(/^([ㄱ-ㅎ])\.\s*(.*)$/);
              return { key: m ? m[1] : 'ㄱ', text: m ? m[2] : v };
            })}
          : null;

        let stimulusText = gen.stimulus || ref.stimulus || '';

        const boViewMatch = stimulusText.match(/<보\s*기>\s*\n?([\s\S]*)$/);
        if (boViewMatch) {
          stimulusText = stimulusText.substring(0, stimulusText.indexOf('<보')).trim();
        }

        let stemText = (gen.stem || ref.stem || '').replace(/^\[\d+~\d+\]\s*/, '').replace(/^\d+\.\s*/, '').replace(/\s*\[3점\]/g, '');

        // "위 사례/자료/표" 등 dangling 참조 → "다음"으로 변환 (연계형 문항 분리 시 필요)
        stemText = stemText.replace(/^위\s*(사례|자료|표|보고서|강의|글)/, '다음 $1');
        // "위 OO 사례에서 (가)에..." 패턴도 처리
        stemText = stemText.replace(/^위\s+(.+?)(에서|을|를)/, '다음 $1$2');

        // Use LLM's templateType + stimulusData if provided, otherwise fall back to plain text
        const genTemplateType = gen.templateType || gen.template_type || '';
        const genStimulusData = gen.stimulusData || gen.stimulus_data || null;

        // If LLM provided structured data, use it directly
        let finalStimulusData: any = stimulusText;
        let finalTemplate = 'TPL_EXAM_REFERENCE';

        if (genTemplateType && genTemplateType !== 'TPL_PLAIN_TEXT' && genStimulusData && typeof genStimulusData === 'object') {
          finalStimulusData = genStimulusData;
          finalTemplate = genTemplateType;
        } else if (stimulusText) {
          // Keep as plain text (PLAIN_TEXT will be assigned later)
        }

        // viewItems 내용이 stimulus로 잘못 들어간 경우 제거
        if (typeof finalStimulusData === 'string') {
          const clean = finalStimulusData.replace(/^viewItems:\s*/i, '');
          if (/^[ㄱ-ㅎ][\.\s]/.test(clean) && clean.includes('|')) {
            this.logger.warn(`[REGEN] viewItems 내용이 stimulus로 잘못 들어감, 제거: targetConcept=${gen.targetConcept || ref.targetConcepts?.join(',')}`);
            finalStimulusData = '';
          }
        }

        // === 개념-선택지 정합성 검증: 생성된 선택지가 target_concept 도메인과 맞는지 확인 ===
        const targetDomain = gen.targetConcept || (ref.targetConcepts || []).join(' ');
        const optText = rawChoices.join(' ');
        const stemDomain = (stemText + ' ' + (typeof finalStimulusData === 'string' ? finalStimulusData : '')).toLowerCase();
        const hasLabor = /노동|근로|임금|고용|퇴직|연장|야간|휴게|휴가|산재/.test(stemDomain);
        const hasEdu = /학습|교육|학교|수업|교사|학생/.test(stemDomain);
        const optHasLabor = /노동|근로|임금|고용|퇴직|연장|야간|휴게|휴가|산재/.test(optText);
        const optHasEdu = /학습|교육|학교|수업|교사|학생/.test(optText);
        if (hasEdu && !hasLabor && optHasLabor && !optHasEdu) {
          this.logger.warn(`[REGEN] 선택지-개념 도메인 불일치: stem=교육, options=노동법 — targetConcept=${targetDomain}`);
        }

        // === 이름 일관성 동기화: stimulus의 X씨와 viewItems/선택지의 X씨 불일치 해소 ===
        // 문자열 + 객체 타입 모두 지원 (narrative, data, content 등)
        let stimText = '';
        if (typeof finalStimulusData === 'string') {
          stimText = finalStimulusData;
        } else if (finalStimulusData && typeof finalStimulusData === 'object') {
          stimText = finalStimulusData.narrative || finalStimulusData.data
            || finalStimulusData.content || finalStimulusData.description
            || finalStimulusData.body || finalStimulusData.text
            || '';
        }
        if (stimText && comboBlock && comboBlock.items.length > 0) {
          const stimNames = [...stimText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
          const viewText = comboBlock.items.map((i: any) => i.text).join(' ');
          const viewNames = [...viewText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
          if (stimNames.length > 0 && viewNames.length > 0 && stimNames[0] !== viewNames[0]) {
            const nameMap = new Map<string, string>();
            viewNames.forEach((vn, i) => { if (stimNames[i]) nameMap.set(vn, stimNames[i]); });
            const replaceName = (s: string) => s.replace(/([A-Z])\s*씨/g, (_, letter) => nameMap.get(letter) ? nameMap.get(letter) + '씨' : letter + '씨');
            comboBlock.items = comboBlock.items.map((item: any) => ({ ...item, text: replaceName(item.text) }));
            rawChoices = rawChoices.map((opt: string) => replaceName(opt));
            this.logger.log(`[REGEN] 이름 동기화: ${[...nameMap.entries()].map(([k, v]) => `${k}씨→${v}씨`).join(', ')}`);
          }
        }

        result.push({
          metadata: {
            unit_name: unitNum + '단원',
            target_concept: gen.targetConcept || gen.target_concept || ref.targetConcepts?.join(', ') || '일반',
            item_type: 'reference_variant',
            difficulty: gen.difficulty || difficulty,
            recommended_template: finalTemplate,
          },
          render_ready: {
            question_stem: stemText,
            stimulus_data: finalStimulusData,
            options_list: rawChoices,
            combo_block: comboBlock,
          },
          explanation: { judgment: gen.explanation || '생성형 문항' },
          correct_answer: rawAnswer,
        });
      }

      await this.reportProgress(reportProgress, {
        stage: 'regenerating',
        progress: 70,
        message: result.length + '/' + selected.length + ' 문항 재생성 완료',
      });
    } catch (e: any) {
      const code = e.code || e.status || 'unknown';
      this.logger.error('[REGEN] batch failed (attempt ' + attempt + '): code=' + code);
      if (attempt < 2) {
        await this.regenerateBatch(batchPrompt, selected, result, difficulty, startUnitNum, reportProgress, attempt + 1);
      }
    }
  }

  private buildBatchRegenPrompt(refs: any[], difficulty: Difficulty, patterns: string, customPrompt?: string): string {
    const count = refs.length;
    let prompt = 'Create ' + count + ' NEW Korean CSAT questions. Must output EXACTLY ' + count + '.\n';
    prompt += 'For EACH reference output exactly one new question.\n';
    prompt += 'Keep same structure (same number of view items, 5 choices).\n';
    prompt += 'Replace at least one concept with a related confusable concept.\n';
    prompt += 'CONCEPT REPLACEMENT RULE: The replacement concept MUST be from the SAME domain as the reference concepts listed below. For example, if the reference concepts are about "근로기준법, 임금, 근로계약", replace with a DIFFERENT labor law concept (like "근로시간, 연장근로, 해고"), NOT a concept from a different domain (like "환경보호법, 소비자보호법"). Verify that the replacement is in the same sub-topic.\n';
    prompt += 'CONCEPT-SOURCE ALIGNMENT: The generated stimulus content MUST match the replaced concept domain. If the concept is about labor law, the stimulus must describe a labor/employment scenario. If the concept is about consumer protection, the stimulus must describe a consumer transaction scenario. Never mix domains between stimulus and answer options.\n';
    prompt += 'NAMING CONSISTENCY: Use the SAME character names throughout the entire question. If stimulus uses "A씨, B씨", then viewItems and choices must also use "A씨, B씨" — NOT different letters. The first mentioned character is always A씨, second is B씨, etc. Never mix letter assignments between stimulus and viewItems.\n';
    prompt += 'Every question MUST have: stem (with \\n line breaks), stimulus (plain text), viewItems, choices (5 with ①②③④⑤), correctAnswer (1-5).\n';
    prompt += 'Choices must have ①~⑤ prefix. Do NOT use (가)(나)(다) placeholders.\n';
    prompt += 'Do NOT include original exam number prefixes like [6~7].\n';
    prompt += 'Determine correctAnswer by evaluating each view item (ㄱㄴㄷㄹ) as TRUE/FALSE.\n';
    prompt += '\n';
    prompt += 'DIFFICULTY VARIETY: Include a mix of difficulty levels. If ' + difficulty + ' is INTERGRATE, at least 40% should require multi-concept reasoning. Vary the question patterns.\n';
    prompt += 'IMPORTANT: Determine the format of the content and output the appropriate structure:\n';
    prompt += '- If the stimulus is a DIALOGUE (speaker labels like "A:" "교사:" etc): set templateType="TPL_CONVERSATIONAL_FLOW" and stimulusData={participants: [{id, name, role}], messages: [{p_id, text}]}\n';
    prompt += '- If the stimulus is a TABLE (headers + rows): set templateType="TPL_COMPARATIVE_MATRIX" and stimulusData={headers: [{id, label}], rows: [{id, cells}]}\n';
    prompt += '- If the stimulus is a DOCUMENT (law, report, notice): set templateType="TPL_FORMAL_DOCUMENT" and stimulusData={doc_type, header_info: {title, date, author}, paragraphs: [{content}], footnotes: []}\n';
    prompt += '- If the stimulus is a CASE/STORY (narrative about a person): set templateType="TPL_CASE_DIAGNOSTIC_FRAME" and stimulusData={case_profile: {name, context}, narrative: string}\n';
    prompt += '- If the stimulus is a LECTURE/CLASS: set templateType="TPL_INSTRUCTIONAL_SCENE" and stimulusData={instructor: {id, text}, canvas_content: {type, data}, students: []}\n';
    prompt += '- If the stimulus is a Q&A FORUM: set templateType="TPL_DIGITAL_FORUM_INTERFACE" and stimulusData={forum_name, main_post: {author, title, content}, comments: [{author, text}]}\n';
    prompt += '- If the stimulus is TIMELINE/EVENTS (dates with descriptions): set templateType="TPL_PLAIN_TEXT" and put the text as "date: description\\n" format in the stimulus field\n';
    prompt += '- If none of the above, set templateType="TPL_PLAIN_TEXT" and put the text in the "stimulus" field (as string, no stimulusData needed)\n';
    prompt += 'When using PLAIN_TEXT, always fill the "stimulus" field with the full text. Never leave it empty.\n';
    prompt += '\n';
    prompt += 'Output format per question:\n';
    prompt += '{stem, stimulus, viewItems, choices, correctAnswer, templateType, stimulusData (if not PLAIN_TEXT)}\n';

    if (patterns) {
      prompt += '\n' + patterns + '\n';
    }

    if (customPrompt) {
      prompt += '\nUser request: ' + customPrompt + '\n';
    }

    prompt += '\nReturn JSON array of ' + count + ' objects.\n\n';

    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      prompt += '[Reference ' + (i + 1) + ']\n';
      prompt += 'stem: ' + (r.stem || '').replace(/\n/g, ' ') + '\n';
      prompt += 'stimulus: ' + (r.stimulus || '').replace(/\n/g, ' ').slice(0, 400) + '\n';
      if (r.viewItems && r.viewItems.length > 0)
        prompt += 'viewItems: ' + r.viewItems.join(' | ').replace(/\n/g, ' ') + '\n';
      prompt += 'choices: ' + (r.choices || []).join(' | ').replace(/\n/g, ' ') + '\n';
      prompt += 'concepts: ' + (r.targetConcepts || []).join(', ') + '\n\n';
    }

    prompt += 'Return JSON array of ' + count + ' objects.';
    return prompt;
  }

  private async convertBatchToTpl(items: any[]): Promise<void> {
    if (items.length === 0) return;

    // 전환 전 stimulus 원본 보존 (AI가 빈 객체를 반환할 경우 복원용)
    const preConvertStimuli = items.map((item) => item.render_ready?.stimulus_data);

    const indices: number[] = [];
    const inputs: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const s = typeof items[i].render_ready?.stimulus_data === 'string'
        ? items[i].render_ready.stimulus_data.trim() : '';
      if (s.length < 10) continue;
      indices.push(i);
      inputs.push('[Item ' + i + '] stem: ' + (items[i].render_ready?.question_stem || '').slice(0, 200) + '\nstimulus: ' + s.slice(0, 1500));
    }
    if (inputs.length === 0) return;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: 'Convert Korean CSAT stimuli to TPL-structured JSON. Return array of {itemIndex, templateType, stimulusData, confidence(1-5)}.\n\nValid templateType values (use ONLY these — NO PLAIN_TEXT):\n- TPL_CONVERSATIONAL_FLOW: dialogue/interview with participants and messages\n- TPL_CASE_DIAGNOSTIC_FRAME: case narrative with profile and check_items\n- TPL_FORMAL_DOCUMENT: document with doc_type, header_info, paragraphs\n- TPL_COMPARATIVE_MATRIX: table with headers and rows\n- TPL_SEQUENTIAL_WORKFLOW: steps with orientation\n- TPL_DIGITAL_FORUM_INTERFACE: forum with main_post and comments\n- TPL_INSTRUCTIONAL_SCENE: lecture with instructor and canvas\n- TPL_PROMOTIONAL_CANVAS: ad with slogan and bullets\n- TPL_QUANTITATIVE_CHART: chart with chart_type, axes, datasets\n\nNEVER use TPL_PLAIN_TEXT. Every stimulus can be mapped to one of the 9 templates above. Be proactive: if the stimulus has dialogue markers (":", speaker labels), use CONVERSATIONAL_FLOW. If it has tables or structured data, use COMPARATIVE_MATRIX. If it describes a case/scenario, use CASE_DIAGNOSTIC_FRAME. If it looks like a document, use FORMAL_DOCUMENT. Even plain narratives can be CASE_DIAGNOSTIC_FRAME.' },
          { role: 'user', content: 'Convert:\n\n' + inputs.join('\n\n') },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content3 = response.choices[0]?.message?.content;
      if (!content3) return;

      const parsed = JSON.parse(content3);
      const arr = parsed.conversions || parsed.items || parsed.results || (Array.isArray(parsed) ? parsed : [parsed]);
      const convs = Array.isArray(arr) ? arr : [arr];

      for (const conv of convs) {
        const idx = conv.itemIndex;
        if (idx === undefined || idx < 0 || idx >= items.length) continue;
        if (!conv.stimulusData) continue;
        const item = items[idx];
        const confidence = conv.confidence ?? 0;

        if (confidence < 2 || (typeof conv.stimulusData === 'object' && !Array.isArray(conv.stimulusData) && Object.keys(conv.stimulusData).length === 0)) {
          item.metadata.recommended_template = 'TPL_PLAIN_TEXT';
          // 원본 문자열 stimulus 복원 (AI가 빈 객체 반환 시)
          const orig = preConvertStimuli[idx];
          if (typeof orig === 'string' && orig.trim()) {
            item.render_ready.stimulus_data = orig;
          }
          continue;
        }

        item.render_ready.stimulus_data = conv.stimulusData;
        item.metadata.recommended_template = conv.templateType || 'TPL_PLAIN_TEXT';
      }

      for (const item of items) {
        if (item.metadata?.recommended_template === 'TPL_EXAM_REFERENCE') {
          item.metadata.recommended_template = 'TPL_PLAIN_TEXT';
        }
      }

      // Post-process: StimulusNormalizer.inferTplFromText()로 PLAIN_TEXT → 구조화 TPL 변환
      for (const item of items) {
        if (item.metadata?.recommended_template !== 'TPL_PLAIN_TEXT') continue;
        const stim = typeof item.render_ready?.stimulus_data === 'string'
          ? item.render_ready.stimulus_data.trim()
          : '';
        if (!stim) continue;

        const inferred = this.stimulusNormalizer.inferTplFromText(stim);
        if (inferred) {
          item.render_ready.stimulus_data = inferred.data;
          item.metadata.recommended_template = inferred.template;
          this.logger.log(`[TPL] inferTplFromText: ${inferred.template}`);
        }
      }
    } catch {}
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
