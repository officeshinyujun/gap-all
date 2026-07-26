import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { TextbookService, UnitPayload } from '../textbook/textbook.service';
import { PromptsService } from '../prompts/prompts.service';
import { PatternMatcherService } from './pattern-matcher.service';
import { SimilarityValidatorService } from './similarity-validator.service';
import { StimulusNormalizer } from './stimulus-normalizer';
import { getTplSchema, isStructuredTplName } from './tpl-schemas';
import { Question } from '../entities/question.entity';
import { QuestionSeenRecord } from '../entities/question-seen-record.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';
import { Difficulty, ExamRecord } from '../entities/exam-record.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { AiUsageLog, AiUsageSource } from '../entities/ai-usage-log.entity';
import { getOpenAIClient } from '../lib/openai-keys';
import { ExamRegeneratorService } from './exam-regenerator.service';
import {
  GeneratedQuestion,
  ExamGenerationProgressReporter,
  ExamGenerationProgressUpdate,
  computeUnitWeights,
  buildItemFamilyQuotaPrompt,
  isSimilarText,
  extractJson,
} from './exam-generation.utils';
import {
  validateItems,
  validateCombinationEncoding,
  validateStemPattern,
  validateItemLogic,
} from './exam-question-validator';

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 180_000;
const MAX_UNIT_TEXT_LENGTH = Number(process.env.MAX_UNIT_TEXT_LENGTH) || 12_000;
const NUMBER_PLAY_UNITS = new Set([5, 6, 9, 16, 17]);
const NUMBER_PLAY_PROMPT_SNIPPET = `\n## [수치 데이터 활용 지시 — 해당 단원]
이 단원은 실제 수능에서 수치 데이터/계산 문제가 자주 출제되는 단원입니다:
- 가능한 TPL_QUANTITATIVE_CHART(차트), TPL_COMPARATIVE_MATRIX(비교표)를 활용하라.
- 임금/근로시간/생산량/급여/보험료 등 구체적인 숫자 데이터를 자료에 포함하라.
- '…을 계산하시오' 또는 '…을 구하시오' 형태의 발문을 적극 허용한다.
- 표 안의 수치를 비교/분석하여 답을 도출하는 문제 유형을 권장한다.`;

@Injectable()
export class ExamGeneratorService {
  private readonly logger = new Logger(ExamGeneratorService.name);
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
    @InjectRepository(ExamRecord)
    private readonly examRecordRepo: Repository<ExamRecord>,
    @InjectRepository(ExamItem)
    private readonly examItemRepo: Repository<ExamItem>,
    @InjectRepository(QuestionSeenRecord)
    private readonly questionSeenRecordRepo: Repository<QuestionSeenRecord>,
    private readonly textbookService: TextbookService,
    private readonly promptsService: PromptsService,
    private readonly patternMatcher: PatternMatcherService,
    private readonly similarityValidator: SimilarityValidatorService,
    private readonly regeneratorService: ExamRegeneratorService,
  ) {}

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
    userId?: string,
    excludePrevious?: boolean,
  ): Promise<Question[]> {
    // 이 요청 전용 OpenAI 클라이언트 (요청별 키 고정 — 동시 요청은 각각 다른 키 사용)
    const client = getOpenAIClient();

    // 사용자 중복 제외 쿼리
    let previousQuestionIds: Set<string> | undefined;
    if (userId && excludePrevious !== false) {
      previousQuestionIds = await this.getUserPreviousQuestionIds(
        userId,
        subjectId,
        startUnitNum,
        endUnitNum,
      );
      if (previousQuestionIds.size > 0) {
        this.logger.log(
          `이전 문항 ${previousQuestionIds.size}개 제외 (사용자 중복 방지)`,
        );
      }
    }

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
    const unitWeights = computeUnitWeights(
      startUnitNum,
      endUnitNum,
      questionCount,
    );
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
        (u) =>
          u.unit_name === `${unitNum}단원` ||
          u.unit_name.includes(`Unit_${String(unitNum).padStart(2, '0')}`),
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
        client,
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
        client,
        blueprint,
        singleUnits,
        subjectSlug,
        0,
      );
      const normalizedItems = this.stimulusNormalizer.normalizeItems(rawItems);

      // 3c. 구조 검증
      const validated = validateItems(
        normalizedItems,
        this.logger,
        this.stimulusNormalizer,
      );
      // 3d. 의미적 검증 + 부족분 재생성 (최대 2회)
      let semValid = await this.runSemanticValidation(client, validated);
      let retryRound = 0;
      while (semValid.length < count && retryRound < 2) {
        retryRound++;
        const deficit = count - semValid.length;
        const extraBp = await this.runStep1(
          client,
          singleUnits,
          difficulty,
          deficit,
          subjectSlug,
          numPlayHint,
          0,
          targetConcepts,
          undefined,
          unitNum,
          unitNum,
        );
        const extraRaw = await this.runStep2(
          client,
          extraBp,
          singleUnits,
          subjectSlug,
          0,
        );
        const extraNorm = this.stimulusNormalizer.normalizeItems(extraRaw);
        const extraVal = validateItems(
          extraNorm,
          this.logger,
          this.stimulusNormalizer,
        );
        const extraSem = await this.runSemanticValidation(client, extraVal);
        semValid = [...semValid, ...extraSem];
      }
      if (semValid.length > count) semValid = semValid.slice(0, count);

      // 3e. 유사도 검증 + 파이프라인 내 중복 체크 (병렬 실행 + 공용 함수)
      const addedCount = await this.filterAndDeduplicate(
        semValid,
        allValid,
        seenConceptKeys,
      );

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
        client,
        units,
        difficulty,
        deficit,
        subjectSlug,
        customPrompt,
        0,
        targetConcepts,
        undefined,
        startUnitNum,
        endUnitNum,
      );
      const fallbackRaw = await this.runStep2(
        client,
        fallbackBp,
        units,
        subjectSlug,
        0,
      );
      const fallbackNorm = this.stimulusNormalizer.normalizeItems(fallbackRaw);
      const fallbackVal = validateItems(
        fallbackNorm,
        this.logger,
        this.stimulusNormalizer,
      );
      const fallbackSem = await this.runSemanticValidation(client, fallbackVal);
      await this.filterAndDeduplicate(fallbackSem, finalItems, seenConceptKeys);
      if (finalItems.length >= questionCount) {
        finalItems = finalItems.slice(0, questionCount);
      }
    }

    if (finalItems.length > questionCount) {
      finalItems = finalItems.slice(0, questionCount);
    }

    // 5. DB 저장
    const PLACEHOLDER_PATTERNS = [
      '(내용 없음)',
      '내용 없음',
      '값을 입력',
      '여기에 ',
    ];
    const contentful = finalItems.filter((item) => {
      const stimJson = JSON.stringify(item.stimulusData ?? {});
      if (PLACEHOLDER_PATTERNS.some((p) => stimJson.includes(p))) {
        this.logger.warn(
          `[CONTFILTER] 플레이스홀더 포함 — ${item.targetConcept} 스킵`,
        );
        return false;
      }
      if (item.questionStem.trim().length < 15) {
        this.logger.warn(
          `[CONTFILTER] stem 너무 짧음 — ${item.targetConcept} 스킵`,
        );
        return false;
      }
      return true;
    });
    if (contentful.length < finalItems.length) {
      this.logger.warn(
        `[CONTFILTER] ${finalItems.length - contentful.length}개 문항 콘텐츠 부족으로 제거`,
      );
    }
    if (contentful.length === 0) {
      this.logger.warn(
        '[CONTFILTER] 콘텐츠 유효한 문항 0개 — 빈 결과 저장 안 함',
      );
      await this.reportProgress(reportProgress, {
        stage: 'saving_questions',
        progress: 100,
        status: 'warning',
        message: '생성된 문항 중 유효한 콘텐츠가 없어 저장된 문항이 없습니다.',
      });
      return [];
    }

    const questions = await this.saveQuestions(
      contentful.slice(0, questionCount),
      subjectId,
      subjectSlug,
      reportProgress,
      userId,
    );

    return questions;
  }

  // ============================================================
  // Step 1: Blueprint 생성
  // ============================================================
  private async runStep1(
    client: OpenAI,
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

      const response = await client.chat.completions.create(
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

      const parsed = extractJson(content);

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
      const unsupportedTemplates = arr.filter(
        (blueprint) =>
          !isStructuredTplName(blueprint?.metadata?.recommended_template),
      );
      if (unsupportedTemplates.length > 0) {
        throw new Error(
          `Step 1이 지원하지 않는 TPL을 선택했습니다: ${unsupportedTemplates
            .map(
              (blueprint) =>
                blueprint?.metadata?.recommended_template || '(empty)',
            )
            .join(', ')}`,
        );
      }

      const dnaCandidates =
        startUnitNum != null && endUnitNum != null
          ? this.patternMatcher.findDna(
              subjectSlug,
              startUnitNum,
              endUnitNum,
              targetConcepts,
              arr.length,
            )
          : [];
      if (dnaCandidates.length > 0) {
        if (dnaCandidates.length < arr.length) {
          throw new Error(
            `DNA v2가 부족합니다: requested=${arr.length}, available=${dnaCandidates.length}`,
          );
        }
        arr.forEach((blueprint, index) => {
          const dna = dnaCandidates[index];
          blueprint.dna_id = dna.dnaId;
          blueprint.dna_contract = dna;
          blueprint.metadata = {
            ...(blueprint.metadata ?? {}),
            recommended_template: dna.materialContract.requiredTemplate,
          };
          blueprint.item_structure = {
            ...(blueprint.item_structure ?? {}),
            item_family: dna.stemContract.responseMode,
            judgment_axis: dna.stemContract.judgmentTarget,
          };
        });
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
          client,
          units,
          difficulty,
          questionCount,
          subjectSlug,
          customPrompt,
          retryCount + 1,
          targetConcepts,
          reportProgress,
          startUnitNum,
          endUnitNum,
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
    client: OpenAI,
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
          bp.dna_contract
            ? '# [DNA v2 강제 계약]\nBlueprint의 dna_contract.materialContract.requiredTemplate을 변경하지 마라. 자료는 dna_contract.solutionContract.evidenceSlots 중 서로 다른 원천 단위의 불가결 근거 두 개와 교과 규칙을 반드시 사용하게 설계하라. claimProofs.indispensabilityChecks에 지정된 각 근거를 제거하면 해당 판단이 불가능하거나 진위가 바뀌어야 한다. 단순 보충ㆍ반복 근거를 끼워 넣어 요건을 충족한 것으로 처리하지 마라. 자료에 없는 법 조항, 예외, 정의로 선지를 판단하게 하지 마라. 각 핵심 보기 또는 선지는 dna_contract.solutionContract.claimProofs의 근거 관계를 유지하라. 한 문장 또는 한 표 셀만 읽으면 정답이 드러나는 구조는 금지한다. 문서형 TPL은 materialContract.metadataRequirements의 실제 값을 모두 채워라.'
            : '',
          `- units: ${unitsJson}`,
        ]
          .filter(Boolean)
          .join('\n');

        let item: any = null;
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

          const response = await client.chat.completions.create(
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
                      json_schema: {
                        name: tplSchema.name,
                        schema: tplSchema.schema,
                        strict: true,
                      },
                    },
                  }
                : {}),
            },
            { signal: controller.signal },
          );

          clearTimeout(timer);

          if (response.usage) {
            usageLogs.push(
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
          const parsed = extractJson(content);
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
          results.push({ ...item, dna_contract: bp.dna_contract });
        } else {
          this.logger.warn(`Step 2 최종 실패 (3/3): ${tpl} — 문항 탈락`);
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

        const response = await client.chat.completions.create(
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
        const parsed = extractJson(content);
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
          client,
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

        const combCheck = validateCombinationEncoding(item);
        if (!combCheck.valid) {
          this.logger.warn(`조합형 검증 실패: ${combCheck.reason}, 스킵`);
          continue;
        }

        const stemCheck = validateStemPattern(item);
        if (!stemCheck.valid) {
          this.logger.warn(`줄기 패턴 검증 실패: ${stemCheck.reason}, 스킵`);
          continue;
        }

        const logicCheck = validateItemLogic(item);
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

  private async runSemanticValidation(
    client: OpenAI,
    items: GeneratedQuestion[],
  ): Promise<GeneratedQuestion[]> {
    if (items.length === 0) return items;

    const validationInput = items.map((item, idx) => ({
      index: idx,
      target_concept: item.targetConcept,
      question_stem: item.questionStem,
      stimulus_data: item.stimulusData,
      options: item.optionsList,
      correct_answer: item.correctAnswer,
      dna_contract: item.dnaContract ?? null,
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
9. DNA CONTRACT: When dna_contract is present, requiredTemplate must match the actual material. The answer must require at least dna_contract.solutionContract.minimumReasoningSteps steps, a curriculum rule, and at least dna_contract.qualityConstraints.requiredEvidenceSlotCount distinct, indispensable source units. For each claim, test every source unit named by its indispensabilityChecks: removing it must make the verdict indeterminate or change it. Reject a question if a single sentence or a single table cell reveals the answer, if an option needs a legal exception not stated in the material, or if the generated material does not support dna_contract.solutionContract.decisionRule.

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

      const response = await client.chat.completions.create(
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
      const parsed = extractJson(content);
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
          '모든 문항이 의미적 검증에 실패. 재생성 대상으로 반환.',
        );
        return [];
      }

      this.logger.log(`의미적 검증: ${passed.length}/${items.length}개 통과`);
      return passed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `의미적 검증 호출 실패, 재생성 대상으로 반환: ${message}`,
      );
      return [];
    }
  }

  // ============================================================
  // 사용자가 이전에 본 question_id 조회 (같은 단원 범위)
  // ============================================================
  private async getUserPreviousQuestionIds(
    userId: string,
    subjectId: string,
    startUnitNum: number,
    endUnitNum: number,
  ): Promise<Set<string>> {
    const examRecords = await this.examRecordRepo.find({
      where: {
        userId,
        subjectId,
        startUnitNum,
        endUnitNum,
      },
    });
    if (examRecords.length === 0) return new Set();

    const examIds = examRecords.map((r) => r.id);
    const examItems = await this.examItemRepo.find({
      where: { examId: In(examIds) },
      relations: ['question'],
    });

    return new Set(examItems.map((i) => i.questionId));
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
          item.questionStem,
          item.stimulusData,
          item.optionsList,
          ct,
        );
        return { item, passed: result.passed };
      }),
    );
    let added = 0;
    for (const { item, passed } of results) {
      if (!passed) continue;
      const conceptKey = `${item.targetConcept}::${item.itemType}`;
      if (seenKeys.has(conceptKey)) {
        this.logger.warn(
          `개념 중복 필터링: targetConcept=${item.targetConcept}`,
        );
        continue;
      }
      if (this.isDuplicateInPipeline(item, targetArray)) {
        this.logger.warn(
          `유사도 중복 필터링: targetConcept=${item.targetConcept}, stem=${item.questionStem.slice(0, 50)}...`,
        );
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
      if (isSimilarText(existing.questionStem, item.questionStem, 0.8)) {
        return true;
      }
      if (
        hasStimulus &&
        JSON.stringify(existing.stimulusData) === itemStimKey
      ) {
        return true;
      }
    }
    return false;
  }

  // ============================================================
  // DB 저장 (항상 새 문항 INSERT + 유저 본 문항 기록)
  // ============================================================
  private async saveQuestions(
    items: GeneratedQuestion[],
    subjectId: string,
    subjectSlug: string,
    reportProgress?: ExamGenerationProgressReporter,
    userId?: string,
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
        message: `문항 저장 처리 중 (${index + 1}/${items.length})`,
        detail: item.targetConcept || item.recommendedTemplate,
      });

      const unitNumber =
        parseInt(item.unitName.replace(/[^0-9]/g, ''), 10) || 1;
      let unit = await this.unitRepo.findOne({
        where: { subjectId, unitNumber },
      });

      if (!unit) {
        unit = this.unitRepo.create({
          subjectId,
          unitNumber,
          title: item.unitName,
        });
        await this.unitRepo.save(unit);
      }

      const safeTemplate = this.stimulusNormalizer.resolveTemplate(
        item.recommendedTemplate,
      );
      const finalStimulus = this.stimulusNormalizer.normalizeStimulusData(
        item.stimulusData ?? {},
        safeTemplate,
      );
      const finalTemplate = safeTemplate;
      const variantGroupId = `${subjectId}::${unit.id}::${item.targetConcept}::${finalTemplate}`;

      const unseenFromPool = userId
        ? await this.findUnseenPoolVariant(userId, variantGroupId)
        : null;

      if (unseenFromPool) {
        this.logger.log(
          `풀 사용: ${item.targetConcept} (${finalTemplate}) — 기존 변형 재할당`,
        );
        if (userId) {
          await this.questionSeenRecordRepo.upsert(
            { userId, questionId: unseenFromPool.id, seenAt: new Date() },
            ['userId', 'questionId'],
          );
        }
        saved.push(unseenFromPool);
        continue;
      }

      const question = this.questionRepo.create({
        subjectId,
        unitId: unit.id,
        targetConcept: item.targetConcept,
        itemType: item.itemType,
        difficulty: item.difficulty,
        recommendedTemplate: finalTemplate,
        variantGroupId,
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

      if (userId) {
        await this.questionSeenRecordRepo.upsert(
          { userId, questionId: question.id, seenAt: new Date() },
          ['userId', 'questionId'],
        );
      }

      saved.push(question);
    }

    await this.reportProgress(reportProgress, {
      stage: 'saving_questions',
      progress: 96,
      status: 'success',
      message: `문항 ${saved.length}개 저장 완료`,
    });

    return saved;
  }

  private async findUnseenPoolVariant(
    userId: string,
    variantGroupId: string,
  ): Promise<Question | null> {
    const pool = await this.questionRepo.find({
      where: { variantGroupId },
    });
    if (pool.length === 0) return null;

    const seen = await this.questionSeenRecordRepo.find({
      where: { userId },
      select: ['questionId'],
    });
    const seenIds = new Set(seen.map((r) => r.questionId));
    return pool.find((q) => !seenIds.has(q.id)) ?? null;
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
    userId?: string,
    excludePrevious?: boolean,
    skipReferenceEnhancements?: boolean,
  ): Promise<Question[]> {
    // 이 요청 전용 OpenAI 클라이언트 (요청별 키 고정 — 동시 요청은 각각 다른 키 사용)
    const client = getOpenAIClient();

    // 사용자 중복 제외 쿼리
    let previousQuestionIds: Set<string> | undefined;
    if (userId && excludePrevious !== false) {
      previousQuestionIds = await this.getUserPreviousQuestionIds(
        userId,
        subjectId,
        startUnitNum,
        endUnitNum,
      );
      if (previousQuestionIds.size > 0) {
        this.logger.log(
          `[REGEN] 이전 문항 ${previousQuestionIds.size}개 제외 (사용자 중복 방지)`,
        );
      }
    }

    await this.reportProgress(reportProgress, {
      stage: 'loading_references',
      progress: 5,
      message: '참조 문항을 불러오는 중입니다.',
    });

    const subjectEn = subjectSlug === 'success' ? 'sungjik' : 'kongil';
    const allDir = path.resolve(
      __dirname,
      '../../../textbook/parsed',
      subjectEn,
      'all',
    );

    let references: any[] = [];
    for (let unit = startUnitNum; unit <= endUnitNum; unit++) {
      const fp = allDir + '/' + unit + '단원.json';
      if (fs.existsSync(fp)) {
        try {
          const qs = JSON.parse(fs.readFileSync(fp, 'utf-8'));
          references.push(
            ...qs.filter(
              (question: any) =>
                typeof question?.stem === 'string' &&
                question.stem.trim().length >= 10 &&
                typeof question?.stimulus === 'string' &&
                question.stimulus.trim().length >= 20 &&
                Array.isArray(question?.choices) &&
                question.choices.length === 5,
            ),
          );
        } catch (error: any) {
          this.logger.warn(
            `[REGEN] 참조 문항 파일을 읽지 못했습니다: ${fp} (${error?.message || error})`,
          );
        }
      }
    }

    if (references.length === 0) {
      this.logger.warn(
        'No reference questions found for units ' +
          startUnitNum +
          '-' +
          endUnitNum,
      );
      return [];
    }

    if (targetConcepts && targetConcepts.length > 0) {
      references = references.filter((r: any) => {
        return targetConcepts.some((tc) =>
          r.targetConcepts?.some(
            (rc: string) => rc.includes(tc) || tc.includes(rc),
          ),
        );
      });
    }

    if (references.length === 0) {
      throw new InternalServerErrorException(
        '선택한 단원 또는 개념에 사용할 수 있는 기출 참조 문항이 없습니다.',
      );
    }

    if (!skipReferenceEnhancements) {
      references = references.map((reference) => ({
        ...reference,
        dnaContract: this.patternMatcher.findDnaForReference(
          subjectSlug,
          reference.source?.unitNumber ?? startUnitNum,
          reference,
        ),
      }));
    }

    references.sort(() => Math.random() - 0.5);

    await this.reportProgress(reportProgress, {
      stage: 'regenerating',
      progress: 20,
      message: questionCount + '개 문항 재생성 중...',
    });

    // 문항 유형 분포 퀀텀 프롬프트 조각
    const itemFamilyQuota = subjectSlug
      ? buildItemFamilyQuotaPrompt(subjectSlug, questionCount)
      : '';

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
      const batchPrompt = this.regeneratorService.buildBatchRegenPrompt(
        chunk,
        difficulty,
        itemFamilyQuota,
        customPrompt,
      );
      await this.regeneratorService.regenerateBatch(
        client,
        batchPrompt,
        chunk,
        chunkResult,
        difficulty,
        startUnitNum,
        reportProgress,
      );

      if (chunkResult.length < chunk.length) {
        remaining.unshift(...chunk.slice(chunkResult.length));
      }
      if (chunkResult.length === 0) continue;

      await this.regeneratorService.convertBatchToTpl(client, chunkResult);
      const failedIndices = await this.regeneratorService.verifyBatch(
        client,
        chunkResult,
      );
      const domainFailedIndices = this.regeneratorService.filterDomainMismatch(
        chunkResult,
        subjectSlug,
        startUnitNum,
        endUnitNum,
      );
      const dnaFailedIndices = chunkResult
        .map((item, index) =>
          item.metadata?.recommended_template === 'TPL_REGENERATION_REQUIRED'
            ? index
            : -1,
        )
        .filter((index) => index >= 0);
      const allFailed = new Set([
        ...failedIndices,
        ...domainFailedIndices,
        ...dnaFailedIndices,
      ]);
      const passed = chunkResult.filter((_, i) => !allFailed.has(i));

      if (passed.length > 0) {
        result.push(...passed);
        this.logger.log(
          '[REGEN] attempt ' + attempts + ': got ' + passed.length + '/' + need,
        );
      }
    }

    if (result.length === 0) return [];

    const generated: GeneratedQuestion[] = result.map((item: any) => ({
      targetConcept: item.metadata?.target_concept || '',
      itemType: item.metadata?.item_type || 'reference_variant',
      difficulty: item.metadata?.difficulty || difficulty,
      recommendedTemplate:
        item.metadata?.recommended_template || 'TPL_PLAIN_TEXT',
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

    // TPL 스키마 검증 (non-blocking — 경고만)
    for (const item of generated) {
      const tplErrors = this.stimulusNormalizer.validateTplSchema(
        item.stimulusData,
        item.recommendedTemplate,
        item,
      );
      if (tplErrors.length > 0) {
        this.logger.warn(
          `[REGEN] TPL schema mismatch: ${tplErrors.join('; ')}`,
        );
      }
    }

    const allValid: GeneratedQuestion[] = [];
    for (const item of generated) {
      const ct = item.comboBlock
        ? item.comboBlock.title +
          ' ' +
          item.comboBlock.items.map((x: any) => x.text).join(' ')
        : '';
      const simResult = await this.similarityValidator.validate(
        item.questionStem,
        item.stimulusData,
        item.optionsList,
        ct,
      );
      if (simResult.passed) allValid.push(item);
    }

    // 저장 전: string stimulusData는 PLAIN_TEXT로 강제 변환 (fillDefaults에서 내용 증발 방지)
    for (const item of allValid) {
      if (typeof item.stimulusData === 'string') {
        item.stimulusData = { data: item.stimulusData };
        item.recommendedTemplate = 'TPL_PLAIN_TEXT';
      }
    }

    // 저장 전 품질 검사: 내용 없는 item 제거
    const contentful = allValid.filter((item) => {
      const json = JSON.stringify(item.stimulusData);
      if (json.includes('(내용 없음)') || json.includes('내용 없음'))
        return false;
      if (item.recommendedTemplate === 'TPL_PLAIN_TEXT') {
        return (item.stimulusData as any)?.data?.trim().length >= 20;
      }
      return json.length > 50;
    });
    const filteredCount = allValid.length - contentful.length;
    if (filteredCount > 0) {
      this.logger.log(`[REGEN] 품질 검사: ${filteredCount}개 제거 (내용 없음)`);
    }

    await this.reportProgress(reportProgress, {
      stage: 'saving',
      progress: 85,
      message: contentful.length + '개 문항 저장 중...',
    });

    return this.saveQuestions(
      contentful.slice(0, questionCount),
      subjectId,
      subjectSlug,
      reportProgress,
      userId,
    );
  }
}
