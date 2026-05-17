import './App.css'

function App() {
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">28</div>
            <span>2830</span>
          </div>
          <nav className="nav-links">
            <a href="#how-it-works">학습 방식</a>
            <a href="#features">핵심 기능</a>
            <a href="#faq">FAQ</a>
            <a href="#cta">시작하기</a>
          </nav>
          <div className="header-actions">
            <button className="header-login">로그인</button>
            <button className="header-cta">무료로 시작 <span className="cta-arrow">&#8594;</span></button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="hero-badge-dot"></span>
              직업계고 AI 학습 플랫폼
            </div>
            <h1>
              개념부터 복습까지, 끊기지 않는 <em>학습</em>
            </h1>
            <p className="hero-subtitle">
              개념 학습부터 시험 풀이, 오답 복습, AI 질문까지 한 흐름으로 이어지는 학습 플랫폼.
            </p>
            <div className="hero-buttons">
              <button className="btn btn-primary">지금 시작하기 <span className="btn-arrow">&#8594;</span></button>
              <button className="btn btn-secondary">학습 방식 보기</button>
            </div>
            <div className="hero-tags">
              <span className="hero-tag">단원별 학습</span>
              <span className="hero-tag">AI 시험 생성</span>
              <span className="hero-tag">오답 복습</span>
              <span className="hero-tag">AI 채팅</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-orb"></div>
            <div className="floating-card floating-card-1">
              <div className="card-stat">
                <div className="card-stat-icon blue">&#9650;</div>
                <div className="card-stat-info">
                  <div className="card-stat-value">5단계</div>
                  <div className="card-stat-label">학습 흐름</div>
                </div>
              </div>
            </div>
            <div className="floating-card floating-card-2">
              <div className="card-user">
                <div className="card-avatar">김</div>
                <div className="card-user-info">
                  <div className="card-user-name">김</div>
                  <div className="card-user-role">특성화고 2학년</div>
                </div>
              </div>
            </div>
            <div className="floating-card floating-card-3">
              <div className="card-stat">
                <div className="card-stat-icon green">&#9881;</div>
                <div className="card-stat-info">
                  <div className="card-stat-value">AI 생성</div>
                  <div className="card-stat-label">맞춤 시험</div>
                </div>
              </div>
            </div>
            <div className="floating-card floating-card-4">
              <div className="card-stat">
                <div className="card-stat-icon amber">&#9733;</div>
                <div className="card-stat-info">
                  <div className="card-stat-value">오답 복습</div>
                  <div className="card-stat-label">자동 추천</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="why" id="why">
        <span className="section-label">왜 2830인가요</span>
        <h2 className="section-title">혼자 공부해도, 다음 학습이 보이도록</h2>
        <p className="section-subtitle">
          개념만 읽고 끝나는 공부가 아니라, 문제로 확인하고, 틀린 내용을 다시 복습하고, 막히면 바로 질문할 수 있도록 학습 흐름을 연결합니다.
        </p>
        <div className="why-cards">
          <div className="why-card">
            <h3>학습 자료 부족</h3>
            <p>직업계 과목은 일반 입시 서비스에서 다루지 않습니다</p>
          </div>
          <div className="why-card">
            <h3>끊기는 학습 동선</h3>
            <p>개념을 읽고 나면 다음에 뭘 해야 할지 막막합니다</p>
          </div>
          <div className="why-card">
            <h3>복습 없는 반복</h3>
            <p>틀린 문제를 따로 정리하지 않으면 같은 실수를 반복합니다</p>
          </div>
        </div>
      </section>

      <section className="how-it-works" id="how-it-works">
        <div className="how-it-works-inner">
          <span className="section-label">학습 방식</span>
          <h2 className="section-title">이해부터 복습까지 자연스럽게 이어집니다</h2>
          <p className="section-subtitle">
            지금 필요한 학습을 바로 시작하고, 다음 단계까지 끊김 없이 이어갈 수 있습니다.
          </p>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <span className="step-connector"></span>
              <h3>개념 학습</h3>
              <p>단원별 핵심 내용을 구조화된 화면에서 학습합니다</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <span className="step-connector"></span>
              <h3>문제 확인</h3>
              <p>빈칸 문제와 개념 매칭으로 이해를 바로 확인합니다</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <span className="step-connector"></span>
              <h3>실전 시험</h3>
              <p>학습 범위에 맞는 AI 생성 시험을 풀어봅니다</p>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <span className="step-connector"></span>
              <h3>오답 복습</h3>
              <p>틀린 내용을 다시 확인하며 약한 부분을 반복합니다</p>
            </div>
            <div className="step">
              <div className="step-number">5</div>
              <h3>AI 질문</h3>
              <p>막히는 개념은 AI 채팅으로 바로 질문합니다</p>
            </div>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <span className="section-label">핵심 기능</span>
        <h2 className="section-title">혼자 공부할 때 필요한 기능을 한곳에</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon blue">&#9670;</div>
            <h3>단원별 진도 학습</h3>
            <p>학습한 위치를 확인하고 다음 단계로 바로 이어집니다</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon green">&#9881;</div>
            <h3>단계형 문제 풀이</h3>
            <p>빈칸, 개념 매칭, 실전 문제로 이해를 확인합니다</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon amber">&#9733;</div>
            <h3>AI 시험 생성</h3>
            <p>학습 범위에 맞는 시험을 만들고 직접 풀어볼 수 있습니다</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon pink">&#9829;</div>
            <h3>오답 복습</h3>
            <p>틀린 내용을 다시 확인하며 약한 부분을 반복 학습합니다</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon indigo">&#9672;</div>
            <h3>AI 채팅</h3>
            <p>막히는 개념은 바로 질문하고 학습을 이어갈 수 있습니다</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon teal">&#9678;</div>
            <h3>학습 루틴 유지</h3>
            <p>복습 추천과 알림으로 꾸준한 학습을 돕습니다</p>
          </div>
        </div>
      </section>

      <section className="difference" id="difference">
        <div className="difference-inner">
          <span className="section-label">차별점</span>
          <h2 className="section-title">AI를 보여주기보다, 공부에 연결합니다</h2>
          <div className="difference-cards">
            <div className="difference-card">
              <h3>직업계 과목에 맞춘 구조</h3>
              <p>학습 흐름 자체를 직업계고 학생에 맞게 설계했습니다</p>
            </div>
            <div className="difference-card">
              <h3>학습과 평가가 이어지는 경험</h3>
              <p>개념, 문제, 시험, 복습이 따로 놀지 않습니다</p>
            </div>
            <div className="difference-card">
              <h3>질문이 바로 학습으로</h3>
              <p>모르면 멈추는 대신 바로 질문하고 계속 학습할 수 있습니다</p>
            </div>
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="faq-inner">
          <span className="section-label">자주 묻는 질문</span>
          <h2 className="section-title">궁금한 점이 있으신가요?</h2>
          <div className="faq-list">
            <div className="faq-item">
              <h3 className="faq-question">어떤 학생을 위한 서비스인가요?</h3>
              <p className="faq-answer">직업계 고등학생이 개념 학습, 문제 풀이, 시험 대비, 복습까지 한 흐름으로 할 수 있도록 만든 서비스입니다.</p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">어떤 방식으로 공부하나요?</h3>
              <p className="faq-answer">단원별 개념 학습 후 문제 풀이와 시험, 오답 복습으로 이어집니다.</p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">AI는 어디에 활용되나요?</h3>
              <p className="faq-answer">시험 생성과 학습 질문 응답 등 실제 학습 경험을 돕는 기능에 활용됩니다.</p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">틀린 문제는 다시 볼 수 있나요?</h3>
              <p className="faq-answer">네. 오답 기반 복습 흐름으로 다시 확인할 수 있습니다.</p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">공부 중 질문도 가능한가요?</h3>
              <p className="faq-answer">네. AI 채팅으로 바로 질문하고 이어서 학습할 수 있습니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section" id="cta">
        <div className="cta-inner">
          <h2>이제, 끊기지 않는 학습을 시작해보세요</h2>
          <p>
            개념 학습부터 시험 대비, 오답 복습, AI 질문까지. 2830과 함께 더 자연스럽고 꾸준한 학습 흐름을 만들어보세요.
          </p>
          <button className="btn btn-primary">지금 시작하기 <span className="btn-arrow">&#8594;</span></button>
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
          <div className="footer-col">
            <h4>학습</h4>
            <ul>
              <li><a href="#concept">개념 학습</a></li>
              <li><a href="#quiz">문제 풀이</a></li>
              <li><a href="#exam">AI 시험</a></li>
              <li><a href="#review">오답 복습</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>서비스</h4>
            <ul>
              <li><a href="#about">소개</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><a href="#contact">문의하기</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>법적 고지</h4>
            <ul>
              <li><a href="#terms">이용약관</a></li>
              <li><a href="#privacy">개인정보처리방침</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 2830. All rights reserved.</p>
        </div>
      </footer>
    </>
  )
}

export default App
