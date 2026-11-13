export const meta = {
  name: 'exam-generate',
  description: 'exam-question-generator: run write → check → blind review → judge/repair for every planned item until accepted or failed',
  whenToUse: 'After `exam plan` created a work folder: pass {work, items} to write and review all items without the main session handling each notification.',
  phases: [
    { title: 'Write', detail: 'exam-writer per item: brief → candidate → check' },
    { title: 'Review', detail: 'exam-reviewer: blind review (per item, or batched)' },
    { title: 'Judge', detail: 'exam-writer: run review judgement, repair/replan/refill when rejected' },
  ],
}

// args: {
//   work: './exam-work/<name>'            (required; plan already created by `exam plan`)
//   items: [1, 2, ...]                     (required; plan ordinals to run — usually 1..count)
//   mode: 'batched' | 'pipeline'          (default 'batched': reviewers take several items — review tokens ~42k → ~9k per item;
//                                           'pipeline': fastest wall-clock, one reviewer per item)
//   reviewBatch: 4                         (batched mode: items per reviewer)
//   reviewerModel: 'sonnet'                (optional; not recommended — caught 1/3 real defects vs 3/3 on the session model)
//   maxRounds: 6                           (review rounds per item, refills included)
//   agentTypes: true                       (false: the session has not loaded .claude/agents yet — restart needed —
//                                           so use the default subagent and make it read the rule file instead)
// }
const work = args.work
const items = args.items
const mode = args.mode || 'batched'
const reviewBatch = args.reviewBatch || 4
const maxRounds = args.maxRounds || 6
const reviewerOpts = args.reviewerModel ? { model: args.reviewerModel } : {}
const CLI = 'node .claude/skills/exam-question-generator/scripts/exam.cjs'
const pad = (n) => String(n).padStart(2, '0')
const useTypes = args.agentTypes !== false
const rules = (name) => (useTypes ? '' : `먼저 .claude/agents/${name}.md의 본문(frontmatter 아래) 규칙을 읽고 그대로 따르라.${name === 'exam-reviewer' ? ' Read·Write 도구만 쓰고 셸 명령은 쓰지 마라.' : ''}\n`)
const typed = (name) => (useTypes ? { agentType: name } : {})

const STATUS = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['accepted', 'awaiting_review', 'failed'] },
    note: { type: 'string' },
  },
  required: ['status', 'note'],
}

const writePrompt = (n) =>
  `작업 폴더 ${work}, 담당 문항 ${n}번. ${work}/items/${pad(n)}/brief.md대로 문항을 쓰고 \`${CLI} check --work ${work} --item ${n}\`을 통과시켜라.\n` +
  `check가 ✓이면 status=awaiting_review, 엔진이 3회 모두 반려해 제외하면 status=failed로 답하라. note에는 개념과 check 횟수만 쓰고 정답·진술은 쓰지 마라.`

const judgePrompt = (n) =>
  `작업 폴더 ${work}, 담당 문항 ${n}번. 블라인드 검토 결과가 ${work}/items/${pad(n)}/review.json에 있다(열어 보지 말 것).\n` +
  `1) \`${CLI} review --work ${work} --item ${n}\`을 실행하라.\n` +
  `2) "✓ ${n}번 통과"이면 아무것도 고치지 말고 status=accepted로 답하라.\n` +
  `3) 반려되어 새 brief.md가 생겼으면 그 지시서(고치기 모드면 앞 시도에서 반려 사유만, 대체 명세면 새로)대로 candidate.json을 저장하고 check를 통과시켜 status=awaiting_review로 답하라.\n` +
  `4) "제외했습니다"가 나오면 \`${CLI} refill --work ${work} --item ${n}\`을 실행하라. 다시 열렸으면 새 brief.md대로 처음부터 써서 check를 통과시키고 status=awaiting_review로, 더 열 수 없으면 status=failed로 답하라.\n` +
  `note에는 판정 결과(통과/반려 코드)와 고친 내용 요약 한 줄만 쓰고, 정답·진술은 쓰지 마라.`

const reviewPrompt = (ns) =>
  `다음 문항을 블라인드 검토하라. 문항마다 review-brief.md만 읽고 결과 JSON을 같은 폴더의 review.json에 저장하라.\n` +
  ns.map((n, i) => `${i + 1}. ${work}/items/${pad(n)}/review-brief.md → ${work}/items/${pad(n)}/review.json`).join('\n')

const write = (n) => agent(rules('exam-writer') + writePrompt(n), { label: `write ${n}`, phase: 'Write', schema: STATUS, ...typed('exam-writer') })
const judge = (n, round) => agent(rules('exam-writer') + judgePrompt(n), { label: `judge ${n} #${round}`, phase: 'Judge', schema: STATUS, ...typed('exam-writer') })
const review = (ns, label) => agent(rules('exam-reviewer') + reviewPrompt(ns), { label, phase: 'Review', ...reviewerOpts, ...typed('exam-reviewer') })

const final = {}

if (mode === 'pipeline') {
  // 문항마다 독립 사슬: 다른 문항을 기다리지 않는다(전체 시간 = 가장 느린 한 문항).
  const runItem = async (n) => {
    let state = await write(n)
    let round = 0
    while (state && state.status === 'awaiting_review' && round < maxRounds) {
      round += 1
      await review([n], `review ${n} #${round}`)
      state = await judge(n, round)
      if (state) log(`${n}번 #${round}: ${state.status} — ${state.note}`)
    }
    final[n] = { status: state ? state.status : 'error', rounds: round, note: state ? state.note : 'agent error' }
  }
  await parallel(items.map((n) => () => runItem(n)))
} else {
  // 묶음 검토: 라운드마다 검토 대기 문항을 reviewBatch개씩 한 검토자에게 맡긴다(검토자 고정 비용을 나눈다).
  const states = {}
  const first = await parallel(items.map((n) => () => write(n)))
  items.forEach((n, i) => { states[n] = first[i] ? first[i].status : 'error' })
  for (let round = 1; round <= maxRounds; round += 1) {
    const waiting = items.filter((n) => states[n] === 'awaiting_review')
    if (waiting.length === 0) break
    const groups = []
    for (let i = 0; i < waiting.length; i += reviewBatch) groups.push(waiting.slice(i, i + reviewBatch))
    await parallel(groups.map((g, gi) => () => review(g, `review r${round} g${gi + 1}`)))
    const judged = await parallel(waiting.map((n) => () => judge(n, round)))
    waiting.forEach((n, i) => {
      states[n] = judged[i] ? judged[i].status : 'error'
      if (judged[i]) log(`${n}번 r${round}: ${judged[i].status} — ${judged[i].note}`)
    })
  }
  for (const n of items) final[n] = { status: states[n] }
}

const left = items.filter((n) => final[n].status !== 'accepted')
if (left.length) log(`미완료: ${left.map((n) => `${n}(${final[n].status})`).join(', ')}`)
return { work, accepted: items.length - left.length, total: items.length, items: final }
