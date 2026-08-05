import { AI_GENERATION_TEMPLATES, canGenerateAiTemplate, getTplGenerationSpec, TPL_GENERATION_REGISTRY } from './ai-tpl-capabilities';

describe('AI template capabilities', () => {
  it('enables only templates with the complete current contract', () => {
    expect(AI_GENERATION_TEMPLATES).toEqual([
      'TPL_CASE_DIAGNOSTIC_FRAME',
      'TPL_CONVERSATIONAL_FLOW',
      'TPL_COMPARATIVE_MATRIX',
      'TPL_FORMAL_DOCUMENT',
      'TPL_ARTICLE',
      'TPL_ANNOUNCEMENT',
      'TPL_SEQUENTIAL_WORKFLOW',
    ]);
    for (const template of AI_GENERATION_TEMPLATES) {
      expect(canGenerateAiTemplate(template, 'certified source')).toBe(true);
    }
  });

  it('does not enable presentation or numeric templates without an answer contract', () => {
    for (const template of [
      'TPL_DIGITAL_FORUM_INTERFACE',
      'TPL_INSTRUCTIONAL_SCENE',
      'TPL_PROMOTIONAL_CANVAS',
      'TPL_INCIDENT_REPORT',
      'TPL_REPORT',
      'TPL_QUANTITATIVE_CHART',
      'TPL_STATISTICS',
    ]) {
      expect(canGenerateAiTemplate(template, 'certified source')).toBe(false);
    }
  });

  it('derives enabled templates and provider slot fields from one registry', () => {
    expect(TPL_GENERATION_REGISTRY).toHaveLength(14);
    expect(getTplGenerationSpec('TPL_COMPARATIVE_MATRIX')?.providerSlotField).toBe('cellTexts');
    expect(getTplGenerationSpec('TPL_REPORT')?.enabled).toBe(false);
  });
});
