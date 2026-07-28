# 랜딩페이지 리디자인 — frontend 내 `/landing` 확장

## 현재 상태

```
frontend/app/(auth)/landing/
├── page.tsx        (35줄 — 로고 + 제목 + 시작하기 버튼만)
└── page.module.scss (71줄 — 360px 카드 중앙정렬)
```

**기술 스택**: React Router, SCSS Module, Geist Sans 폰트, `styles/variables.scss` 디자인 토큰

## 목표

현재의 단순 스플래시 화면을 8섹션 풀 랜딩페이지로 확장. `/landing` 라우트는 그대로 유지.

## 변경 범위

| 파일 | 작업 |
|------|------|
| `page.tsx` | 35줄 → ~350줄, 8섹션 |
| `page.module.scss` | 71줄 → ~600줄, 모든 스타일 |
| `frontend/public/screens/` | PNG 8장 추가 (추후) |

## 새 구조 (8섹션)

```
1. Header     [2830] ··· [시작하기]                     (fixed, scroll-aware)
2. Hero       좌: 텍스트 + CTA / 우: 스크린샷 플레이스홀더
3. Flow       가로 스크롤 5단계 (개념→빈칸→매칭→시험→복습)
4. Compare    개념카드 vs 문제적용 2열 비교
5. Chat       좌: 텍스트 / 우: 채팅 스크린샷
6. Numbers    40 / 120+ / 5 / 2
7. Extras     북마크 + 연속학습일 + 통계
8. Subjects   두 과목 카드 (실제 개념명 표시)
9. CTA        짧은 마무리
```

## 구현 시 주의사항

- `'use client'` 유지 (useEffect로 auth redirect)
- SCSS variables 재사용 (`$brand-primary`, `$text-primary`, `$spacing-*` 등)
- Geist Sans 폰트 그대로 사용
- 스크린샷은 `.screenshot` 클래스의 div로 플레이스홀더 (추후 `frontend/public/screens/` 밑에 PNG 넣으면 `<img>`로 교체)
- 기존 auth redirect 로직 유지 (로그인된 유저는 `/`로 리다이렉트)
