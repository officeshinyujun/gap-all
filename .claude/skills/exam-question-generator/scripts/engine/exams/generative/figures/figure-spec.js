"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIGURE_ID_PATTERN = exports.DIAGRAM_TYPES = exports.EXT_CHART_TYPES = exports.FIGURE_TYPES = exports.PERSON_AGES = exports.PERSON_GENDERS = exports.ROLE_PROPS = exports.ROLE_LABELS = exports.SCENE_ROLES = exports.SCENE_LAYOUTS = exports.CHART_TYPES = void 0;
exports.isCategoricalChart = isCategoricalChart;
exports.isExtChart = isExtChart;
exports.figureTypeOf = figureTypeOf;
exports.figureFamily = figureFamily;
exports.figureKind = figureKind;
exports.parseFigureSpec = parseFigureSpec;
exports.validateFigureSpec = validateFigureSpec;
exports.niceStep = niceStep;
exports.axisStep = axisStep;
exports.axisTitle = axisTitle;
exports.figureAlt = figureAlt;
exports.figureVisibleText = figureVisibleText;
exports.figureReadingLength = figureReadingLength;
/**
 * 그림형 문항의 figure spec(모델이 쓰는 구조화 명세) 타입·해석·검증·설명문.
 *
 * 모델은 SVG를 쓰지 않는다. 그래프(chart)는 범주·계열·축 값을, 인물 그림(scene)은 배치·역할만 적고,
 * 엔진(figure-svg.ts)이 같은 명세로 항상 같은 SVG를 그린다. 순수 TS(스킬 엔진 번들에 들어간다).
 */
const calculation_kit_1 = require("../calculation/calculation-kit");
const figure_chart_ext_1 = require("./figure-chart-ext");
Object.defineProperty(exports, "EXT_CHART_TYPES", { enumerable: true, get: function () { return figure_chart_ext_1.EXT_CHART_TYPES; } });
const figure_diagram_1 = require("./figure-diagram");
Object.defineProperty(exports, "DIAGRAM_TYPES", { enumerable: true, get: function () { return figure_diagram_1.DIAGRAM_TYPES; } });
const figure_parse_1 = require("./figure-parse");
exports.CHART_TYPES = [
    'bar',
    'hbar',
    'stacked_bar',
    'stacked_hbar',
    'line',
    'bar_line',
    'pie',
    'radar',
];
exports.SCENE_LAYOUTS = ['single', 'pair', 'presenter'];
/** 인물 역할: 옷차림·소품이 정해진다(그림 안에 글자는 없다). */
exports.SCENE_ROLES = [
    'reporter',
    'teacher',
    'student',
    'office',
    'executive',
    'worker',
    'engineer',
    'doctor',
    'counselor',
    'chef',
    'farmer',
    'researcher',
    'presenter',
    'citizen',
];
exports.ROLE_LABELS = {
    reporter: '기자',
    teacher: '교사',
    student: '학생',
    office: '회사원',
    executive: '경영자',
    worker: '현장 근로자',
    engineer: '엔지니어',
    doctor: '의사',
    counselor: '상담사',
    chef: '요리사',
    farmer: '농업인',
    researcher: '연구원',
    presenter: '발표자',
    citizen: '시민',
};
/** 지시서에 넣는 역할별 옷차림·소품 설명 */
exports.ROLE_PROPS = {
    reporter: '마이크',
    teacher: '책',
    student: '교복',
    office: '셔츠·넥타이·사원증',
    executive: '정장·넥타이',
    worker: '안전모·안전 조끼',
    engineer: '안전모·작업복·태블릿',
    doctor: '가운·청진기',
    counselor: '카디건·서류철',
    chef: '조리모·조리복',
    farmer: '밀짚모자·멜빵 작업복',
    researcher: '실험 가운·보안경',
    presenter: '마이크·재킷',
    citizen: '평상복',
};
exports.PERSON_GENDERS = ['female', 'male'];
exports.PERSON_AGES = ['child', 'teen', 'adult', 'senior'];
/**
 * 그림 종류(출제 명세의 figureType): 범주형 그래프(categorical: 막대·선·누적·원·방사형) | 간트·관리도·산점도·곡선 |
 * 도식 9종 | 인물 그림(scene)
 */
exports.FIGURE_TYPES = ['categorical', ...figure_chart_ext_1.EXT_CHART_TYPES, ...figure_diagram_1.DIAGRAM_TYPES, 'scene'];
function isCategoricalChart(spec) {
    return spec.kind === 'chart' && exports.CHART_TYPES.includes(spec.chartType);
}
function isExtChart(spec) {
    return spec.kind === 'chart' && figure_chart_ext_1.EXT_CHART_TYPES.includes(spec.chartType);
}
function figureTypeOf(spec) {
    if (spec.kind === 'scene')
        return 'scene';
    if (spec.kind === 'diagram')
        return spec.diagramType;
    return isCategoricalChart(spec) ? 'categorical' : spec.chartType;
}
/** 그림 종류가 속하는 큰 갈래(제시문 구성 chart·diagram·scene) */
function figureFamily(type) {
    if (type === 'scene')
        return 'scene';
    return figure_diagram_1.DIAGRAM_TYPES.includes(type) ? 'diagram' : 'chart';
}
exports.FIGURE_ID_PATTERN = /^F[1-9]$/u;
const NAME_MAX = 16;
const PERCENT_TOLERANCE = 0.5;
/** 앱 figures 맵의 kind 값(기출 코퍼스와 같은 이름) */
function figureKind(spec) {
    return spec.kind === 'scene' ? 'illustration' : spec.kind;
}
/**
 * 모델 출력 한 개를 명세로 정규화한다. 형식부터 틀리면 사유 문자열을 돌려준다.
 * (strict JSON 스키마는 선택 필드를 null로 채우므로 null은 "없음"으로 읽는다.)
 */
function parseFigureSpec(raw) {
    if (!isRecord(raw))
        return '그림 명세가 객체가 아닙니다.';
    const id = str(raw.id);
    if (!exports.FIGURE_ID_PATTERN.test(id))
        return `그림 id "${id}"는 F1~F9 형식이어야 합니다.`;
    if (raw.kind === 'diagram' || (raw.kind === 'chart' && figure_chart_ext_1.EXT_CHART_TYPES.includes(str(raw.chartType)))) {
        try {
            return raw.kind === 'diagram' ? (0, figure_diagram_1.parseDiagram)(raw, id) : (0, figure_chart_ext_1.parseExtChart)(raw, id, str(raw.chartType));
        }
        catch (error) {
            if (error instanceof figure_parse_1.FigureParseError)
                return `${id}: ${error.message}`;
            throw error;
        }
    }
    if (raw.kind === 'chart') {
        const chartType = str(raw.chartType);
        if (!exports.CHART_TYPES.includes(chartType))
            return `${id}: chartType은 ${[...exports.CHART_TYPES, ...figure_chart_ext_1.EXT_CHART_TYPES].join('|')} 중 하나여야 합니다.`;
        const valueAxis = parseAxis(raw.valueAxis);
        if (valueAxis === null)
            return `${id}: valueAxis(label, unit, min, max)가 없거나 형식이 틀렸습니다.`;
        const secondary = raw.secondaryAxis === null || raw.secondaryAxis === undefined ? undefined : parseAxis(raw.secondaryAxis);
        if (secondary === null)
            return `${id}: secondaryAxis 형식이 틀렸습니다.`;
        if (!Array.isArray(raw.categories) || !raw.categories.every((value) => typeof value === 'string')) {
            return `${id}: categories는 문자열 배열이어야 합니다.`;
        }
        if (!Array.isArray(raw.series) || !raw.series.every(isRecord))
            return `${id}: series는 객체 배열이어야 합니다.`;
        const series = [];
        for (const entry of raw.series) {
            if (!Array.isArray(entry.values) || !entry.values.every((value) => typeof value === 'number')) {
                return `${id}: 계열 "${str(entry.name)}"의 values는 숫자 배열이어야 합니다.`;
            }
            const render = entry.render === 'bar' || entry.render === 'line' ? entry.render : undefined;
            const axis = entry.axis === 'left' || entry.axis === 'right' ? entry.axis : undefined;
            series.push({
                name: str(entry.name),
                values: [...entry.values],
                ...(render === undefined ? {} : { render }),
                ...(axis === undefined ? {} : { axis }),
            });
        }
        const title = str(raw.title);
        const categoryLabel = str(raw.categoryLabel);
        return {
            id,
            kind: 'chart',
            chartType,
            ...(title === '' ? {} : { title }),
            ...(categoryLabel === '' ? {} : { categoryLabel }),
            categories: raw.categories.map((value) => value.trim()),
            series,
            valueAxis,
            ...(secondary === undefined ? {} : { secondaryAxis: secondary }),
            ...(typeof raw.showValues === 'boolean' ? { showValues: raw.showValues } : {}),
            ...(typeof raw.percent === 'boolean' ? { percent: raw.percent } : {}),
        };
    }
    if (raw.kind === 'scene') {
        const layout = str(raw.layout);
        if (!exports.SCENE_LAYOUTS.includes(layout))
            return `${id}: layout은 ${exports.SCENE_LAYOUTS.join('|')} 중 하나여야 합니다.`;
        if (!Array.isArray(raw.people) || !raw.people.every(isRecord))
            return `${id}: people은 객체 배열이어야 합니다.`;
        const people = [];
        for (const person of raw.people) {
            const role = str(person.role);
            const gender = str(person.gender);
            const age = str(person.age);
            if (!exports.SCENE_ROLES.includes(role))
                return `${id}: role "${role}"은(는) ${exports.SCENE_ROLES.join('|')} 중 하나여야 합니다.`;
            if (!exports.PERSON_GENDERS.includes(gender))
                return `${id}: gender는 female|male이어야 합니다.`;
            if (!exports.PERSON_AGES.includes(age))
                return `${id}: age는 ${exports.PERSON_AGES.join('|')} 중 하나여야 합니다.`;
            people.push({ speaker: str(person.speaker), role, gender, age });
        }
        return { id, kind: 'scene', layout, people };
    }
    return `${id}: kind는 chart, diagram, scene 중 하나여야 합니다.`;
}
/** 명세 자체의 규칙 위반(문항 맥락과 무관한 것). 빈 배열이면 통과. */
function validateFigureSpec(spec) {
    if (spec.kind === 'scene')
        return validateScene(spec);
    if (spec.kind === 'diagram')
        return (0, figure_diagram_1.validateDiagram)(spec);
    return isCategoricalChart(spec) ? validateChart(spec) : (0, figure_chart_ext_1.validateExtChart)(spec);
}
function validateChart(spec) {
    const problems = [];
    const at = (message) => problems.push(`${spec.id}: ${message}`);
    const { chartType, categories, series } = spec;
    const [minCategories, maxCategories] = chartType === 'radar' ? [3, 8] : chartType === 'pie' ? [2, 6] : [2, 8];
    if (categories.length < minCategories || categories.length > maxCategories) {
        at(`범주는 ${minCategories}~${maxCategories}개여야 합니다(현재 ${categories.length}개).`);
    }
    checkNames(categories, '범주', at);
    const maxSeries = chartType === 'pie' ? 1 : 4;
    if (series.length < 1 || series.length > maxSeries)
        at(`계열은 1~${maxSeries}개여야 합니다(현재 ${series.length}개).`);
    checkNames(series.map((entry) => entry.name), '계열', at);
    for (const entry of series) {
        if (entry.values.length !== categories.length) {
            at(`계열 "${entry.name}"의 값 ${entry.values.length}개가 범주 ${categories.length}개와 다릅니다.`);
        }
        if (entry.values.some((value) => !Number.isFinite(value)))
            at(`계열 "${entry.name}"에 유한하지 않은 값이 있습니다.`);
    }
    for (const [name, axis] of [['valueAxis', spec.valueAxis], ['secondaryAxis', spec.secondaryAxis]]) {
        if (axis === undefined)
            continue;
        if (!(axis.max > axis.min))
            at(`${name}의 max는 min보다 커야 합니다.`);
        const step = axis.step ?? niceStep(axis.min, axis.max);
        const ticks = (axis.max - axis.min) / step;
        if (!(step > 0) || Math.abs(ticks - Math.round(ticks)) > 1e-6) {
            at(`${name}의 step(${(0, calculation_kit_1.num)(step)})이 max-min(${(0, calculation_kit_1.num)(axis.max - axis.min)})을 나누어떨어지게 하지 않습니다.`);
        }
        else if (Math.round(ticks) < 2 || Math.round(ticks) > 12) {
            at(`${name}의 눈금 칸 수는 2~12개여야 합니다(현재 ${Math.round(ticks)}칸).`);
        }
        if (axis.label.length < 1 || axis.label.length > 14)
            at(`${name}.label은 1~14자여야 합니다.`);
        if (axis.unit.length > 8)
            at(`${name}.unit은 8자 이하여야 합니다.`);
    }
    if (chartType === 'bar_line') {
        const lines = series.filter((entry) => entry.render === 'line');
        const bars = series.filter((entry) => entry.render !== 'line');
        if (lines.length === 0 || bars.length === 0)
            at('bar_line은 render "bar" 계열과 render "line" 계열이 하나 이상씩 있어야 합니다.');
        if (series.some((entry) => entry.axis === 'right') && spec.secondaryAxis === undefined) {
            at('오른쪽 축(axis "right") 계열이 있으면 secondaryAxis가 있어야 합니다.');
        }
        if (spec.secondaryAxis !== undefined && !series.some((entry) => entry.axis === 'right')) {
            at('secondaryAxis를 쓰려면 axis "right" 계열이 있어야 합니다.');
        }
    }
    else if (spec.secondaryAxis !== undefined) {
        at('secondaryAxis는 bar_line에서만 쓸 수 있습니다.');
    }
    // 값 범위
    if (chartType === 'stacked_bar' || chartType === 'stacked_hbar') {
        if (series.length < 2)
            at('누적 막대는 계열이 2개 이상이어야 합니다.');
        for (let index = 0; index < categories.length; index += 1) {
            const total = series.reduce((sum, entry) => sum + (entry.values[index] ?? 0), 0);
            if (total > spec.valueAxis.max + 1e-9)
                at(`범주 "${categories[index]}"의 누적 합 ${(0, calculation_kit_1.num)(total)}이 축 최댓값 ${(0, calculation_kit_1.num)(spec.valueAxis.max)}을 넘습니다.`);
            if (spec.percent === true && Math.abs(total - 100) > PERCENT_TOLERANCE) {
                at(`100% 누적 막대인데 범주 "${categories[index]}"의 합이 ${(0, calculation_kit_1.num)(total)}입니다(100±0.5).`);
            }
        }
        if (series.some((entry) => entry.values.some((value) => value < 0)))
            at('누적 막대에 음수 값이 있습니다.');
    }
    else if (chartType === 'pie') {
        const values = series[0]?.values ?? [];
        const total = values.reduce((sum, value) => sum + value, 0);
        if (values.some((value) => value <= 0))
            at('원그래프 조각 값은 모두 0보다 커야 합니다.');
        if (Math.abs(total - 100) > PERCENT_TOLERANCE)
            at(`원그래프 조각 합이 ${(0, calculation_kit_1.num)(total)}%입니다(100±0.5여야 함).`);
    }
    if (chartType !== 'pie') {
        for (const entry of series) {
            const axis = entry.axis === 'right' && spec.secondaryAxis !== undefined ? spec.secondaryAxis : spec.valueAxis;
            const outside = entry.values.filter((value) => value < axis.min - 1e-9 || value > axis.max + 1e-9);
            if (outside.length > 0) {
                at(`계열 "${entry.name}"의 값 ${outside.map(calculation_kit_1.num).join(', ')}이(가) 축 범위 ${(0, calculation_kit_1.num)(axis.min)}~${(0, calculation_kit_1.num)(axis.max)} 밖입니다.`);
            }
        }
    }
    if (spec.title !== undefined && spec.title.length > 40)
        at('title은 40자 이하여야 합니다.');
    if (spec.categoryLabel !== undefined && spec.categoryLabel.length > 12)
        at('categoryLabel은 12자 이하여야 합니다.');
    return problems;
}
function validateScene(spec) {
    const problems = [];
    const expected = spec.layout === 'pair' ? 2 : 1;
    if (spec.people.length !== expected) {
        problems.push(`${spec.id}: layout "${spec.layout}"은(는) 인물 ${expected}명이어야 합니다(현재 ${spec.people.length}명).`);
    }
    const speakers = spec.people.map((person) => person.speaker);
    if (speakers.some((speaker) => speaker === ''))
        problems.push(`${spec.id}: people[].speaker가 비었습니다.`);
    if (new Set(speakers).size !== speakers.length)
        problems.push(`${spec.id}: 같은 화자가 두 번 나옵니다.`);
    return problems;
}
function checkNames(names, label, at) {
    for (const name of names) {
        if (name.length < 1 || name.length > NAME_MAX)
            at(`${label} 이름 "${name}"은(는) 1~${NAME_MAX}자여야 합니다.`);
    }
    if (new Set(names).size !== names.length)
        at(`${label} 이름이 중복됩니다.`);
}
/** step을 주지 않았을 때 쓰는 눈금 간격: 칸 수가 4~10이 되는 1·2·2.5·5×10^k 중 가장 큰 것 */
function niceStep(min, max) {
    const span = max - min;
    if (!(span > 0))
        return 1;
    const candidates = [];
    for (let power = -2; power <= 7; power += 1) {
        for (const base of [1, 2, 2.5, 5])
            candidates.push(base * 10 ** power);
    }
    const fits = candidates.filter((step) => {
        const ticks = span / step;
        return Math.abs(ticks - Math.round(ticks)) < 1e-6 && ticks >= 4 && ticks <= 10;
    });
    if (fits.length > 0)
        return fits[fits.length - 1];
    return span / 5;
}
function axisStep(axis) {
    return axis.step ?? niceStep(axis.min, axis.max);
}
/** 축 제목: "비율(%)", 단위가 없으면 이름만 */
function axisTitle(axis) {
    return axis.unit === '' ? axis.label : `${axis.label}(${axis.unit})`;
}
const CHART_NAMES = {
    bar: '세로 막대그래프',
    hbar: '가로 막대그래프',
    stacked_bar: '세로 누적 막대그래프',
    stacked_hbar: '가로 누적 막대그래프',
    line: '꺾은선 그래프',
    bar_line: '막대그래프와 꺾은선 그래프를 겹친 그래프(이중 축)',
    pie: '원그래프',
    radar: '방사형 그래프',
};
/**
 * 그림 설명문(alt): 기출 description 규칙처럼 그래프는 축·단위·범주·계열별 수치를 모두 적어
 * 블라인드 검토자와 화면 낭독기가 그림 없이도 같은 정보를 얻게 한다.
 */
function figureAlt(spec) {
    if (spec.kind === 'scene')
        return sceneAlt(spec);
    if (spec.kind === 'diagram')
        return (0, figure_diagram_1.diagramAlt)(spec);
    if (!isCategoricalChart(spec))
        return (0, figure_chart_ext_1.extChartAlt)(spec);
    const parts = [];
    const name = spec.percent === true && spec.chartType.startsWith('stacked') ? `100% ${CHART_NAMES[spec.chartType]}` : CHART_NAMES[spec.chartType];
    parts.push(spec.title === undefined ? `${name}.` : `${name}. 제목 ‘${spec.title}’.`);
    const axisText = (axis) => `${axisTitle(axis)} ${(0, calculation_kit_1.num)(axis.min)}～${(0, calculation_kit_1.num)(axis.max)}(${(0, calculation_kit_1.num)(axisStep(axis))} 간격)`;
    const categoryText = `${spec.categoryLabel === undefined ? '' : `${spec.categoryLabel}: `}${spec.categories.join(', ')}`;
    switch (spec.chartType) {
        case 'pie': {
            const values = spec.series[0]?.values ?? [];
            parts.push(`조각(${spec.series[0]?.name ?? ''}, 12시 방향부터 시계 방향): ${spec.categories.map((category, index) => `${category} ${(0, calculation_kit_1.num)(values[index] ?? 0)}%`).join(', ')}.`);
            return parts.join(' ');
        }
        case 'radar':
            parts.push(`꼭짓점(위부터 시계 방향): ${spec.categories.join(', ')}. 눈금: 중심 ${(0, calculation_kit_1.num)(spec.valueAxis.min)}에서 바깥 ${(0, calculation_kit_1.num)(spec.valueAxis.max)}까지 ${(0, calculation_kit_1.num)(axisStep(spec.valueAxis))} 간격(${axisTitle(spec.valueAxis)}).`);
            break;
        case 'hbar':
        case 'stacked_hbar':
            parts.push(`세로축(범주) ${categoryText}. 가로축: ${axisText(spec.valueAxis)}.`);
            break;
        case 'bar_line':
            parts.push(`가로축(범주) ${categoryText}. 왼쪽 세로축: ${axisText(spec.valueAxis)}.`);
            if (spec.secondaryAxis !== undefined)
                parts.push(`오른쪽 세로축: ${axisText(spec.secondaryAxis)}.`);
            break;
        default:
            parts.push(`가로축(범주) ${categoryText}. 세로축: ${axisText(spec.valueAxis)}.`);
    }
    for (const entry of spec.series) {
        const shape = spec.chartType === 'bar_line'
            ? `${entry.render === 'line' ? '꺾은선' : '막대'} ‘${entry.name}’${entry.axis === 'right' ? '(오른쪽 축)' : '(왼쪽 축)'}`
            : spec.chartType === 'line' || spec.chartType === 'radar'
                ? `선 ‘${entry.name}’`
                : `${spec.series.length > 1 ? '계열' : '막대'} ‘${entry.name}’`;
        parts.push(`${shape}: ${spec.categories.map((category, index) => `${category} ${(0, calculation_kit_1.num)(entry.values[index] ?? 0)}`).join(', ')}.`);
    }
    return parts.join(' ');
}
function sceneAlt(spec) {
    const who = (person) => `${person.speaker}(${exports.ROLE_LABELS[person.role]})`;
    const [first, second] = spec.people;
    if (first === undefined)
        return '장식용 인물 그림.';
    if (spec.layout === 'pair' && second !== undefined) {
        // 괄호 뒤 조사는 괄호를 빼고 읽은 앞말(화자명)에 맞춘다("A 씨(시민)가", "상담원(직업 상담사)과").
        const and = (0, calculation_kit_1.josa)(first.speaker, '이/가').endsWith('이') ? '과' : '와';
        const subject = (0, calculation_kit_1.josa)(second.speaker, '이/가').endsWith('이') ? '이' : '가';
        return `장식용. ${who(first)}${and} ${who(second)}${subject} 마주 보고 이야기하는 인물 그림. 대화 내용은 이어지는 대화 블록에 있음.`;
    }
    if (spec.layout === 'presenter') {
        return `장식용. 연단 앞에서 빈 보드를 가리키며 발표하는 ${who(first)} 인물 그림. 발표 내용은 이어지는 대화 블록에 있음.`;
    }
    return `장식용. ${who(first)} 인물 그림. 말한 내용은 이어지는 대화 블록에 있음.`;
}
/** 학생이 그림에서 읽는 글자(정답 개념 노출·라벨·중복 검사용). 인물 그림에는 글자가 없다. */
function figureVisibleText(spec) {
    if (spec.kind === 'scene')
        return '';
    if (!isCategoricalChart(spec))
        return (0, figure_parse_1.collectFigureStrings)(spec).join(' ');
    return [
        spec.title ?? '',
        spec.categoryLabel ?? '',
        ...spec.categories,
        ...spec.series.map((entry) => entry.name),
        axisTitle(spec.valueAxis),
        spec.secondaryAxis === undefined ? '' : axisTitle(spec.secondaryAxis),
    ].filter((value) => value !== '').join(' ');
}
/** 제시문 분량 계산용: 그래프는 학생이 읽어야 하는 라벨·수치 글자 수, 인물 그림은 0 */
function figureReadingLength(spec) {
    if (spec.kind === 'scene')
        return 0;
    if (!isCategoricalChart(spec)) {
        return figureVisibleText(spec).replace(/\s+/gu, '').length + (0, figure_parse_1.countFigureNumbers)(spec) * 2;
    }
    const values = spec.series.flatMap((entry) => entry.values.map((value) => (0, calculation_kit_1.num)(value).length + 1));
    return figureVisibleText(spec).replace(/\s+/gu, '').length + values.reduce((sum, value) => sum + value, 0);
}
function parseAxis(value) {
    if (!isRecord(value))
        return null;
    const min = value.min;
    const max = value.max;
    if (typeof min !== 'number' || typeof max !== 'number')
        return null;
    const step = typeof value.step === 'number' ? value.step : undefined;
    return { label: str(value.label), unit: str(value.unit), min, max, ...(step === undefined ? {} : { step }) };
}
function str(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
