import { createHash } from 'node:crypto';
import { Difficulty } from '../entities/exam-record.entity';
import { ExamRegeneratorService } from './exam-regenerator.service';
import { classifyReferenceArchetype } from './reference-archetype';
import {
  buildConceptPayloadPrompt,
  buildReferenceFramePrompt,
} from './reference-frame-planner.prompts';
import type { ReferenceFramePlannerRequest } from './reference-frame-planner.types';
import type { ConceptPayload, ReferenceFrame } from './reference-frame.types';
import type { NormalizedSourceReference } from './reference-selector.service';
import type { ReferenceVariantGenerationRequest } from './exam-regenerator.service';

const SERIALIZATION_METHOD = 'utf8-json-buffer-byte-length' as const;

export type LegacyReferenceGenerationBaseline = Readonly<{
  fixtureHash: string;
  serialization: typeof SERIALIZATION_METHOD;
  calls: Readonly<{ tenQuestions: number; twentyQuestions: number }>;
  requests: Readonly<{ tenQuestions: number; twentyQuestions: number }>;
  bytes: Readonly<{ tenQuestions: number; twentyQuestions: number }>;
}>;

type LegacyFixture = Readonly<{
  plannerRequest: ReferenceFramePlannerRequest;
  frame: ReferenceFrame;
  payload: ConceptPayload;
  generationRequest: ReferenceVariantGenerationRequest;
}>;

class LegacyReferenceGenerationMetricsError extends Error {
  readonly name = 'LegacyReferenceGenerationMetricsError';
}

export function measureLegacyReferenceGenerationBaseline(): LegacyReferenceGenerationBaseline {
  const tenQuestions = measureQuestionCount(10);
  const twentyQuestions = measureQuestionCount(20);

  return {
    fixtureHash: fixtureHash(),
    serialization: SERIALIZATION_METHOD,
    calls: {
      tenQuestions: legacyRequestCount(10),
      twentyQuestions: legacyRequestCount(20),
    },
    requests: {
      tenQuestions: legacyRequestCount(10),
      twentyQuestions: legacyRequestCount(20),
    },
    bytes: { tenQuestions, twentyQuestions },
  };
}

export function measureLegacyReferenceGenerationRequestBytes(
  questionCount: number,
): number {
  return measureQuestionCount(questionCount);
}

export function legacyRequestCount(questionCount: number): number {
  if (!Number.isInteger(questionCount) || questionCount <= 0) {
    throw new LegacyReferenceGenerationMetricsError(
      'Question count must be a positive integer.',
    );
  }

  return questionCount * 2 + 1;
}

function measureQuestionCount(questionCount: number): number {
  legacyRequestCount(questionCount);
  const fixtures = Array.from({ length: questionCount }, (_, index) =>
    createFixture(index + 1),
  );
  const plannerBytes = fixtures.reduce((total, fixture) => {
    const framePrompt = buildReferenceFramePrompt(fixture.plannerRequest);
    const payloadPrompt = buildConceptPayloadPrompt(
      fixture.plannerRequest,
      fixture.frame,
    );
    return total + bytes(framePrompt) + bytes(payloadPrompt);
  }, 0);
  const regenerationPrompt = buildLegacyRegenerationPrompt(
    fixtures.map((fixture) => fixture.generationRequest),
  );

  return plannerBytes + bytes(regenerationPrompt);
}

function buildLegacyRegenerationPrompt(
  requests: readonly ReferenceVariantGenerationRequest[],
): string {
  const descriptor = Object.getOwnPropertyDescriptor(
    ExamRegeneratorService.prototype,
    'buildReferenceBatchRegenPrompt',
  );
  const builder = descriptor?.value;
  if (typeof builder !== 'function') {
    throw new LegacyReferenceGenerationMetricsError(
      'The legacy regeneration prompt builder is unavailable.',
    );
  }

  const prompt: unknown = builder.call(
    new ExamRegeneratorService(),
    requests,
    Difficulty.MIDDLE,
  );
  if (typeof prompt !== 'string') {
    throw new LegacyReferenceGenerationMetricsError(
      'The legacy regeneration prompt builder returned a non-string value.',
    );
  }

  return prompt;
}

function createFixture(index: number): LegacyFixture {
  const source = {
    sourceId: `success:unit-1:question-${index}`,
    sourceHash: `fixture-hash-${index}`,
  };
  const archetypeResult = classifyReferenceArchetype({
    stem: `Fixture stem ${index}`,
    stimulus: `Fixture stimulus ${index}`,
    viewItems: [],
    choices: [
      'First choice',
      'Second choice',
      'Third choice',
      'Fourth choice',
      'Fifth choice',
    ],
  });
  if (archetypeResult.kind !== 'classified') {
    throw new LegacyReferenceGenerationMetricsError(
      'Legacy fixture archetype classification failed.',
    );
  }
  const archetype = archetypeResult.value;
  const reference: NormalizedSourceReference = {
    source,
    unitNumber: 1,
    questionNumber: index,
    stem: `Fixture stem ${index}`,
    stimulus: `Fixture stimulus ${index}`,
    archetype,
    choices: ['one', 'two', 'three', 'four', 'five'],
    targetConcepts: ['Career values'],
    target: {
      primaryConcept: 'Career values',
      concepts: ['Career values'],
    },
  };
  const frame: ReferenceFrame = {
    source,
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    archetype,
    stem: {
      style: 'statement evaluation',
      polarity: 'positive',
      languageSignals: ['formal'],
    },
    response: {
      mode: 'single_selection',
      choiceEncoding: 'single_choice',
      choiceCount: 5,
      viewItemCount: 0,
      choiceTopology: 'single_choice',
      combinationPlan: {
        expectedAnswerCount: 5,
        optionCount: 5,
        topology: 'single_choice',
      },
    },
    materialDensity: {
      targetLength: 100,
      paragraphCount: 1,
      namedEntities: 1,
      numericFacts: 0,
      conditionCount: 1,
    },
    informationShape: 'case_profile',
    difficultySignals: ['requires comparison'],
    structureBlueprint: {
      informationUnits: [
        { id: 'unit_1', order: 1, kind: 'context', atomIds: ['atom_1'] },
      ],
      relations: [],
      reasoningSteps: [
        {
          id: 'step_1',
          order: 1,
          operation: 'derive_conclusion',
          unitIds: ['unit_1'],
          dependsOnStepIds: [],
        },
      ],
      itemRoles: [
        {
          itemKind: 'choice',
          itemIndex: 1,
          role: 'correct',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 2,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 3,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 4,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 5,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
      ],
      evidenceBlocks: [
        {
          itemKind: 'choice',
          itemIndex: 1,
          role: 'correct',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 2,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 3,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 4,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 5,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
      ],
    },
    semanticAtoms: [
      {
        id: 'atom_1',
        subjectSlot: 'actor_a',
        predicateKind: 'has_status',
        operator: 'equals',
        objectSlot: null,
        quantityRole: null,
        polarity: true,
      },
    ],
    groundingLexicon: {
      entities: [{ slot: 'actor_a', class: 'person' }],
      quantities: [],
      rules: [
        { id: 'rule_1', conceptId: 'concept_career_planning', polarity: true },
      ],
      bindings: [
        {
          atomId: 'atom_1',
          entitySlots: ['actor_a'],
          quantityIds: [],
          ruleIds: ['rule_1'],
        },
      ],
    },
    shell: archetype.shell,
  };
  const payload: ConceptPayload = {
    source,
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    eligibleUnits: [2],
    targetConceptIds: ['concept_career_planning'],
    supportingConceptIds: [],
    distractorAxes: ['scope_reversal'],
    answerPlan: {
      responseMode: 'single_selection',
      choiceEncoding: 'single_choice',
      expectedAnswerCount: 1,
      options: [
        { id: `option_${index}_1`, verdict: true, atomIds: ['atom_1'] },
        { id: `option_${index}_2`, verdict: false, atomIds: ['atom_1'] },
        { id: `option_${index}_3`, verdict: false, atomIds: ['atom_1'] },
        { id: `option_${index}_4`, verdict: false, atomIds: ['atom_1'] },
        { id: `option_${index}_5`, verdict: false, atomIds: ['atom_1'] },
      ],
    },
    requiredInformationShape: 'case_profile',
    noveltyRules: ['Use new facts.'],
  };
  const plannerRequest: ReferenceFramePlannerRequest = {
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    selection: {
      kind: 'selected',
      concepts: [
        { concept: 'Career values', unitNumbers: [1] },
        { concept: 'Career planning', unitNumbers: [2] },
      ],
      distractorAxisCatalog: [
        'condition_omission',
        'scope_reversal',
        'causal_reversal',
      ],
      distractorAxes: ['condition_omission'],
      references: [reference],
    },
    reference,
    archetype,
    referenceDistractorAxes: ['condition_omission'],
    catalogConcepts: [
      {
        id: 'concept_career_planning',
        subject: 'success',
        unit: 2,
        canonicalLabel: 'Career planning',
        ruleTags: ['comparison'],
      },
    ],
  };

  return {
    plannerRequest,
    frame,
    payload,
    generationRequest: {
      reference: { ...reference, viewItems: [] },
      frame,
      payload,
      catalogConcepts: plannerRequest.catalogConcepts,
      selectedTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    },
  };
}

function fixtureHash(): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(createFixture(1)))
    .digest('hex')}`;
}

function bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}
