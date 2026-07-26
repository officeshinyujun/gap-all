import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface PatternSkeleton {
  itemFamily: string;
  stimulusTPL: string | null;
  blankCount: number;
  boCount: number;
  choiceType: string;
  choiceCount: number;
  hasComboBlock: boolean;
}

export interface QuestionPattern {
  assessmentIntent: string;
  judgmentAxis: string;
  skeletonStructure: PatternSkeleton;
  distractorBlueprint: string[];
  difficultyDriver: string;
  stemPattern: string;
}

export interface PatternEntry {
  conceptId: string;
  targetConcept: string;
  frequency: number;
  sourceExam: string;
  questionNumber: number;
  pattern: QuestionPattern;
}

export interface UnitPatterns {
  unit: number;
  unitTitle: string;
  subject: string;
  totalQuestions: number;
  patterns: PatternEntry[];
}

export interface QuestionDnaV2 {
  schemaVersion: 2;
  dnaId: string;
  subject: 'success' | 'kongil';
  unitNumber: number;
  targetConcepts: string[];
  difficulty: string;
  itemFamily: string;
  provenance: {
    sourceHash: string;
    sourceType: string;
    sourceExam: string;
    questionNumber: number;
  };
  materialContract: {
    materialKind: string;
    requiredTemplate: string;
    requiredFields: string[];
    metadataRequirements: string[];
    requiresVisualParity: boolean;
  };
  stemContract: {
    materialReference: string;
    judgmentTarget: string;
    polarity: 'positive' | 'negative';
    responseMode: string;
    requiredEntityLabels: string[];
    forbiddenGenericPatterns: string[];
  };
  solutionContract: {
    minimumReasoningSteps: number;
    evidenceSlots: Array<{
      id: string;
      sourceUnitId: string;
      sourceLocation: string;
      evidence: string;
      role: string;
    }>;
    decisionRule: string;
    claimProofs: Array<{
      claimId: string;
      verdict: boolean;
      evidenceSlotIds: string[];
      indispensabilityChecks: Array<{
        evidenceSlotId: string;
        verdictWithoutEvidence: 'indeterminate' | 'changes';
      }>;
      appliedRule: string;
      distractorType?: string;
    }>;
    answerEncodingRule: string;
  };
  qualityConstraints: {
    sourceClosed: boolean;
    requiredEvidenceSlotCount: number;
    rejectDirectAnswer: boolean;
    indispensableEvidenceVerified: boolean;
    noveltyConstraints: string[];
  };
}

interface UnitDnaV2 {
  schemaVersion: 2;
  subject: string;
  unit: number;
  records: QuestionDnaV2[];
}

const SUPPORTED_TPLS = new Set([
  'TPL_COMPARATIVE_MATRIX',
  'TPL_FORMAL_DOCUMENT',
  'TPL_CONVERSATIONAL_FLOW',
  'TPL_CASE_DIAGNOSTIC_FRAME',
  'TPL_SEQUENTIAL_WORKFLOW',
  'TPL_INSTRUCTIONAL_SCENE',
  'TPL_DIGITAL_FORUM_INTERFACE',
  'TPL_QUANTITATIVE_CHART',
  'TPL_PROMOTIONAL_CANVAS',
]);

@Injectable()
export class PatternMatcherService {
  private readonly logger = new Logger(PatternMatcherService.name);
  private readonly patternsBasePath: string;
  private readonly dnaBasePath: string;
  private cache: Map<string, UnitPatterns> = new Map();
  private dnaCache: Map<string, UnitDnaV2> = new Map();

  constructor() {
    this.patternsBasePath =
      process.env.PATTERNS_BASE_PATH ??
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'textbook',
        'question-patterns',
      );
    this.dnaBasePath = path.join(this.patternsBasePath, 'dna');
  }

  private subjectFolder(subjectSlug: string): 'success' | 'kongil' {
    return subjectSlug === 'success' ? 'success' : 'kongil';
  }

  private loadUnitDna(
    subjectSlug: string,
    unitNumber: number,
  ): UnitDnaV2 | null {
    const subject = this.subjectFolder(subjectSlug);
    const cacheKey = `${subject}_${unitNumber}`;
    if (this.dnaCache.has(cacheKey)) return this.dnaCache.get(cacheKey)!;

    const filePath = path.join(
      this.dnaBasePath,
      subject,
      `${unitNumber}단원.v2.json`,
    );
    if (!fs.existsSync(filePath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UnitDnaV2;
      if (data.schemaVersion !== 2 || !Array.isArray(data.records)) {
        this.logger.warn(`Invalid DNA v2 file: ${filePath}`);
        return null;
      }
      this.dnaCache.set(cacheKey, data);
      return data;
    } catch {
      this.logger.warn(`Failed to load DNA v2 file: ${filePath}`);
      return null;
    }
  }

  findDna(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
    targetConcepts: string[] | undefined,
    maxRecords: number,
  ): QuestionDnaV2[] {
    const candidates: QuestionDnaV2[] = [];
    for (let unit = startUnit; unit <= endUnit; unit++) {
      const unitDna = this.loadUnitDna(subjectSlug, unit);
      if (!unitDna) continue;
      for (const record of unitDna.records) {
        if (
          !SUPPORTED_TPLS.has(record.materialContract?.requiredTemplate) ||
          record.solutionContract?.minimumReasoningSteps < 3 ||
          record.solutionContract?.evidenceSlots?.length < 2 ||
          record.qualityConstraints?.sourceClosed !== true ||
          record.qualityConstraints?.rejectDirectAnswer !== true ||
          record.qualityConstraints?.indispensableEvidenceVerified !== true ||
          !this.hasIndispensableEvidence(record)
        ) {
          continue;
        }
        if (
          targetConcepts?.length &&
          !targetConcepts.some((concept) =>
            record.targetConcepts.some(
              (target) => target.includes(concept) || concept.includes(target),
            ),
          )
        ) {
          continue;
        }
        candidates.push(record);
      }
    }

    return candidates
      .sort((left, right) => {
        const leftScore = targetConcepts?.some((concept) =>
          left.targetConcepts.includes(concept),
        )
          ? 1
          : 0;
        const rightScore = targetConcepts?.some((concept) =>
          right.targetConcepts.includes(concept),
        )
          ? 1
          : 0;
        return rightScore - leftScore || left.dnaId.localeCompare(right.dnaId);
      })
      .slice(0, maxRecords);
  }

  private hasIndispensableEvidence(record: QuestionDnaV2): boolean {
    const slotsById = new Map(
      record.solutionContract.evidenceSlots.map((slot) => [slot.id, slot]),
    );
    if (
      slotsById.size < 2 ||
      [...slotsById.values()].some((slot) => !slot.sourceUnitId)
    ) {
      return false;
    }

    return record.solutionContract.claimProofs.every((proof) => {
      const sourceUnitIds = new Set(
        proof.evidenceSlotIds.map(
          (slotId) => slotsById.get(slotId)?.sourceUnitId,
        ),
      );
      const checkedSlotIds = new Set(
        proof.indispensabilityChecks
          .filter(
            (check) =>
              check.verdictWithoutEvidence === 'indeterminate' ||
              check.verdictWithoutEvidence === 'changes',
          )
          .map((check) => check.evidenceSlotId),
      );
      return (
        proof.evidenceSlotIds.length >= 2 &&
        !sourceUnitIds.has(undefined) &&
        sourceUnitIds.size >= 2 &&
        proof.evidenceSlotIds.every((slotId) => checkedSlotIds.has(slotId))
      );
    });
  }

  findDnaForReference(
    subjectSlug: string,
    unitNumber: number,
    reference: {
      questionNumber?: number;
      stem?: string;
      stimulus?: string;
      choices?: string[];
    },
  ): QuestionDnaV2 | null {
    const unitDna = this.loadUnitDna(subjectSlug, unitNumber);
    if (!unitDna) return null;
    const normalized = [
      reference.stem ?? '',
      reference.stimulus ?? '',
      ...(reference.choices ?? []),
    ]
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const hash = normalized
      ? `sha256:${createHash('sha256').update(normalized).digest('hex')}`
      : '';
    return (
      unitDna.records.find(
        (record) =>
          record.provenance.questionNumber === reference.questionNumber ||
          (hash && record.provenance.sourceHash === hash),
      ) ?? null
    );
  }

  private loadUnitPatterns(
    subjectSlug: string,
    unitNumber: number,
  ): UnitPatterns | null {
    const cacheKey = `${subjectSlug}_${unitNumber}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const folder = subjectSlug === 'success' ? 'success' : subjectSlug;
    const filePath = path.join(
      this.patternsBasePath,
      folder,
      `${unitNumber}단원.json`,
    );

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: UnitPatterns = JSON.parse(raw);
      this.cache.set(cacheKey, data);
      return data;
    } catch {
      this.logger.warn(`Failed to load pattern file: ${filePath}`);
      return null;
    }
  }

  findPatterns(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
    targetConcepts?: string[],
    maxPatterns: number = 4,
  ): PatternEntry[] {
    const allPatterns: PatternEntry[] = [];

    for (let unit = startUnit; unit <= endUnit; unit++) {
      const unitData = this.loadUnitPatterns(subjectSlug, unit);
      if (!unitData) continue;

      for (const entry of unitData.patterns) {
        if (
          targetConcepts &&
          targetConcepts.length > 0 &&
          !targetConcepts.some(
            (tc) =>
              entry.targetConcept.includes(tc) ||
              tc.includes(entry.targetConcept),
          )
        ) {
          continue;
        }
        allPatterns.push(entry);
      }
    }

    // Shuffle and pick up to maxPatterns for diversity
    const shuffled = [...allPatterns].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, maxPatterns);
  }

  formatPatternContext(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
    targetConcepts?: string[],
  ): string {
    const dnaRecords = this.findDna(
      subjectSlug,
      startUnit,
      endUnit,
      targetConcepts,
      4,
    );
    if (dnaRecords.length > 0) {
      return this.formatDnaContext(dnaRecords);
    }

    const patterns = this.findPatterns(
      subjectSlug,
      startUnit,
      endUnit,
      targetConcepts,
    );

    if (patterns.length === 0) {
      return '';
    }

    const lines: string[] = [
      '# [참고: 해당 단원 실제 기출 패턴 분석]',
      '아래는 이 단원의 실제 기출문항들에서 추출한 패턴 정보이다.',
      '출제 의도, 판단 축, 문항 골격 구조는 반드시 따르되,',
      '구체적인 자료 내용과 문장은 완전히 새롭게 창작하라.',
      '기존 문제의 특정 표현, 수치, 사례명, 인물명을 재사용하지 마라.',
      '',
      JSON.stringify(
        patterns.map((p) => ({
          targetConcept: p.targetConcept,
          sourceExam: p.sourceExam,
          pattern: p.pattern,
        })),
        null,
        2,
      ),
      '',
      '# [패턴 활용 규칙]',
      '1. assessmentIntent(출제 의도)는 반드시 유지하라.',
      '2. judgmentAxis(판단 축)는 반드시 유지하라.',
      '3. skeletonStructure(골격 구조: itemFamily, blankCount, boCount, choiceType)는 반드시 유지하라.',
      '4. distractorBlueprint(오답 전략)은 동일한 방식을 사용하라.',
      '5. stimulusTPL(자료 형식)이 존재하면 해당 자료 구조를 유지하라.',
      '6. stemPattern(발문 패턴)은 참고만 하고, 구체적 표현은 다르게 구성하라.',
      '7. [금지] 구체적인 stimulus_data 내용, 수치, 이름, 장소를 기출문제와 동일하게 사용하지 마라.',
      '8. [금지] 실제 기출문제의 특정 문장을 그대로 또는 유사하게 재사용하지 마라.',
    ];

    return lines.join('\n');
  }

  private formatDnaContext(records: QuestionDnaV2[]): string {
    return [
      '# [필수: Question DNA v2 계약]',
      '아래 DNA 중 문항마다 서로 다른 dnaId 하나를 선택해 계약을 그대로 따른다.',
      'requiredTemplate, materialKind, responseMode, polarity를 변경하지 마라.',
      '자료의 새 사례, 인물, 수치만 창작하고 evidenceSlots의 관계와 decisionRule은 유지하라.',
      '모든 핵심 주장에는 서로 다른 원천 단위의 indispensable evidenceSlots 두 개와 교과 규칙 하나가 필요하다.',
      '자료에 없는 법 조항, 예외, 정의로 보기의 참거짓을 판단하게 하지 마라.',
      '빈 문서 메타데이터와 한 문장 또는 한 표 셀만 읽으면 풀리는 보기를 금지한다.',
      JSON.stringify(records, null, 2),
      '# [DNA 출력 규칙]',
      'Blueprint에 선택한 dnaId와 dna_contract를 그대로 포함하라.',
      'metadata.recommended_template은 dna_contract.materialContract.requiredTemplate과 같아야 한다.',
      'item_structure.item_family는 dna_contract.stemContract.responseMode과 호환되어야 한다.',
    ].join('\n');
  }

  /** 패턴 캐시 초기화 (메모리 절약용) */
  clearCache(): void {
    this.cache.clear();
    this.dnaCache.clear();
  }
}
