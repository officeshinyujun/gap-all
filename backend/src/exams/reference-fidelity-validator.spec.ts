import { classifyReferenceArchetype } from './reference-archetype';
import { buildReferenceFidelitySpec } from './reference-fidelity-spec';
import {
  validateReferenceCopyPolicy,
  validateReferenceDensity,
} from './reference-fidelity-validator';

const SOURCE_STIMULUS =
  '지원자는 예외 요건을 충족해야 지원할 수 있으며, 승인받지 않은 연속 원문 구절은 복제할 수 없다.';
const SOURCE_STEM =
  '다음 자료에 제시된 사례를 분석한 내용으로 옳은 것만을 고른 것은?';
const SOURCE_CHOICE =
  '① 지원 요건을 충족하지 않는 경우에는 신청할 수 없습니다.';

function spec() {
  const archetype = classifyReferenceArchetype({
    stem: SOURCE_STEM,
    stimulus: SOURCE_STIMULUS,
    viewItems: [],
    choices: [SOURCE_CHOICE, '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
    targetConcepts: ['지원 요건'],
  });
  if (archetype.kind !== 'classified') throw new Error('Invalid fixture.');
  return buildReferenceFidelitySpec(
    {
      source: { sourceId: 'success:1:source-1', sourceHash: 'hash-1' },
      stem: SOURCE_STEM,
      stimulus: SOURCE_STIMULUS,
      viewItems: [],
      choices: [SOURCE_CHOICE, '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['지원 요건'],
    },
    archetype.value,
    {
      structureBlueprint: {
        informationUnits: [
          { id: 'unit_1', order: 1, kind: 'context', atomIds: ['atom_1'] },
          { id: 'unit_2', order: 2, kind: 'condition', atomIds: ['atom_2'] },
          { id: 'unit_3', order: 3, kind: 'conclusion', atomIds: ['atom_3'] },
        ],
        relations: [
          { kind: 'condition_of', fromUnitId: 'unit_2', toUnitId: 'unit_3' },
        ],
        reasoningSteps: [
          {
            id: 'step_1',
            order: 1,
            operation: 'derive_conclusion',
            unitIds: ['unit_2', 'unit_3'],
            dependsOnStepIds: [],
          },
        ],
        itemRoles: [
          {
            itemKind: 'choice',
            itemIndex: 1,
            role: 'correct',
            unitIds: ['unit_3'],
            reasoningStepIds: ['step_1'],
          },
          {
            itemKind: 'choice',
            itemIndex: 2,
            role: 'irrelevant',
            unitIds: ['unit_1'],
            reasoningStepIds: ['step_1'],
          },
          {
            itemKind: 'choice',
            itemIndex: 3,
            role: 'irrelevant',
            unitIds: ['unit_1'],
            reasoningStepIds: ['step_1'],
          },
          {
            itemKind: 'choice',
            itemIndex: 4,
            role: 'irrelevant',
            unitIds: ['unit_1'],
            reasoningStepIds: ['step_1'],
          },
          {
            itemKind: 'choice',
            itemIndex: 5,
            role: 'irrelevant',
            unitIds: ['unit_1'],
            reasoningStepIds: ['step_1'],
          },
        ],
        evidenceBlocks: [],
      },
      answerPlan: {
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        expectedAnswerCount: 5,
        options: [
          { id: 'option_1', verdict: true, atomIds: ['atom_1'] },
          { id: 'option_2', verdict: false, atomIds: ['atom_1'] },
          { id: 'option_3', verdict: false, atomIds: ['atom_1'] },
          { id: 'option_4', verdict: false, atomIds: ['atom_1'] },
          { id: 'option_5', verdict: false, atomIds: ['atom_1'] },
        ],
      },
      targetConceptIds: ['concept_support_requirements'],
    },
  );
}

describe('validateReferenceCopyPolicy', () => {
  it('allows the conventional source question stem while protecting source content', () => {
    expect(validateReferenceCopyPolicy(spec(), SOURCE_STEM)).toEqual({
      kind: 'accepted',
    });
  });

  it('accepts a close paraphrase that retains the source concept', () => {
    expect(
      validateReferenceCopyPolicy(
        spec(),
        '지원 요건의 예외 조건을 만족한 사람만 신청할 수 있다.',
      ),
    ).toEqual({ kind: 'accepted' });
  });

  it('rejects a copied protected source sentence', () => {
    const result = validateReferenceCopyPolicy(spec(), SOURCE_STIMULUS);

    expect(result).toMatchObject({
      kind: 'rejected',
      reason: 'VERBATIM_SOURCE_SEGMENT',
    });
    if (result.kind !== 'rejected') {
      throw new Error('Expected a copy-policy rejection.');
    }
    expect(result.matches[0]).toEqual(
      expect.objectContaining({
        protectedSegmentIndex: expect.any(Number),
        sourceStart: expect.any(Number),
        renderedStart: expect.any(Number),
        length: expect.any(Number),
        overlap: expect.any(String),
      }),
    );
    expect(JSON.stringify(result)).not.toContain(SOURCE_STIMULUS);
  });

  it('allows a 24-character partial overlap but rejects substantial source overlap', () => {
    expect(
      validateReferenceCopyPolicy(spec(), SOURCE_STIMULUS.slice(0, 24)),
    ).toEqual({ kind: 'accepted' });
    expect(
      validateReferenceCopyPolicy(spec(), SOURCE_STIMULUS.slice(0, 48)),
    ).toMatchObject({ kind: 'rejected', reason: 'VERBATIM_SOURCE_SEGMENT' });
  });

  it('rejects a copied source choice', () => {
    expect(validateReferenceCopyPolicy(spec(), SOURCE_CHOICE)).toMatchObject({
      kind: 'rejected',
      reason: 'VERBATIM_SOURCE_SEGMENT',
    });
  });

  it('rejects a variant whose stimulus is materially shorter than the source', () => {
    expect(validateReferenceDensity(spec(), '짧다.')).toEqual({
      kind: 'rejected',
      reason: 'INSUFFICIENT_STIMULUS_DENSITY',
    });
  });

  it('rejects a variant whose stimulus exceeds the source density bound', () => {
    expect(
      validateReferenceDensity(spec(), SOURCE_STIMULUS.repeat(21)),
    ).toEqual({
      kind: 'rejected',
      reason: 'EXCESSIVE_STIMULUS_DENSITY',
    });
  });
});
