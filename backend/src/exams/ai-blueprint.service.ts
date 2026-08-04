import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, type Repository } from 'typeorm';
import { Difficulty } from '../entities/exam-record.entity';
import { ReferenceQuestion } from '../entities/reference-question.entity';
import {
  AI_BLUEPRINT_VERSION,
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

export type AiBlueprintPreview = Readonly<{
  subjectSlug: string;
  profileVersion: string;
  blueprintVersion: string;
  requestedCount: number;
  availableCount: number;
  blueprints: readonly AiQuestionBlueprint[];
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
    caseContext?: string;
    variantOrdinal?: number;
  }>;

const CASE_VARIANTS_PER_SOURCE = 3;

@Injectable()
export class AiBlueprintService {
  constructor(
    private readonly profileService: AiUnitProfileService,
    @InjectRepository(ReferenceQuestion)
    private readonly referenceRepo: Pick<Repository<ReferenceQuestion>, 'find'>,
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
    const evidence = collectEvidence(sources, request.subjectSlug);
    return compileAiBlueprints(profile, evidence, request);
  }
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
  >,
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
  const preferredFamily =
    request.aiQuestionFamily ??
    (eligibleEvidence.some((item) => item.family === 'case')
      ? 'case'
      : 'concept');
  const familyEvidence = eligibleEvidence.filter(
    (item) => item.family === preferredFamily,
  );
  const uniqueEvidence = uniqueBySource(
    familyEvidence.length > 0 ? familyEvidence : eligibleEvidence,
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
  const materializableEvidence = uniqueEvidence.filter(
    (item) =>
      conceptPool.filter((concept) => concept !== item.concept).length >= 4,
  );
  const selected = selectBalancedEvidence(
    materializableEvidence,
    request.questionCount,
  );
  const blueprints = selected.map((item, index) =>
    createBlueprint(
      item,
      request.subjectId,
      request.difficulty,
      seed,
      index + 1,
      conceptPool.filter((concept) => concept !== item.concept).slice(0, 4),
    ),
  );
  const reason =
    selected.length === 0 && request.aiQuestionFamily !== undefined
      ? 'UNSUPPORTED_FAMILY'
      : 'INSUFFICIENT_CERTIFIED_EVIDENCE';
  return {
    subjectSlug: profile.subjectSlug,
    profileVersion: AI_UNIT_PROFILE_VERSION,
    blueprintVersion: AI_BLUEPRINT_VERSION,
    requestedCount: request.questionCount,
    availableCount: materializableEvidence.length,
    blueprints,
    ...(selected.length === request.questionCount
      ? {}
      : {
          shortfall: {
            requestedCount: request.questionCount,
            availableCount: materializableEvidence.length,
            reason,
          },
        }),
  };
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
  return {
    id,
    family: evidence.family,
    subjectId,
    unitNumber: evidence.unitNumber,
    targetConcept: evidence.concept,
    template: evidence.template,
    ...(evidence.sourceArchetype === undefined
      ? {}
      : { sourceArchetype: evidence.sourceArchetype }),
    ...(evidence.template === 'TPL_CONVERSATIONAL_FLOW'
      ? { conversationContract: conversationContractFor(evidence.caseContext) }
      : {}),
    sourceFactAnchors,
    caseContext: evidence.caseContext ?? '',
    variantOrdinal: evidence.variantOrdinal ?? 1,
    invariantFacts: [
      {
        id: 'target-concept',
        description: `정답 판단은 ${evidence.concept} 개념의 필수 조건에 근거해야 한다.`,
      },
      ...sourceFactAnchors.map((anchor, index) => ({
        id: `source-fact-${index + 1}`,
        description: `원문에서 확인된 결정적 수치/단위 ${anchor}를 보존해야 한다.`,
      })),
    ],
    mutableSlots:
      evidence.family === 'case'
        ? [
            { name: 'actor', kind: 'text' },
            { name: 'context', kind: 'text' },
            { name: 'action', kind: 'text' },
          ]
        : [{ name: 'situation', kind: 'text' }],
    answerRule: {
      id: 'concept-match-v1',
      description: `${familyText}의 필수 조건을 만족하는 선택지만 정답으로 인정한다.`,
    },
    answerIndex: ((parseInt(
      stableHash(`${seed}:answer:${evidence.sourceId}`),
      16,
    ) %
      5) +
      1) as 1 | 2 | 3 | 4 | 5,
    distractorRule: {
      id: 'concept-boundary-v1',
      description:
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

function collectEvidence(
  sources: readonly AiProfileSource[],
  subjectSlug: string,
): BlueprintEvidence[] {
  const subject = subjectStyle(subjectSlug);
  return sources.flatMap((source) => {
    const parsed = parseReference(catalogReferencePayload(source), subject);
    if (!parsed.ok || parsed.value.correctAnswer == null) return [];
    const family = inferFamily(source, parsed.value.archetype?.stimulusRole);
    const template = parsed.value.archetype?.sourceTemplate;
    if (
      template === undefined ||
      !isSupportedTemplate(template) ||
      !isSupportedCaseArchetype(parsed.value.archetype)
    )
      return [];
    if (
      template === 'TPL_CONVERSATIONAL_FLOW' &&
      conversationContractFor(parsed.value.stimulus).speakerSequence.length < 2
    ) {
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
      caseContext: parsed.value.stimulus,
      variantOrdinal: index + 1,
    }));
  });
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

function isSupportedTemplate(template: string): boolean {
  return (
    template === 'TPL_CASE_DIAGNOSTIC_FRAME' ||
    template === 'TPL_CONVERSATIONAL_FLOW'
  );
}

function isSupportedCaseArchetype(
  archetype: BlueprintEvidence['sourceArchetype'],
): boolean {
  return (
    archetype === undefined ||
    ((archetype.sourceTemplate === 'TPL_CASE_DIAGNOSTIC_FRAME' ||
      archetype.sourceTemplate === 'TPL_CONVERSATIONAL_FLOW') &&
      archetype.responseMode === 'single_selection' &&
      archetype.choiceTopology === 'single_choice' &&
      (archetype.stemIntent === 'positive_single_selection' ||
        archetype.stemIntent === 'negative_single_selection'))
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

function extractSourceFactAnchors(
  stimulus: string | undefined,
): readonly string[] {
  if (stimulus === undefined) return [];
  const matches =
    stimulus.match(
      /\d+(?:[.,]\d+)?\s*(?:%|명|개|원|일|개월|년|시간|단계)?/gu,
    ) ?? [];
  return [...new Set(matches.map((value) => value.trim()).filter(Boolean))];
}

function selectBalancedEvidence(
  evidence: readonly BlueprintEvidence[],
  count: number,
): readonly BlueprintEvidence[] {
  const byUnit = new Map<number, BlueprintEvidence[]>();
  for (const item of evidence) {
    const current = byUnit.get(item.unitNumber) ?? [];
    current.push(item);
    byUnit.set(item.unitNumber, current);
  }
  const units = [...byUnit.keys()].sort((left, right) => left - right);
  const ordered: BlueprintEvidence[] = [];
  let cursor = 0;
  while (units.length > 0) {
    const unit = units[cursor % units.length];
    const bucket = byUnit.get(unit);
    const next = bucket?.shift();
    if (next !== undefined) ordered.push(next);
    if (bucket?.length === 0) {
      units.splice(cursor % units.length, 1);
      cursor = units.length === 0 ? 0 : cursor % units.length;
    } else {
      cursor = (cursor + 1) % units.length;
    }
  }
  const selected: BlueprintEvidence[] = [];
  const selectedIds = new Set<string>();
  const conceptCounts = new Map<string, number>();
  const distinctConceptCount = new Set(evidence.map((item) => item.concept))
    .size;
  const conceptCap = Math.max(
    1,
    Math.ceil(count / Math.min(4, Math.max(1, distinctConceptCount))),
  );
  for (const next of ordered) {
    if (selected.length >= count) break;
    const currentConceptCount = conceptCounts.get(next.concept) ?? 0;
    if (currentConceptCount < conceptCap || selected.length === 0) {
      selected.push(next);
      selectedIds.add(next.sourceId);
      conceptCounts.set(next.concept, currentConceptCount + 1);
    }
  }
  if (selected.length < count) {
    for (const next of ordered) {
      if (selected.length >= count) break;
      if (selectedIds.has(next.sourceId)) continue;
      selected.push(next);
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

function uniqueBySource(
  values: readonly BlueprintEvidence[],
): readonly BlueprintEvidence[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.sourceId)) return false;
    seen.add(value.sourceId);
    return true;
  });
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
