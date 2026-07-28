const brand = 'var(--landing-brand)'

const s = {
  card: { background:'var(--landing-bg-primary)', borderRadius:16, border:'1px solid var(--landing-border)', padding:28, overflow:'hidden' } as React.CSSProperties,
  pill: { display:'inline-flex',padding:'5px 12px',borderRadius:100,fontSize:12,fontWeight:600,color:'var(--landing-text-secondary)',background:'var(--landing-bg-secondary)' } as React.CSSProperties,
  pillBrand: { display:'inline-flex',padding:'5px 12px',borderRadius:100,fontSize:12,fontWeight:600,color:brand,background:'var(--landing-brand-subtle-alpha-06)' } as React.CSSProperties,
  tag: { display:'inline-flex',padding:'4px 8px',borderRadius:8,fontSize:11,fontWeight:500,background:'var(--landing-bg-secondary)',color:'var(--landing-text-secondary)' } as React.CSSProperties,
  h3: { fontSize:18,fontWeight:700,color:'var(--landing-text-primary)',margin:'0 0 6px' } as React.CSSProperties,
  p: { fontSize:13,color:'var(--landing-text-secondary)',lineHeight:1.6,margin:0 } as React.CSSProperties,
  label: { fontSize:11,fontWeight:700,color:'var(--landing-text-secondary)',textTransform:'uppercase' as const,letterSpacing:'0.5px' },
  dot: { width:6,height:6,borderRadius:'50%',background:'var(--landing-text-secondary)',flexShrink:0 } as React.CSSProperties,
  option: (active:boolean) => ({ padding:'10px 16px',borderRadius:10,border:`1px solid ${active?brand:'var(--landing-border)'}`,background:active?'var(--landing-brand-subtle-alpha-04)':'var(--landing-bg-primary)',fontSize:13,fontWeight:active?600:400,color:active?brand:'var(--landing-text-primary)' }) as React.CSSProperties,
  feedback: { marginTop:12,padding:12,background:'var(--landing-bg-secondary)',borderRadius:10 } as React.CSSProperties,
  divider: { borderBottom:'1px solid var(--landing-border)' } as React.CSSProperties,
}

export function ConceptCardDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <span style={{fontSize:11,fontWeight:700,color:brand,padding:'2px 8px',borderRadius:6,background:'var(--landing-brand-subtle-alpha-06)'}}>2단원</span>
        <span style={s.pillBrand}>개념 학습</span>
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--landing-text-secondary)'}}>3/6</span>
      </div>
      <h3 style={{...s.h3,fontSize:20,marginBottom:10}}>직업 가치관</h3>
      <p style={{...s.p,fontSize:14,marginBottom:16}}>개인이 직업을 선택할 때 중요하게 생각하는 기준으로, 내재적 가치(자아실현, 흥미)와 외재적 가치(보수, 안정성)로 구분됩니다.</p>
      <div style={{marginBottom:16}}>
        <span style={s.label}>핵심 포인트</span>
        <ul style={{margin:'6px 0 0',padding:'0 0 0 18px',fontSize:13,color:'var(--landing-text-secondary)',lineHeight:1.8}}>
          <li>내재적 가치: 자아실현, 흥미, 적성, 보람</li>
          <li>외재적 가치: 보수, 직업안정, 근무환경</li>
        </ul>
      </div>
      <div style={{background:'var(--landing-bg-secondary)',borderRadius:10,padding:14}}>
        <span style={s.label}>주의</span>
        <p style={{...s.p,marginTop:2}}>내재적 가치와 외재적 가치의 구분을 혼동하지 마세요. 보수는 외재적 가치입니다.</p>
      </div>
    </div>
  )
}

export function BlankQuizDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
        <span style={s.pillBrand}>빈칸 문제</span>
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--landing-text-secondary)'}}>3/10</span>
      </div>
      <p style={{...s.p,fontSize:14,marginBottom:18,lineHeight:1.8}}>
        개인이 직업을 선택할 때 중요하게 생각하는 기준으로, 자아실현이나 흥미와 같은 <span style={{display:'inline-block',borderBottom:`2px solid ${brand}`,minWidth:80,textAlign:'center',color:brand,fontWeight:600}}>내재적 가치</span>와 보수나 안정성과 같은 외재적 가치로 구분된다.
      </p>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        {['내재적 가치','외재적 가치','직업 가치관','사회적 가치'].map((opt,i) => (
          <span key={i} style={s.option(i===0)}>{opt}</span>
        ))}
      </div>
      <div style={s.feedback}>
        <span style={{fontSize:11,fontWeight:600,color:'var(--landing-text-primary)'}}>정답입니다</span>
        <p style={{...s.p,marginTop:2}}>내재적 가치는 자아실현, 흥미, 적성 등 개인의 내적 만족과 관련된 직업 가치입니다.</p>
      </div>
    </div>
  )
}

export function ConceptMatchDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
        <span style={s.pillBrand}>개념 매칭</span>
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--landing-text-secondary)'}}>2/10</span>
      </div>
      <div style={{marginBottom:18}}>
        <span style={s.label}>개념</span>
        <h3 style={{...s.h3,fontSize:20,marginTop:4}}>홀랜드 직업 흥미 유형</h3>
      </div>
      <div style={{marginBottom:18}}>
        <span style={s.label}>정의를 입력하세요</span>
        <textarea readOnly style={{width:'100%',minHeight:80,marginTop:6,padding:12,borderRadius:10,border:'1px solid var(--landing-border)',fontSize:13,color:'var(--landing-text-primary)',resize:'none',background:'var(--landing-bg-secondary)',fontFamily:'inherit'}} value="개인의 성격을 6가지 유형(현실형, 탐구형, 예술형, 사회형, 진취형, 관습형)으로 분류하여 적합한 직업을 제시하는 이론" />
      </div>
      <div style={{display:'flex',gap:10}}>
        <button style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${brand}`,background:'var(--landing-brand-subtle-alpha-06)',color:brand,fontSize:13,fontWeight:600,cursor:'default'}}>맞았어요</button>
        <button style={{flex:1,padding:12,borderRadius:10,border:'1px solid var(--landing-border)',background:'var(--landing-bg-primary)',fontSize:13,color:'var(--landing-text-secondary)',cursor:'default'}}>틀렸어요</button>
      </div>
    </div>
  )
}

export function ExamPreviewDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
        <span style={s.pillBrand}>실전 시험</span>
        <span style={{fontSize:11,color:'var(--landing-text-secondary)'}}>2024 6월 모의평가</span>
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--landing-text-secondary)'}}>4/20</span>
      </div>
      <p style={{...s.p,fontSize:14,marginBottom:14,fontWeight:500,color:'var(--landing-text-primary)'}}>
        4. 다음은 직업 가치관에 대한 설명이다. (가), (나)에 들어갈 알맞은 내용을 고르면?
      </p>
      <div style={{background:'var(--landing-bg-secondary)',borderRadius:10,padding:16,marginBottom:16,fontSize:13,color:'var(--landing-text-primary)',lineHeight:1.8}}>
        (가) — 직업을 통해 자아실현, 흥미, 보람 등을 추구하는 가치관<br/>
        (나) — 직업을 통해 보수, 안정성, 근무 환경 등을 추구하는 가치관
      </div>
      {['① 내재적 — 외재적','② 외재적 — 내재적','③ 생업적 — 소명적','④ 소명적 — 생업적','⑤ 개인적 — 사회적'].map((opt,i)=>(
        <div key={i} style={{...s.option(i===0),marginBottom:6}}>{opt}</div>
      ))}
    </div>
  )
}

export function ReviewPreviewDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
        <span style={{fontSize:12,fontWeight:700,color:'var(--landing-text-primary)'}}>복습 필요</span>
      </div>
      {[
        {concept:'직업 가치관',count:3,unit:'1단원'},
        {concept:'근로기준법',count:2,unit:'15단원'},
        {concept:'하렌 진로 결정',count:2,unit:'12단원'},
      ].map((item,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 0',borderBottom:i<2?'1px solid var(--landing-border)':'none'}}>
          <div>
            <span style={{fontSize:14,fontWeight:600,color:'var(--landing-text-primary)'}}>{item.concept}</span>
            <span style={{fontSize:11,color:'var(--landing-text-secondary)',marginLeft:8}}>{item.unit}</span>
          </div>
          <span style={s.pill}>오답 {item.count}회</span>
        </div>
      ))}
      <button style={{width:'100%',marginTop:18,padding:12,borderRadius:10,border:'none',background:brand,color:'var(--landing-white)',fontSize:13,fontWeight:600,cursor:'default'}}>복습 시작하기</button>
    </div>
  )
}

export function ConceptApplyDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <span style={{fontSize:11,fontWeight:700,color:brand,padding:'2px 8px',borderRadius:6,background:'var(--landing-brand-subtle-alpha-06)'}}>2단원</span>
        <span style={s.pillBrand}>문제 적용</span>
      </div>
      <p style={{...s.p,marginBottom:12}}>이 개념이 시험에서 이렇게 출제됐어요</p>
      <div style={{background:'var(--landing-bg-secondary)',borderRadius:10,padding:16,marginBottom:12,fontSize:13,color:'var(--landing-text-primary)',lineHeight:1.8}}>
        <span style={{color:brand,fontWeight:600}}>2023 수능</span><br/>
        다음 중 직업 가치관에 대한 설명으로 옳은 것은?<br/>
        ① 내재적 가치는 보수와 안정성을 중시한다<br/>
        ② <span style={{background:'var(--landing-brand-subtle-alpha-08)',borderRadius:3,padding:'0 2px'}}>외재적 가치는 근무 환경을 중시한다</span><br/>
        ③ 모든 가치는 내재적 가치에 포함된다
      </div>
      <div style={s.feedback}>
        <span style={{fontSize:11,fontWeight:600,color:'var(--landing-text-primary)'}}>정답 ② — 개념 하이라이트</span>
        <p style={{...s.p,marginTop:2}}>외재적 가치는 보수, 직업안정, 근무환경 등 외부적 요인과 관련됩니다.</p>
      </div>
    </div>
  )
}

export function ChatPreviewDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,paddingBottom:14,borderBottom:'1px solid var(--landing-border)'}}>
        <span style={s.dot}/>
        <span style={{fontSize:13,fontWeight:600,color:'var(--landing-text-primary)'}}>AI 튜터</span>
      </div>
      <div style={{background:'var(--landing-bg-secondary)',borderRadius:'12px 12px 12px 2px',padding:12,marginBottom:10,maxWidth:'85%',fontSize:12,color:'var(--landing-text-primary)',lineHeight:1.5}}>
        <div style={{background:'var(--landing-bg-primary)',borderRadius:8,padding:10,marginBottom:8,textAlign:'center',fontSize:11,color:'var(--landing-text-secondary)',border:'1px dashed var(--landing-border)'}}>📷 업로드된 문제 이미지</div>
        이 문제 풀이 좀 알려줘
      </div>
      <div style={{background:'var(--landing-brand-subtle-alpha-04)',borderRadius:'12px 12px 2px 12px',padding:12,marginBottom:12,marginLeft:'auto',maxWidth:'85%',fontSize:12,color:'var(--landing-text-primary)',lineHeight:1.6}}>
        이 문제는 <strong>직업 가치관</strong>에 관한 문제입니다.<br/><br/>
        <strong>내재적 가치</strong>는 자아실현, 흥미 등 내적 만족과 관련되고<br/>
        <strong>외재적 가치</strong>는 보수, 안정성 등 외부적 요인입니다.
      </div>
      <div style={{background:'var(--landing-bg-primary)',border:'1px solid var(--landing-border)',borderRadius:10,padding:12,fontSize:12}}>
        <span style={{fontWeight:600,color:'var(--landing-text-primary)'}}>유사 기출</span>
        <p style={{margin:'4px 0 0',color:'var(--landing-text-secondary)',fontSize:11}}>2022 9월 모의평가 — 직업 가치관 유형 분류 문제</p>
      </div>
    </div>
  )
}

export function BookmarkListDemo() {
  return (
    <div style={s.card}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <span style={{fontSize:15,fontWeight:700,color:'var(--landing-text-primary)'}}>개념리스트</span>
        <span style={{fontSize:11,color:'var(--landing-text-secondary)'}}>5개 저장됨</span>
      </div>
      {[
        {concept:'직업 가치관',subject:'성공적인 직업생활',unit:'1단원'},
        {concept:'근로기준법',subject:'성공적인 직업생활',unit:'15단원'},
        {concept:'6시그마와 TQM',subject:'공업 일반',unit:'8단원'},
      ].map((item,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 0',borderBottom:i<2?'1px solid var(--landing-border)':'none'}}>
          <div>
            <span style={{fontSize:14,fontWeight:600,color:'var(--landing-text-primary)'}}>{item.concept}</span>
            <div style={{display:'flex',gap:6,marginTop:4}}>
              <span style={s.tag}>{item.subject}</span>
              <span style={s.tag}>{item.unit}</span>
            </div>
          </div>
          <span style={{fontSize:14}}>📌</span>
        </div>
      ))}
    </div>
  )
}
