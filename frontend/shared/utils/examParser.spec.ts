import comparativeMatrix from './fixtures/validation-comparative-matrix.json';
import conversationalFlow from './fixtures/validation-conversational-flow.json';
import plainTextFallback from './fixtures/validation-plain-text.json';
import { describe, expect, it } from 'vitest';
import { inferTemplate, parseStimulus } from './examParser';

const typedFixtures = [
  {
    name: '비교표',
    data: comparativeMatrix,
    template: 'TPL_COMPARATIVE_MATRIX',
    requiredFields: ['headers', 'rows', 'selection_chips'],
  },
  {
    name: '대화문',
    data: conversationalFlow,
    template: 'TPL_CONVERSATIONAL_FLOW',
    requiredFields: ['participants', 'messages'],
  },
  {
    name: '문서',
    data: {
      doc_type: '공식 안내문',
      header_info: { title: '자료 안내', date: '2026.08.30', author: '출제팀' },
      paragraphs: [{ sub_title: '내용', content: '원문 조항을 보존한다.' }],
      footnotes: [],
    },
    template: 'TPL_FORMAL_DOCUMENT',
    requiredFields: ['doc_type', 'header_info', 'paragraphs', 'footnotes'],
  },
  {
    name: '통계 자료',
    data: {
      title: '고용률 통계',
      category_label: '연령대',
      data_entries: [{ label: '20대', value: '75.2%' }],
      unit: '%',
      source: '통계청',
    },
    template: 'TPL_STATISTICS',
    requiredFields: ['title', 'category_label', 'data_entries', 'unit', 'source'],
  },
] as const;

describe('shared exam stimulus parser validation', () => {
  it.each(typedFixtures)(
    '$name is inferred and keeps required fields after normalization',
    ({ data, template, requiredFields }) => {
      expect(inferTemplate(data)).toBe(template);

      const parsed = parseStimulus(undefined, data);
      expect(parsed?.template).toBe(template);
      if (parsed === null || typeof parsed.data !== 'object' || parsed.data === null) {
        throw new Error('structured fixture was normalized as plain text');
      }

      const normalized = parsed.data as unknown as Record<string, unknown>;
      for (const field of requiredFields) {
        expect(normalized).toHaveProperty(field);
      }
    },
  );

  it('falls back to plain text without dropping an unclassified source object', () => {
    expect(inferTemplate(plainTextFallback)).toBe('TPL_PLAIN_TEXT');
    expect(parseStimulus(undefined, plainTextFallback)).toEqual({
      template: 'TPL_PLAIN_TEXT',
      data: JSON.stringify(plainTextFallback, null, 2),
    });
  });
});
