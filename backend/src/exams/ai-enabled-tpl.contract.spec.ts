import { Difficulty } from '../entities/exam-record.entity';
import type { AiQuestionBlueprint, AiQuestionCandidate } from './ai-blueprint.types';
import { aiCandidateResponseFormat, parseAiQuestionCandidate } from './ai-provider.adapter';
import { AI_GENERATION_TEMPLATES, getTplGenerationSpec } from './ai-tpl-capabilities';
import { materializeAiQuestion } from './ai-question-materializer';
import { validateSimplyReferenceStructuredTpl } from './simply-reference-generation-contract';

const choices = ['직무 분석에 맞다', '둘', '셋', '넷', '다섯'];

describe('enabled AI TPL contracts', () => {
  it.each(AI_GENERATION_TEMPLATES)('%s has one provider field, count, parser, and materializer contract', (template) => {
    const field = getTplGenerationSpec(template)?.providerSlotField;
    const count = template === 'TPL_CASE_DIAGNOSTIC_FRAME' ? undefined : 2;
    const context = template === 'TPL_COMPARATIVE_MATRIX'
      ? '| 기준 | 값 |\n| --- | --- |\n| A | 원문 값 |'
      : template === 'TPL_CONVERSATIONAL_FLOW'
        ? '교사: 첫째 사실\n학생: 둘째 사실'
        : '원문 첫째 사실\n원문 둘째 사실';
    const blueprint: AiQuestionBlueprint = {
      id: `contract-${template}`,
      family: 'case',
      subjectId: 'subject-1',
      unitNumber: 1,
      targetConcept: '직무 분석',
      template,
      providerSlotField: field,
      providerSlotCount: count,
      caseContext: context,
      ...(template === 'TPL_CONVERSATIONAL_FLOW' ? {
        conversationContract: {
          participants: [
            { id: 'speaker-1', name: '교사', role: '교사' },
            { id: 'speaker-2', name: '학생', role: '학생' },
          ],
          speakerSequence: ['speaker-1', 'speaker-2'],
          sceneKind: 'dialogue' as const,
        },
      } : {}),
      invariantFacts: [],
      mutableSlots: [],
      answerRule: { id: 'answer-v1', description: 'server' },
      answerIndex: 1,
      distractorRule: { id: 'distractor-v1', description: 'server' },
      distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
      difficulty: Difficulty.MIDDLE,
      sourceEvidence: [{ sourceId: 'source-1', sourceHash: 'hash', unitNumber: 1 }],
      blueprintVersion: 'v3',
    };
    const values = template === 'TPL_CASE_DIAGNOSTIC_FRAME'
      ? { stemText: '상황', explanationText: '직무 분석의 조건이다.' }
      : { [field!]: ['첫째 사실', '둘째 사실'], explanationText: '직무 분석의 조건이다.' };
    const format = aiCandidateResponseFormat(blueprint);
    expect(format.json_schema.schema.required).toContain(field ?? 'stemText');
    const candidate = parseAiQuestionCandidate(JSON.stringify(values), blueprint);
    const materialized = materializeAiQuestion(blueprint, candidate);
    expect(materialized.kind).toBe('accepted');
    if (materialized.kind === 'accepted') {
      expect(
        validateSimplyReferenceStructuredTpl(
          template,
          materialized.question.stimulusData,
        ),
      ).toBe(true);
    }
  });
});
