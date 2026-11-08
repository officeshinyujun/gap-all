/**
 * 스킬 CLI(exam.cjs)의 고치기 모드·status 다음 열. 빌드된 엔진(scripts/engine)을 쓰므로 `npm run build:skill` 뒤 상태를 검사한다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = join(__dirname, '..', '..', '..', '..', '..', '.claude', 'skills', 'exam-question-generator', 'scripts', 'exam.cjs');

const run = (args: string[]) => {
  try {
    return execFileSync('node', [cli, ...args], { encoding: 'utf8' });
  } catch (error) {
    // check·review 반려는 exitCode 2로 끝난다
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    if (failed.status === 2) return failed.stdout ?? '';
    throw new Error(`${failed.stdout ?? ''}${failed.stderr ?? ''}`);
  }
};

describe('exam.cjs repair mode', () => {
  let work: string;
  const planFile = () => join(work, 'plan.json');
  const item = () => JSON.parse(readFileSync(planFile(), 'utf8')).items[0];
  const itemDir = () => join(work, 'items', '01');
  const setItem = (patch: Record<string, unknown>) => {
    const plan = JSON.parse(readFileSync(planFile(), 'utf8'));
    Object.assign(plan.items[0], patch);
    writeFileSync(planFile(), JSON.stringify(plan));
  };
  const review = (overrides: Record<string, unknown>) => JSON.stringify({
    reasoning: 'r', answerIndex: item().spec.answerIndex, ambiguity: 'none', curriculumIssues: [], answerGivenAway: false,
    perceivedDifficulty: 'hard', trivialStatements: [], dataFreeStatements: [], ...overrides,
  });
  const awaitReview = (attempt: number) => {
    setItem({ status: 'awaiting_review', attempt });
    writeFileSync(join(itemDir(), `candidate.attempt${attempt}.json`), '{}');
    writeFileSync(join(itemDir(), 'review-brief.md'), '# review');
  };

  beforeEach(() => {
    if (!existsSync(join(cli, '..', 'engine', 'exams', 'generative', 'skill', 'skill-engine.js'))) throw new Error('먼저 npm run build:skill');
    work = mkdtempSync(join(tmpdir(), 'exam-cli-'));
    run(['plan', '--work', work, '--subject', 'success', '--units', '1', '--count', '1', '--difficulty', 'HIGH', '--seed', 'cli-test', '--force']);
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('repairs the same spec after a failed check and points the brief at the previous attempt', () => {
    const specId = item().spec.id;
    writeFileSync(join(itemDir(), 'candidate.json'), '{"stem":"x"}');
    expect(run(['check', '--work', work, '--item', '1'])).toContain('같은 명세 — 앞 시도 문항을 고치기');
    expect(item()).toMatchObject({ attempt: 2, status: 'writing', replanned: false });
    expect(item().spec.id).toBe(specId);
    const brief = readFileSync(join(itemDir(), 'brief.md'), 'utf8');
    expect(brief).toContain('## 고치기 모드');
    expect(brief).toContain('candidate.attempt1.json');
    expect(brief).toContain('## 제출 전 자기 점검');
    const status = JSON.parse(run(['status', '--work', work, '--json']));
    expect(status.items[0]).toMatchObject({ action: 'repair', status: 'writing' });
  });

  it('repairs on a read-only-statement rejection and replans on an answer mismatch', () => {
    const specId = item().spec.id;
    awaitReview(1);
    expect(JSON.parse(run(['status', '--work', work, '--json'])).items[0].action).toBe('review');
    writeFileSync(join(itemDir(), 'review.json'), review({ trivialStatements: ['ㄱ'] }));
    expect(JSON.parse(run(['status', '--work', work, '--json'])).items[0].action).toBe('judge');
    expect(run(['review', '--work', work, '--item', '1'])).toContain('같은 명세 — 고치기');
    expect(item().spec.id).toBe(specId);
    expect(readFileSync(join(itemDir(), 'brief.md'), 'utf8')).toContain('## 고치기 모드');

    awaitReview(1);
    writeFileSync(join(itemDir(), 'review.json'), review({ answerIndex: (item().spec.answerIndex % 5) + 1 }));
    expect(run(['review', '--work', work, '--item', '1'])).toContain('대체 명세 — 새로 쓰기');
    expect(item().spec.id).not.toBe(specId);
    expect(item().repairNotes[0]).toContain('[앞 명세(다른 개념)에서 반려된 사유');
    expect(readFileSync(join(itemDir(), 'brief.md'), 'utf8')).not.toContain('## 고치기 모드');
    expect(JSON.parse(run(['status', '--work', work, '--json'])).items[0].action).toBe('write');
  });

  it('clears repair mode when a failed slot is refilled', () => {
    awaitReview(3);
    writeFileSync(join(itemDir(), 'review.json'), review({ trivialStatements: ['ㄱ'] }));
    expect(run(['review', '--work', work, '--item', '1'])).toContain('최대 시도 횟수');
    expect(JSON.parse(run(['status', '--work', work, '--json'])).items[0].action).toBe('refill');
    setItem({ repairFrom: join(itemDir(), 'candidate.attempt3.json') });
    run(['refill', '--work', work]);
    expect(item().repairFrom).toBeUndefined();
    expect(readFileSync(join(itemDir(), 'brief.md'), 'utf8')).not.toContain('## 고치기 모드');
  });
});
