import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, type Repository } from 'typeorm';
import { Difficulty } from '../entities/exam-record.entity';
import { ReferenceQuestion } from '../entities/reference-question.entity';
import { AiReferenceAnalysis as AiReferenceAnalysisEntity } from '../entities/ai-reference-analysis.entity';
import {
  AI_BLUEPRINT_VERSION,
  createAiChoiceFocuses,
  type AiConversationContract,
  type AiGenerationSourceEvidence,
  type AiQuestionBlueprint,
  type AiQuestionFamily,
} from './ai-blueprint.types';
import {
  AI_UNIT_PROFILE_VERSION,
  type AiGenerationProfile,
  type AiProfileSource,
  AiUnitProfileService,
} from './ai-unit-profile.service';
import type { ReferenceArchetype } from './reference-archetype';
import { parseReference, stableHash } from './reference-selector.utils';
import type { SubjectStyle } from './reference-frame.types';
import type { PreviewAiBlueprintDto } from './dto/preview-ai-blueprint.dto';
import { canGenerateAiTemplate } from './ai-tpl-capabilities';
import { getTplGenerationSpec } from './ai-tpl-capabilities';
import { AiProviderAdapter } from './ai-provider.adapter';
import type { AiReferenceAnalysis } from './ai-blueprint.types';

export type AiBlueprintPreview = Readonly<{
  subjectSlug: string;
  profileVersion: string;
  blueprintVersion: string;
  requestedCount: number;
  availableCount: number;
  reserveCount: number;
  plannedByTpl: Readonly<Record<string, number>>;
  reserveByTpl: Readonly<Record<string, number>>;
  blueprints: readonly AiQuestionBlueprint[];
  diagnostics?: Readonly<{
    rawReferenceCount: number;
    parsedReferenceCount: number;
    evidenceCount: number;
    invalidReferenceCount: number;
    unsupportedTemplateCount: number;
    excludedPreviousSourceCount: number;
    availableReferenceCount: number;
    blueprintCount: number;
  }>;
  shortfall?: Readonly<{
    requestedCount: number;
    availableCount: number;
    reason: 'INSUFFICIENT_CERTIFIED_EVIDENCE' | 'UNSUPPORTED_FAMILY';
  }>;
}>;

type BlueprintEvidence = AiGenerationSourceEvidence &
  Readonly<{
    baseSourceId?: string;
    concept: string;
    family: AiQuestionFamily;
    template: string;
    sourceArchetype?: ReferenceArchetype;
    sourceChoiceTexts?: readonly string[];
    sourceViewItems?: readonly string[];
    caseContext?: string;
    variantOrdinal?: number;
    analysis?: AiReferenceAnalysis;
    sourcePayload?: Record<string, unknown>;
    sourceAnswerIndex?: 1 | 2 | 3 | 4 | 5;
  }>;

type EvidenceCollectionResult = Readonly<{
  evidence: readonly BlueprintEvidence[];
  rawReferenceCount: number;
  parsedReferenceCount: number;
  invalidReferenceCount: number;
  unsupportedTemplateCount: number;
}>;

const CASE_VARIANTS_PER_SOURCE = 3;
export const AI_REPLACEMENT_RESERVE_MINIMUM = 5;

@Injectable()
export class AiBlueprintService {
  private readonly logger = new Logger(AiBlueprintService.name);

  constructor(
    private readonly profileService: AiUnitProfileService,
    @InjectRepository(ReferenceQuestion)
    private readonly referenceRepo: Pick<Repository<ReferenceQuestion>, 'find'>,
    @InjectRepository(AiReferenceAnalysisEntity)
    private readonly analysisRepo: Pick<
      Repository<AiReferenceAnalysisEntity>,
      'find' | 'upsert'
    >,
    private readonly provider: AiProviderAdapter,
  ) {}

  async preview(request: PreviewAiBlueprintDto): Promise<AiBlueprintPreview> {
    const profile = await this.profileService.getProfile(
      request.subjectSlug,
      request.startUnitNum,
      request.endUnitNum,
    );
    const sources = await this.referenceRepo.find({
      where: {
        subject: In(catalogSubjects(request.subjectSlug)),
        unitNumber: Between(request.startUnitNum, request.endUnitNum),
      },
    });
    const collected = collectEvidence(sources, request.subjectSlug);
    const evidence = collected.evidence;
    const candidateCount =
      request.questionCount +
      Math.max(request.questionCount, AI_REPLACEMENT_RESERVE_MINIMUM);

    // ponytail: select blueprints FIRST (deterministic, no LLM), then only
    // analyze the selected subset. Merge analyzed back into full evidence so
    // compileAiBlueprints has the complete concept pool for distractor selection.
    const preSelected = preSelectForAnalysis(profile, evidence, {
      ...request,
      candidateCount,
    });
    const analyzed = await this.loadOrSaveAnalyses(preSelected);
    const merged = evidence.map((item) => {
      const analyzedItem = analyzed.find(
        (a) => (a.baseSourceId ?? a.sourceId) === (item.baseSourceId ?? item.sourceId),
      );
      return analyzedItem ?? item;
    });
    const preview = compileAiBlueprints(profile, merged, {
      ...request,
      candidateCount,
    });
    const diagnostics = {
      rawReferenceCount: collected.rawReferenceCount,
      parsedReferenceCount: collected.parsedReferenceCount,
      evidenceCount: collected.evidence.length,
      invalidReferenceCount: collected.invalidReferenceCount,
      unsupportedTemplateCount: collected.unsupportedTemplateCount,
      excludedPreviousSourceCount: new Set(request.excludeSourceIds ?? []).size,
      availableReferenceCount: preview.availableCount,
      blueprintCount: preview.blueprints.length,
    };
    this.logger.log(`AI blueprint diagnostics: ${JSON.stringify(diagnostics)}`);
    return { ...preview, diagnostics };
  }

  private async loadOrSaveAnalyses(
    evidence: readonly BlueprintEvidence[],
  ): Promise<readonly BlueprintEvidence[]> {
    if (evidence.length === 0) return evidence;

    const cached = await this.analysisRepo.find({
      where: {
        analysisVersion: AI_BLUEPRINT_VERSION,
        sourceId: In(evidence.map((item) => item.sourceId)),
      },
    });
    const bySourceId = new Map(cached.map((row) => [row.sourceId, row]));

    const analyzed: BlueprintEvidence[] = [];
    for (const item of evidence) {
      const cachedRow = bySourceId.get(item.sourceId);
      if (cachedRow !== undefined) {
        analyzed.push(mergeAnalysis(item, cachedRow.analysis));
        continue;
      }
      try {
        const analysis = await this.provider.analyzeReference({
          sourceId: item.sourceId,
          sourceHash: item.sourceHash,
          unitNumber: item.unitNumber,
          targetConcept: item.concept,
          template: item.template,
          sourceArchetype: item.sourceArchetype ?? null,
          sourceContext: item.caseContext ?? null,
          sourcePayload: item.sourcePayload ?? null,
        });
        await this.analysisRepo.upsert(
          {
            sourceId: item.sourceId,
            sourceHash: item.sourceHash,
            analysisVersion: AI_BLUEPRINT_VERSION,
            providerModel: process.env.OPENAI_AI_ANALYSIS_MODEL ??
              process.env.OPENAI_AI_BLUEPRINT_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            promptHash: null,
            analysis: analysis as unknown as any,
          },
          ['sourceId', 'analysisVersion'],
        );
        analyzed.push(mergeAnalysis(item, analysis));
      } catch (error: unknown) {
        // Keep blueprint generation available when analysis is temporarily unavailable;
        // the later candidate/schema/fidelity gates still reject unsafe output.
        const fallback = deterministicAnalysis(item);
        this.logger.warn(
          `Reference analysis fallback for ${item.sourceId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        analyzed.push(mergeAnalysis(item, fallback));
      }
    }

    return analyzed;
  }
}

function deterministicAnalysis(evidence: BlueprintEvidence): AiReferenceAnalysis {
  const sourceFactAnchors = extractSourceFactAnchors(evidence.caseContext);
  return {
    stemIntent: evidence.sourceArchetype?.stemIntent ?? '사례의 조건을 비교해 판단한다.',
    reasoningPattern: evidence.sourceArchetype?.reasoningPattern ?? '핵심 조건 비교',
    invariantFacts: [
      { id: 'target-concept', description: `정답 판단은 ${evidence.concept}의 필수 조건에 근거한다.` },
      ...sourceFactAnchors.map((anchor, index) => ({
        id: `source-fact-${index + 1}`,
        description: `원문 근거 ${anchor}를 보존한다.`,
      })),
    ],
    mutableSlots: evidence.family === 'case'
      ? [
          { name: 'actor', kind: 'text' },
          { name: 'context', kind: 'text' },
          { name: 'action', kind: 'text' },
        ]
      : [{ name: 'situation', kind: 'text' }],
    answerRule: {
      id: 'concept-match-v1',
      description: '원본 정답 위치와 정답 판정 규칙을 유지한다.',
    },
    distractorRules: [
      '인접 개념의 경계를 혼동하지만 원본 정답 조건과 겹치지 않는 오답을 사용한다.',
    ],
    stimulusRequired: true,
  };
}

function mergeAnalysis(
  evidence: BlueprintEvidence,
  analysis: Record<string, unknown>,
): BlueprintEvidence {
  if (!isReferenceAnalysis(analysis)) return evidence;
  return { ...evidence, analysis };
}

function isReferenceAnalysis(value: Record<string, unknown>): value is AiReferenceAnalysis {
  return value.stimulusRequired === true &&
    typeof value.stemIntent === 'string' &&
    typeof value.reasoningPattern === 'string' &&
    Array.isArray(value.invariantFacts) &&
    Array.isArray(value.mutableSlots) &&
    typeof value.answerRule === 'object' && value.answerRule !== null &&
    Array.isArray(value.distractorRules);
}

export function compileAiBlueprints(
  profile: AiGenerationProfile,
  evidence: readonly BlueprintEvidence[],
  request: Pick<
    PreviewAiBlueprintDto,
    | 'difficulty'
    | 'subjectId'
    | 'questionCount'
    | 'targetConcepts'
    | 'aiQuestionFamily'
    | 'seed'
    | 'excludeSourceIds'
  > & { candidateCount?: number },
): AiBlueprintPreview {
  const seed =
    request.seed?.trim() || `${profile.subjectSlug}:${AI_BLUEPRINT_VERSION}`;
  const requestedConcepts = new Set(request.targetConcepts ?? []);
  const excludedSourceIds = new Set(request.excludeSourceIds ?? []);
  const eligibleEvidence = evidence
    .filter((item) => {
      const baseSourceId = item.baseSourceId ?? item.sourceId;
      return !excludedSourceIds.has(baseSourceId);
    })
    .filter((item) => {
      if (request.aiQuestionFamily !== undefined) {
        return item.family === request.aiQuestionFamily;
      }
      // AI 신규 문항은 단원에서 실제 사례형 출제가 확인되면 사례형을
      // 우선한다. 사용자는 유형을 고르지 않고 단원만 선택한다.
      return true;
    })
    .filter(
      (item) =>
        request.aiQuestionFamily === undefined ||
        item.family === request.aiQuestionFamily,
    )
    .filter(
      (item) =>
        requestedConcepts.size === 0 || requestedConcepts.has(item.concept),
    )
    .sort((left, right) =>
      compareText(
        stableHash(`${seed}:${left.sourceId}`),
        stableHash(`${seed}:${right.sourceId}`),
      ),
    );
  const conceptPool = unique([
    ...evidence.map((item) => item.concept),
    ...profile.units.flatMap((unit) =>
      unit.concepts.map((concept) => concept.name),
    ),
  ]).sort((left, right) =>
    compareText(
      stableHash(`${seed}:concept:${left}`),
      stableHash(`${seed}:concept:${right}`),
    ),
  );
  const materializableEvidence = eligibleEvidence.filter(
    (item) =>
      conceptPool.filter((concept) => concept !== item.concept).length >= 4,
  );
  const selected = selectBalancedEvidence(
    materializableEvidence,
    request.candidateCount ?? request.questionCount,
  );
  const blueprints = selected.map((item, index) => {
    // 같은 단원 개념 우선 → 다른 단원 개념 fallback (채용면접 vs 공기업 같은 엉뚱한 오답 방지)
    const sameUnitConcepts =
      profile.units
        .find((u) => u.unitNumber === item.unitNumber)
        ?.concepts.map((c) => c.name) ?? [];
    const otherConcepts = conceptPool.filter(
      (c) => !sameUnitConcepts.includes(c),
    );
    const distractorPool = [...sameUnitConcepts, ...otherConcepts].filter(
      (c) => c !== item.concept,
    );
    const distractorConcepts = distractorPool.slice(0, 4);
    return createBlueprint(
      item,
      request.subjectId,
      request.difficulty,
      seed,
      index + 1,
      distractorConcepts,
    );
  });
  const reserveCount = Math.max(0, selected.length - request.questionCount);
  const plannedByTpl = countByTemplate(blueprints);
  const reserveByTpl = countByTemplate(blueprints.slice(request.questionCount));
  const reason =
    selected.length === 0 && request.aiQuestionFamily !== undefined
      ? 'UNSUPPORTED_FAMILY'
      : 'INSUFFICIENT_CERTIFIED_EVIDENCE';
  return {
    subjectSlug: profile.subjectSlug,
    profileVersion: AI_UNIT_PROFILE_VERSION,
    blueprintVersion: AI_BLUEPRINT_VERSION,
    requestedCount: request.questionCount,
    availableCount: uniqueByBaseSource(materializableEvidence).length,
    reserveCount,
    plannedByTpl,
    reserveByTpl,
    blueprints,
    ...(selected.length >= request.questionCount
      ? {}
      : {
          shortfall: {
            requestedCount: request.questionCount,
            availableCount: uniqueByBaseSource(materializableEvidence).length,
            reason,
          },
        }),
  };
}

// ponytail: select which evidence items to LLM-analyze before expensive analysis.
// Uses the same filtering/sorting/selection as compileAiBlueprints but skips analysis.
function preSelectForAnalysis(
  profile: AiGenerationProfile,
  evidence: readonly BlueprintEvidence[],
  request: Parameters<typeof compileAiBlueprints>[2],
): readonly BlueprintEvidence[] {
  const seed =
    request.seed?.trim() || `${profile.subjectSlug}:${AI_BLUEPRINT_VERSION}`;
  const requestedConcepts = new Set(request.targetConcepts ?? []);
  const excludedSourceIds = new Set(request.excludeSourceIds ?? []);
  const eligible = evidence
    .filter((item) => !excludedSourceIds.has(item.baseSourceId ?? item.sourceId))
    .filter((item) =>
      request.aiQuestionFamily !== undefined
        ? item.family === request.aiQuestionFamily
        : true,
    )
    .filter((item) =>
      requestedConcepts.size === 0 || requestedConcepts.has(item.concept),
    )
    .sort((left, right) =>
      compareText(
        stableHash(`${seed}:${left.sourceId}`),
        stableHash(`${seed}:${right.sourceId}`),
      ),
    );
  const conceptPool = unique([
    ...evidence.map((item) => item.concept),
    ...profile.units.flatMap((unit) =>
      unit.concepts.map((concept) => concept.name),
    ),
  ]);
  const materializable = eligible.filter(
    (item) =>
      conceptPool.filter((concept) => concept !== item.concept).length >= 4,
  );
  return selectBalancedEvidence(
    materializable,
    request.candidateCount ?? request.questionCount,
  );
}

function createBlueprint(
  evidence: BlueprintEvidence,
  subjectId: string,
  difficulty: Difficulty,
  seed: string,
  ordinal: number,
  distractorConcepts: readonly string[],
): AiQuestionBlueprint {
  const id = `ai-blueprint:${stableHash(`${seed}:${evidence.sourceId}:${ordinal}`)}`;
  const familyText = evidence.family === 'case' ? '사례' : '개념';
  const sourceFactAnchors = extractSourceFactAnchors(evidence.caseContext);
  const answerIndex = evidence.sourceAnswerIndex ??
    (((parseInt(stableHash(`${seed}:answer:${evidence.sourceId}`), 16) % 5) + 1) as 1 | 2 | 3 | 4 | 5);
  const providerSlotField = getTplGenerationSpec(evidence.template)?.providerSlotField;
  const sourceSlotTexts = sourceSlotsFor(evidence.template, evidence.caseContext);
  return {
    id,
    family: evidence.family,
    subjectId,
    unitNumber: evidence.unitNumber,
    targetConcept: evidence.concept,
    template: evidence.template,
    ...(providerSlotField === undefined ? {} : { providerSlotField }),
    providerSlotCount: providerSlotCountFor(evidence.template, evidence.caseContext),
    ...(sourceSlotTexts === undefined ? {} : { sourceSlotTexts }),
    ...(evidence.sourceArchetype === undefined
      ? {}
      : { sourceArchetype: evidence.sourceArchetype }),
    ...(evidence.sourceChoiceTexts === undefined
      ? {}
      : { sourceChoiceTexts: evidence.sourceChoiceTexts }),
    ...(evidence.sourceViewItems === undefined || evidence.sourceViewItems.length === 0
      ? {}
      : { sourceViewItems: evidence.sourceViewItems }),
    ...(evidence.template === 'TPL_CONVERSATIONAL_FLOW'
      ? { conversationContract: conversationContractFor(evidence.caseContext) }
      : {}),
    sourceFactAnchors,
    ...(evidence.sourceArchetype?.responseMode === 'single_selection'
      ? {
          choiceFocuses: createAiChoiceFocuses(
            evidence.concept,
            distractorConcepts,
            answerIndex,
            sourceFactAnchors,
            evidence.caseContext ?? '',
          ),
        }
      : {}),
    caseContext: evidence.caseContext ?? '',
    variantOrdinal: evidence.variantOrdinal ?? 1,
    invariantFacts: evidence.analysis?.invariantFacts ?? [
      { id: 'target-concept', description: `정답 판단은 ${evidence.concept} 개념의 필수 조건에 근거해야 한다.` },
      ...sourceFactAnchors.map((anchor, index) => ({ id: `source-fact-${index + 1}`, description: `원문에서 확인된 결정적 수치/단위 ${anchor}를 보존해야 한다.` })),
    ],
    mutableSlots: evidence.analysis?.mutableSlots ??
      (evidence.family === 'case'
        ? [{ name: 'actor', kind: 'text' }, { name: 'context', kind: 'text' }, { name: 'action', kind: 'text' }]
        : [{ name: 'situation', kind: 'text' }]),
    answerRule: evidence.analysis?.answerRule ?? {
      id: 'concept-match-v1',
      description: `${familyText}의 필수 조건을 만족하는 선택지만 정답으로 인정한다.`,
    },
    answerIndex,
    distractorRule: {
      id: 'concept-boundary-v1',
      description: evidence.analysis?.distractorRules.join(' ') ??
        '인접 개념의 범위를 혼동하지만 정답 조건과 겹치지 않는 오답을 사용한다.',
    },
    distractorConcepts,
    difficulty,
    sourceEvidence: [
      {
        sourceId: evidence.baseSourceId ?? evidence.sourceId,
        sourceHash: evidence.sourceHash,
        unitNumber: evidence.unitNumber,
        normalizedStimulus: evidence.caseContext,
        archetypeFingerprint: evidence.sourceArchetype?.fingerprint,
      },
    ],
    blueprintVersion: AI_BLUEPRINT_VERSION,
  };
}

function sourceSlotsFor(
  template: string,
  stimulus: string | undefined,
): readonly string[] | undefined {
  const field = getTplGenerationSpec(template)?.providerSlotField;
  if (field === undefined) return undefined;
  if (field === 'messageTexts') {
    return (stimulus ?? '').split('\n')
      .map((line) => /^\s*[^:：]{1,20}?\s*[:：](.+)$/u.exec(line)?.[1]?.trim())
      .filter((text): text is string => text !== undefined && text !== '');
  }
  const lines = (stimulus ?? '').split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  if (field !== 'cellTexts') return lines;
  return lines.filter((line) => line.includes('|')).slice(1)
    .filter((line) => !/^\|?\s*:?-+:?/u.test(line))
    .flatMap((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean));
}

function collectEvidence(
  sources: readonly AiProfileSource[],
  subjectSlug: string,
): EvidenceCollectionResult {
  const subject = subjectStyle(subjectSlug);
  let parsedReferenceCount = 0;
  let invalidReferenceCount = 0;
  let unsupportedTemplateCount = 0;
  const evidence = sources.flatMap((source) => {
    const parsed = parseReference(catalogReferencePayload(source), subject);
    if (
      !parsed.ok ||
      !isSingleAnswerIndex(parsed.value.correctAnswer)
    ) {
      invalidReferenceCount += 1;
      return [];
    }
    parsedReferenceCount += 1;
    const family = inferFamily(source, parsed.value.archetype?.stimulusRole);
    // Preserve the certified source shape. The materializer handles the
    // truth-combination source-preserving contract per template.
    const template = parsed.value.archetype?.sourceTemplate;
    if (
      template === undefined ||
      !isSupportedTemplate(template) ||
      !canGenerateAiTemplate(template, parsed.value.stimulus) ||
      !isSupportedCaseArchetype(parsed.value.archetype) ||
      !hasCertifiedSourceShape(template, parsed.value.stimulus)
    ) {
      unsupportedTemplateCount += 1;
      return [];
    }
    if (
      template === 'TPL_CONVERSATIONAL_FLOW' &&
      conversationContractFor(parsed.value.stimulus).speakerSequence.length < 2
    ) {
      unsupportedTemplateCount += 1;
      return [];
    }
    const baseSourceId = parsed.value.source.sourceId;
    const variantCount = family === 'case' ? CASE_VARIANTS_PER_SOURCE : 1;
    return Array.from({ length: variantCount }, (_, index) => ({
      sourceId:
        variantCount === 1
          ? baseSourceId
          : `${baseSourceId}#case-variant-${index + 1}`,
      baseSourceId,
      sourceHash: parsed.value.source.sourceHash,
      unitNumber: parsed.value.unitNumber,
      concept: parsed.value.target.primaryConcept,
      family,
      template,
      sourceArchetype: parsed.value.archetype,
      sourceChoiceTexts: parsed.value.choices,
      sourceViewItems: parsed.value.viewItems,
      caseContext: parsed.value.stimulus,
      variantOrdinal: index + 1,
      sourcePayload: source.sourcePayload,
      sourceAnswerIndex: parsed.value.correctAnswer as 1 | 2 | 3 | 4 | 5,
    }));
  });
  return {
    evidence,
    rawReferenceCount: sources.length,
    parsedReferenceCount,
    invalidReferenceCount,
    unsupportedTemplateCount,
  };
}

function inferFamily(
  source: AiProfileSource,
  stimulusRole: string | undefined,
): AiQuestionFamily {
  const explicit =
    source.sourcePayload.questionFamily ?? source.sourcePayload.questionType;
  if (explicit === 'calculation') return 'calculation';
  if (explicit === 'case') return 'case';
  return stimulusRole === 'case' || stimulusRole === 'dialogue'
    ? 'case'
    : 'concept';
}

function isSingleAnswerIndex(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isSupportedTemplate(template: string): boolean {
  return getTplGenerationSpec(template)?.enabled === true;
}

function hasCertifiedSourceShape(template: string, stimulus: string | undefined): boolean {
  if (template !== 'TPL_COMPARATIVE_MATRIX') return true;
  const lines = (stimulus ?? '')
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));
  if (lines.length < 2) return false;
  const split = (line: string) => line.split('|').map((cell) => cell.trim()).filter(Boolean);
  const headers = split(lines[0] ?? '');
  const rows = lines.slice(1)
    .filter((line) => !/^\|?\s*:?-+:?/u.test(line))
    .map(split);
  return headers.length > 0 && rows.length > 0 && rows.every((row) => row.length === headers.length);
}

export function isSupportedCaseArchetype(
  archetype: BlueprintEvidence['sourceArchetype'],
): boolean {
  if (
    archetype === undefined ||
    !isSupportedTemplate(archetype.sourceTemplate)
  ) {
    return archetype === undefined;
  }

  // Keep the existing single-selection reference corpus usable. Truth
  // combination is allowed only for templates with a verified AI path.
  const singleSelection =
    archetype.responseMode === 'single_selection' &&
    archetype.choiceTopology === 'single_choice' &&
    (archetype.stemIntent === 'positive_single_selection' ||
      archetype.stemIntent === 'negative_single_selection');
  if (singleSelection) return true;

  const truthCombinationTemplates = new Set([
    'TPL_CASE_DIAGNOSTIC_FRAME',
    'TPL_FORMAL_DOCUMENT',
    'TPL_COMPARATIVE_MATRIX',
    'TPL_CONVERSATIONAL_FLOW',
    'TPL_SEQUENTIAL_WORKFLOW',
  ]);
  return (
    truthCombinationTemplates.has(archetype.sourceTemplate) &&
    archetype.responseMode === 'truth_combination' &&
    archetype.choiceTopology === 'combo_sets' &&
    archetype.stemIntent === 'truth_combination'
  );
}

function conversationContractFor(
  stimulus: string | undefined,
): AiConversationContract {
  const parsed: Array<{ name: string; text: string }> = [];
  for (const line of (stimulus ?? '').split('\n')) {
    const match = /^\s*([^:：]{1,20}?)\s*[:：](.+)$/u.exec(line);
    if (match === null) continue;
    parsed.push({ name: match[1]?.trim() ?? '', text: match[2]?.trim() ?? '' });
  }
  const names = [...new Set(parsed.map((message) => message.name))].filter(
    Boolean,
  );
  const participants = names.map((name, index) => ({
    id: `speaker-${index + 1}`,
    name,
    role: name,
  }));
  const idByName = new Map(
    participants.map((participant) => [participant.name, participant.id]),
  );
  return {
    participants,
    speakerSequence: parsed.map(
      (message) => idByName.get(message.name) ?? 'speaker-1',
    ),
    sceneKind: 'dialogue',
  };
}

function providerSlotCountFor(template: string, stimulus: string | undefined): number | undefined {
  const spec = getTplGenerationSpec(template);
  if (spec?.providerSlotField === 'messageTexts') {
    return conversationContractFor(stimulus).speakerSequence.length;
  }
  if (spec?.providerSlotField === undefined) return undefined;
  const lines = (stimulus ?? '').split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  if (spec.providerSlotField === 'cellTexts') {
    const rows = lines.filter((line) => line.includes('|')).slice(1).filter((line) => !/^\|?\s*:?-+:?/u.test(line));
    const count = rows.reduce((total, line) => total + line.split('|').map((cell) => cell.trim()).filter(Boolean).length, 0);
    return count || undefined;
  }
  return lines.length || undefined;
}

function extractSourceFactAnchors(
  stimulus: string | undefined,
): readonly string[] {
  if (stimulus === undefined) return [];
  const matches =
    stimulus.match(
      /\d+(?:[.,]\d+)?\s*(?:%|명|개|원|일|개월|년|시간|단계)?/gu,
    ) ?? [];
  return [
    ...new Set(
      matches
        .map((value) => value.trim())
        .filter((value) => value !== '' && !/^\d$/u.test(value)),
    ),
  ];
}

// 모의고사형 선별: TPL 비율 기반 할당 → 단원 가중치 분배.
// 실제 수능/모의고사처럼 TPL 다양성과 단원 커버리지를 동시에 확보한다.
function selectBalancedEvidence(
  evidence: readonly BlueprintEvidence[],
  count: number,
): readonly BlueprintEvidence[] {
  const primary = uniqueByBaseSource(evidence);
  const variants = new Map<string, BlueprintEvidence[]>();
  for (const item of evidence) {
    const baseId = item.baseSourceId ?? item.sourceId;
    if (item.sourceId !== baseId) {
      variants.set(baseId, [...(variants.get(baseId) ?? []), item]);
    }
  }

  // ① TPL별 목표 개수: 레퍼런스 분포 비율로 계산
  const tplCounts = new Map<string, number>();
  for (const item of primary) {
    tplCounts.set(item.template, (tplCounts.get(item.template) ?? 0) + 1);
  }
  const totalAvailable = [...tplCounts.values()].reduce((a, b) => a + b, 0);
  const tplTargets = new Map<string, number>();
  let allocated = 0;
  const tplEntries = [...tplCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tpl, available] of tplEntries) {
    const target = Math.min(
      available,
      Math.max(1, Math.round((available / totalAvailable) * count)),
    );
    tplTargets.set(tpl, target);
    allocated += target;
  }
  // 보정: 목표 합계가 count와 다르면 가장 큰 TPL에 차이 반영
  const diff = count - allocated;
  if (diff !== 0 && tplEntries.length > 0) {
    const largest = tplEntries[0]![0];
    tplTargets.set(largest, Math.max(1, (tplTargets.get(largest) ?? 1) + diff));
  }

  // ② 단원별 가중치: 실제 출제 빈도 (등장한 시험 수).
  const unitExamSets = new Map<number, Set<string>>();
  for (const item of primary) {
    const parts = item.sourceId.split(':');
    const examKey = parts.length >= 3 ? parts[2]!.replace(/:\d+$/, '') : item.sourceId;
    if (!unitExamSets.has(item.unitNumber)) {
      unitExamSets.set(item.unitNumber, new Set<string>());
    }
    unitExamSets.get(item.unitNumber)!.add(examKey);
  }
  const unitWeights = new Map<number, number>();
  for (const [unit, exams] of unitExamSets) {
    unitWeights.set(unit, exams.size);
  }

  // ③ TPL별로 가중치 기반 단원 선택 (round-robin으로 단원 중복 방지)
  const selected: BlueprintEvidence[] = [];
  const usedUnits = new Set<number>();
  const usedSources = new Set<string>();

  for (const [tpl, target] of tplTargets) {
    const pool = primary.filter(
      (item) =>
        item.template === tpl && !usedSources.has(item.baseSourceId ?? item.sourceId),
    );
    // 단원 가중치로 정렬 (많은 레퍼런스 = 앞쪽)
    const sorted = [...pool].sort(
      (a, b) =>
        (unitWeights.get(b.unitNumber) ?? 0) - (unitWeights.get(a.unitNumber) ?? 0) ||
        a.unitNumber - b.unitNumber,
    );

    // truth_combination / single_selection 섞기 위해 인터리브
    const tcItems = sorted.filter(
      (item) => item.sourceArchetype?.stemIntent === 'truth_combination',
    );
    const singleItems = sorted.filter(
      (item) => item.sourceArchetype?.stemIntent !== 'truth_combination',
    );
    const interleaved: BlueprintEvidence[] = [];
    let ti = 0, si = 0;
    while (interleaved.length < sorted.length) {
      if (ti < tcItems.length) interleaved.push(tcItems[ti++]!);
      if (si < singleItems.length) interleaved.push(singleItems[si++]!);
    }

    let picked = 0;
    // round-robin으로 단원이 겹치지 않게 선택
    const rounds = [...interleaved];
    while (picked < target && rounds.length > 0) {
      const next = rounds.shift()!;
      const baseId = next.baseSourceId ?? next.sourceId;
      if (usedSources.has(baseId)) continue;
      selected.push(next);
      usedUnits.add(next.unitNumber);
      usedSources.add(baseId);
      picked++;
    }
    // 단원 겹쳐도 되면 남은 것 중 선택
    if (picked < target) {
      for (const item of interleaved) {
        if (picked >= target) break;
        const baseId = item.baseSourceId ?? item.sourceId;
        if (usedSources.has(baseId)) continue;
        selected.push(item);
        usedSources.add(baseId);
        picked++;
      }
    }
  }

  // ④ 부족하면 variant로 채움
  if (selected.length >= count) return selected.slice(0, count);
  for (const source of selected.slice()) {
    for (const variant of variants.get(source.baseSourceId ?? source.sourceId) ?? []) {
      if (selected.length >= count) return selected;
      selected.push(variant);
    }
  }
  return selected;
}

function catalogReferencePayload(
  row: AiProfileSource,
): Readonly<Record<string, unknown>> {
  const sourceValue = row.sourcePayload.source;
  const source = isRecord(sourceValue) ? { ...sourceValue } : {};
  source.unitNumber = row.unitNumber;
  return { ...row.sourcePayload, source };
}

function subjectStyle(subjectSlug: string): SubjectStyle {
  if (subjectSlug === 'success') return 'success';
  if (subjectSlug === 'industry') return 'kongil';
  throw new Error(`지원하지 않는 과목입니다: ${subjectSlug}`);
}

function catalogSubjects(subjectSlug: string): readonly string[] {
  if (subjectSlug === 'success') return ['success', 'sungjik'];
  if (subjectSlug === 'industry') return ['industry', 'kongil'];
  return [subjectSlug];
}

function uniqueByBaseSource(
  values: readonly BlueprintEvidence[],
): readonly BlueprintEvidence[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const baseId = value.baseSourceId ?? value.sourceId;
    if (seen.has(baseId)) return false;
    seen.add(baseId);
    return true;
  });
}

function countByTemplate(
  values: readonly AiQuestionBlueprint[],
): Readonly<Record<string, number>> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value.template] = (counts[value.template] ?? 0) + 1;
    return counts;
  }, {});
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
