import { useState, useEffect } from 'react'
import './App.css'

const SUBJECTS = [
  { slug: 'success', name: '성공적인 직업생활', desc: '일과 직업부터 직업 윤리까지, 20개 단원으로 구성된 직업 탐구 과목입니다.', concepts: ['직업 가치관(내재적/외재적)', '근로기준법(근로시간, 휴게시간)', '하렌의 진로 의사 결정 유형', 'NCS 직업기초능력 10개 영역', '홀랜드 직업 흥미 유형'] },
  { slug: 'industry', name: '공업 일반', desc: '산업 분류부터 진로 결정까지, 20개 단원의 공업 이론을 다룹니다.', concepts: ['6시그마와 TQM(전사적 품질 경영)', 'JIT와 린 생산 시스템', '생산 정보 시스템(MES, ERP)', '풀 프루프와 페일 세이프', '클라크·호프만의 산업 분류'] },
]

const FLOW_STEPS = [
  { num: 1, title: '개념 카드', desc: '정의·키포인트·오답함정을 한 장에', screen: '04a-concept-card', wide: false },
  { num: 2, title: '빈칸 문제', desc: '시험지처럼 풀고 즉시 해설', screen: '02-blank-quiz', wide: false },
  { num: 3, title: '개념 매칭', desc: '직접 정의 쓰고 자가채점', screen: '03-concept-match', wide: false },
  { num: 4, title: '실전 시험', desc: '단원 범위·난이도 설정, 모의고사', screen: '05-exam', wide: true },
  { num: 5, title: '오답 복습', desc: '틀린 개념만 골라 재학습', screen: '06-review', wide: false },
]

const STATS = [
  { num: '40', label: '전체 단원' },
  { num: '120+', label: '시험빈출 개념' },
  { num: '5', label: '학습 단계' },
  { num: '2', label: '과목' },
]

function Screenshot({ id, label, ratio = '16/10' }: { id: string; label: string; ratio?: string }) {
  return (
    <div className="screenshot" style={{ aspectRatio: ratio }}>
      <div className="screenshot-inner">
        <span className="screenshot-label">{label}</span>
        <span className="screenshot-id">{id}.png</span>
      </div>
    </div>
  )
}

function App() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      {/* 1. Header */}
      <header className={`header${scrolled ? ' scrolled' : ''}`}>
        <div className="header-inner">
          <div className="logo">2830</div>
          <a href="https://app.2830.kr" className="header-start">시작하기</a>
        </div>
      </header>

      {/* 2. Hero */}
      <section className="hero">
        <div className="hero-bg-deco" />
        <div className="hero-grid">
          <div className="hero-text">
            <span className="hero-badge">성공적인 직업생활 · 공업일반</span>
            <h1 className="hero-heading">
              직업계고 시험,<br />
              <span className="hero-highlight">단원별</span>로 끝내는
            </h1>
            <p className="hero-desc">
              40개 단원을 개념 카드부터 빈칸 문제, 실전 시험, 오답 복습까지
              5단계로 빈틈없이 학습합니다.
            </p>
            <div className="hero-btns">
              <a href="https://app.2830.kr" className="btn-primary">지금 시작하기</a>
              <a href="#flow" className="btn-ghost">학습 과정 살펴보기</a>
            </div>
          </div>
          <div className="hero-screen">
            <div className="hero-image-wrap">
              <img
                src="/01-study-detail.png"
                alt="2830 학습 화면 — 단원 목록, 진도율, 개념 태그"
                className="hero-image"
              />
              <div className="hero-image-shadow" />
            </div>
          </div>
        </div>
        <div className="hero-stats">
          {STATS.map((s) => (
            <div className="hero-stat" key={s.label}>
              <span className="hero-stat-num">{s.num}</span>
              <span className="hero-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 학습 흐름 */}
      <section className="flow" id="flow">
        <div className="flow-head">
          <h2 className="section-title">개념부터 복습까지,<br />끊기지 않는 5단계</h2>
          <p className="section-sub">각 단계마다 실제 앱 화면입니다. 스크린샷은 추후 교체됩니다.</p>
        </div>
        <div className="flow-scroll">
          {FLOW_STEPS.map((s) => (
            <div className={`flow-card${s.wide ? ' wide' : ''}`} key={s.num}>
              <Screenshot id={s.screen} label={s.title} ratio={s.wide ? '16/9' : '3/4'} />
              <div className="flow-card-text">
                <span className="flow-card-num">{s.num}</span>
                <h3 className="flow-card-title">{s.title}</h3>
                <p className="flow-card-desc">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 개념 → 시험 비교 */}
      <section className="compare" id="compare">
        <div className="compare-grid">
          <div className="compare-card">
            <Screenshot id="04a-concept-card" label="개념 카드 — 정의·키포인트·함정" ratio="4/3" />
            <div className="compare-text">
              <span className="compare-tag">개념 학습</span>
              <h3>정의부터 오답 함정까지,<br />한 장에 담았습니다</h3>
              <p>120개 이상의 시험빈출 개념을 정의, 핵심 포인트, 자주 틀리는 함정까지 카드 한 장으로 정리했습니다.</p>
            </div>
          </div>
          <div className="compare-divider">
            <span>→</span>
          </div>
          <div className="compare-card">
            <Screenshot id="04b-concept-apply" label="문제 적용 — 같은 개념의 기출 예시" ratio="4/3" />
            <div className="compare-text">
              <span className="compare-tag accent">문제 적용</span>
              <h3>이 개념이 시험에<br />이렇게 나옵니다</h3>
              <p>개념 카드에서 바로 '문제 적용' 탭으로 전환하면, 같은 개념이 실제 기출에서 어떻게 출제되는지 확인할 수 있습니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. AI 채팅 */}
      <section className="chat" id="chat">
        <div className="chat-grid">
          <div className="chat-text">
            <h2 className="section-title">문제 찍어서<br />물어보세요</h2>
            <p className="chat-desc">
              풀이가 막힌다면 사진 한 장이면 충분합니다.<br />
              AI가 문제를 분석하고 풀이를 설명해줍니다.
            </p>
            <ul className="chat-features">
              <li>이미지 업로드로 문제 질문</li>
              <li>마크다운 형식의 풀이 해설</li>
              <li>관련 기출 유사 문제 자동 추천</li>
              <li>여러 세션으로 주제별 대화</li>
            </ul>
          </div>
          <div className="chat-screen">
            <Screenshot id="07-chat-image" label="AI 채팅 — 이미지 질문 + 유사문제 추천" ratio="3/4" />
          </div>
        </div>
      </section>

      {/* 6. 숫자로 보는 2830 */}
      <section className="numbers" id="numbers">
        {STATS.map((s) => (
          <div className="number-item" key={s.label}>
            <span className="number-num">{s.num}</span>
            <span className="number-label">{s.label}</span>
          </div>
        ))}
      </section>

      {/* 7. 북마크 + 스트릭 */}
      <section className="extras" id="extras">
        <div className="extras-grid">
          <div className="extra-item">
            <Screenshot id="08-bookmarks" label="개념리스트 — 북마크 모아보기" ratio="16/10" />
            <div className="extra-text">
              <h3>개념 북마크</h3>
              <p>학습 중 저장한 개념을 개념리스트에서 한눈에 모아봅니다. 과목·단원별로 정리되어 언제든 다시 꺼내볼 수 있습니다.</p>
            </div>
          </div>
          <div className="extra-item">
            <div className="streak-box">
              <span className="streak-num">7</span>
              <span className="streak-unit">일째 연속 학습 중</span>
              <div className="streak-dots">
                {['월','화','수','목','금','토','일'].map((d, i) => (
                  <div className={`streak-dot${i < 5 ? ' done' : ''}`} key={d}>
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="extra-text">
              <h3>연속 학습일</h3>
              <p>매일 학습할수록 스트릭이 쌓입니다. 오늘도 공부하면 내일은 8일째.</p>
              <div className="extra-mini-stats">
                <div><strong>32</strong><span>총 학습일</span></div>
                <div><strong>18</strong><span>완료 단원</span></div>
                <div><strong>47</strong><span>응시 횟수</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. 과목 소개 */}
      <section className="subjects" id="subjects">
        <div className="subjects-head">
          <h2 className="section-title">두 과목, 40개 단원</h2>
          <p className="section-sub">직업계고 시험에 나오는 모든 내용을 담았습니다.</p>
        </div>
        <div className="subjects-grid">
          {SUBJECTS.map((subj) => (
            <div className="subject-card" key={subj.slug}>
              <h3 className="subject-name">{subj.name}</h3>
              <p className="subject-desc">{subj.desc}</p>
              <div className="subject-concepts">
                {subj.concepts.map((c) => (
                  <span className="subject-concept" key={c}>{c}</span>
                ))}
              </div>
              <a href={`https://app.2830.kr/study/${subj.slug}`} className="subject-link">{subj.name} 시작하기 →</a>
            </div>
          ))}
        </div>
      </section>

      {/* 9. CTA */}
      <section className="cta">
        <h2>지금 시작하기</h2>
        <p>성공적인 직업생활 · 공업일반<br />단원별 학습 시작 →</p>
        <a href="https://app.2830.kr" className="btn-primary">무료로 시작하기</a>
      </section>

      {/* 10. Footer */}
      <footer className="footer">
        <div className="footer-top">
          <div className="logo">2830</div>
          <p>직업계고 시험 대비 학습 플랫폼</p>
        </div>
        <div className="footer-bottom">
          <span>© 2025 2830</span>
        </div>
      </footer>
    </>
  )
}

export default App
