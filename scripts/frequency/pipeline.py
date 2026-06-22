import argparse
import json
import sys

from .config import BASE_DIR, SOURCE_MAP
from .api import load_api_keys, get_llm_client
from .step0_concepts import step0_extract_concept_list, verify_and_fix_step0c
from .step0_ocr import step0_ocr
from .step1_parse import step1_parse_questions
from .step2_extract import step2_extract_concepts, verify_and_fix_step2
from .step3_frequency import step3_frequency_count, verify_and_fix_step3
from .step4_cards import step4_card_generation, verify_and_fix_step4
from .step5_realquestions import step5_realquestions, verify_and_fix_step5
from .step6_quizzes import step6_quiz_generation, verify_and_fix_step6
from .step9_assemble import step9_final_assembly, verify_and_fix_step9


def find_pdfs(source_key):
    cfg = SOURCE_MAP[source_key]
    pattern = cfg["pdf_pattern"]

    if "**" in pattern:
        pdf_files = sorted(BASE_DIR.glob(pattern))
    else:
        pdf_files = sorted(BASE_DIR.glob(pattern))

    question_pdfs = []
    for f in pdf_files:
        question_pdfs.append(f)

    return question_pdfs


def run_pipeline(source_key, skip_to=None):
    cfg = SOURCE_MAP[source_key]
    subject = cfg["subject"]
    slug = cfg["slug"]
    source_type = cfg["source_type"]
    output_dir = BASE_DIR / cfg["output_dir"]
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}", flush=True)
    print(f"소스: {source_key}", flush=True)
    print(f"과목: {subject} ({slug})", flush=True)
    print(f"출력: {output_dir}", flush=True)
    print(f"{'='*60}\n", flush=True)

    keys = load_api_keys()
    ocr_api_key = keys.get("OCR_API_KEY", "")
    llm_api_key = keys.get("OPENAI_API_KEY", keys.get("LLM_API_KEY", ""))

    if "," in llm_api_key:
        from .api import get_round_robin_client
        client = get_round_robin_client(llm_api_key)
        print(f"LLM 키: {llm_api_key.count(',') + 1}개 (라운드 로빈)", flush=True)
    else:
        client = get_llm_client(llm_api_key)

    pdf_files = find_pdfs(source_key)
    print(f"PDF 파일: {len(pdf_files)}개", flush=True)
    if not pdf_files:
        print("PDF 파일을 찾을 수 없습니다.", flush=True)
        return

    steps = ["concepts", "ocr", "parse", "extract", "frequency", "cards", "realquestions", "quizzes", "final"]
    start_idx = 0
    if skip_to and skip_to in steps:
        start_idx = steps.index(skip_to)

    concept_list = None
    ocr_results = None
    questions = None
    extracted = None
    rankings = None
    cards = None
    real_questions = None
    quizzes = None

    if start_idx <= 0:
        concept_list = step0_extract_concept_list(client, slug, output_dir)
        concept_list = verify_and_fix_step0c(client, concept_list, slug, output_dir)
    else:
        p = output_dir / "_step0_concepts.json"
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            concept_list = {int(k): v for k, v in data.items()}

    if start_idx <= 1:
        ocr_results = step0_ocr(client, pdf_files, output_dir)
    else:
        p = output_dir / "_step0_ocr.json"
        if p.exists():
            ocr_results = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(ocr_results, list) and ocr_results and isinstance(ocr_results[0], list):
                flat = []
                for item in ocr_results:
                    if isinstance(item, list):
                        flat.extend(item)
                    else:
                        flat.append(item)
                ocr_results = flat

    if start_idx <= 2:
        if ocr_results is None:
            p = output_dir / "_step0_ocr.json"
            ocr_results = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(ocr_results, list) and ocr_results and isinstance(ocr_results[0], list):
                flat = []
                for item in ocr_results:
                    if isinstance(item, list):
                        flat.extend(item)
                    else:
                        flat.append(item)
                ocr_results = flat
        questions = step1_parse_questions(client, ocr_results, source_type, output_dir)
    else:
        p = output_dir / "_step1_questions.json"
        if p.exists():
            questions = json.loads(p.read_text(encoding="utf-8"))

    if start_idx <= 3:
        if questions is None:
            p = output_dir / "_step1_questions.json"
            questions = json.loads(p.read_text(encoding="utf-8"))
        if concept_list is None:
            p = output_dir / "_step0_concepts.json"
            if p.exists():
                data = json.loads(p.read_text(encoding="utf-8"))
                concept_list = {int(k): v for k, v in data.items()}
        extracted = step2_extract_concepts(client, questions, source_type, output_dir, concept_list=concept_list)
        extracted = verify_and_fix_step2(client, extracted, concept_list, source_type, output_dir)
    else:
        p = output_dir / "_step2_extracted.json"
        if p.exists():
            extracted = json.loads(p.read_text(encoding="utf-8"))

    if start_idx <= 4:
        if extracted is None:
            p = output_dir / "_step2_extracted.json"
            extracted = json.loads(p.read_text(encoding="utf-8"))
        rankings = step3_frequency_count(extracted, output_dir)
        rankings = verify_and_fix_step3(rankings, output_dir)
    else:
        p = output_dir / "_step3_rankings.json"
        if p.exists():
            rankings = json.loads(p.read_text(encoding="utf-8"))

    if start_idx <= 5:
        if rankings is None:
            p = output_dir / "_step3_rankings.json"
            rankings = json.loads(p.read_text(encoding="utf-8"))
        cards = step4_card_generation(client, rankings, subject, slug, output_dir)
        cards = verify_and_fix_step4(client, cards, rankings, subject, slug, output_dir)
    else:
        p = output_dir / "_step4_cards.json"
        if p.exists():
            cards = json.loads(p.read_text(encoding="utf-8"))

    if start_idx <= 6:
        if rankings is None:
            p = output_dir / "_step3_rankings.json"
            rankings = json.loads(p.read_text(encoding="utf-8"))
        if extracted is None:
            p = output_dir / "_step2_extracted.json"
            if p.exists():
                extracted = json.loads(p.read_text(encoding="utf-8"))
        if questions is None:
            p = output_dir / "_step1_questions.json"
            if p.exists():
                questions = json.loads(p.read_text(encoding="utf-8"))
        real_questions = step5_realquestions(client, rankings, extracted, questions, subject, output_dir)
        real_questions = verify_and_fix_step5(client, real_questions, rankings, subject, output_dir)
    else:
        p = output_dir / "_step5_realquestions.json"
        if p.exists():
            real_questions = json.loads(p.read_text(encoding="utf-8"))

    if start_idx <= 7:
        if rankings is None:
            p = output_dir / "_step3_rankings.json"
            rankings = json.loads(p.read_text(encoding="utf-8"))
        quizzes = step6_quiz_generation(client, rankings, subject, output_dir)
        quizzes = verify_and_fix_step6(client, quizzes, rankings, subject, output_dir)
    else:
        p = output_dir / "_step6_quizzes.json"
        if p.exists():
            quizzes = json.loads(p.read_text(encoding="utf-8"))

    if start_idx <= 8:
        if rankings is None:
            p = output_dir / "_step3_rankings.json"
            rankings = json.loads(p.read_text(encoding="utf-8"))
        if cards is None:
            p = output_dir / "_step4_cards.json"
            cards = json.loads(p.read_text(encoding="utf-8")) if (output_dir / "_step4_cards.json").exists() else {}
        if real_questions is None:
            p = output_dir / "_step5_realquestions.json"
            real_questions = json.loads(p.read_text(encoding="utf-8")) if (output_dir / "_step5_realquestions.json").exists() else {}
        if quizzes is None:
            p = output_dir / "_step6_quizzes.json"
            quizzes = json.loads(p.read_text(encoding="utf-8")) if (output_dir / "_step6_quizzes.json").exists() else {}

        step9_final_assembly(rankings, cards, real_questions, quizzes, subject, slug, output_dir)
        verify_and_fix_step9(output_dir)

    print(f"\n완료: {source_key}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="GAP Frequency Card Generator (NVIDIA NIM)")
    parser.add_argument("--source", choices=list(SOURCE_MAP.keys()), help="처리할 소스")
    parser.add_argument("--all", action="store_true", help="모든 소스 처리")
    parser.add_argument("--skip-to", choices=["concepts", "ocr", "parse", "extract", "frequency", "cards", "realquestions", "quizzes", "final"], help="특정 단계부터 재시작")
    args = parser.parse_args()

    if not args.source and not args.all:
        parser.print_help()
        sys.exit(1)

    if args.all:
        for source_key in SOURCE_MAP:
            run_pipeline(source_key, skip_to=args.skip_to)
    else:
        run_pipeline(args.source, skip_to=args.skip_to)
