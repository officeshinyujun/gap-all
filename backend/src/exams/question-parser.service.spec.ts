import { parseOfficialAnswerKeyText } from './question-parser.service';

describe('parseOfficialAnswerKeyText', () => {
  it('extracts every question from a multi-column evaluation-service answer table', () => {
    const answers = parseOfficialAnswerKeyText(
      '1 ② 2 6 ④ 3 11 ① 2 16 ③ 2\n2 ④ 2 7 ② 3 12 ② 2 17 ② 2',
    );

    expect([...answers.entries()]).toEqual([
      [1, 2],
      [6, 4],
      [11, 1],
      [16, 3],
      [2, 4],
      [7, 2],
      [12, 2],
      [17, 2],
    ]);
  });

  it('retains support for a compact one-answer-per-line key', () => {
    expect([...parseOfficialAnswerKeyText('1. ③\n2 ⑤').entries()]).toEqual([
      [1, 3],
      [2, 5],
    ]);
  });
});
