import { Link } from 'react-router'
import s from '../landing/page.module.scss'

export default function TermsPage() {
  return (
    <div className={s.page} style={{ maxWidth: 800, margin: '0 auto', padding: '100px 24px 80px' }}>
      <Link to="/landing" style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-primary)', textDecoration: 'none', display: 'block', marginBottom: 32 }}>2830</Link>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32 }}>이용약관</h1>
      <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
        <p><strong>제1조 (목적)</strong><br/>본 약관은 2830(이하 "서비스")가 제공하는 온라인 학습 플랫폼의 이용 조건 및 절차를 규정함을 목적으로 합니다.</p>
        <br/>
        <p><strong>제2조 (정의)</strong><br/>"이용자"란 본 약관에 따라 서비스를 이용하는 모든 회원을 말합니다.</p>
        <br/>
        <p><strong>제3조 (서비스 내용)</strong><br/>본 서비스는 수능 직업탐구 영역(성공적인 직업생활, 공업일반)의 기출 분석, 개념 학습, 문제 풀이, AI 기반 시험 생성 및 채팅 기능을 제공합니다.</p>
        <br/>
        <p><strong>제4조 (회원 가입)</strong><br/>이용자는 이메일 또는 Google 계정을 통해 회원 가입할 수 있으며, 정확한 정보를 제공해야 합니다.</p>
        <br/>
        <p><strong>제5조 (서비스 이용)</strong><br/>서비스는 연중무휴 24시간 제공을 원칙으로 하며, 시스템 점검 등의 사유로 일시 중단될 수 있습니다.</p>
        <br/>
        <p><strong>제6조 (이용 제한)</strong><br/>다음 각 호에 해당하는 경우 서비스 이용을 제한할 수 있습니다.<br/>1. 타인의 계정을 도용하는 경우<br/>2. 서비스의 정상적인 운영을 방해하는 경우<br/>3. 기타 관계 법령에 위반되는 행위를 하는 경우</p>
        <br/>
        <p><strong>제7조 (면책 조항)</strong><br/>서비스는 학습 보조 도구로서 제공되며, 특정 시험 결과를 보장하지 않습니다. AI가 생성한 콘텐츠의 정확성은 참고용으로만 활용해 주시기 바랍니다.</p>
        <br/>
        <p><strong>제8조 (약관 변경)</strong><br/>본 약관은 필요에 따라 변경될 수 있으며, 변경 시 사전 공지합니다.</p>
        <br/>
        <p style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border-primary)', fontSize: 13, color: 'var(--text-secondary)' }}>시행일: 2025년 7월 27일</p>
      </div>
    </div>
  )
}
