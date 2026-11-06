export const DEFAULT_REFERENCE_PARSE_VERSION = 'reference-pdf-v2';

// reference_questions에는 여러 추출 버전이 공존한다. 읽는 쪽은 모두 이 값으로 필터링해야
// 버전 전환·롤백을 env 하나(REFERENCE_PARSE_VERSION)로 할 수 있다.
export function activeReferenceParseVersion(): string {
  return process.env.REFERENCE_PARSE_VERSION?.trim() || DEFAULT_REFERENCE_PARSE_VERSION;
}
