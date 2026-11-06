"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIAGRAM_SHAPE_LABELS = void 0;
exports.figureTypeSchema = figureTypeSchema;
exports.figureTypeInstructions = figureTypeInstructions;
/**
 * 간트·관리도·산점도·곡선 그래프와 도식 9종의 출제 지시와 strict JSON 스키마.
 * 출제 명세의 figureType에 맞는 절·스키마만 지시서에 넣는다.
 */
const figure_chart_ext_1 = require("./figure-chart-ext");
const STRING = { type: 'string' };
const NUMBER = { type: 'number' };
const INTEGER = { type: 'integer' };
const NULL_STRING = { type: ['string', 'null'] };
const NULL_NUMBER = { type: ['number', 'null'] };
const strings = (minItems, maxItems) => ({ type: 'array', items: STRING, minItems, maxItems });
function obj(properties) {
    return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}
function head(kind, type) {
    return kind === 'chart'
        ? { id: { type: 'string', enum: ['F1'] }, kind: { type: 'string', enum: ['chart'] }, chartType: { type: 'string', enum: [type] }, title: NULL_STRING }
        : { id: { type: 'string', enum: ['F1'] }, kind: { type: 'string', enum: ['diagram'] }, diagramType: { type: 'string', enum: [type] }, title: NULL_STRING };
}
/** figureType별 그림 명세 스키마(strict: 선택 필드는 null 허용) */
function figureTypeSchema(type) {
    switch (type) {
        case 'gantt':
            return obj({
                ...head('chart', type),
                periodLabel: STRING, unit: STRING, start: INTEGER, end: INTEGER, statusDay: { type: ['integer', 'null'] },
                tasks: { type: 'array', minItems: 1, maxItems: 6, items: obj({ name: STRING, plannedStart: INTEGER, plannedEnd: INTEGER, doneUntil: { type: ['integer', 'null'] } }) },
            });
        case 'control':
            return obj({ ...head('chart', type), xLabel: STRING, yLabel: STRING, values: { type: 'array', items: NUMBER, minItems: 8, maxItems: 30 }, center: NUMBER, upper: NUMBER, lower: NUMBER });
        case 'scatter':
            return obj({
                ...head('chart', type), points: INTEGER,
                panels: { type: 'array', minItems: 1, maxItems: 2, items: obj({ title: NULL_STRING, xLabel: STRING, yLabel: STRING, correlation: { type: 'string', enum: [...figure_chart_ext_1.CORRELATIONS] } }) },
            });
        case 'curve':
            return obj({
                ...head('chart', type), xLabel: STRING, yLabel: STRING,
                preset: { type: ['string', 'null'], enum: ['lifecycle', null] },
                segments: { type: ['array', 'null'], items: STRING, maxItems: 6 },
                xMax: NUMBER, yMax: NUMBER,
                curves: { type: 'array', maxItems: 3, items: obj({ name: STRING, points: { type: 'array', minItems: 3, maxItems: 12, items: obj({ x: NUMBER, y: NUMBER }) } }) },
            });
        case 'flow':
            return obj({
                ...head('diagram', type),
                direction: { type: 'string', enum: ['horizontal', 'vertical'] },
                steps: { type: 'array', minItems: 2, maxItems: 8, items: obj({ id: STRING, label: STRING, shape: { type: 'string', enum: ['box', 'decision', 'terminal'] }, yesLabel: NULL_STRING }) },
                loops: { type: 'array', maxItems: 3, items: obj({ from: STRING, to: STRING, label: NULL_STRING }) },
            });
        case 'network':
            return obj({
                ...head('diagram', type), unit: STRING,
                tasks: { type: 'array', minItems: 3, maxItems: 10, items: obj({ id: STRING, name: STRING, duration: NUMBER }) },
                links: { type: 'array', minItems: 2, maxItems: 16, items: obj({ from: STRING, to: STRING }) },
            });
        case 'fishbone':
            return obj({ ...head('diagram', type), effect: STRING, categories: { type: 'array', minItems: 2, maxItems: 6, items: obj({ name: STRING, causes: strings(1, 3) }) } });
        case 'tree':
            return obj({
                ...head('diagram', type), direction: { type: 'string', enum: ['down', 'right'] },
                nodes: { type: 'array', minItems: 3, maxItems: 20, items: obj({ id: STRING, label: STRING, parent: NULL_STRING }) },
            });
        case 'cycle':
            return obj({ ...head('diagram', type), center: NULL_STRING, steps: strings(3, 8) });
        case 'venn':
            return obj({
                ...head('diagram', type), mode: { type: 'string', enum: ['overlap', 'nested'] }, labels: strings(2, 4),
                onlyFirst: { type: ['array', 'null'], items: STRING, maxItems: 4 }, onlySecond: { type: ['array', 'null'], items: STRING, maxItems: 4 }, both: { type: ['array', 'null'], items: STRING, maxItems: 4 },
            });
        case 'relation':
            return obj({
                ...head('diagram', type), layout: { type: 'string', enum: ['circle', 'hub'] },
                nodes: { type: 'array', minItems: 2, maxItems: 6, items: obj({ id: STRING, label: STRING }) },
                links: { type: 'array', minItems: 1, maxItems: 10, items: obj({ from: STRING, to: STRING, label: NULL_STRING, arrow: { type: 'string', enum: ['forward', 'both', 'none'] } }) },
            });
        case 'matrix': {
            const axis = obj({ label: STRING, low: STRING, high: STRING });
            return obj({
                ...head('diagram', type), xAxis: axis, yAxis: axis,
                quadrants: { type: ['array', 'null'], items: STRING, minItems: 4, maxItems: 4 },
                points: { type: 'array', maxItems: 6, items: obj({ label: STRING, x: NUMBER, y: NUMBER }) },
            });
        }
        case 'nesting':
            return obj({
                ...head('diagram', type), unit: STRING,
                plans: { type: 'array', minItems: 1, maxItems: 2, items: obj({ label: STRING, sheetWidth: NUMBER, sheetHeight: NUMBER, diameter: NUMBER, rows: { type: 'array', items: INTEGER, minItems: 1, maxItems: 8 }, stagger: { type: 'boolean' } }) },
            });
        default:
            return null;
    }
}
const COMMON_RULES = [
    '- figures에 명세 1개({"id":"F1", …}), blocks에 {"type":"figure","figureId":"F1"} 블록 1개. SVG·그림 묘사는 쓰지 마십시오. 엔진이 명세대로 기출 양식(회색조)으로 그립니다.',
    '- 그림 속 글자(라벨)는 학생이 읽습니다. 빈칸이 필요하면 기출처럼 (가)·(나)를 라벨에 쓰고, 쓴 라벨은 발문·<보기>·선지에서 반드시 그 라벨로 묻습니다. 정답 개념명은 라벨에도 쓰지 마십시오.',
    '- text 블록에는 상황·조건만 쓰고 그림의 내용(수치·단계·관계)을 다시 나열하지 마십시오.',
    '- 블라인드 검토자는 그림 대신 엔진이 만든 설명문을 봅니다. [엔진 계산]으로 표시된 사실(주 공정·소요 시간·지연 일수·관리 이탈 점·상관 부호·이용률 등)은 엔진이 명세로 계산합니다. 진술에 쓰는 값은 명세로 직접 계산해 맞게 쓰십시오(엔진 계산과 다르면 검토에서 반려).',
];
const TYPE_RULES = {
    gantt: [
        '## 간트 차트 (필수 — 기출 작업 관리 도표)',
        '- {"kind":"chart","chartType":"gantt","periodLabel":"6월","unit":"일","start":1,"end":15,"statusDay":8,"tasks":[{"name":"작업 A","plannedStart":1,"plannedEnd":6,"doneUntil":8}, …]}',
        '- 칸은 start~end(최대 31칸). 계획 작업량은 ┌ ┐ 괄호선(plannedStart~plannedEnd), 완료 작업량은 빗금 막대(plannedStart부터 doneUntil까지)로 그려집니다. statusDay는 진행 상황을 보는 기준일(세로 점선)입니다. 완료 막대는 완료한 작업량이므로 기준일을 넘으면 계획보다 앞선 것이고, 계획 종료일(plannedEnd)은 넘을 수 없습니다.',
        '- 엔진이 작업마다 "기준일까지 계획 n일분 대비 k일 지연/앞섬/계획대로"를 계산합니다(완료 일수 − 기준일까지 계획 일수). 지연·앞섬 판단을 진술의 핵심으로 쓰십시오.',
    ],
    control: [
        '## 관리도 (필수 — 기출 관리도)',
        '- {"kind":"chart","chartType":"control","xLabel":"일자","yLabel":"통계량","values":[…8~30개],"center":50,"upper":60,"lower":40}',
        '- 중심선(실선)·관리 상·하한선(점선)과 점을 잇는 꺾은선이 그려집니다. 숫자 눈금은 표시되지 않으므로 학생은 점의 위치(선 위·아래, 연속 여부)로 판단합니다. 점을 한계선에 너무 가깝게(폭의 5% 이내) 두지 마십시오.',
        '- 엔진이 관리 한계선 밖 점(몇 번째), 중심선 한쪽 연속 최다 점 수, 연속 상승·하강 최다 점 수, 판정(한계선 밖 점 또는 연속 7점 이상 런·경향이면 이상)을 계산합니다.',
    ],
    scatter: [
        '## 산점도 (필수 — 기출 산점도)',
        `- {"kind":"chart","chartType":"scatter","points":40,"panels":[{"title":null,"xLabel":"부품 오차","yLabel":"불량률","correlation":"strong_positive"}, …최대 2개]}. correlation은 ${figure_chart_ext_1.CORRELATIONS.join(' | ')}.`,
        '- 점은 엔진이 correlation에 맞게 만들고 상관 계수를 계산해 부호·강도를 확인합니다. 축은 0~100 눈금만 있으므로 진술은 상관의 방향·유무로 판단하게 쓰십시오(특정 점 값 금지).',
    ],
    curve: [
        '## 곡선 그래프 (필수 — 제품 수명 주기·비용 곡선·거리별 변화 등)',
        '- 제품 수명 주기: {"kind":"chart","chartType":"curve","preset":"lifecycle","xLabel":"시기","yLabel":"매출액","segments":["(가)","(나)","(다)","(라)"],"xMax":100,"yMax":100,"curves":[]} — 엔진이 도입(완만한 증가)→성장(급증)→성숙(최고점)→쇠퇴(감소) 곡선을 그립니다.',
        '- 그 밖의 곡선: preset null, curves 1~3개, 각 곡선 points 3~12개({"x","y"}, x는 커지는 순서, 0~xMax·0~yMax). 축 눈금은 그리지 않으므로 모양(증가·감소·최고점·교차)으로 판단하게 쓰십시오. segments는 가로축을 같은 너비로 나눈 구간 이름(선택).',
        '- 엔진이 구간별 증가·감소, 가장 가파른 구간, 최고점이 있는 구간을 계산합니다.',
    ],
    flow: [
        '## 흐름도·순서도 (필수 — 기출 공정 흐름도·순서도)',
        '- {"kind":"diagram","diagramType":"flow","direction":"horizontal","steps":[{"id":"s1","label":"원료 투입","shape":"box","yesLabel":null}, …],"loops":[]}',
        '- steps는 화살표로 이어지는 순서대로(가로 2~6개, 세로 2~8개). shape: box(단계), decision(판단 마름모, label은 "…인가?"), terminal(시작·끝).',
        '- decision 단계는 아래(다음 단계)로 가는 갈래 이름을 yesLabel("예")로, 다른 갈래를 loops({"from":"s3","to":"s1","label":"아니요"})로 씁니다. loops는 되돌아가거나 건너뛰는 화살표(최대 3개)입니다. 순서도는 direction "vertical"을 권장합니다.',
    ],
    network: [
        '## 작업 네트워크 도표(퍼트) (필수 — 기출 작업 순서 네트워크)',
        '- {"kind":"diagram","diagramType":"network","unit":"분","tasks":[{"id":"A","name":"작업 A","duration":6}, …3~10개],"links":[{"from":"A","to":"B"}, …]}',
        '- 원 위쪽에 작업명, 아래쪽에 작업 시간이 표시되고 화살표가 선후 관계입니다. 순환 금지, 모든 작업이 하나로 이어져야 하며 작업 시간은 양수입니다.',
        '- 엔진이 주 공정(가장 긴 경로)·전체 완료 최소 시간·작업별 여유 시간·가장 이른 시작 시각을 계산합니다. 주 공정과 단축 효과(어느 작업을 줄여야 전체가 줄어드는지)를 진술의 핵심으로 쓰면 좋습니다.',
    ],
    fishbone: [
        '## 특성 요인도 (필수 — 기출 생선뼈 도표)',
        '- {"kind":"diagram","diagramType":"fishbone","effect":"조립 불량","categories":[{"name":"작업 절차","causes":["불필요한 동작 과다"]}, …2~6개]}',
        '- 머리(오른쪽)에 특성(결과), 큰 가지에 요인(4M 등), 작은 가지에 세부 원인이 그려집니다.',
    ],
    tree: [
        '## 계층도·조직도·분류 트리 (필수)',
        '- {"kind":"diagram","diagramType":"tree","direction":"down","nodes":[{"id":"n1","label":"대표이사","parent":null},{"id":"n2","label":"생산부","parent":"n1"}, …3~20개]}',
        '- 뿌리(parent null)는 1개, 깊이 4단계 이하, 한 노드의 자식 6개 이하. 한 층이 넓은 분류 트리는 direction "right"(왼쪽 뿌리→오른쪽 가지).',
    ],
    cycle: [
        '## 순환도 (필수 — 데밍 사이클·순환 과정)',
        '- {"kind":"diagram","diagramType":"cycle","center":"안전 관리 사이클","steps":["P 계획","D 실시","C (가)","A 조치"]} — 시계 방향 3~8단계, 마지막 단계 다음은 첫 단계입니다.',
    ],
    venn: [
        '## 벤 다이어그램·포함 도식 (필수)',
        '- 겹침: {"kind":"diagram","diagramType":"venn","mode":"overlap","labels":["(가)","(나)"],"onlyFirst":["…"],"onlySecond":["…"],"both":["…"]} — 각 영역 항목 4개 이하, 항목은 짧은 개조식 구절.',
        '- 포함: {"mode":"nested","labels":["바깥 개념","가운데","안쪽"],"onlyFirst":null,"onlySecond":null,"both":null} — 바깥이 안쪽을 포함(2~4겹).',
    ],
    relation: [
        '## 관계도 (필수 — 주체 사이 관계·중심 개념과 주변 요소)',
        '- {"kind":"diagram","diagramType":"relation","layout":"circle","nodes":[{"id":"a","label":"(가)"}, …2~6개],"links":[{"from":"b","to":"a","label":"노동정책 건의","arrow":"forward"}, …]}',
        '- layout "circle": 노드가 원 둘레(3개면 삼각형)에 놓이고 글이 달린 화살표로 이어집니다. 맞방향 관계는 두 연결로 쓰면 나란히 그려집니다. layout "hub": 첫 노드가 가운데, 나머지가 둘레(마인드맵·전략 도식, 노드 글 40자 이하).',
    ],
    matrix: [
        '## 2×2 매트릭스(포지셔닝 맵) (필수)',
        '- {"kind":"diagram","diagramType":"matrix","xAxis":{"label":"자신이 아는 정도","low":"안다","high":"모른다"},"yAxis":{…},"quadrants":["왼쪽 위","오른쪽 위","왼쪽 아래","오른쪽 아래" 이름],"points":[{"label":"A","x":3,"y":7}]}',
        '- 좌표는 0~10(5가 경계, 경계 위 금지). 엔진이 점마다 속한 사분면을 계산합니다.',
    ],
    nesting: [
        '## 가공 형태(원판 배치) (필수 — 판재에서 원판 따내기)',
        '- {"kind":"diagram","diagramType":"nesting","unit":"cm","plans":[{"label":"1안","sheetWidth":80,"sheetHeight":40,"diameter":20,"rows":[4,4],"stagger":false},{"label":"2안", …,"rows":[4,3],"stagger":true}]}',
        '- 엇갈린 배치(stagger)는 줄 간격이 지름×0.866이고 짝수 번째 줄이 반지름만큼 밀립니다. 판 안에 들어가지 않으면 반려됩니다. 엔진이 원판 수와 재료 이용률(π=3.14)을 계산합니다.',
    ],
};
function figureTypeInstructions(type) {
    const rules = TYPE_RULES[type];
    return rules === undefined ? [] : ['', ...rules, ...COMMON_RULES];
}
exports.DIAGRAM_SHAPE_LABELS = {
    gantt: '간트 차트', control: '관리도', scatter: '산점도', curve: '곡선 그래프', flow: '흐름도·순서도', network: '작업 네트워크 도표',
    fishbone: '특성 요인도', tree: '계층도', cycle: '순환도', venn: '벤 다이어그램', relation: '관계도', matrix: '2×2 매트릭스', nesting: '가공 형태',
};
