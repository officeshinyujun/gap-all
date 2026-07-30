'use client'

import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@shared/contexts/AuthContext'
import { ConceptCardDemo, BlankQuizDemo, ConceptMatchDemo, ExamPreviewDemo, ReviewPreviewDemo, ConceptApplyDemo, ChatPreviewDemo, BookmarkListDemo } from './demo-components'
import s from './page.module.scss'

const FLOW_STEPS = [
  { n: 1, title: '개념 카드로 빠르게 암기', desc: '120개 시험빈출 개념. 정의부터 키포인트, 오답 함정까지 한 장으로 끝냅니다. 외울 것만 딱!', screen: '04a-concept-card', wide: false },
  { n: 2, title: '빈칸 문제로 바로 확인', desc: '방금 외운 개념, 시험지 스타일로 채워보고 즉시 채점·해설. 눈으로만 보면 착각합니다.', screen: '02-blank-quiz', wide: false },
  { n: 3, title: '개념 매칭으로 진짜 이해', desc: '용어 뜻을 직접 타이핑하며 내가 진짜 아는 건지 스스로 체크합니다. 모르는 척 못 합니다.', screen: '03-concept-match', wide: false },
  { n: 4, title: '실전 모의시험으로 감각 완성', desc: '원하는 단원과 난이도를 설정해 실제 시험처럼 응시. 시간 압박 속에서도 실수하지 않게.', screen: '05-exam', wide: true },
  { n: 5, title: '오답만 골라 3번 반복', desc: '틀린 개념은 3회 연속 정답까지 자동 반복. 약점을 강점으로 바꾸는 마지막 단계.', screen: '06-review', wide: false },
]

function HeroImg({ id, aspect }: { id: string; aspect: string }) {
  return <img src={`/screens/${id}.png`} alt="" className={s.screenshot} style={{ aspectRatio: aspect }} />
}

function FlowCard({ step, index }: { step: typeof FLOW_STEPS[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null); const [visible, setVisible] = useState(false)
  const isEven = index % 2 === 0
  useEffect(() => { const el = ref.current; if (!el) return; const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 }); obs.observe(el); return () => obs.disconnect() }, [])
  return (
    <div ref={ref} className={`${s.flowCard}${visible ? ` ${s.visible}` : ''}${isEven ? '' : ` ${s.reversed}`}`} style={{ transitionDelay: `${index * 100}ms` }}>
      <div className={s.flowCardDemo}>
        {step.n === 1 ? <ConceptCardDemo /> : step.n === 2 ? <BlankQuizDemo /> : step.n === 3 ? <ConceptMatchDemo /> : step.n === 4 ? <ExamPreviewDemo /> : <ReviewPreviewDemo />}
      </div>
      <div className={s.flowCardBody}>
        <div className={s.flowCardStep}>
          <span className={s.flowCardNum}>{String(step.n).padStart(2, '0')}</span>
          <span className={s.flowCardStepLabel}>STEP</span>
        </div>
        <h3 className={s.flowCardTitle}>{step.title}</h3>
        <p className={s.flowCardDesc}>{step.desc}</p>
      </div>
    </div>
  )
}

function useScrollY() { const [y,setY]=useState(0); useEffect(()=>{let r=0;const f=()=>{cancelAnimationFrame(r);r=requestAnimationFrame(()=>setY(window.scrollY))};window.addEventListener('scroll',f,{passive:true});return()=>{window.removeEventListener('scroll',f);cancelAnimationFrame(r)}},[]);return y }
function useInView(ref: React.RefObject<HTMLElement|null>, th=0.15) { const [v,setV]=useState(false); useEffect(()=>{const e=ref.current;if(!e)return;const o=new IntersectionObserver(([x])=>setV(x.isIntersecting),{threshold:th});o.observe(e);return()=>o.disconnect()},[ref,th]);return v }
function useHeaderVisible(y: number) { const [v,setV]=useState(true);const p=useRef(0); useEffect(()=>{const d=y-p.current;if(y<64)setV(true);else if(d>5)setV(false);else if(d<-5)setV(true);p.current=y},[y]);return v }

export default function LandingPage() {
  const navigate = useNavigate(); const { user, isLoading } = useAuth()
  const scrollY = useScrollY(); const headerVisible = useHeaderVisible(scrollY)
  const vh = typeof window !== 'undefined' ? window.innerHeight / 100 : 8
  const heroProgress = Math.min(scrollY / (vh * 60), 1)

  const compareRef=useRef<HTMLDivElement>(null), chatRef=useRef<HTMLDivElement>(null), extrasRef=useRef<HTMLDivElement>(null), subjectsRef=useRef<HTMLDivElement>(null)
  const compareIn=useInView(compareRef), chatIn=useInView(chatRef), extrasIn=useInView(extrasRef), subjectsIn=useInView(subjectsRef)
  useEffect(()=>{if(!isLoading&&user)navigate('/',{replace:true})},[isLoading,user,navigate])

  return (
    <div className={s.page}>
      <header className={`${s.header}${headerVisible?'':` ${s.hidden}`}${scrollY>20?` ${s.scrolled}`:''}`}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <Link to="/landing" className={s.logo}>2830</Link>

          </div>
          <div className={s.headerActions}>
            <Link to="/signup" className={s.headerCta}>회원가입</Link>
            <Link to="/login" className={s.headerOutline}>로그인</Link>
          </div>
        </div>
      </header>

      <section className={s.hero} style={{ opacity: 1 - heroProgress * 0.5 }}>
        <div className={s.heroBgDeco} />
        <div className={s.heroGrid}>
          <div className={s.heroContent}>
            <span className={s.heroBadge}>성공적인 직업생활 · 공업일반</span>
            <h1 className={s.heroHeading}>
              <span className={s.heroKeyword}>직업탐구</span>, 한 플랫폼에서<br />
              끝내세요
            </h1>
            <p className={s.heroDesc}>
              40개 단원을 개념 카드부터 빈칸 문제, 실전 시험, 오답 복습까지
              5단계로 빈틈없이 학습합니다.
            </p>
            <div className={s.heroBtns}>
              <Link to="/login" className={s.btnPill}>지금 시작하기</Link>
              <a href="#flow" className={s.btnPillOutline}>학습 과정 살펴보기</a>
            </div>
          </div>
          <div className={s.heroScreen}>
            <div className={s.heroImageWrap}>
              <img
                src="/screens/01-study-detail.png"
                alt="2830 학습 화면 — 단원 목록, 진도율, 개념 태그"
                className={s.heroImage}
              />
              <div className={s.heroImageShadow} />
            </div>
          </div>
        </div>
      </section>

      <section className={s.flow} id="flow">
        <div className={s.inner}>
          <div className={s.flowHead}>
            <span className={s.flowLabel}>학습 시스템</span>
            <h2 className={s.flowTitle}>개념 암기부터 실전까지<br />5단계면 충분합니다</h2>
            <p className={s.flowSub}>외우고 → 확인하고 → 써보고 → 시험보고 → 복습. 이 순서만 지키면 됩니다.</p>
          </div>
          <div className={s.flowTimeline}>
            <div className={s.flowTimelineLine} />
            {FLOW_STEPS.map((st,i)=><FlowCard key={st.n} step={st} index={i}/>)}
          </div>
        </div>
      </section>

      <section className={`${s.compare} ${s.sectionReveal}${compareIn?` ${s.inView}`:''}`} ref={compareRef}>
        <div className={s.inner}>
          <div className={s.compareGrid}>
            <div className={s.compareItem}>
              <ConceptCardDemo />
              <div><span className={s.tag}>개념 학습</span><h3>출제 포인트만<br/>한 장에 정리했습니다</h3><p>120개 이상의 빈출 개념을 정의, 핵심 포인트, 자주 틀리는 함정까지 한눈에 볼 수 있습니다.</p></div>
            </div>
            <div className={s.compareDivider}><span>→</span></div>
            <div className={s.compareItem}>
              <ConceptApplyDemo />
              <div><span className={`${s.tag} ${s.tagAccent}`}>문제 적용</span><h3>이 개념, 시험에<br/>이렇게 나옵니다</h3><p>같은 개념이 실제 기출에서 어떻게 출제되는지 탭 하나로 바로 확인할 수 있습니다.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.chat} ${s.sectionReveal}${chatIn?` ${s.inView}`:''}`} ref={chatRef}>
        <div className={s.inner}>
          <div className={s.chatGrid}>
            <div><h2 className={s.sectionTitle}>막히는 기출문제,<br/>찍어서 바로 질문</h2><p className={s.chatDesc}>풀이가 막히면 사진 한 장 올리면 됩니다. AI가 분석하고 설명합니다.</p><ul className={s.chatList}><li>문제 사진 업로드</li><li>마크다운 해설</li><li>유사 기출 자동 추천</li></ul></div>
            <div className={s.chatScreen}><ChatPreviewDemo /></div>
          </div>
        </div>
      </section>

      <section className={s.numbers}><div className={s.inner}><div className={s.numberItem}><span className={s.numberNum}>40</span><span>전체 단원</span></div><div className={s.numberItem}><span className={s.numberNum}>120+</span><span>시험빈출 개념</span></div><div className={s.numberItem}><span className={s.numberNum}>500+</span><span>기출문제</span></div></div></section>

      <section className={`${s.extras} ${s.sectionReveal}${extrasIn?` ${s.inView}`:''}`} ref={extrasRef}>
        <div className={s.inner}>
          <div className={s.extrasGrid}>
            <div className={s.extraItem}><BookmarkListDemo /><div><h3 className={s.extraTitle}>저장한 개념을 한눈에</h3><p className={s.extraDesc}>북마크한 개념을 과목·단원별로 모아서 언제든 다시 볼 수 있습니다.</p></div></div>
            <div className={s.extraItem}>
              <div className={s.streakBox}><span className={s.streakNum}>7</span><span className={s.streakUnit}>일째 연속 학습</span><div className={s.streakDots}>{['월','화','수','목','금','토','일'].map((d,i)=>(<div className={`${s.streakDot}${i<5?` ${s.done}`:''}`} key={d}><span>{d}</span></div>))}</div></div>
              <div><h3 className={s.extraTitle}>매일 쌓이는 학습 기록</h3><p className={s.extraDesc}>오늘도 공부하면 내일은 8일째. 연속 학습일이 동기부여가 됩니다.</p><div className={s.extraMiniStats}><div><strong>32</strong><span>총 학습일</span></div><div><strong>18</strong><span>완료 단원</span></div><div><strong>47</strong><span>응시</span></div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.subjects} ${s.sectionReveal}${subjectsIn?` ${s.inView}`:''}`} ref={subjectsRef}>
        <div className={s.inner}><h2 className={s.sectionTitle}>두 과목, 전 단원 수록</h2>
          <div className={s.subjectsGrid}>{[{slug:'success',name:'성공적인 직업생활',concepts:['직업 가치관','근로기준법','하렌 진로 결정 유형','NCS 직업기초능력','홀랜드 직업 흥미']},{slug:'industry',name:'공업 일반',concepts:['6시그마·TQM','JIT·린 생산','MES·ERP','풀 프루프·페일 세이프','클라크·호프만 산업 분류']}].map(subj=>(<div className={s.subjectCard} key={subj.slug}><h3 className={s.subjectName}>{subj.name}</h3><div className={s.subjectConcepts}>{subj.concepts.map(c=><span className={s.subjectConcept} key={c}>{c}</span>)}</div><a href="/login" className={s.subjectLink}>{subj.name} 시작하기 →</a></div>))}</div>
        </div>
      </section>

      <section className={s.cta}><h2 className={s.ctaTitle}>지금 무료로 시작하기</h2><Link to="/login" className={s.btnPill}>2830 시작하기</Link></section>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerBrand}>
            <span className={s.footerLogo}>2830</span>
            <p className={s.footerDesc}>직업탐구 기출 분석 학습 플랫폼</p>
            <a href="mailto:officeshinyujun@gmail.com" className={s.footerEmail}>officeshinyujun@gmail.com</a>
          </div>
          <div className={s.footerLinks}>
            <div className={s.footerCol}><Link to="/terms">이용약관</Link><Link to="/privacy">개인정보처리방침</Link></div>
          </div>
        </div>
        <div className={s.footerBottom}>© 2025 2830. All rights reserved.</div>
      </footer>
    </div>
  )
}
