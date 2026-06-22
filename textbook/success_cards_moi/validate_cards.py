#!/usr/bin/env python3
"""
성공적인 직업생활 카드 전수 검증 스크립트
=========================================
실행: python3 validate_cards.py

검증 항목:
1. JSON 구조 무결성
2. 문제-단원 매칭 정합성 (오매칭 검출)
3. 개념-문제 연관성 (키워드 기반)
4. 데이터 품질 (빈 필드, 잘린 텍스트, 오염 태그)
5. 출제빈도 데이터와의 정합성
6. 중복 문제 배정 검출
7. 선지 해설 품질
8. 개념 간 중복도
"""

import json
import re
import os
from collections import Counter, defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).parent
FREQ_DIR = BASE_DIR.parent / "sungjik_frequency_v2_full_applied"

# ============================================================
# COLORS
# ============================================================
class C:
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    BOLD = "\033[1m"
    END = "\033[0m"

def error(msg): return f"{C.RED}✗ ERROR{C.END} {msg}"
def warn(msg): return f"{C.YELLOW}⚠ WARN{C.END}  {msg}"
def ok(msg): return f"{C.GREEN}✓ OK{C.END}    {msg}"
def info(msg): return f"{C.BLUE}ℹ INFO{C.END}  {msg}"
def header(msg): print(f"\n{C.BOLD}{'='*60}\n {msg}\n{'='*60}{C.END}")

# ============================================================
# LOAD DATA
# ============================================================
def load_units():
    """Load all 단원 JSON files"""
    units = {}
    for n in range(1, 21):
        fpath = BASE_DIR / f"{n}단원.json"
        if fpath.exists():
            with open(fpath, encoding="utf-8") as f:
                units[n] = json.load(f)
    return units

def load_mapping():
    """Load question-unit mapping"""
    fpath = BASE_DIR / "_question_unit_mapping.json"
    if not fpath.exists():
        return []
    with open(fpath, encoding="utf-8") as f:
        return json.load(f)

def load_ocr():
    """Load OCR questions"""
    fpath = BASE_DIR / "_step0_ocr.json"
    if not fpath.exists():
        return []
    with open(fpath, encoding="utf-8") as f:
        return json.load(f)

def load_frequency():
    """Load frequency data"""
    freq = {}
    if not FREQ_DIR.exists():
        return freq
    for n in range(1, 21):
        fpath = FREQ_DIR / f"{n}단원.json"
        if fpath.exists():
            with open(fpath, encoding="utf-8") as f:
                freq[n] = json.load(f)
    return freq

# ============================================================
# CHECK 1: JSON 구조 무결성
# ============================================================
def check_json_integrity(units):
    header("1. JSON 구조 무결성")
    errors = []
    warnings = []
    
    required_concept_fields = ['id', 'rank', 'name', 'card']
    required_card_fields = ['definition', 'keyPoints']
    required_rq_fields = ['questionData']
    required_qd_fields = ['number', 'source_exam', 'stem', 'options', 'answer']
    
    total_concepts = 0
    
    for n, data in units.items():
        if 'concepts' not in data:
            errors.append(error(f"{n}단원: 'concepts' 필드 없음"))
            continue
        
        for c in data['concepts']:
            total_concepts += 1
            cid = c.get('id', '???')
            
            # Required fields
            for field in required_concept_fields:
                if field not in c:
                    errors.append(error(f"{cid}: '{field}' 필드 없음"))
            
            # Card fields
            card = c.get('card', {})
            for field in required_card_fields:
                if field not in card:
                    warnings.append(warn(f"{cid}: card.{field} 없음"))
            
            # realQuestion structure
            rq = c.get('realQuestion')
            if rq is not None:
                for field in required_rq_fields:
                    if field not in rq:
                        errors.append(error(f"{cid}: realQuestion.{field} 없음"))
                
                qd = rq.get('questionData', {})
                for field in required_qd_fields:
                    if field not in qd:
                        errors.append(error(f"{cid}: questionData.{field} 없음"))
    
    for e in errors[:10]:
        print(e)
    for w in warnings[:5]:
        print(w)
    
    if not errors:
        print(ok(f"전체 {total_concepts}개 개념 구조 정상"))
    else:
        print(error(f"{len(errors)}건 구조 오류 발견"))
    
    return len(errors), len(warnings)

# ============================================================
# CHECK 2: 문제-단원 매칭 정합성
# ============================================================
def check_unit_matching(units, mapping):
    header("2. 문제-단원 매칭 정합성")
    
    if not mapping:
        print(warn("_question_unit_mapping.json 없음 - 스킵"))
        return 0, 0
    
    # Build lookup
    q_to_unit = {}
    for q in mapping:
        key = (q.get('source_exam', ''), q.get('number', 0))
        q_to_unit[key] = q.get('primary_unit')
    
    correct = 0
    mismatched = 0
    null_rq = 0
    mismatch_details = []
    
    for n, data in units.items():
        for c in data['concepts']:
            rq = c.get('realQuestion')
            if rq is None:
                null_rq += 1
                continue
            
            qd = rq.get('questionData', {})
            source = qd.get('source_exam', '')
            number = qd.get('number', 0)
            expected = q_to_unit.get((source, number))
            
            if expected == n:
                correct += 1
            elif expected is not None:
                mismatched += 1
                mismatch_details.append(
                    warn(f"{c['id']}: unit={n}에 Q{number} 배정됨, 실제 단원={expected}")
                )
            else:
                correct += 1  # Not in mapping
    
    for d in mismatch_details[:10]:
        print(d)
    
    total = correct + mismatched
    if mismatched == 0:
        print(ok(f"매칭 정상: {correct}/{total} (null: {null_rq})"))
    else:
        print(error(f"오매칭 {mismatched}/{total}건 ({mismatched/total*100:.1f}%)"))
    
    return mismatched, 0

# ============================================================
# CHECK 3: 개념-문제 연관성 (키워드)
# ============================================================
def check_concept_relevance(units):
    header("3. 개념-문제 연관성")
    
    low_relevance = []
    checked = 0
    
    for n, data in units.items():
        for c in data['concepts']:
            rq = c.get('realQuestion')
            if rq is None:
                continue
            
            checked += 1
            concept_name = c.get('name', '')
            card_def = c.get('card', {}).get('definition', '')
            card_kp = str(c.get('card', {}).get('keyPoints', ''))
            
            qd = rq.get('questionData', {})
            q_text = ' '.join([
                qd.get('stem', ''),
                qd.get('stimulus', ''),
                ' '.join(qd.get('options', [])),
                ' '.join(qd.get('box_items', []))
            ])
            
            # Extract keywords from concept
            concept_words = set(re.findall(r'[가-힣]{2,}', concept_name + ' ' + card_def + ' ' + card_kp))
            q_words = set(re.findall(r'[가-힣]{2,}', q_text))
            
            # Filter common/stop words
            stop_words = {'것은', '대한', '다음', '적절한', '있는', '이다', '에서', '으로', '에는', '한다', '하는', 
                         '대로', '고른', '위한', '통해', '있다', '없다', '경우', '때문', '하여', '포함', '해당'}
            concept_words -= stop_words
            q_words -= stop_words
            
            overlap = concept_words & q_words
            if len(concept_words) > 0:
                relevance = len(overlap) / len(concept_words)
            else:
                relevance = 0
            
            if relevance < 0.1 and len(concept_words) > 3:
                low_relevance.append(
                    warn(f"{c['id']} '{concept_name}' ↔ Q{qd.get('number')} 연관도={relevance:.0%} (겹침: {list(overlap)[:3]})")
                )
    
    for lr in low_relevance[:10]:
        print(lr)
    
    if not low_relevance:
        print(ok(f"{checked}개 개념-문제 연관성 양호"))
    else:
        print(warn(f"{len(low_relevance)}/{checked}개 개념에서 낮은 연관도 감지"))
    
    return 0, len(low_relevance)

# ============================================================
# CHECK 4: 데이터 품질
# ============================================================
def check_data_quality(units):
    header("4. 데이터 품질")
    
    issues = []
    
    for n, data in units.items():
        for c in data['concepts']:
            cid = c.get('id', '???')
            rq = c.get('realQuestion')
            
            # Empty card definition
            card_def = c.get('card', {}).get('definition', '')
            if len(card_def) < 10:
                issues.append(warn(f"{cid}: card.definition 너무 짧음 ({len(card_def)}자)"))
            
            if rq is None:
                continue
            
            qd = rq.get('questionData', {})
            
            # [cite:N] 태그 잔존
            all_text = json.dumps(qd, ensure_ascii=False)
            if '[cite:' in all_text:
                issues.append(error(f"{cid}: [cite:N] 태그 잔존"))
            
            # Doubled ㄱ.ㄱ. in box_items
            for item in qd.get('box_items', []):
                if re.match(r'^[ㄱㄴㄷㄹ]\.', item):
                    issues.append(error(f"{cid}: box_item에 'ㄱ.' 접두사 잔존: '{item[:40]}'"))
                    break
            
            # Empty stimulus
            if not qd.get('stimulus', '').strip():
                issues.append(warn(f"{cid}: stimulus 비어있음"))
            
            # Empty options
            if not qd.get('options', []):
                issues.append(error(f"{cid}: options 비어있음"))
            
            # Answer format check
            answer = qd.get('answer', '')
            if not answer:
                issues.append(error(f"{cid}: answer 비어있음"))
            elif not any(m in str(answer) for m in ['①','②','③','④','⑤']):
                issues.append(warn(f"{cid}: answer 형식 이상: '{answer}'"))
            
            # conceptHighlightV2 check
            chv2 = rq.get('conceptHighlightV2')
            if chv2 is None:
                issues.append(warn(f"{cid}: conceptHighlightV2 null"))
            elif chv2:
                # Check optionAnalysis quality
                oa = chv2.get('optionAnalysis', [])
                for item in oa:
                    r = item.get('reasoning', '')
                    if r in ['', None] or len(r) < 5:
                        issues.append(warn(f"{cid}: optionAnalysis[{item.get('optionNum')}] reasoning 비어있음"))
                        break
    
    errors_list = [i for i in issues if 'ERROR' in i]
    warns_list = [i for i in issues if 'WARN' in i]
    
    for e in errors_list[:10]:
        print(e)
    for w in warns_list[:10]:
        print(w)
    
    if not errors_list:
        print(ok(f"심각한 데이터 오류 없음"))
    else:
        print(error(f"{len(errors_list)}건 데이터 오류"))
    
    if warns_list:
        print(warn(f"{len(warns_list)}건 경고"))
    
    return len(errors_list), len(warns_list)

# ============================================================
# CHECK 5: 출제빈도 정합성
# ============================================================
def check_frequency_alignment(units, freq_data):
    header("5. 출제빈도 데이터 정합성")
    
    if not freq_data:
        print(warn("출제빈도 데이터 없음 - 스킵"))
        return 0, 0
    
    issues = []
    
    for n, data in units.items():
        freq = freq_data.get(n)
        if not freq:
            continue
        
        freq_concepts = {c['name'] for c in freq.get('concepts', [])}
        card_concepts = {c['name'] for c in data.get('concepts', [])}
        
        # Concepts in frequency but not in cards
        missing_from_cards = freq_concepts - card_concepts
        # We do fuzzy matching - check if any freq concept is a substring of card concepts
        truly_missing = set()
        for fc in missing_from_cards:
            found = False
            for cc in card_concepts:
                if fc in cc or cc in fc or len(set(fc.split()) & set(cc.split())) >= 1:
                    found = True
                    break
            if not found:
                truly_missing.add(fc)
        
        if truly_missing:
            issues.append(warn(f"{n}단원: 빈출 개념이 카드에 없음: {list(truly_missing)[:3]}"))
    
    for i in issues[:10]:
        print(i)
    
    if not issues:
        print(ok("출제빈도 개념과 카드 개념 정합"))
    else:
        print(warn(f"{len(issues)}개 단원에서 빈출 개념 누락 가능성"))
    
    return 0, len(issues)

# ============================================================
# CHECK 6: 중복 문제 배정
# ============================================================
def check_duplicate_questions(units):
    header("6. 중복 문제 배정 검출")
    
    question_usage = defaultdict(list)
    
    for n, data in units.items():
        for c in data['concepts']:
            rq = c.get('realQuestion')
            if rq is None:
                continue
            qd = rq.get('questionData', {})
            key = (qd.get('source_exam', ''), qd.get('number', 0))
            question_usage[key].append(c.get('id', '???'))
    
    duplicates = {k: v for k, v in question_usage.items() if len(v) > 1}
    
    for key, concepts in list(duplicates.items())[:10]:
        print(warn(f"Q{key[1]} [{key[0][:30]}...] → {len(concepts)}개 개념에 중복: {concepts}"))
    
    if not duplicates:
        print(ok("중복 배정 없음"))
    else:
        print(error(f"{len(duplicates)}개 문제가 중복 배정됨"))
    
    return len(duplicates), 0

# ============================================================
# CHECK 7: 선지 해설 품질
# ============================================================
def check_explanation_quality(units):
    header("7. 선지 해설 품질")
    
    issues = []
    total_options = 0
    poor_quality = 0
    
    for n, data in units.items():
        for c in data['concepts']:
            rq = c.get('realQuestion')
            if rq is None:
                continue
            
            chv2 = rq.get('conceptHighlightV2', {})
            if not chv2:
                continue
            
            for oa in chv2.get('optionAnalysis', []):
                total_options += 1
                r = oa.get('reasoning', '')
                
                # Check for garbage patterns
                if re.match(r'^(정답|오답)\.\s*$', r):
                    poor_quality += 1
                elif len(r) < 10:
                    poor_quality += 1
                elif r.endswith('...') and len(r) < 20:
                    poor_quality += 1
    
    quality_pct = (total_options - poor_quality) / total_options * 100 if total_options > 0 else 0
    
    if poor_quality == 0:
        print(ok(f"전체 {total_options}개 선지 해설 품질 양호"))
    elif poor_quality < total_options * 0.05:
        print(warn(f"저품질 해설: {poor_quality}/{total_options} ({100-quality_pct:.1f}% 문제)"))
    else:
        print(error(f"저품질 해설: {poor_quality}/{total_options} ({100-quality_pct:.1f}% 문제)"))
    
    return 0 if poor_quality < 10 else poor_quality, 0

# ============================================================
# CHECK 8: 개념 간 중복도
# ============================================================
def check_concept_overlap(units):
    header("8. 개념 간 내용 중복도")
    
    # Collect all definitions
    all_defs = []
    for n, data in units.items():
        for c in data['concepts']:
            card = c.get('card', {})
            definition = card.get('definition', '')
            all_defs.append((c.get('id', ''), n, definition))
    
    # Find high overlap pairs (within same unit)
    high_overlap = []
    
    for n, data in units.items():
        concepts = data.get('concepts', [])
        for i in range(len(concepts)):
            for j in range(i+1, len(concepts)):
                def_i = concepts[i].get('card', {}).get('definition', '')
                def_j = concepts[j].get('card', {}).get('definition', '')
                
                if not def_i or not def_j:
                    continue
                
                # Simple word overlap ratio
                words_i = set(re.findall(r'[가-힣]{2,}', def_i))
                words_j = set(re.findall(r'[가-힣]{2,}', def_j))
                
                if not words_i or not words_j:
                    continue
                
                overlap = len(words_i & words_j) / min(len(words_i), len(words_j))
                
                if overlap > 0.6:
                    high_overlap.append(
                        warn(f"{n}단원: '{concepts[i]['name']}' ↔ '{concepts[j]['name']}' 중복도={overlap:.0%}")
                    )
    
    for h in high_overlap[:10]:
        print(h)
    
    if not high_overlap:
        print(ok("단원 내 개념 중복 없음"))
    else:
        print(warn(f"{len(high_overlap)}쌍 높은 중복도 감지"))
    
    return 0, len(high_overlap)

# ============================================================
# SUMMARY
# ============================================================
def print_summary(results):
    header("검증 결과 요약")
    
    total_errors = sum(r[0] for r in results)
    total_warnings = sum(r[1] for r in results)
    
    # Count stats
    units = load_units()
    total_concepts = sum(len(d.get('concepts', [])) for d in units.values())
    has_question = sum(
        1 for d in units.values() 
        for c in d.get('concepts', []) 
        if c.get('realQuestion') is not None
    )
    null_question = total_concepts - has_question
    
    print(f"""
{C.BOLD}총 개념 수:{C.END}        {total_concepts}
{C.BOLD}문제 배정됨:{C.END}       {has_question} ({has_question/total_concepts*100:.0f}%)
{C.BOLD}문제 없음 (null):{C.END}  {null_question} ({null_question/total_concepts*100:.0f}%)

{C.BOLD}총 에러:{C.END}           {C.RED}{total_errors}{C.END}
{C.BOLD}총 경고:{C.END}           {C.YELLOW}{total_warnings}{C.END}
""")
    
    if total_errors == 0:
        print(f"{C.GREEN}{C.BOLD}🎉 PASS - 심각한 오류 없음{C.END}")
    else:
        print(f"{C.RED}{C.BOLD}❌ FAIL - {total_errors}건 에러 수정 필요{C.END}")


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    print(f"{C.BOLD}성공적인 직업생활 카드 검증 스크립트{C.END}")
    print(f"경로: {BASE_DIR}")
    print()
    
    units = load_units()
    mapping = load_mapping()
    freq_data = load_frequency()
    
    results = []
    results.append(check_json_integrity(units))
    results.append(check_unit_matching(units, mapping))
    results.append(check_concept_relevance(units))
    results.append(check_data_quality(units))
    results.append(check_frequency_alignment(units, freq_data))
    results.append(check_duplicate_questions(units))
    results.append(check_explanation_quality(units))
    results.append(check_concept_overlap(units))
    
    print_summary(results)
