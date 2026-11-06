/**
 * 도식(diagram) 그림 명세: 흐름도·순서도, 작업 네트워크(PERT), 특성 요인도, 조직도·계층도,
 * 순환도, 벤 다이어그램, 관계도, 2×2 매트릭스, 가공 형태(원판 배치).
 * 도식 안 글자는 필요하며 (가)·(나) 빈칸 라벨을 쓸 수 있다. 정답에 쓰이는 계산 사실
 * (주 공정·전체 소요 시간, 원판 수·재료 이용률 등)은 엔진이 계산해 설명문에 적는다.
 */
import {
  FigureParseError,
  fmtNum,
  isRecord,
  num,
  oneOf,
  optStr,
  optStrs,
  recs,
  str,
  strs,
} from './figure-parse';

export const DIAGRAM_TYPES = ['flow', 'network', 'fishbone', 'tree', 'cycle', 'venn', 'relation', 'matrix', 'nesting'] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export type FlowStep = Readonly<{ id: string; label: string; shape: 'box' | 'decision' | 'terminal'; yesLabel?: string }>;
export type FlowLoop = Readonly<{ from: string; to: string; label?: string }>;
export type FlowDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'flow'; title?: string;
  direction: 'horizontal' | 'vertical';
  steps: readonly FlowStep[];
  loops: readonly FlowLoop[];
}>;

export type NetworkTask = Readonly<{ id: string; name: string; duration: number }>;
export type NetworkDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'network'; title?: string;
  unit: string;
  tasks: readonly NetworkTask[];
  links: readonly Readonly<{ from: string; to: string }>[];
}>;

export type FishboneDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'fishbone'; title?: string;
  effect: string;
  categories: readonly Readonly<{ name: string; causes: readonly string[] }>[];
}>;

export type TreeNode = Readonly<{ id: string; label: string; parent?: string }>;
export type TreeDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'tree'; title?: string;
  direction: 'down' | 'right';
  nodes: readonly TreeNode[];
}>;

export type CycleDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'cycle'; title?: string;
  center?: string;
  steps: readonly string[];
}>;

export type VennDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'venn'; title?: string;
  mode: 'overlap' | 'nested';
  /** overlap: [왼쪽 집합, 오른쪽 집합], nested: 바깥 → 안쪽(2~4) */
  labels: readonly string[];
  /** overlap 전용 영역 항목 */
  onlyFirst: readonly string[];
  onlySecond: readonly string[];
  both: readonly string[];
}>;

export type RelationNode = Readonly<{ id: string; label: string }>;
export type RelationLink = Readonly<{ from: string; to: string; label?: string; arrow: 'forward' | 'both' | 'none' }>;
export type RelationDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'relation'; title?: string;
  layout: 'circle' | 'hub';
  nodes: readonly RelationNode[];
  links: readonly RelationLink[];
}>;

export type MatrixAxis = Readonly<{ label: string; low: string; high: string }>;
export type MatrixDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'matrix'; title?: string;
  xAxis: MatrixAxis;
  yAxis: MatrixAxis;
  /** [왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래] */
  quadrants?: readonly string[];
  points: readonly Readonly<{ label: string; x: number; y: number }>[];
}>;

export type NestingPlan = Readonly<{ label: string; sheetWidth: number; sheetHeight: number; diameter: number; rows: readonly number[]; stagger: boolean }>;
export type NestingDiagramSpec = Readonly<{
  id: string; kind: 'diagram'; diagramType: 'nesting'; title?: string;
  unit: string;
  plans: readonly NestingPlan[];
}>;

export type DiagramSpec =
  | FlowDiagramSpec | NetworkDiagramSpec | FishboneDiagramSpec | TreeDiagramSpec | CycleDiagramSpec
  | VennDiagramSpec | RelationDiagramSpec | MatrixDiagramSpec | NestingDiagramSpec;

// ------------------------------------------------------------
// 해석
// ------------------------------------------------------------

export function parseDiagram(raw: Record<string, unknown>, id: string): DiagramSpec {
  const diagramType = oneOf(raw.diagramType, DIAGRAM_TYPES, 'diagramType');
  const title = optStr(raw.title);
  const base = { id, kind: 'diagram' as const, ...(title === undefined ? {} : { title }) };
  switch (diagramType) {
    case 'flow':
      return {
        ...base, diagramType,
        direction: oneOf(raw.direction ?? 'horizontal', ['horizontal', 'vertical'] as const, 'direction'),
        steps: recs(raw.steps, 'steps').map((step) => {
          const yesLabel = optStr(step.yesLabel);
          return {
            id: str(step.id), label: str(step.label),
            shape: oneOf(step.shape ?? 'box', ['box', 'decision', 'terminal'] as const, 'steps[].shape'),
            ...(yesLabel === undefined ? {} : { yesLabel }),
          };
        }),
        loops: raw.loops === null || raw.loops === undefined ? [] : recs(raw.loops, 'loops').map((loop) => {
          const label = optStr(loop.label);
          return { from: str(loop.from), to: str(loop.to), ...(label === undefined ? {} : { label }) };
        }),
      };
    case 'network':
      return {
        ...base, diagramType,
        unit: str(raw.unit) || '분',
        tasks: recs(raw.tasks, 'tasks').map((task) => ({ id: str(task.id), name: str(task.name), duration: num(task.duration, 'tasks[].duration') })),
        links: recs(raw.links, 'links').map((link) => ({ from: str(link.from), to: str(link.to) })),
      };
    case 'fishbone':
      return {
        ...base, diagramType,
        effect: str(raw.effect),
        categories: recs(raw.categories, 'categories').map((category) => ({ name: str(category.name), causes: strs(category.causes, 'categories[].causes') })),
      };
    case 'tree':
      return {
        ...base, diagramType,
        direction: oneOf(raw.direction ?? 'down', ['down', 'right'] as const, 'direction'),
        nodes: recs(raw.nodes, 'nodes').map((node) => {
          const parent = optStr(node.parent);
          return { id: str(node.id), label: str(node.label), ...(parent === undefined ? {} : { parent }) };
        }),
      };
    case 'cycle': {
      const center = optStr(raw.center);
      return { ...base, diagramType, ...(center === undefined ? {} : { center }), steps: strs(raw.steps, 'steps') };
    }
    case 'venn':
      return {
        ...base, diagramType,
        mode: oneOf(raw.mode ?? 'overlap', ['overlap', 'nested'] as const, 'mode'),
        labels: strs(raw.labels, 'labels'),
        onlyFirst: optStrs(raw.onlyFirst, 'onlyFirst') ?? [],
        onlySecond: optStrs(raw.onlySecond, 'onlySecond') ?? [],
        both: optStrs(raw.both, 'both') ?? [],
      };
    case 'relation':
      return {
        ...base, diagramType,
        layout: oneOf(raw.layout ?? 'circle', ['circle', 'hub'] as const, 'layout'),
        nodes: recs(raw.nodes, 'nodes').map((node) => ({ id: str(node.id), label: str(node.label) })),
        links: recs(raw.links, 'links').map((link) => {
          const label = optStr(link.label);
          return {
            from: str(link.from), to: str(link.to), ...(label === undefined ? {} : { label }),
            arrow: oneOf(link.arrow ?? 'forward', ['forward', 'both', 'none'] as const, 'links[].arrow'),
          };
        }),
      };
    case 'matrix': {
      const axis = (value: unknown, what: string): MatrixAxis => {
        if (!isRecord(value)) throw new FigureParseError(`${what}는 {label, low, high} 객체여야 합니다.`);
        return { label: str(value.label), low: str(value.low), high: str(value.high) };
      };
      const quadrants = optStrs(raw.quadrants, 'quadrants');
      return {
        ...base, diagramType,
        xAxis: axis(raw.xAxis, 'xAxis'),
        yAxis: axis(raw.yAxis, 'yAxis'),
        ...(quadrants === undefined ? {} : { quadrants }),
        points: raw.points === null || raw.points === undefined ? [] : recs(raw.points, 'points').map((point) => ({
          label: str(point.label), x: num(point.x, 'points[].x'), y: num(point.y, 'points[].y'),
        })),
      };
    }
    case 'nesting':
      return {
        ...base, diagramType,
        unit: str(raw.unit) || 'cm',
        plans: recs(raw.plans, 'plans').map((plan) => ({
          label: str(plan.label),
          sheetWidth: num(plan.sheetWidth, 'plans[].sheetWidth'),
          sheetHeight: num(plan.sheetHeight, 'plans[].sheetHeight'),
          diameter: num(plan.diameter, 'plans[].diameter'),
          rows: (Array.isArray(plan.rows) ? plan.rows : []).map((count) => num(count, 'plans[].rows[]')),
          stagger: plan.stagger === true,
        })),
      };
  }
}

// ------------------------------------------------------------
// 검증
// ------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9_-]{1,12}$/u;

function labels(problems: string[], id: string, values: readonly string[], what: string, max: number): void {
  for (const value of values) {
    if (value.length < 1 || value.length > max) problems.push(`${id}: ${what} "${value}"은(는) 1~${max}자여야 합니다.`);
  }
}

function ids(problems: string[], id: string, values: readonly string[], what: string): void {
  if (values.some((value) => !ID_PATTERN.test(value))) problems.push(`${id}: ${what} id는 영문·숫자 1~12자여야 합니다.`);
  if (new Set(values).size !== values.length) problems.push(`${id}: ${what} id가 중복됩니다.`);
}

export function validateDiagram(spec: DiagramSpec): string[] {
  const problems: string[] = [];
  const at = (message: string) => problems.push(`${spec.id}: ${message}`);
  if (spec.title !== undefined && spec.title.length > 40) at('title은 40자 이하여야 합니다.');
  switch (spec.diagramType) {
    case 'flow': {
      const max = spec.direction === 'horizontal' ? 6 : 8;
      if (spec.steps.length < 2 || spec.steps.length > max) at(`${spec.direction === 'horizontal' ? '가로' : '세로'} 흐름도의 단계는 2~${max}개여야 합니다(현재 ${spec.steps.length}개).`);
      ids(problems, spec.id, spec.steps.map((step) => step.id), '단계');
      labels(problems, spec.id, spec.steps.map((step) => step.label), '단계 글', 40);
      const stepIds = new Set(spec.steps.map((step) => step.id));
      for (const loop of spec.loops) {
        if (!stepIds.has(loop.from) || !stepIds.has(loop.to)) at(`되돌림 화살표 ${loop.from}→${loop.to}가 없는 단계를 가리킵니다.`);
        if (loop.from === loop.to) at('되돌림 화살표는 다른 단계로 가야 합니다.');
        if (loop.label !== undefined && loop.label.length > 10) at('되돌림 화살표 글은 10자 이하여야 합니다.');
      }
      if (spec.loops.length > 3) at('되돌림 화살표는 3개 이하여야 합니다.');
      for (const step of spec.steps) {
        if (step.shape === 'decision' && !spec.loops.some((loop) => loop.from === step.id)) {
          at(`판단 단계 "${step.label}"에서 나가는 다른 갈래(loops)가 없습니다.`);
        }
        if (step.yesLabel !== undefined && step.yesLabel.length > 6) at('yesLabel은 6자 이하여야 합니다.');
      }
      break;
    }
    case 'network': {
      if (spec.tasks.length < 3 || spec.tasks.length > 10) at(`작업은 3~10개여야 합니다(현재 ${spec.tasks.length}개).`);
      ids(problems, spec.id, spec.tasks.map((task) => task.id), '작업');
      labels(problems, spec.id, spec.tasks.map((task) => task.name), '작업 이름', 8);
      if (new Set(spec.tasks.map((task) => task.name)).size !== spec.tasks.length) at('작업 이름이 중복됩니다.');
      if (spec.tasks.some((task) => !(task.duration > 0) || task.duration > 999)) at('작업 시간은 0보다 크고 999 이하여야 합니다.');
      if (spec.unit.length > 4) at('unit은 4자 이하여야 합니다.');
      const taskIds = new Set(spec.tasks.map((task) => task.id));
      const seen = new Set<string>();
      for (const link of spec.links) {
        if (!taskIds.has(link.from) || !taskIds.has(link.to)) at(`화살표 ${link.from}→${link.to}가 없는 작업을 가리킵니다.`);
        if (link.from === link.to) at('작업이 자기 자신을 가리킵니다.');
        if (seen.has(`${link.from}>${link.to}`)) at(`화살표 ${link.from}→${link.to}가 중복됩니다.`);
        seen.add(`${link.from}>${link.to}`);
      }
      if (problems.length === 0) {
        const order = topologicalOrder(spec);
        if (order === null) at('선후 관계에 순환이 있습니다(되돌아오는 화살표 금지).');
        else if (!isConnected(spec)) at('모든 작업이 화살표로 하나의 네트워크에 이어져야 합니다.');
      }
      break;
    }
    case 'fishbone':
      labels(problems, spec.id, [spec.effect], '특성(결과)', 12);
      if (spec.categories.length < 2 || spec.categories.length > 6) at('요인(큰 가지)은 2~6개여야 합니다.');
      labels(problems, spec.id, spec.categories.map((category) => category.name), '요인', 8);
      for (const category of spec.categories) {
        if (category.causes.length < 1 || category.causes.length > 3) at(`요인 "${category.name}"의 세부 원인은 1~3개여야 합니다.`);
        labels(problems, spec.id, category.causes, '세부 원인', 16);
      }
      break;
    case 'tree': {
      if (spec.nodes.length < 3 || spec.nodes.length > 20) at(`노드는 3~20개여야 합니다(현재 ${spec.nodes.length}개).`);
      ids(problems, spec.id, spec.nodes.map((node) => node.id), '노드');
      labels(problems, spec.id, spec.nodes.map((node) => node.label), '노드 글', 16);
      const roots = spec.nodes.filter((node) => node.parent === undefined);
      if (roots.length !== 1) at(`뿌리(parent 없음)는 정확히 1개여야 합니다(현재 ${roots.length}개).`);
      const nodeIds = new Set(spec.nodes.map((node) => node.id));
      if (spec.nodes.some((node) => node.parent !== undefined && !nodeIds.has(node.parent))) at('없는 parent를 가리키는 노드가 있습니다.');
      if (problems.length === 0) {
        const depth = treeDepths(spec);
        if (depth === null) at('parent 관계에 순환이 있습니다.');
        else if (Math.max(...depth.values()) > 3) at('깊이는 4단계(뿌리 포함) 이하여야 합니다.');
        const children = new Map<string, number>();
        for (const node of spec.nodes) if (node.parent !== undefined) children.set(node.parent, (children.get(node.parent) ?? 0) + 1);
        if ([...children.values()].some((count) => count > 6)) at('한 노드의 자식은 6개 이하여야 합니다.');
        const perLevel = new Map<number, number>();
        for (const level of (depth ?? new Map<string, number>()).values()) perLevel.set(level, (perLevel.get(level) ?? 0) + 1);
        const widest = Math.max(0, ...perLevel.values());
        if (spec.direction === 'down' && widest > 8) at('한 층에 노드가 8개를 넘으면 direction "right"를 쓰십시오.');
      }
      break;
    }
    case 'cycle':
      if (spec.steps.length < 3 || spec.steps.length > 8) at('순환 단계는 3~8개여야 합니다.');
      labels(problems, spec.id, spec.steps, '단계 글', 16);
      if (spec.center !== undefined && spec.center.length > 14) at('center는 14자 이하여야 합니다.');
      break;
    case 'venn':
      if (spec.mode === 'overlap') {
        if (spec.labels.length !== 2) at('겹침(overlap) 벤 다이어그램은 집합 2개여야 합니다.');
        for (const [name, items] of [['onlyFirst', spec.onlyFirst], ['onlySecond', spec.onlySecond], ['both', spec.both]] as const) {
          if (items.length > 4) at(`${name} 항목은 4개 이하여야 합니다.`);
          labels(problems, spec.id, items, `${name} 항목`, 30);
        }
      } else {
        if (spec.labels.length < 2 || spec.labels.length > 4) at('포함(nested) 도식은 2~4겹이어야 합니다.');
        if (spec.onlyFirst.length + spec.onlySecond.length + spec.both.length > 0) at('포함 도식에는 영역 항목을 쓰지 않습니다(labels만).');
      }
      labels(problems, spec.id, spec.labels, '집합 이름', 14);
      break;
    case 'relation': {
      if (spec.nodes.length < 2 || spec.nodes.length > 6) at('노드는 2~6개여야 합니다.');
      if (spec.layout === 'hub' && spec.nodes.length < 3) at('hub 배치는 가운데 1개 + 주변 2개 이상이어야 합니다.');
      ids(problems, spec.id, spec.nodes.map((node) => node.id), '노드');
      labels(problems, spec.id, spec.nodes.map((node) => node.label), '노드 글', spec.layout === 'hub' ? 40 : 16);
      const nodeIds = new Set(spec.nodes.map((node) => node.id));
      if (spec.links.length < 1 || spec.links.length > 10) at('연결은 1~10개여야 합니다.');
      for (const link of spec.links) {
        if (!nodeIds.has(link.from) || !nodeIds.has(link.to) || link.from === link.to) at(`연결 ${link.from}→${link.to}가 잘못되었습니다.`);
        if (link.label !== undefined && link.label.length > 14) at('연결 글은 14자 이하여야 합니다.');
      }
      const pairs = spec.links.map((link) => `${link.from}>${link.to}`);
      if (new Set(pairs).size !== pairs.length) at('같은 방향 연결이 중복됩니다.');
      break;
    }
    case 'matrix':
      for (const [name, axis] of [['xAxis', spec.xAxis], ['yAxis', spec.yAxis]] as const) {
        labels(problems, spec.id, [axis.label], `${name}.label`, 14);
        labels(problems, spec.id, [axis.low, axis.high], `${name} 양 끝 글`, 10);
      }
      if (spec.quadrants !== undefined && spec.quadrants.length !== 4) at('quadrants는 4개(왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래)여야 합니다.');
      labels(problems, spec.id, spec.quadrants ?? [], '사분면 이름', 14);
      if (spec.points.length > 6) at('점은 6개 이하여야 합니다.');
      labels(problems, spec.id, spec.points.map((point) => point.label), '점 이름', 8);
      if (spec.points.some((point) => point.x < 0 || point.x > 10 || point.y < 0 || point.y > 10)) at('점 좌표는 0~10이어야 합니다.');
      if (spec.points.some((point) => point.x === 5 || point.y === 5)) at('점은 사분면 경계(5) 위에 놓지 마십시오.');
      if ((spec.quadrants?.length ?? 0) === 0 && spec.points.length === 0) at('quadrants나 points 중 하나는 있어야 합니다.');
      break;
    case 'nesting':
      if (spec.plans.length < 1 || spec.plans.length > 2) at('배치안은 1~2개여야 합니다.');
      labels(problems, spec.id, spec.plans.map((plan) => plan.label), '배치안 이름', 10);
      for (const plan of spec.plans) {
        const fit = nestingFit(plan);
        if (!(plan.sheetWidth > 0 && plan.sheetHeight > 0 && plan.diameter > 0)) at(`${plan.label}: 판 크기와 지름은 0보다 커야 합니다.`);
        else if (plan.rows.length < 1 || plan.rows.length > 8 || plan.rows.some((count) => !Number.isInteger(count) || count < 1 || count > 12)) {
          at(`${plan.label}: rows는 1~8줄, 줄마다 1~12개 정수여야 합니다.`);
        } else if (fit !== null) at(`${plan.label}: ${fit}`);
      }
      break;
  }
  return problems;
}

// ------------------------------------------------------------
// 계산
// ------------------------------------------------------------

function topologicalOrder(spec: NetworkDiagramSpec): string[] | null {
  const incoming = new Map(spec.tasks.map((task) => [task.id, 0]));
  for (const link of spec.links) incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1);
  const queue = spec.tasks.filter((task) => incoming.get(task.id) === 0).map((task) => task.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const link of spec.links.filter((entry) => entry.from === id)) {
      const left = (incoming.get(link.to) ?? 0) - 1;
      incoming.set(link.to, left);
      if (left === 0) queue.push(link.to);
    }
  }
  return order.length === spec.tasks.length ? order : null;
}

function isConnected(spec: NetworkDiagramSpec): boolean {
  if (spec.tasks.length === 0) return true;
  const seen = new Set<string>([spec.tasks[0].id]);
  const stack = [spec.tasks[0].id];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const link of spec.links) {
      const next = link.from === id ? link.to : link.to === id ? link.from : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size === spec.tasks.length;
}

export type NetworkSchedule = Readonly<{
  /** 작업별 가장 이른 시작·끝, 가장 늦은 시작, 여유 시간 */
  tasks: readonly Readonly<{ id: string; name: string; duration: number; es: number; ef: number; ls: number; slack: number; level: number }>[];
  duration: number;
  criticalPaths: readonly (readonly string[])[];
}>;

/** 주 공정(CPM): 전진·후진 계산으로 여유 시간 0인 경로와 전체 소요 시간을 구한다. 순환이면 null. */
export function networkSchedule(spec: NetworkDiagramSpec): NetworkSchedule | null {
  const order = topologicalOrder(spec);
  if (order === null) return null;
  const byId = new Map(spec.tasks.map((task) => [task.id, task]));
  const preds = (id: string) => spec.links.filter((link) => link.to === id).map((link) => link.from);
  const succs = (id: string) => spec.links.filter((link) => link.from === id).map((link) => link.to);
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const level = new Map<string, number>();
  for (const id of order) {
    const start = Math.max(0, ...preds(id).map((pred) => ef.get(pred) ?? 0));
    es.set(id, start);
    ef.set(id, start + (byId.get(id)?.duration ?? 0));
    level.set(id, Math.max(-1, ...preds(id).map((pred) => level.get(pred) ?? 0)) + 1);
  }
  const duration = Math.max(...[...ef.values()]);
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const finish = Math.min(duration, ...succs(id).map((succ) => ls.get(succ) ?? duration));
    lf.set(id, finish);
    ls.set(id, finish - (byId.get(id)?.duration ?? 0));
  }
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const tasks = order.map((id) => ({
    id,
    name: byId.get(id)!.name,
    duration: byId.get(id)!.duration,
    es: round(es.get(id)!),
    ef: round(ef.get(id)!),
    ls: round(ls.get(id)!),
    slack: round(ls.get(id)! - es.get(id)!),
    level: level.get(id)!,
  }));
  const critical = new Set(tasks.filter((task) => Math.abs(task.slack) < 1e-9).map((task) => task.id));
  const paths: string[][] = [];
  const walk = (id: string, path: string[]) => {
    const next = succs(id).filter((succ) => critical.has(succ) && Math.abs((es.get(succ) ?? 0) - (ef.get(id) ?? 0)) < 1e-9);
    if (next.length === 0) {
      if (Math.abs((ef.get(id) ?? 0) - duration) < 1e-9) paths.push(path);
      return;
    }
    for (const succ of next) walk(succ, [...path, succ]);
  };
  for (const id of order.filter((entry) => critical.has(entry) && preds(entry).length === 0 && (es.get(entry) ?? 0) === 0)) walk(id, [id]);
  return { tasks, duration: round(duration), criticalPaths: paths };
}

/** 트리 깊이(뿌리 0). 순환이면 null */
export function treeDepths(spec: TreeDiagramSpec): Map<string, number> | null {
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();
  for (const node of spec.nodes) {
    let depth = 0;
    let cursor: TreeNode | undefined = node;
    const seen = new Set<string>();
    while (cursor?.parent !== undefined) {
      if (seen.has(cursor.id)) return null;
      seen.add(cursor.id);
      cursor = byId.get(cursor.parent);
      depth += 1;
      if (depth > spec.nodes.length) return null;
    }
    depths.set(node.id, depth);
  }
  return depths;
}

/** 원판 배치가 판 안에 들어가는지. 들어가면 null, 아니면 사유 */
export function nestingFit(plan: NestingPlan): string | null {
  const pitch = plan.stagger ? (plan.diameter * Math.sqrt(3)) / 2 : plan.diameter;
  const height = plan.diameter + pitch * (plan.rows.length - 1);
  if (height > plan.sheetHeight + 1e-9) return `원판 ${plan.rows.length}줄의 높이 ${fmtNum(height)}이(가) 판 세로 ${fmtNum(plan.sheetHeight)}을(를) 넘습니다.`;
  for (const [index, count] of plan.rows.entries()) {
    const offset = plan.stagger && index % 2 === 1 ? plan.diameter / 2 : 0;
    const width = offset + count * plan.diameter;
    if (width > plan.sheetWidth + 1e-9) return `${index + 1}번째 줄 ${count}개의 폭 ${fmtNum(width)}이(가) 판 가로 ${fmtNum(plan.sheetWidth)}을(를) 넘습니다.`;
  }
  return null;
}

export function nestingFacts(plan: NestingPlan): { count: number; utilization: number } {
  const count = plan.rows.reduce((sum, value) => sum + value, 0);
  const utilization = (count * 3.14 * (plan.diameter / 2) ** 2) / (plan.sheetWidth * plan.sheetHeight);
  return { count, utilization: Math.round(utilization * 1000) / 10 };
}

/** 매트릭스 점의 사분면 */
export function quadrantOf(point: Readonly<{ x: number; y: number }>): 0 | 1 | 2 | 3 {
  if (point.y > 5) return point.x < 5 ? 0 : 1;
  return point.x < 5 ? 2 : 3;
}

const QUADRANT_NAMES = ['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래'] as const;

// ------------------------------------------------------------
// 설명문(alt)
// ------------------------------------------------------------

export function diagramAlt(spec: DiagramSpec): string {
  const title = spec.title === undefined ? '' : ` 제목 ‘${spec.title}’.`;
  switch (spec.diagramType) {
    case 'flow': {
      const byId = new Map(spec.steps.map((step) => [step.id, step]));
      const name = (step: FlowStep | undefined) => (step === undefined ? '?' : step.shape === 'decision' ? `◇‘${step.label}’` : `[${step.label}]`);
      const main = spec.steps.map((step, index) => {
        const arrow = index === spec.steps.length - 1 ? '' : step.shape === 'decision' && step.yesLabel !== undefined ? ` →(${step.yesLabel}) ` : ' → ';
        return `${name(step)}${arrow}`;
      }).join('');
      const loops = spec.loops.map((loop) => `${name(byId.get(loop.from))}에서${loop.label === undefined ? '' : ` ‘${loop.label}’이면`} ${name(byId.get(loop.to))}(으)로 가는 화살표`);
      return [
        `${spec.steps.some((step) => step.shape === 'decision') ? '순서도' : '흐름도'}(${spec.direction === 'horizontal' ? '왼쪽에서 오른쪽' : '위에서 아래'}).${title}`,
        `${main}.`,
        loops.length === 0 ? '' : `${loops.join('; ')}.`,
      ].filter(Boolean).join(' ');
    }
    case 'network': {
      const schedule = networkSchedule(spec);
      const byId = new Map(spec.tasks.map((task) => [task.id, task.name]));
      const parts = [
        `작업 네트워크 도표(퍼트, 원 위쪽 작업명·아래쪽 작업 시간(${spec.unit}), 화살표는 선후 관계).${title}`,
        `작업 시간: ${spec.tasks.map((task) => `${task.name} ${fmtNum(task.duration)}${spec.unit}`).join(', ')}.`,
        `선후 관계: ${spec.links.map((link) => `${byId.get(link.from)}→${byId.get(link.to)}`).join(', ')}.`,
      ];
      if (schedule !== null) {
        parts.push(`[엔진 계산] 주 공정(가장 긴 경로): ${schedule.criticalPaths.map((path) => path.map((id) => byId.get(id)).join('→')).join(' / ')}, 전체 작업 완료 최소 ${fmtNum(schedule.duration)}${spec.unit}.`);
        const slack = schedule.tasks.filter((task) => task.slack > 0);
        parts.push(slack.length === 0 ? '여유 시간이 있는 작업 없음.' : `여유 시간: ${slack.map((task) => `${task.name} ${fmtNum(task.slack)}${spec.unit}`).join(', ')}.`);
        parts.push(`가장 이른 시작 시각: ${schedule.tasks.map((task) => `${task.name} ${fmtNum(task.es)}`).join(', ')}.`);
      }
      return parts.join(' ');
    }
    case 'fishbone':
      return `특성 요인도(생선뼈 도표).${title} 머리(결과·특성): ‘${spec.effect}’. 큰 가지(요인)와 세부 원인: ${spec.categories.map((category) => `‘${category.name}’ - ${category.causes.map((cause) => `‘${cause}’`).join(', ')}`).join('; ')}.`;
    case 'tree': {
      const children = (id: string) => spec.nodes.filter((node) => node.parent === id);
      const describe = (node: TreeNode): string => {
        const kids = children(node.id);
        return kids.length === 0 ? `‘${node.label}’` : `‘${node.label}’ 아래 [${kids.map(describe).join(', ')}]`;
      };
      const root = spec.nodes.find((node) => node.parent === undefined);
      return `${spec.direction === 'down' ? '위에서 아래로' : '왼쪽에서 오른쪽으로'} 갈라지는 계층도(조직도·분류 트리).${title} ${root === undefined ? '' : describe(root)}.`;
    }
    case 'cycle':
      return `순환 도식(시계 방향 화살표).${title}${spec.center === undefined ? '' : ` 가운데: ‘${spec.center}’.`} ${spec.steps.map((step) => `‘${step}’`).join(' → ')} → 다시 ‘${spec.steps[0]}’.`;
    case 'venn':
      return spec.mode === 'overlap'
        ? `벤 다이어그램(두 원이 겹침).${title} 왼쪽 원 ‘${spec.labels[0]}’에만: ${list(spec.onlyFirst)}. 오른쪽 원 ‘${spec.labels[1]}’에만: ${list(spec.onlySecond)}. 두 원의 겹친 부분(공통): ${list(spec.both)}.`
        : `포함 관계 도식(겹겹이 안으로 들어가는 타원).${title} 바깥부터 ${spec.labels.map((label) => `‘${label}’`).join(' ⊃ ')} 순으로 안쪽이 바깥에 포함됨.`;
    case 'relation': {
      const byId = new Map(spec.nodes.map((node) => [node.id, node.label]));
      const arrow = (link: RelationLink) => (link.arrow === 'both' ? '↔' : link.arrow === 'none' ? '—' : '→');
      return [
        `${spec.layout === 'hub' ? `가운데 ‘${spec.nodes[0]?.label ?? ''}’을(를) 중심으로 연결된 관계도` : '관계도'}.${title}`,
        `${spec.layout === 'hub' ? '주변' : '구성'}: ${(spec.layout === 'hub' ? spec.nodes.slice(1) : spec.nodes).map((node) => `‘${node.label}’`).join(', ')}.`,
        `연결: ${spec.links.map((link) => `‘${byId.get(link.from)}’ ${arrow(link)} ‘${byId.get(link.to)}’${link.label === undefined ? '' : `(${link.label})`}`).join(', ')}.`,
      ].join(' ');
    }
    case 'matrix': {
      const quadrants = spec.quadrants ?? [];
      return [
        `2×2 매트릭스(포지셔닝 맵).${title} 가로축 ‘${spec.xAxis.label}’(왼쪽 ${spec.xAxis.low} → 오른쪽 ${spec.xAxis.high}), 세로축 ‘${spec.yAxis.label}’(아래 ${spec.yAxis.low} → 위 ${spec.yAxis.high}).`,
        quadrants.length === 4 ? `사분면: ${QUADRANT_NAMES.map((name, index) => `${name} ‘${quadrants[index]}’`).join(', ')}.` : '',
        spec.points.length === 0 ? '' : `점(0～10 척도) [엔진 계산: 속한 사분면]: ${spec.points.map((point) => {
          const quadrant = quadrantOf(point);
          return `${point.label}(${fmtNum(point.x)}, ${fmtNum(point.y)}) → ${QUADRANT_NAMES[quadrant]}${quadrants.length === 4 ? ` ‘${quadrants[quadrant]}’` : ''}`;
        }).join(', ')}.`,
      ].filter(Boolean).join(' ');
    }
    case 'nesting':
      return `가공 형태(직사각형 판에서 같은 크기 원판을 따내는 배치).${title} ${spec.plans.map((plan) => {
        const facts = nestingFacts(plan);
        return `${plan.label}: 판 가로 ${fmtNum(plan.sheetWidth)}${spec.unit}×세로 ${fmtNum(plan.sheetHeight)}${spec.unit}, 원판 지름 ${fmtNum(plan.diameter)}${spec.unit}, ${plan.stagger ? '엇갈린' : '가지런한'} ${plan.rows.length}줄(${plan.rows.join('-')}개), [엔진 계산] 원판 ${facts.count}개, 재료 이용률 약 ${fmtNum(facts.utilization)}%(원판 넓이 합÷판 넓이, π≈3.14)`;
      }).join('. ')}.`;
  }
}

function list(items: readonly string[]): string {
  return items.length === 0 ? '(비어 있음)' : items.map((item) => `‘${item}’`).join(', ');
}
