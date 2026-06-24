/**
 * 날짜를 상대적 표현으로 변환합니다.
 * - 오늘이면 '오늘'
 * - 이전이면 'N일 전'
 * - 날짜 없으면 '기록 없음'
 */
export function formatDaysAgo(date?: Date | string): string {
    if (!date) return '기록 없음';
    const days = Math.floor(
        (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 0) return '오늘';
    return `${days}일 전`;
}

/** 배열 내 가장 최근 날짜를 반환합니다. */
export function getLatestDate(
    dates: (Date | string | undefined)[]
): Date | string | undefined {
    return dates
        .filter((d): d is Date | string => d != null)
        .sort(
            (a, b) =>
                new Date(b).getTime() - new Date(a).getTime()
        )[0];
}
