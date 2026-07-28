# 랜딩페이지 스크롤 애니메이션 플랜

## 목표

한 번의 스크롤로 모든 콘텐츠가 자연스럽게 등장·변화하는 "스크롤텔링" 랜딩페이지. 
Apple, Stripe, Linear 같은 제품 페이지처럼.

## 기술 선택

**framer-motion 없이 구현** (추가 의존성 없음).
`IntersectionObserver` + CSS `transition` + `requestAnimationFrame` + CSS Custom Properties.

---

## 애니메이션 설계 (섹션별)

### 1. Header → 스크롤 다운 시 숨김, 스크롤 업 시 나타남

```
스크롤 ↓: translateY(-100%) → 사라짐
스크롤 ↑: translateY(0) → 나타남
```

`scroll` 이벤트로 `scrollY` 방향 감지해 `hidden` 클래스 토글.

### 2. Hero — 고정 + 타이틀 축소

```
┌─────────────────────────────────┐
│  직업계고 시험,                   │  ← scrollY 0~300: 전체 표시
│  단원별로 끝내는                   │
│                                  │
│  [스크린샷]                       │
│  40 / 120+ / 5 / 2               │
└─────────────────────────────────┘
         ↓ 스크롤
┌─────────────────────────────────┐
│  직업계고 시험, 단원별로 끝내는     │  ← scrollY 300~600: 타이틀 작아짐
│  [스크린샷 우측]                  │     스크린샷 왼쪽으로 이동, stats 사라짐
└─────────────────────────────────┘
```

- Hero section: `position: sticky; top: 0; height: 100vh`
- Scroll 0~50%: heroHeading `font-size: 48px → 24px`, heroDesc `opacity: 1 → 0`
- Scroll 30~60%: heroScreen `translateX(40px → 0)`, heroStats `opacity: 1 → 0`

### 3. Flow — 스티키 + 장면 전환

```
┌─────────────────────────────────┐
│  개념부터 복습까지,               │ ← 화면 고정 (sticky)
│  끊기지 않는 5단계                │
│                                  │
│  ┌──────────┐                   │ ← Scene 1: 개념 카드
│  │ Screenshot│  정의·키포인트···  │
│  └──────────┘                   │
└─────────────────────────────────┘
         ↓ 스크롤
┌─────────────────────────────────┐
│  개념부터 복습까지,               │ ← 같은 sticky 영역
│  끊기지 않는 5단계                │
│                                  │
│  ┌──────────┐                   │ ← Scene 2: 빈칸 문제 (Scene 1 fade out)
│  │ Screenshot│  시험지처럼 풀고···│
│  └──────────┘                   │
└─────────────────────────────────┘
         ↓ 계속 스크롤
         (Scene 3, 4, 5 순차 등장)
```

구현:
- `.flow` section: `position: sticky; top: 64px; height: 100vh`
- 내부에 5개 scene을 `position: absolute` 로 겹쳐놓고
- `IntersectionObserver` 로 각 scene의 marker div 감지 → 현재 scene index 결정
- 현재 scene만 `opacity: 1`, 나머지는 `opacity: 0`
- 섹션 아래에 5개의 spacer div를 두어 스크롤 공간 확보

### 4. Compare — 좌우에서 슬라이드 인

```
         ← 왼쪽에서                                     오른쪽에서 →
┌──────────┐         →         ┌──────────┐
│ 개념 카드 │                   │ 문제 적용 │
└──────────┘                   └──────────┘
```

`.compareItem`: 첫 번째는 `translateX(-60px) → 0`, 두 번째는 `translateX(60px) → 0`

### 5. Chat — 배경 패럴랙스 + 이미지 회전

```
채팅 스크린샷이 살짝 기울어져 있다가 스크롤 시 정위치로
```

`.chatScreen`: `transform: rotate(-1deg) translateY(20px) → rotate(0) translateY(0)`

### 6. Numbers — 카운트 업

```
0 → 40   (scroll 진입 시)
0 → 120+
0 → 5
0 → 2
```

`IntersectionObserver` 진입 시 CSS `@keyframes` count-up 시뮬레이션 또는 JS `setInterval`.
간단하게는 `opacity + scale` 로 대체.

### 7. CTA — 배경 확장 + 텍스트 등장

```
#fafafa 배경이 아래에서 위로 차오르는 느낌
```

---

## 구현 순서

1. **Hero sticky + 타이틀 축소** — scrollY에 따라 font-size, opacity 변화
2. **Flow sticky + 장면 전환** — 5개 scene 교차 (핵심)
3. **Compare 슬라이드 인** — IntersectionObserver + translateX
4. **Chat 패럴랙스** — transform 기반
5. **Numbers scale** — scale(0.8→1) + opacity
6. **CTA 배경 채우기** — background-size transition
7. **Header show/hide** — scroll 방향 감지

## 사용 기술

- `useEffect` + `scroll` 이벤트 → `requestAnimationFrame` → CSS Custom Property `--scroll-y`
- `IntersectionObserver` → `.visible` 클래스 토글
- CSS `transition` + `transform` + `opacity`
- `position: sticky` + `overflow: hidden` (Flow 장면 전환)
- SCSS Custom Properties: `--hero-scale`, `--hero-opacity` 등

## 파일 변경

- `page.tsx`: scroll listener 추가, FlowCard를 scene으로 변경, spacer div 추가
- `page.module.scss`: sticky, absolute positioning, transition, animation keyframes

## 예상 시간

약 1.5~2시간 (JS 로직 + CSS 애니메이션 디버깅)
