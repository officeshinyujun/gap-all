import {
  matrixGroundingTerms,
  validateReferenceFactGrounding,
} from './reference-fact-grounding';

describe('reference fact grounding', () => {
  const source = {
    stimulus:
      '| 구분 | 내용 |\n| --- | --- |\n| 기업체명 | ㈜△△식품 |\n| 1일 근로 시간 | 08:30~17:30 |\n| 임금 | 시간당 12,000원 |',
  };

  it('extracts non-generic source facts from a structured source table', () => {
    expect(matrixGroundingTerms(source)).toEqual(
      expect.arrayContaining(['기업체명', '1일 근로 시간', '임금']),
    );
  });

  it('rejects the observed contract-source and A/B-cost-table mismatch', () => {
    expect(
      validateReferenceFactGrounding({
        source,
        template: 'TPL_COMPARATIVE_MATRIX',
        stimulusData: {
          headers: [
            { id: 'criteria', label: '비교 항목' },
            { id: 'a', label: 'A안' },
            { id: 'b', label: 'B안' },
          ],
          rows: [
            { id: 'initial', cells: ['초기 비용', '500만 원', '300만 원'] },
            {
              id: 'maintenance',
              cells: ['유지 비용', '연 100만 원', '연 200만 원'],
            },
          ],
          selection_chips: [],
        },
      }),
    ).toMatchObject({
      kind: 'rejected',
      reason: 'MATRIX_SOURCE_FACT_MISMATCH',
    });
  });

  it('accepts a matrix that preserves multiple source facts', () => {
    expect(
      validateReferenceFactGrounding({
        source,
        template: 'TPL_COMPARATIVE_MATRIX',
        stimulusData: {
          headers: [
            { id: 'field', label: '기업체명' },
            { id: 'detail', label: '임금' },
          ],
          rows: [
            { id: 'work', cells: ['㈜△△식품', '시간당 12,000원'] },
            { id: 'hours', cells: ['1일 근로 시간', '08:30~17:30'] },
          ],
          selection_chips: [],
        },
      }),
    ).toEqual({ kind: 'accepted' });
  });
});
