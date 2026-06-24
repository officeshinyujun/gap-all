/** subject slug를 한글 과목명으로 변환합니다. */
export const SUBJECT_NAMES: Record<string, string> = {
    industry: '공업 일반',
    success: '성공적인 직업생활',
};

export function getSubjectName(subject: string): string {
    return SUBJECT_NAMES[subject] ?? subject;
}
