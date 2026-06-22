#!/bin/bash
# GAP Frequency Generator - 전체 과목 일괄 실행
#
# 사용법:
#     ./scripts/run_all_frequency.sh
#
# 필요:
#     OPENAI_API_KEY 환경변수 설정
#     pip install openai pdf2image pillow
#     brew install poppler

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GENERATOR="$SCRIPT_DIR/generate_frequency.py"

# PDF 소스 경로 (본인 환경에 맞게 수정)
MOI_KONGIL="./sources/moi_kongil"
MOI_SUCCESS="./sources/moi_success"
TEXTBOOK_KONGIL="./sources/textbook_kongil"
TEXTBOOK_SUCCESS="./sources/textbook_success"

echo "================================================"
echo "GAP Frequency Generator - 일괄 실행"
echo "================================================"
echo ""

# 1. 모의고사 - 공업일반
echo "[1/4] 모의고사 - 공업일반"
python "$GENERATOR" \
  --subject kongil \
  --pdf-dir "$MOI_KONGIL" \
  --output-dir "textbook/kongil_frequency_v3_moi"
echo ""

# 2. 모의고사 - 성공적인 직업생활
echo "[2/4] 모의고사 - 성공적인 직업생활"
python "$GENERATOR" \
  --subject success \
  --pdf-dir "$MOI_SUCCESS" \
  --output-dir "textbook/success_frequency_v3_moi"
echo ""

# 3. 수능특강 - 공업일반
echo "[3/4] 수능특강 - 공업일반"
python "$GENERATOR" \
  --subject kongil \
  --pdf-dir "$TEXTBOOK_KONGIL" \
  --output-dir "textbook/kongil_frequency_v3_textbook"
echo ""

# 4. 수능특강 - 성공적인 직업생활
echo "[4/4] 수능특강 - 성공적인 직업생활"
python "$GENERATOR" \
  --subject success \
  --pdf-dir "$TEXTBOOK_SUCCESS" \
  --output-dir "textbook/success_frequency_v3_textbook"
echo ""

echo "================================================"
echo "전체 완료"
echo "================================================"
