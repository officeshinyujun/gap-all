import { normalizeExamNotation, normalizeExamRegister } from './exam-register';

describe('평가원 문체·표기 보정', () => {
  it('turns colloquial past contractions into the exam\'s written forms', () => {
    expect(normalizeExamRegister('A 씨는 2월에 입사했다. 이후 팀장이 됐고, 교육을 받기 위해서 휴직했으며 결과를 봤다.'))
      .toBe('A 씨는 2월에 입사하였다. 이후 팀장이 되었고, 교육을 받기 위하여 휴직하였으며 결과를 보았다.');
    expect(normalizeExamRegister('작업 전 점검을 실시했음.')).toBe('작업 전 점검을 실시하였음.');
    // "해서는 안 된다"·"해서도" 같은 관용 표현은 그대로
    expect(normalizeExamRegister('휴게 시간을 근로 시간에 포함해서는 안 된다.')).toBe('휴게 시간을 근로 시간에 포함해서는 안 된다.');
  });

  it('keeps dialogue colloquial but fixes notation everywhere', () => {
    expect(normalizeExamNotation('어제 계약서를 썼어요. 정말 힘들었어요.')).toBe('어제 계약서를 썼어요. 정말 힘들었어요.');
    expect(normalizeExamNotation('A씨는 "노조에 들지 마라"는 말과 \'확인서\'를 받았다.')).toBe('A 씨는 “노조에 들지 마라”는 말과 ‘확인서’를 받았다.');
    expect(normalizeExamNotation('2024.12.10. 상여금을 지급하였고 6월10일까지 신청한다.')).toBe('2024년 12월 10일 상여금을 지급하였고 6월 10일까지 신청한다.');
    expect(normalizeExamNotation('실업 항목 3만 6천 원, 훈련 항목 1만 8천 원, 회비 5천 원, 체불 2천만 원'))
      .toBe('실업 항목 36,000원, 훈련 항목 18,000원, 회비 5,000원, 체불 2천만 원');
    expect(normalizeExamNotation('아저씨와 ○○씨')).toBe('아저씨와 ○○ 씨');
  });
});
