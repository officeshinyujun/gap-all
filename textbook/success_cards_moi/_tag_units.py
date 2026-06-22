import json
import re

UNIT_KEYWORDS = {
    1: ["직업의 의미", "직업의 특징", "윤리성", "경제성", "계속성", "사회성", "직업 가치", "외재적", "내재적", "홀랜드", "유연근무", "재택근무", "원격근무", "탄력적 근로시간", "선택적 근로시간", "워크넷 직업 가치관", "변화 지향", "직업 안정"],
    2: ["생애 발달", "발달 과업", "해비거스트", "에릭슨", "레빈슨", "긴즈버그", "슈퍼", "마샤", "자아 정체감", "영아기", "유아기", "아동기", "청소년기", "성년기", "중년기", "노년기", "발달 단계"],
    3: ["직업적 성공", "자기 이해", "자아 개념", "자아 존중감", "적성", "흥미", "진로 계획", "하렌", "진로 의사 결정", "합리적", "직관적", "의존적", "조하리의 창", "성격 강점"],
    4: ["기업의 의미", "기업의 목적", "기업의 역할", "사기업", "공기업", "합명", "합자", "유한회사", "유한책임회사", "주식회사", "인적 회사", "물적 회사", "무한책임사원", "유한책임사원", "대기업", "중소기업", "중견기업", "사회적 기업", "ESG", "협동조합"],
    5: ["경영 관리", "경영자", "최고 경영자", "중간 경영자", "PODC", "계획 조직 지휘 통제", "라인 조직", "사업부제", "인적 자원 관리", "생산 관리", "마케팅", "STP", "4P", "제품 수명 주기", "재무 관리", "자금 조달", "투자", "회계", "재무제표", "MIS", "ERP"],
    6: ["제조업", "클라크", "호프만", "생산재", "소비재", "제1차 산업", "제2차 산업", "제3차 산업", "경공업", "중화학 공업", "첨단 공업", "개별 생산", "로트 생산", "연속 생산", "프로젝트 생산", "주문 생산", "계획 생산", "다품종 소량", "소품종 대량", "B2B", "B2C", "CIM", "SCM", "FMS", "JIT", "생산 체제"],
    7: ["서비스", "무형성", "동시성", "이질성", "소멸성", "슈메너", "서비스 프로세스 매트릭스", "서비스 공장", "서비스 점포", "대량 서비스", "전문 서비스", "노동 집약도", "고객 참여", "서비스 설계", "서비스 생산 체제"],
    8: ["직업 기초 능력", "직업기초능력", "NCS 직업기초", "10개 영역", "의사소통 능력", "수리 능력", "문제 해결 능력", "정보 능력", "기술 능력", "자원 관리 능력", "조직 이해 능력", "대인 관계 능력", "자기 개발 능력", "직업 윤리 능력", "기초 능력군", "업무 처리 능력군", "직장 적응 능력군", "도표 분석", "기초 외국어"],
    9: ["근로 계약", "소정 근로 시간", "법정 근로 시간", "연장 근로", "야간 근로", "휴일 근로", "휴게 시간", "임금 지급 원칙", "통화 직접 전액 정기", "최저 임금", "통상 임금", "평균 임금"],
    10: ["NCS", "국가직무능력표준", "대분류", "중분류", "소분류", "세분류", "능력단위", "능력단위요소", "수행준거", "직무 기술서", "직무 수행 내용", "NCS 분류체계"],
    11: ["경력 개발", "경력 목표", "SMART", "평생 학습", "학점은행제", "학점 인정", "일학습 병행", "계약학과", "사내대학", "디지털 배지", "K-MOOC", "경력 경로", "평생교육"],
    12: ["의사소통", "경청", "문서 이해", "문서 작성", "의사 표현", "비언어적", "갈등 관리", "갈등 해결", "메라비언", "공감적 경청", "직무 문서", "공문서", "기획서", "보고서"],
    13: ["채용", "입사 지원서", "자기소개서", "경력 기술서", "경험 기술서", "면접", "블라인드 면접", "토론 면접", "상황 면접", "구조화 면접", "STAR", "서류 전형", "필기 전형", "면접 전형", "정량 평가", "정성 평가"],
    14: ["창업", "창업자", "창업 아이템", "창업 자본", "자기 자본", "타인 자본", "프랜차이즈", "기존 사업체 인수", "사업 타당성", "시장성", "기술성", "경제성", "기업가 정신", "위험 감수", "진취성", "혁신성", "사회적 책임성", "사업자 등록"],
    15: ["근로관계법", "근로기준법", "노동 3권", "단결권", "단체 교섭권", "단체 행동권", "근로자 의무", "사용자 의무", "연차 유급 휴가", "해고 예고", "퇴직금", "가산 임금", "50%", "법정 휴일", "약정 휴일", "5인 미만"],
    16: ["근로 계약서", "서면 교부", "미성년자", "연소 근로자", "친권자", "후견인", "부당 해고", "임금 체불", "직장 내 성희롱", "권익 침해", "구제 신청", "지방노동위원회", "차별 시정", "현장 실습", "위약 예정", "전차금 상계"],
    17: ["고용보험", "고용 서비스", "실업 급여", "구직 급여", "취업 촉진 수당", "조기 재취업 수당", "직업능력개발 수당", "훈련연장급여", "상병급여", "소정 급여 일수", "180일", "고용 안정 사업", "직업 능력 개발 사업", "출산전후휴가", "육아휴직"],
    18: ["산업 재해", "안전사고", "불안전한 행동", "불안전한 상태", "하인리히", "도미노 이론", "재해 예방", "사고 예방 5단계", "안전 보건 표지", "금지 표지", "경고 표지", "업무상 재해", "산재 보험", "요양급여", "휴업급여", "장해급여", "유족급여", "중대 재해"],
    19: ["노사 관계", "노동조합", "부당 노동 행위", "노동위원회", "단체 교섭", "쟁의 행위", "파업", "태업", "직장 폐쇄", "조정", "중재", "긴급 조정", "노사협의회", "근로자참여 및 협력증진", "사용자 단체"],
    20: ["직업 윤리", "근로 윤리", "공동체 윤리", "근면", "성실", "정직", "봉사", "책임", "준법", "정명 사상", "직업 윤리 5대 원칙", "비윤리적 행위", "도덕적 해이", "미래 사회", "유망 직업", "첨단 기술", "IoT", "사물인터넷", "바이오", "증강현실", "인공지능", "드론", "3D프린팅", "정보 윤리", "환경 윤리", "생명 윤리"],
}

def get_question_text(q):
    parts = []
    if q.get("stem"):
        parts.append(q["stem"])
    if q.get("stimulus"):
        parts.append(q["stimulus"])
    if q.get("box_items"):
        parts.append(" ".join(q["box_items"]))
    if q.get("options"):
        parts.append(" ".join(q["options"]))
    if q.get("full_text"):
        parts.append(q["full_text"])
    return " ".join(parts)

def match_units(text):
    scores = {}
    matched_keywords = {}
    for unit, keywords in UNIT_KEYWORDS.items():
        matches = []
        for kw in keywords:
            if kw in text:
                matches.append(kw)
        if matches:
            scores[unit] = len(matches)
            matched_keywords[unit] = matches
    return scores, matched_keywords

def apply_composite_rules(scores, matched_keywords, text):
    if 2 in scores and 14 in scores:
        if "해비거스트" in text and "기업가 정신" in text:
            scores[2] += 5
    if 16 in scores and 9 in scores:
        if "근로 계약서" in text or "미성년자" in text or "연소 근로자" in text or "현장 실습" in text or "위약 예정" in text:
            scores[16] += 5
    if 15 in scores:
        if ("연차 유급 휴가" in text or "퇴직금" in text or "가산 임금" in text or "근로기준법" in text):
            scores[15] += 3
    if 10 in scores:
        if "직무 기술서" in text or "NCS 분류체계" in text or "능력단위" in text:
            scores[10] += 5
    if 8 in scores:
        has_sub = any(kw in text for kw in ["의사소통 능력", "수리 능력", "문제 해결 능력", "정보 능력", "기술 능력", "자원 관리 능력", "조직 이해 능력", "대인 관계 능력", "자기 개발 능력", "직업 윤리 능력"])
        if has_sub:
            scores[8] += 5
    if 19 in scores:
        if "노사협의회" in text or "노동조합" in text:
            scores[19] += 3
    if 18 in scores:
        if "산재 보험" in text or "휴업급여" in text or "요양급여" in text:
            scores[18] += 3
    if 17 in scores:
        if "구직 급여" in text or "상병급여" in text or "고용보험" in text:
            scores[17] += 3
    if 7 in scores and 6 in scores:
        svc_count = sum(1 for kw in matched_keywords.get(7, []) if kw in text)
        mfg_count = sum(1 for kw in matched_keywords.get(6, []) if kw in text)
        if svc_count > mfg_count:
            scores[7] += 3
        else:
            scores[6] += 3
    if 20 in scores:
        if "유망 직업" in text or "직업 윤리" in text or "근로 윤리" in text or "공동체 윤리" in text:
            scores[20] += 3
    return scores

def classify_question(q):
    text = get_question_text(q)
    scores, matched_keywords = match_units(text)
    scores = apply_composite_rules(scores, matched_keywords, text)

    if not scores:
        return {
            "source_exam": q.get("source_exam", ""),
            "number": q.get("number"),
            "primary_unit": None,
            "secondary_units": [],
            "keywords_matched": [],
            "confidence": "low"
        }

    sorted_units = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    primary_unit = sorted_units[0][0]
    secondary_units = [u for u, s in sorted_units[1:] if s >= 1]

    all_matched = []
    for unit in [primary_unit] + secondary_units:
        all_matched.extend(matched_keywords.get(unit, []))
    all_matched = list(dict.fromkeys(all_matched))

    primary_count = scores[primary_unit]
    if primary_count >= 3:
        confidence = "high"
    elif primary_count >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "source_exam": q.get("source_exam", ""),
        "number": q.get("number"),
        "primary_unit": primary_unit,
        "secondary_units": secondary_units,
        "keywords_matched": all_matched,
        "confidence": confidence
    }

def main():
    with open("/Users/yjshin/projects/gap/textbook/success_cards_moi/_step0_ocr.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    results = []
    for exam_group in data:
        for exam in exam_group:
            questions = exam.get("questions", [])
            for q in questions:
                result = classify_question(q)
                results.append(result)

    with open("/Users/yjshin/projects/gap/textbook/success_cards_moi/_question_unit_mapping.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"Total questions tagged: {len(results)}")
    confidence_counts = {"high": 0, "medium": 0, "low": 0}
    for r in results:
        confidence_counts[r["confidence"]] += 1
    print(f"Confidence distribution: {confidence_counts}")

    unit_counts = {}
    for r in results:
        u = r["primary_unit"]
        unit_counts[u] = unit_counts.get(u, 0) + 1
    for u in sorted(unit_counts.keys(), key=lambda x: (x is None, x)):
        print(f"  Unit {u}: {unit_counts[u]} questions")

if __name__ == "__main__":
    main()
