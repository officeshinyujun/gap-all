'use client'

import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@shared/contexts/AuthContext'
import { ConceptCardDemo, BlankQuizDemo, ConceptMatchDemo, ExamPreviewDemo, ReviewPreviewDemo, ConceptApplyDemo, ChatPreviewDemo, BookmarkListDemo } from './demo-components'
import s from './page.module.scss'

const FLOW_STEPS = [
  { n: 1, title: '개념 카드', desc: '120개 시험빈출 개념을 정의·키포인트·오답함정까지 한 장으로', screen: '04a-concept-card', wide: false },
  { n: 2, title: '빈칸 채우기', desc: '시험지 스타일로 풀고 바로 해설을 확인합니다', screen: '02-blank-quiz', wide: false },
  { n: 3, title: '개념 매칭', desc: '용어를 보고 직접 정의를 쓰며 이해도를 스스로 체크', screen: '03-concept-match', wide: false },
  { n: 4, title: '실전 모의시험', desc: '단원 범위와 난이도를 설정해 진짜 시험처럼 응시', screen: '05-exam', wide: true },
  { n: 5, title: '오답 복습', desc: '틀린 개념만 모아서 3회 연속 정답까지 반복 학습', screen: '06-review', wide: false },
]

function HeroImg({ id, aspect }: { id: string; aspect: string }) {
  return <img src={`/screens/${id}.png`} alt="" className={s.screenshot} style={{ aspectRatio: aspect }} />
}

function FlowCard({ step, index }: { step: typeof FLOW_STEPS[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null); const [visible, setVisible] = useState(false)
  useEffect(() => { const el = ref.current; if (!el) return; const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 }); obs.observe(el); return () => obs.disconnect() }, [])
  return (
    <div ref={ref} className={`${s.flowCard}${visible ? ` ${s.visible}` : ''}`} style={{ transitionDelay: `${index * 80}ms` }}>
      {step.n === 1 ? <ConceptCardDemo /> : step.n === 2 ? <BlankQuizDemo /> : step.n === 3 ? <ConceptMatchDemo /> : step.n === 4 ? <ExamPreviewDemo /> : <ReviewPreviewDemo />}
      <div className={s.flowCardText}><span className={s.flowCardNum}>{String(step.n).padStart(2, '0')}</span><h3 className={s.flowCardTitle}>{step.title}</h3><p>{step.desc}</p></div>
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
            <Link to="/login" className={s.headerCta}>회원가입</Link>
            <Link to="/login" className={s.headerOutline}>로그인</Link>
          </div>
        </div>
      </header>

      <section className={s.hero} style={{ opacity: 1 - heroProgress * 0.5 }}>
        <div className={s.heroGlow} />
        <div className={s.heroContent}>
          <h1 className={s.heroHeading}>
            여러분의 <span className={s.heroKeyword}>직업탐구</span>를<br/>
            <span className={s.heroKeyword}>AI</span>와 함께, <span className={s.heroKeyword}>편하게</span>
          </h1>
          <p className={s.heroDesc}>
            기출 기반 개념 요약, 빈칸 문제, 개념 매칭, 실전 시험, 오답 복습, AI 튜터까지.<br/>
            직업탐구를 확실하게 배울 수 있습니다.
          </p>
          <div className={s.heroBtns}>
            <Link to="/login" className={s.btnPill}>시작하기</Link>
            <a href="#flow" className={s.btnPillOutline}>살펴보기</a>
          </div>
        </div>
        <div className={s.heroScreen}>
          <HeroImg id="01-study-detail" aspect="16/10" />
        </div>
      </section>

      <section className={s.flow} id="flow">
        <div className={s.inner}>
          <div className={s.sectionHead}><h2 className={s.sectionTitle}>하루 30분, 한 단원 끝내기</h2><p className={s.sectionSub}>기출 분석 → 개념 정리 → 실전 문제 → 오답까지 한 번에</p></div>
          <div className={s.flowCards}>{FLOW_STEPS.map((st,i)=><FlowCard key={st.n} step={st} index={i}/>)}</div>
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
            <div className={s.footerCol}><Link to="/terms">이용약관</Link><Link to="/privacy">개인정보처리방침</Link></div>
          </div>
        </div>
        <div className={s.footerBottom}>© 2025 2830. All rights reserved.</div>
      </footer>
    </div>
  )
}
