import { Link } from 'react-router'
import s from '../landing/page.module.scss'

export default function PrivacyPage() {
  return (
    <div className={s.page} style={{ maxWidth: 800, margin: '0 auto', padding: '100px 24px 80px' }}>
      <Link to="/landing" style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-primary)', textDecoration: 'none', display: 'block', marginBottom: 32 }}>2830</Link>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32 }}>개인정보처리방침</h1>
      <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
        <p><strong>제1조 (수집하는 개인정보)</strong><br/>서비스는 회원 가입 및 서비스 제공을 위해 다음과 같은 정보를 수집합니다.<br/>- 이메일 주소<br/>- 이름 (선택)<br/>- Google 계정 정보 (Google 로그인 시)</p>
        <br/>
        <p><strong>제2조 (개인정보 수집 목적)</strong><br/>수집된 개인정보는 다음 목적으로 사용됩니다.<br/>- 서비스 제공 및 계정 관리<br/>- 학습 진도 및 통계 저장<br/>- 서비스 개선 및 문의 응대</p>
        <br/>
        <p><strong>제3조 (개인정보 보유 기간)</strong><br/>이용자의 개인정보는 회원 탈퇴 시 즉시 파기됩니다. 단, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
        <br/>
        <p><strong>제4조 (개인정보 제3자 제공)</strong><br/>서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에 의한 요구가 있는 경우 예외로 합니다.</p>
        <br/>
        <p><strong>제5조 (AI 데이터 처리)</strong><br/>AI 채팅 및 시험 생성 기능 이용 시 입력된 텍스트와 이미지는 OpenAI API로 전송되어 처리됩니다. 해당 데이터는 AI 응답 생성 목적으로만 사용됩니다.</p>
        <br/>
        <p><strong>제6조 (Google OAuth)</strong><br/>Google 로그인 시 Google의 개인정보처리방침이 추가로 적용됩니다.</p>
        <br/>
        <p><strong>제7조 (개인정보 보호 책임자)</strong><br/>이메일: officeshinyujun@gmail.com</p>
        <br/>
        <p style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border-primary)', fontSize: 13, color: 'var(--text-secondary)' }}>시행일: 2025년 7월 27일</p>
      </div>
    </div>
  )
}
