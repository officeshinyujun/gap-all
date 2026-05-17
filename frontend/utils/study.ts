import { StudyMode, type Unit, type StudyProgress } from '@/types/study';
import type { SubUnit } from '@/components/study/UnitCard';

export type SubUnitStatus = 'completed' | 'in_progress' | 'not_started';

/** 진행률(0~100)을 SubUnit 상태 값으로 변환합니다. */
export function getSubUnitStatus(percent: number): SubUnitStatus {
    if (percent === 100) return 'completed';
    if (percent > 0) return 'in_progress';
    return 'not_started';
}

const STUDY_MODE_TITLES: Record<StudyMode, string> = {
    [StudyMode.BASIC_CONCEPT]: '기초 개념',
    [StudyMode.BLANK_FILL]: '빈칸 문제 풀기',
    [StudyMode.INTERACTIVE_QUIZ]: '양방향 개념 문제 풀이',
    [StudyMode.PRACTICE_EXAM]: '실전 문제 풀이',
    [StudyMode.REVIEW_INCORRECT]: '오답 재풀이',
};

const STUDY_MODES: StudyMode[] = [
    StudyMode.BASIC_CONCEPT,
    StudyMode.BLANK_FILL,
    StudyMode.INTERACTIVE_QUIZ,
    StudyMode.PRACTICE_EXAM,
    StudyMode.REVIEW_INCORRECT,
];

export interface UnitWithProgress extends Omit<Unit, 'progress'> {
    progress: number;
    subUnits: SubUnit[];
}

/**
 * Unit 목록과 StudyProgress 목록을 받아
 * 각 Unit에 progress와 subUnits을 포함한 UI용 데이터로 변환합니다.
 */
export function computeUnitsWithProgress(
    units: Unit[],
    progressList: StudyProgress[]
): UnitWithProgress[] {
    return units.map(unit => {
        const unitProgress = progressList.filter(p => p.unitId === unit.id);
        let totalPercent = 0;

        const subUnits = STUDY_MODES.map((mode, idx) => {
            const prog = unitProgress.find(p => p.studyMode === mode);
            const percent = prog?.progressPercent ?? 0;
            totalPercent += percent;

            return {
                id: idx + 1,
                mode,
                title: STUDY_MODE_TITLES[mode],
                progress: percent,
                status: getSubUnitStatus(percent),
                lastStudiedAt: prog?.lastStudiedAt,
                // isActive는 아래에서 결정
                isActive: false,
            };
        });

        // 첫 번째 미완료 항목을 active로 설정
        let activeAssigned = false;
        const finalSubUnits = subUnits.map(sub => {
            if (!activeAssigned && sub.status !== 'completed') {
                activeAssigned = true;
                return { ...sub, isActive: true };
            }
            return sub;
        });
        // 전부 완료된 경우 첫 번째를 active
        if (!activeAssigned && finalSubUnits.length > 0) {
            finalSubUnits[0] = { ...finalSubUnits[0], isActive: true };
        }

        return {
            ...unit,
            progress: Math.round(totalPercent / STUDY_MODES.length),
            subUnits: finalSubUnits,
        };
    });
}
