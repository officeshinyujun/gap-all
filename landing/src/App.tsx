import { useState, useEffect } from 'react'
import './App.css'

const faqs = [
  {
    q: '어떤 학생을 위한 서비스인가요?',
    a: '직업계 고등학생이 개념 학습, 문제 풀이, 시험 대비, 복습까지 한 흐름으로 할 수 있도록 만든 서비스입니다.',
  },
  {
    q: '어떤 방식으로 공부하나요?',
    a: '단원별 개념 학습 후 문제 풀이와 시험, 오답 복습으로 이어집니다.',
  },
  {
    q: 'AI는 어디에 활용되나요?',
    a: '시험 생성과 학습 질문 응답 등 실제 학습 경험을 돕는 기능에 활용됩니다.',
  },
  {
    q: '틀린 문제는 다시 볼 수 있나요?',
    a: '네. 오답 기반 복습 흐름으로 다시 확인할 수 있습니다.',
  },
  {
    q: '공부 중 질문도 가능한가요?',
    a: '네. AI 채팅으로 바로 질문하고 이어서 학습할 수 있습니다.',
  },
]

const steps = [
  { num: '01', title: '개념 학습', desc: '단원별 핵심 내용을 구조화된 화면에서 학습합니다' },
  { num: '02', title: '문제 확인', desc: '빈칸 문제와 개념 매칭으로 이해를 바로 확인합니다' },
  { num: '03', title: '실전 시험', desc: '학습 범위에 맞는 AI 생성 시험을 풀어봅니다' },
  { num: '04', title: '오답 복습', desc: '틀린 내용을 다시 확인하며 약한 부분을 반복합니다' },
  { num: '05', title: 'AI 질문', desc: '막히는 개념은 AI 채팅으로 바로 질문합니다' },
]

const features = [
  {
    title: '단원별 진도 학습',
    desc: '학습한 위치를 확인하고 다음 단계로 바로 이어집니다',
    tag: '학습',
  },
  {
    title: 'AI 시험 생성',
    desc: '학습 범위에 맞는 시험을 자동으로 만들고 직접 풀어볼 수 있습니다',
    tag: 'AI',
  },
  {
    title: '오답 복습',
    desc: '틀린 내용을 다시 확인하며 약한 부분을 반복 학습합니다',
    tag: '복습',
  },
  {
    title: 'AI 채팅',
    desc: '막히는 개념은 바로 질문하고 학습을 이어갈 수 있습니다',
    tag: 'AI',
  },
]

function MockUI() {
  return (
    <div className="mock-ui">
      <div className="mock-frame">
        <div className="mock-bar">
          <div className="mock-bar-dot" />
          <div className="mock-bar-dot" />
          <div className="mock-bar-dot" />
        </div>
        <div className="mock-body">
          <div className="mock-header-row">
            <div className="mock-chip">2단원 · 개념 학습</div>
            <div className="mock-progress-wrap">
              <div className="mock-progress-bar">
                <div className="mock-progress-fill" />
              </div>
              <span className="mock-progress-label">68%</span>
            </div>
          </div>
          <div className="mock-card-main">
            <div className="mock-card-label">핵심 개념</div>
            <div className="mock-card-title">정보 처리 기술의 이해</div>
            <div className="mock-card-lines">
              <div className="mock-line w80" />
              <div className="mock-line w60" />
              <div className="mock-line w70" />
            </div>
          </div>
          <div className="mock-row-btns">
            <div className="mock-btn-outline">이전</div>
            <div className="mock-btn-fill">다음 단계 →</div>
          </div>
          <div className="mock-bottom-row">
            <div className="mock-stat-item">
              <span className="mock-stat-num">5</span>
              <span className="mock-stat-lbl">학습 단계</span>
            </div>
            <div className="mock-stat-divider" />
            <div className="mock-stat-item">
              <span className="mock-stat-num">AI</span>
              <span className="mock-stat-lbl">시험 생성</span>
            </div>
            <div className="mock-stat-divider" />
            <div className="mock-stat-item">
              <span className="mock-stat-num">∞</span>
              <span className="mock-stat-lbl">오답 복습</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`faq-item${open ? ' open' : ''}`} onClick={() => setOpen(!open)}>
      <div className="faq-row">
        <span className="faq-question">{q}</span>
        <span className="faq-icon">{open ? '−' : '+'}</span>
      </div>
      {open && <p className="faq-answer">{a}</p>}
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
      <header className={`header${scrolled ? ' scrolled' : ''}`}>
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">28</div>
            <span>2830</span>
          </div>
          <nav className="nav-links">
            <a href="#how-it-works">학습 방식</a>
            <a href="#features">핵심 기능</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="header-actions">
            <a href="#" className="header-login">로그인</a>
            <button className="header-cta">무료로 시작</button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              직업계고 AI 학습 플랫폼
            </div>
            <h1>
              개념부터 복습까지<br />
              <em>끊기지 않는 학습</em>
            </h1>
            <p className="hero-subtitle">
              개념 학습, 시험, 오답 복습, AI 질문까지 한 흐름으로 이어지는 학습 경험.
            </p>
            <div className="hero-buttons">
              <button className="btn btn-primary">지금 시작하기 →</button>
              <button className="btn btn-secondary">학습 방식 보기</button>
            </div>
          </div>
          <MockUI />
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-num">5단계</span>
            <span className="hero-stat-lbl">완결된 학습 흐름</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-num">AI 기반</span>
            <span className="hero-stat-lbl">맞춤 시험 생성</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-num">직업계고</span>
            <span className="hero-stat-lbl">전용 과목 구성</span>
          </div>
        </div>
      </section>

      <section className="how-it-works" id="how-it-works">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-label">학습 방식</span>
            <h2 className="section-title">이해부터 복습까지<br />자연스럽게 이어집니다</h2>
          </div>
          <div className="steps">
            {steps.map((s) => (
              <div className="step" key={s.num}>
                <span className="step-num">{s.num}</span>
                <div className="step-body">
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-label">핵심 기능</span>
            <h2 className="section-title">혼자 공부할 때<br />필요한 기능을 한곳에</h2>
          </div>
          <div className="features-grid">
            {features.map((f) => (
              <div className="feature-card" key={f.title}>
                <span className="feature-tag">{f.tag}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="section-inner faq-inner">
          <div className="section-head">
            <span className="section-label">FAQ</span>
            <h2 className="section-title">자주 묻는 질문</h2>
          </div>
          <div className="faq-list">
            {faqs.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section" id="cta">
        <div className="cta-inner">
          <h2>이제, 끊기지 않는<br />학습을 시작해보세요</h2>
          <p>개념부터 복습까지, 2830이 학습 흐름을 연결합니다.</p>
          <button className="btn btn-cta">지금 시작하기 →</button>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="logo">
              <div className="logo-mark">28</div>
              <span>2830</span>
            </div>
            <p>직업계고 학생을 위한 AI 학습 플랫폼</p>
          </div>
          <div className="footer-links">
            <a href="#how-it-works">학습 방식</a>
            <a href="#features">핵심 기능</a>
            <a href="#faq">FAQ</a>
            <a href="#terms">이용약관</a>
            <a href="#privacy">개인정보처리방침</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2025 2830. All rights reserved.</p>
        </div>
      </footer>
    </>
  )
}

export default App
