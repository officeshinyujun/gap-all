import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Raw, type Repository } from 'typeorm';
import { ReferenceQuestion } from '../entities/reference-question.entity';
import { UnitExamProfile } from '../entities/unit-exam-profile.entity';
import {
  TextbookService,
  type UnitConcepts,
} from '../textbook/textbook.service';
import { parseReference, stableHash } from './reference-selector.utils';
import type { SubjectStyle } from './reference-frame.types';
import type { AiQuestionFamily } from './ai-blueprint.types';
import {
  buildStudyInsights,
  STUDY_INSIGHTS_VERSION,
  type StudyInsights,
  type StudyInsightObservation,
} from '../study/study-insights';
import { STUDY_NOTE_CANDIDATES } from '../study/study-note-candidates';

export const AI_UNIT_PROFILE_VERSION = 'v3' as const;

const SUPPORTED_EVIDENCE_TEMPLATES = new Set([
  'TPL_CASE_DIAGNOSTIC_FRAME',
  'TPL_CONVERSATIONAL_FLOW',
]);

const BLOCKED_TEMPLATE_REASON = 'UNSUPPORTED_SOURCE_TEMPLATE';

export type AiUnitProfileConcept = Readonly<{
  name: string;
  certifiedReferenceCount: number;
  familyCounts: Readonly<Record<AiQuestionFamily, number>>;
  supportedFamilies: readonly AiQuestionFamily[];
  blockedReasons: readonly string[];
  archetypePattern?: Readonly<{
    template: string;
    stemIntent: string;
    responseMode: string;
    materialKind: string;
    reasoningPattern: string;
  }>;
}>;

export type AiUnitProfilePattern = Readonly<{
  template: string;
  stemIntent: string;
  responseMode: string;
  materialKind: string;
  reasoningPattern: string;
  count: number;
}>;

export type AiUnitProfileUnit = Readonly<{
  unitNumber: number;
  unitName: string;
  referenceCount: number;
  certifiedReferenceCount: number;
  familyCounts: Readonly<Record<AiQuestionFamily, number>>;
  supportedFamilies: readonly AiQuestionFamily[];
  blockedReasons: readonly string[];
  archetypePatterns?: readonly AiUnitProfilePattern[];
  concepts: readonly AiUnitProfileConcept[];
  studyInsights?: StudyInsights;
}>;

export type AiGenerationProfile = Readonly<{
  subjectSlug: string;
  profileVersion: string;
  units: readonly AiUnitProfileUnit[];
}>;

export type AiProfileSource = Pick<
  ReferenceQuestion,
  'logicalSourceId' | 'contentHash' | 'subject' | 'unitNumber' | 'sourcePayload'
>;

type SourceObservation = Readonly<{
  logicalSourceId: string;
  unitNumber: number;
  concept: string;
  concepts: readonly string[];
  family: AiQuestionFamily;
  certified: boolean;
  supported: boolean;
  source: string;
  questionNumber: number | null;
  blockedReasons: readonly string[];
  archetypePattern?: Readonly<{
    template: string;
    stemIntent: string;
    responseMode: string;
    materialKind: string;
    reasoningPattern: string;
  }>;
}>;

@Injectable()
export class AiUnitProfileService {
  constructor(
    @InjectRepository(ReferenceQuestion)
    private readonly referenceRepo: Pick<Repository<ReferenceQuestion>, 'find'>,
    @InjectRepository(UnitExamProfile)
    private readonly profileRepo: Pick<
      Repository<UnitExamProfile>,
      'find' | 'save'
    >,
    private readonly textbookService: TextbookService,
  ) {}

  async getProfile(
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
  ): Promise<AiGenerationProfile> {
    const textbookConcepts = await this.textbookService.getConcepts(
      subjectSlug,
      startUnitNum,
      endUnitNum,
    );
    const sources = await this.referenceRepo.find({
      where: {
        subject: In(catalogSubjects(subjectSlug)),
        unitNumbers: Raw(
          (alias) => `${alias} && ARRAY(SELECT generate_series(${startUnitNum},${endUnitNum}))`,
        ),
      },
    });
    const sourceFingerprint = fingerprintSources(sources);
    const textbookFingerprint = stableHash(JSON.stringify(textbookConcepts));
    const persisted = await this.profileRepo.find({
      where: {
        subjectSlug,
        unitNumber: Between(startUnitNum, endUnitNum),
      },
    });
    const persistedByUnit = new Map(
      persisted.map((row) => [row.unitNumber, row]),
    );
    const unitNumbers = Array.from(
      { length: endUnitNum - startUnitNum + 1 },
      (_, index) => startUnitNum + index,
    );
    const cacheComplete = unitNumbers.every((unitNumber) => {
      const row = persistedByUnit.get(unitNumber);
      return (
        row !== undefined &&
        row.profileVersion === AI_UNIT_PROFILE_VERSION &&
        row.sourceFingerprint === sourceFingerprint &&
        row.textbookFingerprint === textbookFingerprint
      );
    });

    if (cacheComplete) {
      return {
        subjectSlug,
        profileVersion: AI_UNIT_PROFILE_VERSION,
        units: unitNumbers
          .map((unitNumber) => persistedByUnit.get(unitNumber)?.profile)
          .filter(isProfileUnit),
      };
    }

    const profile = buildGenerationProfile(
      subjectSlug,
      startUnitNum,
      endUnitNum,
      textbookConcepts,
      sources,
    );
    await this.profileRepo.save(
      profile.units.map((unit) => ({
        ...(persistedByUnit.get(unit.unitNumber)?.id === undefined
          ? {}
          : { id: persistedByUnit.get(unit.unitNumber)?.id }),
        subjectSlug,
        unitNumber: unit.unitNumber,
        profileVersion: AI_UNIT_PROFILE_VERSION,
        sourceFingerprint,
        textbookFingerprint,
        profile: unit,
      })),
    );
    return profile;
  }
}

export function buildGenerationProfile(
  subjectSlug: string,
  startUnitNum: number,
  endUnitNum: number,
  textbookConcepts: readonly UnitConcepts[],
  sources: readonly AiProfileSource[],
): AiGenerationProfile {
  const subject = subjectStyle(subjectSlug);
  const observations = sources.flatMap((source) =>
    observeSource(source, subject),
  );
  const units = Array.from(
    { length: endUnitNum - startUnitNum + 1 },
    (_, index) => startUnitNum + index,
  ).map((unitNumber) => {
    const unitObservations = observations.filter(
      (observation) => observation.unitNumber === unitNumber,
    );
    const textbookUnit = textbookConcepts.find(
      (unit) => unitNumberFromName(unit.unitName) === unitNumber,
    );
    const conceptNames = unique([
      ...(textbookUnit?.concepts ?? []),
      ...unitObservations
        .map((observation) => observation.concept)
        .filter((concept) => concept !== ''),
    ]);
    const concepts = conceptNames.map((name) =>
      buildConceptProfile(name, unitObservations),
    );
    return buildUnitProfile(
      subjectSlug,
      unitNumber,
      unitObservations,
      concepts,
      textbookUnit?.unitName ?? `${unitNumber}단원`,
    );
  });
  return { subjectSlug, profileVersion: AI_UNIT_PROFILE_VERSION, units };
}

function observeSource(
  source: AiProfileSource,
  subject: SubjectStyle,
): SourceObservation[] {
  const payload = catalogReferencePayload(source);
  const parsed = parseReference(payload, subject);
  if (!parsed.ok) {
    return [
      {
        logicalSourceId: source.logicalSourceId,
        unitNumber: source.unitNumber,
        concept: '',
        concepts: [],
        family: 'concept',
        certified: false,
        supported: false,
        source: sourceName(source.sourcePayload),
        questionNumber: questionNumber(source.sourcePayload),
        blockedReasons: ['INVALID_SOURCE_PAYLOAD'],
      },
    ];
  }
  const reference = parsed.value;
  const payloadRecord = source.sourcePayload;
  const explicitFamily = explicitFamilyFromPayload(payloadRecord);
  const family =
    explicitFamily ??
    (reference.archetype?.stimulusRole === 'case' ||
    reference.archetype?.stimulusRole === 'dialogue'
      ? 'case'
      : 'concept');
  const supported = SUPPORTED_EVIDENCE_TEMPLATES.has(
    reference.archetype?.sourceTemplate ?? '',
  );
  const blockedReasons = supported ? [] : [BLOCKED_TEMPLATE_REASON];
  const archetypePattern = reference.archetype
    ? {
        template: reference.archetype.sourceTemplate,
        stemIntent: reference.archetype.stemIntent,
        responseMode: reference.archetype.responseMode,
        materialKind: reference.archetype.materialKind,
        reasoningPattern: reference.archetype.reasoningPattern,
      }
    : undefined;
  return [
    {
      logicalSourceId: source.logicalSourceId,
      unitNumber: reference.unitNumber,
      concept: reference.target.primaryConcept,
      concepts: unique(
        Array.isArray(payloadRecord.targetConcepts)
          ? payloadRecord.targetConcepts.filter(
              (value): value is string => typeof value === 'string',
            )
          : [reference.target.primaryConcept],
      ),
      family,
      certified:
        reference.correctAnswer !== null &&
        reference.correctAnswer !== undefined &&
        reference.choices.length === 5 &&
        reference.stimulus.trim() !== '',
      supported,
      source: sourceName(payloadRecord),
      questionNumber: questionNumber(payloadRecord),
      blockedReasons,
      archetypePattern,
    },
  ];
}

function buildUnitProfile(
  subjectSlug: string,
  unitNumber: number,
  observations: readonly SourceObservation[],
  concepts: readonly AiUnitProfileConcept[],
  unitName: string,
): AiUnitProfileUnit {
  const familyCounts = emptyFamilyCounts();
  const blockedReasons = new Set<string>();
  for (const observation of observations) {
    if (observation.certified && observation.supported) {
      familyCounts[observation.family] += 1;
    }
    for (const reason of observation.blockedReasons) blockedReasons.add(reason);
  }
  const archetypePatterns = aggregatePatterns(observations);
  return {
    unitNumber,
    unitName,
    referenceCount: observations.length,
    certifiedReferenceCount: observations.filter((item) => item.certified)
      .length,
    familyCounts,
    supportedFamilies: supportedFamiliesFromCounts(familyCounts),
    blockedReasons: [...blockedReasons],
    archetypePatterns,
    concepts,
    studyInsights: buildStudyInsights(
      profileSubjectSlug(subjectSlug),
      unitNumber,
      observations.map(toStudyObservation),
      STUDY_NOTE_CANDIDATES,
    ),
  };
}

function buildConceptProfile(
  name: string,
  observations: readonly SourceObservation[],
): AiUnitProfileConcept {
  const matching = observations.filter(
    (observation) => observation.concept === name,
  );
  const familyCounts = emptyFamilyCounts();
  const blockedReasons = new Set<string>();
  for (const observation of matching) {
    if (observation.certified && observation.supported) {
      familyCounts[observation.family] += 1;
    }
    for (const reason of observation.blockedReasons) blockedReasons.add(reason);
  }
  return {
    name,
    certifiedReferenceCount: matching.filter((item) => item.certified).length,
    familyCounts,
    supportedFamilies: supportedFamiliesFromCounts(familyCounts),
    blockedReasons: [...blockedReasons],
    ...(matching[0]?.archetypePattern === undefined
      ? {}
      : { archetypePattern: matching[0].archetypePattern }),
  };
}

function aggregatePatterns(
  observations: readonly SourceObservation[],
): readonly AiUnitProfilePattern[] {
  const counts = new Map<string, AiUnitProfilePattern>();
  for (const observation of observations) {
    const pattern = observation.archetypePattern;
    if (
      !observation.certified ||
      !observation.supported ||
      pattern === undefined
    )
      continue;
    const key = [
      pattern.template,
      pattern.stemIntent,
      pattern.responseMode,
      pattern.materialKind,
      pattern.reasoningPattern,
    ].join('|');
    const current = counts.get(key);
    counts.set(key, {
      ...pattern,
      count: (current?.count ?? 0) + 1,
    });
  }
  return [...counts.values()].sort((left, right) =>
    left.template.localeCompare(right.template),
  );
}

function emptyFamilyCounts(): Record<AiQuestionFamily, number> {
  return { concept: 0, case: 0, calculation: 0 };
}

function supportedFamiliesFromCounts(
  counts: Readonly<Record<AiQuestionFamily, number>>,
): readonly AiQuestionFamily[] {
  return (['concept', 'case', 'calculation'] as const).filter(
    (family) => counts[family] > 0,
  );
}

function explicitFamilyFromPayload(
  payload: Record<string, unknown>,
): AiQuestionFamily | undefined {
  const candidate = payload.questionFamily ?? payload.questionType;
  return candidate === 'concept' ||
    candidate === 'case' ||
    candidate === 'calculation'
    ? candidate
    : undefined;
}

function catalogReferencePayload(
  row: AiProfileSource,
): Readonly<Record<string, unknown>> {
  const sourceValue = row.sourcePayload.source;
  const source = isRecord(sourceValue) ? { ...sourceValue } : {};
  source.unitNumber = row.unitNumber;
  return { ...row.sourcePayload, source };
}

function toStudyObservation(
  observation: SourceObservation,
): StudyInsightObservation {
  return {
    logicalSourceId: observation.logicalSourceId,
    unitNumber: observation.unitNumber,
    concepts: observation.concepts,
    family: observation.family,
    certified: observation.certified,
    supported: observation.supported,
    source: observation.source,
    questionNumber: observation.questionNumber,
    ...(observation.archetypePattern === undefined
      ? {}
      : { archetypePattern: observation.archetypePattern }),
  };
}

function sourceName(payload: Record<string, unknown>): string {
  const source = isRecord(payload.source) ? payload.source : {};
  const examType = source.examType;
  const filename = source.filename;
  if (typeof examType === 'string' && examType.trim() !== '') return examType;
  if (typeof filename === 'string' && filename.trim() !== '') return filename;
  return '기출';
}

function questionNumber(payload: Record<string, unknown>): number | null {
  return typeof payload.questionNumber === 'number'
    ? payload.questionNumber
    : null;
}

function profileSubjectSlug(subjectSlug: string): 'success' | 'industry' {
  if (subjectSlug === 'success' || subjectSlug === 'industry') {
    return subjectSlug;
  }
  throw new Error(`지원하지 않는 과목입니다: ${subjectSlug}`);
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

function fingerprintSources(sources: readonly AiProfileSource[]): string {
  return stableHash(
    [
      STUDY_INSIGHTS_VERSION,
      ...sources
        .map((source) => `${source.logicalSourceId}:${source.contentHash}`)
        .sort(),
    ].join('\u0000'),
  );
}

function unitNumberFromName(unitName: string): number | null {
  const match = /^(\d+)단원$/u.exec(unitName.trim());
  return match === null ? null : Number(match[1]);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProfileUnit(value: unknown): value is AiUnitProfileUnit {
  return isRecord(value) && typeof value.unitNumber === 'number';
}
