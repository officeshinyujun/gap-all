"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIFECYCLE_POINTS = exports.CONTROL_RUN_LIMIT = exports.CORRELATIONS = exports.EXT_CHART_TYPES = void 0;
exports.parseExtChart = parseExtChart;
exports.validateExtChart = validateExtChart;
exports.ganttStatus = ganttStatus;
exports.controlFacts = controlFacts;
exports.scatterPoints = scatterPoints;
exports.pearson = pearson;
exports.curveLines = curveLines;
exports.curveValueAt = curveValueAt;
exports.curveSegmentTrends = curveSegmentTrends;
exports.extChartAlt = extChartAlt;
exports.correlationText = correlationText;
/**
 * 범주형 막대·선 밖의 그래프: 간트 차트, 관리도, 산점도, 곡선(제품 수명 주기 등).
 * 정답에 쓰이는 사실(작업별 지연 일수, 관리 한계 밖 점·연속 점, 상관 부호, 구간별 추세)은
 * 엔진이 계산해 설명문(alt)에 적는다. 블라인드 검토자는 그 설명문으로 그래프를 읽는다.
 */
const figure_parse_1 = require("./figure-parse");
const stable_hash_1 = require("../../../common/stable-hash");
exports.EXT_CHART_TYPES = ['gantt', 'control', 'scatter', 'curve'];
exports.CORRELATIONS = ['strong_positive', 'positive', 'none', 'negative', 'strong_negative'];
// ------------------------------------------------------------
// 해석
// ------------------------------------------------------------
function parseExtChart(raw, id, chartType) {
    const title = (0, figure_parse_1.optStr)(raw.title);
    const base = { id, kind: 'chart', ...(title === undefined ? {} : { title }) };
    switch (chartType) {
        case 'gantt': {
            const statusDay = (0, figure_parse_1.optNum)(raw.statusDay, 'statusDay');
            return {
                ...base,
                chartType,
                periodLabel: (0, figure_parse_1.str)(raw.periodLabel),
                unit: (0, figure_parse_1.str)(raw.unit) || '일',
                start: (0, figure_parse_1.num)(raw.start, 'start'),
                end: (0, figure_parse_1.num)(raw.end, 'end'),
                ...(statusDay === undefined ? {} : { statusDay }),
                tasks: (0, figure_parse_1.recs)(raw.tasks, 'tasks').map((task) => {
                    const doneUntil = (0, figure_parse_1.optNum)(task.doneUntil, 'tasks[].doneUntil');
                    return {
                        name: (0, figure_parse_1.str)(task.name),
                        plannedStart: (0, figure_parse_1.num)(task.plannedStart, 'tasks[].plannedStart'),
                        plannedEnd: (0, figure_parse_1.num)(task.plannedEnd, 'tasks[].plannedEnd'),
                        ...(doneUntil === undefined ? {} : { doneUntil }),
                    };
                }),
            };
        }
        case 'control':
            return {
                ...base,
                chartType,
                xLabel: (0, figure_parse_1.str)(raw.xLabel),
                yLabel: (0, figure_parse_1.str)(raw.yLabel),
                values: numbers(raw.values, 'values'),
                center: (0, figure_parse_1.num)(raw.center, 'center'),
                upper: (0, figure_parse_1.num)(raw.upper, 'upper'),
                lower: (0, figure_parse_1.num)(raw.lower, 'lower'),
            };
        case 'scatter':
            return {
                ...base,
                chartType,
                points: (0, figure_parse_1.num)(raw.points ?? 40, 'points'),
                panels: (0, figure_parse_1.recs)(raw.panels, 'panels').map((panel) => {
                    const panelTitle = (0, figure_parse_1.optStr)(panel.title);
                    return {
                        ...(panelTitle === undefined ? {} : { title: panelTitle }),
                        xLabel: (0, figure_parse_1.str)(panel.xLabel),
                        yLabel: (0, figure_parse_1.str)(panel.yLabel),
                        correlation: (0, figure_parse_1.oneOf)(panel.correlation, exports.CORRELATIONS, 'panels[].correlation'),
                    };
                }),
            };
        case 'curve': {
            const segments = (0, figure_parse_1.optStrs)(raw.segments, 'segments');
            const preset = raw.preset === 'lifecycle' ? 'lifecycle' : undefined;
            return {
                ...base,
                chartType,
                xLabel: (0, figure_parse_1.str)(raw.xLabel),
                yLabel: (0, figure_parse_1.str)(raw.yLabel),
                ...(preset === undefined ? {} : { preset }),
                ...(segments === undefined ? {} : { segments }),
                xMax: (0, figure_parse_1.num)(raw.xMax ?? 100, 'xMax'),
                yMax: (0, figure_parse_1.num)(raw.yMax ?? 100, 'yMax'),
                curves: preset === 'lifecycle' && (raw.curves === null || raw.curves === undefined)
                    ? []
                    : (0, figure_parse_1.recs)(raw.curves, 'curves').map((curve) => ({
                        name: (0, figure_parse_1.str)(curve.name),
                        points: (Array.isArray(curve.points) ? curve.points : []).map((point) => {
                            if (Array.isArray(point) && point.length === 2)
                                return [(0, figure_parse_1.num)(point[0], 'points[][0]'), (0, figure_parse_1.num)(point[1], 'points[][1]')];
                            if (point !== null && typeof point === 'object') {
                                const record = point;
                                return [(0, figure_parse_1.num)(record.x, 'points[].x'), (0, figure_parse_1.num)(record.y, 'points[].y')];
                            }
                            throw new figure_parse_1.FigureParseError('curves[].points는 [x, y] 또는 {x, y} 배열이어야 합니다.');
                        }),
                    })),
            };
        }
    }
}
function numbers(value, what) {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
        throw new figure_parse_1.FigureParseError(`${what}는 숫자 배열이어야 합니다.`);
    }
    return [...value];
}
// ------------------------------------------------------------
// 검증
// ------------------------------------------------------------
const LABEL_MAX = 20;
function label(problems, id, value, what, max = LABEL_MAX) {
    if (value.length < 1 || value.length > max)
        problems.push(`${id}: ${what} "${value}"은(는) 1~${max}자여야 합니다.`);
}
function validateExtChart(spec) {
    const problems = [];
    const at = (message) => problems.push(`${spec.id}: ${message}`);
    if (spec.title !== undefined && spec.title.length > 40)
        at('title은 40자 이하여야 합니다.');
    switch (spec.chartType) {
        case 'gantt': {
            const isInt = (value) => Number.isInteger(value);
            if (![spec.start, spec.end].every(isInt) || spec.end <= spec.start)
                at('start < end인 정수여야 합니다.');
            if (spec.end - spec.start + 1 > 31)
                at('기간은 31칸 이하여야 합니다.');
            label(problems, spec.id, spec.periodLabel, 'periodLabel', 12);
            if (spec.unit.length > 4)
                at('unit은 4자 이하여야 합니다.');
            if (spec.tasks.length < 1 || spec.tasks.length > 6)
                at(`작업은 1~6개여야 합니다(현재 ${spec.tasks.length}개).`);
            if (new Set(spec.tasks.map((task) => task.name)).size !== spec.tasks.length)
                at('작업 이름이 중복됩니다.');
            for (const task of spec.tasks) {
                label(problems, spec.id, task.name, '작업 이름', 12);
                const values = [task.plannedStart, task.plannedEnd, ...(task.doneUntil === undefined ? [] : [task.doneUntil])];
                if (!values.every(isInt))
                    at(`작업 "${task.name}"의 날짜는 정수여야 합니다.`);
                if (task.plannedStart < spec.start || task.plannedEnd > spec.end || task.plannedStart > task.plannedEnd) {
                    at(`작업 "${task.name}"의 계획 ${task.plannedStart}~${task.plannedEnd}이(가) 기간 ${spec.start}~${spec.end} 밖이거나 거꾸로입니다.`);
                }
                if (task.doneUntil !== undefined && (task.doneUntil < task.plannedStart || task.doneUntil > task.plannedEnd)) {
                    at(`작업 "${task.name}"의 doneUntil ${task.doneUntil}은(는) 계획 시작일 ${task.plannedStart} 이상, 계획 종료일 ${task.plannedEnd} 이하여야 합니다(완료 작업량은 계획 작업량을 넘을 수 없음).`);
                }
            }
            if (spec.statusDay !== undefined && (!isInt(spec.statusDay) || spec.statusDay < spec.start || spec.statusDay > spec.end)) {
                at(`statusDay ${spec.statusDay}은(는) 기간 안의 정수여야 합니다.`);
            }
            break;
        }
        case 'control': {
            if (!(spec.lower < spec.center && spec.center < spec.upper))
                at('lower < center < upper여야 합니다.');
            if (spec.values.length < 8 || spec.values.length > 30)
                at(`점은 8~30개여야 합니다(현재 ${spec.values.length}개).`);
            const span = spec.upper - spec.lower;
            if (spec.values.some((value) => value > spec.upper + span || value < spec.lower - span))
                at('관리 한계에서 지나치게 먼 점이 있습니다(한계 폭 이내로).');
            label(problems, spec.id, spec.xLabel, 'xLabel', 10);
            label(problems, spec.id, spec.yLabel, 'yLabel', 10);
            break;
        }
        case 'scatter':
            if (spec.panels.length < 1 || spec.panels.length > 2)
                at('패널은 1~2개여야 합니다.');
            if (!Number.isInteger(spec.points) || spec.points < 15 || spec.points > 80)
                at('points는 15~80 정수여야 합니다.');
            for (const panel of spec.panels) {
                label(problems, spec.id, panel.xLabel, 'xLabel', 12);
                label(problems, spec.id, panel.yLabel, 'yLabel', 12);
                if (panel.title !== undefined && panel.title.length > 16)
                    at('panels[].title은 16자 이하여야 합니다.');
            }
            break;
        case 'curve': {
            label(problems, spec.id, spec.xLabel, 'xLabel', 10);
            label(problems, spec.id, spec.yLabel, 'yLabel', 10);
            if (!(spec.xMax > 0) || !(spec.yMax > 0))
                at('xMax, yMax는 0보다 커야 합니다.');
            const segments = spec.segments ?? [];
            if (segments.length > 6)
                at('segments는 6개 이하여야 합니다.');
            for (const segment of segments)
                label(problems, spec.id, segment, '구간 이름', 8);
            if (spec.preset === 'lifecycle') {
                if (segments.length !== 0 && segments.length !== 4)
                    at('수명 주기 곡선의 구간은 4개(도입기·성장기·성숙기·쇠퇴기 자리)여야 합니다.');
                break;
            }
            if (spec.curves.length < 1 || spec.curves.length > 3)
                at('곡선은 1~3개여야 합니다.');
            if (new Set(spec.curves.map((curve) => curve.name)).size !== spec.curves.length)
                at('곡선 이름이 중복됩니다.');
            for (const curve of spec.curves) {
                label(problems, spec.id, curve.name, '곡선 이름', 12);
                if (curve.points.length < 3 || curve.points.length > 12)
                    at(`곡선 "${curve.name}"의 점은 3~12개여야 합니다.`);
                if (curve.points.some(([x, y]) => x < 0 || x > spec.xMax || y < 0 || y > spec.yMax))
                    at(`곡선 "${curve.name}"의 점이 0~xMax, 0~yMax 밖입니다.`);
                if (curve.points.some(([x], index) => index > 0 && x <= curve.points[index - 1][0]))
                    at(`곡선 "${curve.name}"의 x는 커지는 순서여야 합니다.`);
            }
            break;
        }
    }
    return problems;
}
function ganttStatus(spec) {
    return spec.tasks.map((task) => {
        const plannedDays = task.plannedEnd - task.plannedStart + 1;
        const doneDays = task.doneUntil === undefined ? 0 : task.doneUntil - task.plannedStart + 1;
        const complete = doneDays >= plannedDays;
        if (spec.statusDay === undefined)
            return { name: task.name, plannedDays, doneDays, complete };
        const plannedByStatus = Math.max(0, Math.min(spec.statusDay, task.plannedEnd) - task.plannedStart + 1);
        return { name: task.name, plannedDays, doneDays, plannedByStatus, difference: doneDays - plannedByStatus, complete };
    });
}
/** 연속 7점 이상 한쪽(런)·연속 7점 상승/하강(경향)이면 이상으로 본다(교과서 판정 규칙). */
exports.CONTROL_RUN_LIMIT = 7;
function controlFacts(spec) {
    const outOfLimits = spec.values.flatMap((value, index) => value > spec.upper ? [{ index: index + 1, value, side: 'upper' }]
        : value < spec.lower ? [{ index: index + 1, value, side: 'lower' }] : []);
    let longestRun = { length: 0, side: 'upper', from: 0, to: 0 };
    let current = { length: 0, side: 'upper', from: 0 };
    spec.values.forEach((value, index) => {
        const side = value > spec.center ? 'upper' : value < spec.center ? 'lower' : null;
        if (side === null) {
            current = { length: 0, side: 'upper', from: index + 2 };
            return;
        }
        current = side === current.side && current.length > 0 ? { ...current, length: current.length + 1 } : { length: 1, side, from: index + 1 };
        if (current.length > longestRun.length)
            longestRun = { length: current.length, side: current.side, from: current.from, to: index + 1 };
    });
    let longestTrend = { length: 1, direction: 'up', from: 1, to: 1 };
    let trend = { length: 1, direction: 'up', from: 1 };
    for (let index = 1; index < spec.values.length; index += 1) {
        const delta = spec.values[index] - spec.values[index - 1];
        const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : null;
        if (direction === null) {
            trend = { length: 1, direction: 'up', from: index + 1 };
            continue;
        }
        trend = direction === trend.direction && trend.length > 1 ? { ...trend, length: trend.length + 1 } : { length: 2, direction, from: index };
        if (trend.length > longestTrend.length)
            longestTrend = { length: trend.length, direction: trend.direction, from: trend.from, to: index + 1 };
    }
    const inControl = outOfLimits.length === 0 && longestRun.length < exports.CONTROL_RUN_LIMIT && longestTrend.length < exports.CONTROL_RUN_LIMIT;
    return { outOfLimits, longestRun, longestTrend, inControl };
}
/** 산점도 점: 명세 해시로 시드한 결정론적 점. 요청한 상관 강도가 나올 때까지 시드를 바꾼다. */
function scatterPoints(spec, panelIndex) {
    const panel = spec.panels[panelIndex];
    const target = CORRELATION_RANGES[panel.correlation];
    let best = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const rng = (0, figure_parse_1.seededRandom)(Number.parseInt((0, stable_hash_1.stableHash)(`${JSON.stringify(spec)}:${panelIndex}:${attempt}`), 16));
        const noise = { strong_positive: 8, positive: 20, none: 0, negative: 20, strong_negative: 8 }[panel.correlation];
        const sign = panel.correlation.endsWith('negative') ? -1 : 1;
        const points = [];
        for (let index = 0; index < spec.points; index += 1) {
            const x = 8 + rng() * 84;
            const y = panel.correlation === 'none'
                ? 8 + rng() * 84
                : Math.min(96, Math.max(4, (sign > 0 ? x : 100 - x) + (rng() * 2 - 1) * noise * 1.7));
            points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
        }
        const r = pearson(points);
        if (r >= target[0] && r <= target[1])
            return { points, r };
        if (best === null || Math.abs(r - (target[0] + target[1]) / 2) < Math.abs(best.r - (target[0] + target[1]) / 2))
            best = { points, r };
    }
    return best ?? { points: [], r: 0 };
}
const CORRELATION_RANGES = {
    strong_positive: [0.85, 1],
    positive: [0.45, 0.75],
    none: [-0.15, 0.15],
    negative: [-0.75, -0.45],
    strong_negative: [-1, -0.85],
};
function pearson(points) {
    const n = points.length;
    if (n < 2)
        return 0;
    const mx = points.reduce((sum, [x]) => sum + x, 0) / n;
    const my = points.reduce((sum, [, y]) => sum + y, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const [x, y] of points) {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
    }
    return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}
/** 제품 수명 주기 기본 곡선(가로 0~100, 세로 0~100): 도입 완만 → 성장 급증 → 성숙 최고점 → 쇠퇴 */
exports.LIFECYCLE_POINTS = [
    [0, 2], [12, 6], [25, 15], [37, 40], [50, 72], [62, 88], [70, 92], [78, 88], [88, 74], [100, 52],
];
/** 곡선 하나: 프리셋이면 엔진 곡선을, 아니면 명세 점을 가로·세로 0~100 비율로 쓴다. */
function curveLines(spec) {
    if (spec.preset === 'lifecycle') {
        return [{ name: spec.yLabel, points: exports.LIFECYCLE_POINTS.map(([x, y]) => [(x / 100) * spec.xMax, (y / 100) * spec.yMax]) }];
    }
    return [...spec.curves];
}
/** 곡선의 x에서 값(점 사이 직선 보간) */
function curveValueAt(points, x) {
    if (x <= points[0][0])
        return points[0][1];
    for (let index = 1; index < points.length; index += 1) {
        const [x1, y1] = points[index];
        const [x0, y0] = points[index - 1];
        if (x <= x1)
            return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return points[points.length - 1][1];
}
/** 구간별 추세: 시작·끝 값과 구간 안 최고점 여부 */
function curveSegmentTrends(spec, line) {
    const segments = spec.segments ?? (spec.preset === 'lifecycle' ? ['도입기', '성장기', '성숙기', '쇠퇴기'] : []);
    if (segments.length === 0)
        return [];
    const width = spec.xMax / segments.length;
    const peakX = line.points.reduce((best, point) => (point[1] > best[1] ? point : best), line.points[0])[0];
    const lowX = line.points.reduce((best, point) => (point[1] < best[1] ? point : best), line.points[0])[0];
    const slopes = segments.map((_, index) => (curveValueAt(line.points, width * (index + 1)) - curveValueAt(line.points, width * index)) / width);
    const steepest = Math.max(...slopes.map(Math.abs));
    return segments.map((segment, index) => {
        const from = width * index;
        const to = width * (index + 1);
        const delta = curveValueAt(line.points, to) - curveValueAt(line.points, from);
        const scale = Math.max(...line.points.map(([, y]) => y)) || 1;
        const relative = delta / scale;
        let trend = Math.abs(relative) < 0.04 ? '거의 변화 없음' : relative > 0 ? '증가' : '감소';
        if (trend !== '거의 변화 없음' && Math.abs(slopes[index]) === steepest)
            trend = `가장 가파르게 ${trend}`;
        else if (trend !== '거의 변화 없음' && Math.abs(slopes[index]) < steepest * 0.35)
            trend = `완만하게 ${trend}`;
        const notes = [peakX > from && peakX <= to ? '최고점 포함' : '', lowX > from && lowX < to ? '최저점 포함' : ''].filter(Boolean);
        return `${segment} ${trend}${notes.length > 0 ? `(${notes.join(', ')})` : ''}`;
    });
}
// ------------------------------------------------------------
// 설명문(alt)
// ------------------------------------------------------------
function extChartAlt(spec) {
    const title = spec.title === undefined ? '' : ` 제목 ‘${spec.title}’.`;
    switch (spec.chartType) {
        case 'gantt': {
            const status = ganttStatus(spec);
            const lines = spec.tasks.map((task, index) => {
                const facts = status[index];
                const done = task.doneUntil === undefined ? '완료 작업량 없음' : `완료 작업량 ${task.plannedStart}${spec.unit}～${task.doneUntil}${spec.unit}`;
                return `${task.name}: 계획 ${task.plannedStart}${spec.unit}～${task.plannedEnd}${spec.unit}, ${done}${facts.complete ? '(완료)' : ''}`;
            });
            const judgements = spec.statusDay === undefined ? [] : spec.tasks.map((task, index) => {
                const facts = status[index];
                const amounts = `계획 ${facts.plannedByStatus}${spec.unit}분·완료 ${facts.doneDays}${spec.unit}분`;
                const verdict = (facts.difference ?? 0) < 0 ? `${-(facts.difference ?? 0)}${spec.unit} 지연`
                    : (facts.difference ?? 0) > 0 ? `${facts.difference}${spec.unit} 앞섬` : '계획대로';
                return `${task.name} ${verdict}(${amounts})`;
            });
            return [
                `간트 차트.${title} 가로: ${spec.periodLabel} ${spec.start}～${spec.end}${spec.unit}, 세로: 작업.`,
                '범례: ┌ ┐ 괄호선 = 계획 작업량(예정 시작일～예정 종료일), 빗금 막대 = 완료 작업량.',
                spec.statusDay === undefined ? '' : `기준일(세로 점선): ${spec.statusDay}${spec.unit}.`,
                `${lines.join('. ')}.`,
                judgements.length === 0 ? '' : `[엔진 계산] 기준일까지 계획 대비: ${judgements.join(', ')}.`,
            ].filter(Boolean).join(' ');
        }
        case 'control': {
            const facts = controlFacts(spec);
            const out = facts.outOfLimits.length === 0
                ? '관리 한계선을 벗어난 점 없음'
                : `관리 한계선을 벗어난 점: ${facts.outOfLimits.map((point) => `${point.index}번째(${(0, figure_parse_1.fmtNum)(point.value)}, ${point.side === 'upper' ? '상한선 위' : '하한선 아래'})`).join(', ')}`;
            return [
                `관리도.${title} 가로축 ‘${spec.xLabel}’ 1～${spec.values.length}, 세로축 ‘${spec.yLabel}’.`,
                `중심선 ${(0, figure_parse_1.fmtNum)(spec.center)}, 관리 상한선 ${(0, figure_parse_1.fmtNum)(spec.upper)}, 관리 하한선 ${(0, figure_parse_1.fmtNum)(spec.lower)}.`,
                `점(순서대로): ${spec.values.map(figure_parse_1.fmtNum).join(', ')}.`,
                `[엔진 계산] ${out}. 중심선 한쪽 연속 최다 ${facts.longestRun.length}점(${facts.longestRun.from}～${facts.longestRun.to}번째, 중심선 ${facts.longestRun.side === 'upper' ? '위' : '아래'}). 연속 ${facts.longestTrend.direction === 'up' ? '상승' : '하강'} 최다 ${facts.longestTrend.length}점(${facts.longestTrend.from}～${facts.longestTrend.to}번째).`,
                `판정(한계선 밖 점 또는 연속 ${exports.CONTROL_RUN_LIMIT}점 이상의 런·경향이 있으면 이상): ${facts.inControl ? '관리 상태' : '관리 이상 상태(이상 원인 의심)'}.`,
            ].join(' ');
        }
        case 'scatter':
            return `산점도 ${spec.panels.length}개.${title} ${spec.panels.map((panel, index) => {
                const { r } = scatterPoints(spec, index);
                return `${panel.title === undefined ? `${index + 1}번째` : `‘${panel.title}’`}: 가로축 ‘${panel.xLabel}’(0～100), 세로축 ‘${panel.yLabel}’(0～100), 점 ${spec.points}개가 ${correlationText(r)} [엔진 계산: 상관 계수 약 ${r >= 0 ? '' : '−'}${Math.abs(r).toFixed(2)}]`;
            }).join('. ')}.`;
        case 'curve': {
            const lines = curveLines(spec);
            const segments = spec.segments ?? (spec.preset === 'lifecycle' ? ['도입기', '성장기', '성숙기', '쇠퇴기'] : []);
            return [
                `${spec.preset === 'lifecycle' ? '제품 수명 주기 곡선' : '곡선 그래프'}.${title} 가로축 ‘${spec.xLabel}’, 세로축 ‘${spec.yLabel}’(눈금 없음, 0에서 시작).`,
                segments.length === 0 ? '' : `가로축은 점선으로 같은 너비의 ${segments.length}구간(${segments.join(', ')})으로 나뉨.`,
                ...lines.map((line) => {
                    const trends = curveSegmentTrends(spec, line);
                    return `곡선 ‘${line.name}’: ${trends.length > 0 ? `[엔진 계산] 구간별 변화 ${trends.join(', ')}` : `지나는 점 ${line.points.map(([x, y]) => `(${(0, figure_parse_1.fmtNum)(x)}, ${(0, figure_parse_1.fmtNum)(y)})`).join(' → ')}`}.`;
                }),
            ].filter(Boolean).join(' ');
        }
    }
}
function correlationText(r) {
    if (Math.abs(r) < 0.2)
        return '뚜렷한 방향 없이 흩어짐(상관관계 없음)';
    const strength = Math.abs(r) >= 0.8 ? '강한 ' : '';
    return r > 0 ? `오른쪽 위로 올라가는 띠 모양(${strength}양의 상관관계)` : `오른쪽 아래로 내려가는 띠 모양(${strength}음의 상관관계)`;
}
