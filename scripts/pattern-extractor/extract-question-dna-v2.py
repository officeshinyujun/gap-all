#!/usr/bin/env python3
"""Build versioned Question DNA v2 files from parsed CSAT reference questions.

The extractor is intentionally offline. It only calls OpenAI when this script is
run, never from the request-time exam generation path.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterator

from openai import OpenAI


BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = BASE_DIR / "backend"
TEXTBOOK_DIR = BASE_DIR / "textbook"
SUPPORTED_TEMPLATES = {
    "TPL_COMPARATIVE_MATRIX",
    "TPL_FORMAL_DOCUMENT",
    "TPL_CONVERSATIONAL_FLOW",
    "TPL_CASE_DIAGNOSTIC_FRAME",
    "TPL_SEQUENTIAL_WORKFLOW",
    "TPL_INSTRUCTIONAL_SCENE",
    "TPL_DIGITAL_FORUM_INTERFACE",
    "TPL_QUANTITATIVE_CHART",
    "TPL_PROMOTIONAL_CANVAS",
}
TEMPLATE_ALIASES = {
    "TPL_DIALOGUE": "TPL_CONVERSATIONAL_FLOW",
    "TPL_CONVERSATION": "TPL_CONVERSATIONAL_FLOW",
    "TPL_TABLE": "TPL_COMPARATIVE_MATRIX",
    "TPL_MATRIX": "TPL_COMPARATIVE_MATRIX",
    "TPL_DOCUMENT": "TPL_FORMAL_DOCUMENT",
    "TPL_CASE": "TPL_CASE_DIAGNOSTIC_FRAME",
    "TPL_WORKFLOW": "TPL_SEQUENTIAL_WORKFLOW",
    "TPL_FLOWCHART": "TPL_SEQUENTIAL_WORKFLOW",
    "TPL_FORUM": "TPL_DIGITAL_FORUM_INTERFACE",
    "TPL_CHART": "TPL_QUANTITATIVE_CHART",
    "TPL_PROMOTION": "TPL_PROMOTIONAL_CANVAS",
}


def load_api_key() -> str | None:
    key = os.getenv("OPENAI_API_KEY") or os.getenv("GAP_OPENAI_KEY")
    if key:
        return key

    env_path = BACKEND_DIR / ".env"
    if not env_path.exists():
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("OPENAI_API_KEY=") or line.startswith("GAP_OPENAI_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").replace("\n", " ").split()).lower()


def source_hash(question: dict[str, Any]) -> str:
    payload = "\n".join(
        [
            str(question.get("stem", "")),
            str(question.get("stimulus", "")),
            *(str(choice) for choice in question.get("choices", [])),
        ]
    )
    return "sha256:" + hashlib.sha256(normalize_text(payload).encode("utf-8")).hexdigest()


def material_facts(stimulus: Any) -> list[dict[str, str]]:
    """Split material into indivisible source units for admissibility review.

    A sentence, dialogue turn, or table cell is the smallest usable source unit.
    An extractor must not split one such unit into multiple evidence slots merely
    to satisfy the evidence-count requirement.
    """
    facts: list[dict[str, str]] = []
    for raw_line in str(stimulus or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if "|" in line:
            cells = [cell.strip() for cell in line.split("|") if cell.strip()]
            for cell in cells:
                if len(normalize_text(cell)) >= 12:
                    facts.append({"text": normalize_text(cell), "unitType": "table_cell"})
            continue
        for sentence in re.split(r"(?<=[.!?])\s+|(?<=다\.)\s*", line):
            normalized = normalize_text(sentence)
            if len(normalized) >= 12:
                facts.append({"text": normalized, "unitType": "sentence"})

    if not facts and normalize_text(stimulus):
        facts = [{"text": normalize_text(stimulus), "unitType": "material"}]
    return [
        {"id": f"F{index + 1}", **fact}
        for index, fact in enumerate(facts[:12])
    ]


def card_question_number(card_question: dict[str, Any]) -> int | None:
    metadata = card_question.get("metadata", {})
    for value in (
        card_question.get("number"),
        metadata.get("question_number"),
        metadata.get("questionNumber"),
    ):
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def walk_card_questions(node: Any) -> Iterator[dict[str, Any]]:
    if isinstance(node, dict):
        real_question = node.get("realQuestion")
        if isinstance(real_question, dict):
            question_data = real_question.get("questionData")
            if isinstance(question_data, dict):
                yield {
                    "question": question_data,
                    "highlight": real_question.get("conceptHighlightV2")
                    or node.get("conceptHighlightV2")
                    or {},
                }
        for value in node.values():
            yield from walk_card_questions(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_card_questions(value)


def card_stem(card_question: dict[str, Any]) -> str:
    render_ready = card_question.get("render_ready", {})
    return str(
        render_ready.get("question_stem")
        or card_question.get("stem")
        or card_question.get("question_stem")
        or ""
    )


def load_card_index(subject: str, unit: int) -> dict[str, dict[str, Any]]:
    folder = "success_cards_moi" if subject == "success" else "kongil_cards_moi"
    path = TEXTBOOK_DIR / folder / f"{unit}단원.json"
    if not path.exists():
        return {}

    result: dict[str, dict[str, Any]] = {}
    for entry in walk_card_questions(read_json(path)):
        stem = normalize_text(card_stem(entry["question"]))
        if stem and stem not in result:
            result[stem] = entry
    return result


def question_payload(question: dict[str, Any], card: dict[str, Any] | None) -> dict[str, Any]:
    source = question.get("source", {})
    highlight = card.get("highlight", {}) if card else {}
    return {
        "source": {
            "type": source.get("type", "unknown"),
            "filename": source.get("filename", ""),
            "questionNumber": question.get("questionNumber"),
        },
        "targetConcepts": question.get("targetConcepts", []),
        "difficulty": question.get("difficulty", "MIDDLE"),
        "stem": question.get("stem", ""),
        "stimulus": question.get("stimulus", ""),
        "materialFacts": material_facts(question.get("stimulus", "")),
        "viewItems": question.get("viewItems", []),
        "choices": question.get("choices", []),
        "cardEnrichment": {
            "stimulusClues": highlight.get("stimulusClues", []),
            "optionAnalysis": highlight.get("optionAnalysis", []),
            "solvingFlow": highlight.get("solvingFlow", []),
        },
    }


def infer_material_contract(payload: dict[str, Any]) -> dict[str, Any]:
    stimulus = str(payload.get("stimulus", ""))
    lines = [line.strip() for line in stimulus.splitlines() if line.strip()]
    pipe_rows = [line for line in lines if line.startswith("|") and line.endswith("|")]
    speaker_rows = [line for line in lines if re.match(r"^[^:]{1,16}:\s+", line)]
    step_rows = [line for line in lines if re.match(r"^(\d+[.)]|[①②③④⑤])\s*", line)]

    if len(pipe_rows) >= 2:
        return {
            "materialKind": "contract_matrix",
            "requiredTemplate": "TPL_COMPARATIVE_MATRIX",
            "requiredFields": ["headers", "rows"],
            "metadataRequirements": [],
            "requiresVisualParity": True,
        }
    if re.search(r"제\s*\d+\s*조|법률|근로기준법", stimulus):
        return {
            "materialKind": "legal_document",
            "requiredTemplate": "TPL_FORMAL_DOCUMENT",
            "requiredFields": ["doc_type", "header_info", "paragraphs"],
            "metadataRequirements": ["title", "date", "author"],
            "requiresVisualParity": True,
        }
    if len(speaker_rows) >= 2:
        return {
            "materialKind": "dialogue",
            "requiredTemplate": "TPL_CONVERSATIONAL_FLOW",
            "requiredFields": ["participants", "messages"],
            "metadataRequirements": [],
            "requiresVisualParity": True,
        }
    if len(step_rows) >= 2 and re.search(r"절차|과정|단계|공정|순서", stimulus):
        return {
            "materialKind": "workflow",
            "requiredTemplate": "TPL_SEQUENTIAL_WORKFLOW",
            "requiredFields": ["orientation", "steps"],
            "metadataRequirements": [],
            "requiresVisualParity": True,
        }
    return {
        "materialKind": "case",
        "requiredTemplate": "TPL_CASE_DIAGNOSTIC_FRAME",
        "requiredFields": ["case_profile", "narrative"],
        "metadataRequirements": [],
        "requiresVisualParity": True,
    }


def expected_claim_ids(payload: dict[str, Any]) -> list[str]:
    view_items = payload.get("viewItems", [])
    if isinstance(view_items, list) and view_items:
        keys = []
        for item in view_items:
            match = re.match(r"^([ㄱ-ㅎ])", str(item).strip())
            if match:
                keys.append({"ㄱ": "ga", "ㄴ": "na", "ㄷ": "da", "ㄹ": "ra"}.get(match.group(1), ""))
        if len(keys) == len(view_items) and all(keys):
            return keys
    return [f"option_{index}" for index in range(1, 6)]


def infer_response_mode(payload: dict[str, Any]) -> str:
    return "truth_combination" if payload.get("viewItems") else "single_selection"


def canonical_claim_id(value: Any) -> str:
    raw = str(value or "").strip()
    return {
        "ㄱ": "ga",
        "ㄴ": "na",
        "ㄷ": "da",
        "ㄹ": "ra",
        "g": "ga",
        "n": "na",
        "d": "da",
        "r": "ra",
    }.get(raw, raw)


def canonical_verdict(proof: dict[str, Any]) -> bool | None:
    value = proof.get("verdict")
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"o", "true", "옳음", "참"}:
            return True
        if normalized in {"x", "false", "틀림", "거짓"}:
            return False
    for key, key_value in proof.items():
        if key.startswith("verdict:"):
            normalized = key.split(":", 1)[1].strip(" ,").lower()
            if normalized == "true":
                return True
            if normalized == "false":
                return False
            if isinstance(key_value, bool):
                return key_value
    return None


def validate_and_normalize_extraction(
    result: dict[str, Any], payload: dict[str, Any]
) -> tuple[dict[str, Any] | None, str]:
    solution = result.get("solutionContract", {})
    constraints = result.get("qualityConstraints", {})
    evidence_slots = solution.get("evidenceSlots", [])
    expected_ids = expected_claim_ids(payload)
    proofs = solution.get("claimProofs", [])

    if not isinstance(evidence_slots, list) or len(evidence_slots) < 2:
        return None, "insufficient_evidence_slots"
    evidence_ids = {slot.get("id") for slot in evidence_slots if isinstance(slot, dict)}
    material_facts_by_id = {
        fact["id"]: fact for fact in payload.get("materialFacts", []) if isinstance(fact, dict)
    }
    evidence_texts = {
        normalize_text(slot.get("evidence"))
        for slot in evidence_slots
        if isinstance(slot, dict) and normalize_text(slot.get("evidence"))
    }
    if len(evidence_ids) < 2 or len(evidence_texts) < 2:
        return None, "non_distinct_evidence_slots"
    if any(
        str(slot.get("sourceLocation", "")).lower() in {"viewitems", "choices", "options"}
        for slot in evidence_slots
        if isinstance(slot, dict)
    ):
        return None, "view_item_cannot_be_material_evidence"
    seen_source_units: set[str] = set()
    for slot in evidence_slots:
        if not isinstance(slot, dict):
            continue
        source_unit_id = str(slot.get("sourceUnitId", ""))
        source_unit = material_facts_by_id.get(source_unit_id)
        if not source_unit:
            return None, f"unknown_source_unit:{source_unit_id or 'missing'}"
        if source_unit_id in seen_source_units:
            return None, f"multiple_slots_from_one_source_unit:{source_unit_id}"
        seen_source_units.add(source_unit_id)
        evidence = normalize_text(slot.get("evidence"))
        if not evidence or evidence not in source_unit["text"]:
            return None, f"evidence_not_grounded_in_source_unit:{source_unit_id}"
    if not isinstance(proofs, list) or not solution.get("decisionRule"):
        return None, "missing_claim_proofs_or_decision_rule"

    proof_map: dict[str, dict[str, Any]] = {}
    for proof in proofs:
        if not isinstance(proof, dict):
            continue
        claim_id = canonical_claim_id(proof.get("claimId"))
        verdict = canonical_verdict(proof)
        if verdict is None:
            continue
        proof["claimId"] = claim_id
        proof["verdict"] = verdict
        proof_map[claim_id] = proof
    for claim_id in expected_ids:
        proof = proof_map.get(claim_id)
        if not proof or not isinstance(proof.get("verdict"), bool):
            return None, f"missing_or_invalid_proof:{claim_id}"
        slot_ids = proof.get("evidenceSlotIds", [])
        if len(slot_ids) < 2 or not set(slot_ids).issubset(evidence_ids):
            return None, f"direct_answer_risk:{claim_id}"
        source_units = {
            str(next(slot for slot in evidence_slots if slot.get("id") == slot_id).get("sourceUnitId"))
            for slot_id in slot_ids
        }
        if len(source_units) < 2:
            return None, f"single_source_unit_proof:{claim_id}"
        indispensability = proof.get("indispensabilityChecks", [])
        checked_slot_ids = {
            check.get("evidenceSlotId")
            for check in indispensability
            if isinstance(check, dict)
            and check.get("verdictWithoutEvidence") in {"indeterminate", "changes"}
        }
        if not set(slot_ids).issubset(checked_slot_ids):
            return None, f"unverified_indispensable_evidence:{claim_id}"
        if not proof.get("appliedRule"):
            return None, f"missing_applied_rule:{claim_id}"
    if constraints.get("sourceClosed") is not True:
        return None, f"source_closed_not_true:{constraints.get('sourceClosed')}"

    material_contract = infer_material_contract(payload)
    result["materialContract"] = material_contract
    stem_contract = result.get("stemContract", {})
    stem_contract["responseMode"] = infer_response_mode(payload)
    stem_contract["polarity"] = (
        "negative" if "옳지 않은" in str(payload.get("stem", "")) else "positive"
    )
    result["stemContract"] = stem_contract
    solution["minimumReasoningSteps"] = max(
        3, int(solution.get("minimumReasoningSteps", 3) or 3)
    )
    result["solutionContract"] = solution
    constraints["sourceClosed"] = True
    constraints["requiredEvidenceSlotCount"] = max(
        2, int(constraints.get("requiredEvidenceSlotCount", 2) or 2)
    )
    constraints["rejectDirectAnswer"] = True
    constraints["indispensableEvidenceVerified"] = True
    result["qualityConstraints"] = constraints
    return result, ""


EXTRACTION_PROMPT = """You are a Korean CSAT vocational-subject item analyst.
Extract a reusable Question DNA record from ONE real reference item. The output is
used internally to generate new, non-copied items with the same reasoning and
material structure.

Rules:
1. Choose exactly one supported material template. Never use TPL_PLAIN_TEXT.
2. The template must match the material's logical structure, not its topic.
3. The new item must be source-closed: every option verdict must be decidable
   from the material plus an explicitly stated curriculum rule.
4. Before extraction, reject the source and return {"rejectReason":"direct_answer_risk"}
   if ANY decisive claim can be answered from one sentence, dialogue turn, or
   table cell. A truth-combination answer does not qualify merely because it
   combines several independently direct claims.
5. For every retained claim, use at least two distinct materialFacts source
   units plus one curriculum rule. Each evidence slot must name exactly one
   sourceUnitId from materialFacts. Never split a sentence or table cell into
   multiple evidence slots.
6. For every cited evidence slot, include an indispensability check. Removing
   that source unit must make the claim indeterminate or change its verdict;
   contextual, redundant, and corroborating facts do not count.
7. claimProofs must explain which indispensable evidence slots and rule make
   each claim true or false. Include every view item when present; otherwise
   include all five options.
8. Document templates need meaningful metadata requirements. Tables need actual
   row and column requirements. Do not allow empty decorative fields.
7. Document templates need meaningful metadata requirements. Tables need actual
   row and column requirements. Do not allow empty decorative fields.

Return one JSON object with this exact shape:
{
  "materialContract": {
    "materialKind": "legal_document|contract_matrix|dialogue|case|workflow|chart|forum|instruction|promotional",
    "requiredTemplate": "one supported TPL",
    "requiredFields": ["..."],
    "metadataRequirements": ["..."],
    "requiresVisualParity": true
  },
  "stemContract": {
    "materialReference": "...",
    "judgmentTarget": "...",
    "polarity": "positive|negative",
    "responseMode": "single_selection|truth_combination|label_matching|pair_selection|blank_workflow",
    "requiredEntityLabels": ["..."],
    "forbiddenGenericPatterns": ["..."]
  },
  "solutionContract": {
    "minimumReasoningSteps": 2,
    "evidenceSlots": [{"id":"E1","sourceUnitId":"F1","sourceLocation":"...","evidence":"exact quote from F1","role":"fact|condition|exception|calculation_input"}],
    "decisionRule": "...",
    "claimProofs": [{"claimId":"ga|na|da|ra|option_1","verdict":true,"evidenceSlotIds":["E1","E2"],"indispensabilityChecks":[{"evidenceSlotId":"E1","verdictWithoutEvidence":"indeterminate"},{"evidenceSlotId":"E2","verdictWithoutEvidence":"changes"}],"appliedRule":"...","distractorType":"..."}],
    "answerEncodingRule": "..."
  },
  "qualityConstraints": {
    "sourceClosed": true,
    "requiredEvidenceSlotCount": 2,
    "rejectDirectAnswer": true,
    "indispensableEvidenceVerified": true,
    "noveltyConstraints": ["..."]
  }
}
"""


def extract_record(client: OpenAI, payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_DNA_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=False),
            },
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    if not content:
        return None, "empty_response"
    result = json.loads(content)

    material = result.get("materialContract", {})
    template = material.get("requiredTemplate")
    if template in TEMPLATE_ALIASES:
        material["requiredTemplate"] = TEMPLATE_ALIASES[template]
    normalized, reason = validate_and_normalize_extraction(result, payload)
    if normalized is None and os.getenv("DNA_DEBUG") == "1":
        print("DNA_DEBUG invalid response:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return normalized, reason


def build_record(
    subject: str,
    unit: int,
    question: dict[str, Any],
    extracted: dict[str, Any],
) -> dict[str, Any]:
    source = question.get("source", {})
    return {
        "schemaVersion": 2,
        "dnaId": f"dna-v2-{subject}-{unit}-{question.get('questionNumber', 0)}-{source_hash(question)[7:19]}",
        "subject": subject,
        "unitNumber": unit,
        "targetConcepts": question.get("targetConcepts", []),
        "difficulty": question.get("difficulty", "MIDDLE"),
        "itemFamily": extracted["stemContract"]["responseMode"],
        "provenance": {
            "sourceHash": source_hash(question),
            "sourceType": source.get("type", "unknown"),
            "sourceExam": source.get("filename", "unknown"),
            "questionNumber": question.get("questionNumber", 0),
        },
        **extracted,
    }


def extract_unit(
    client: OpenAI,
    subject: str,
    unit: int,
    dry_run: bool,
    limit: int | None,
    question_number: int | None,
    source_exam: str | None,
) -> dict[str, Any]:
    parsed_folder = "sungjik" if subject == "success" else "kongil"
    source_path = TEXTBOOK_DIR / "parsed" / parsed_folder / "all" / f"{unit}단원.json"
    if not source_path.exists():
        return {"unit": unit, "status": "missing_source", "records": []}

    questions = read_json(source_path)
    cards = load_card_index(subject, unit)
    records: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    matched_cards = 0

    for index, question in enumerate(questions):
        if limit is not None and len(records) + len(failures) >= limit:
            break
        if not isinstance(question, dict) or not question.get("stimulus"):
            continue
        if question_number is not None and question.get("questionNumber") != question_number:
            continue
        filename = str(question.get("source", {}).get("filename", ""))
        if source_exam and source_exam not in filename:
            continue
        number = question.get("questionNumber")
        card = cards.get(normalize_text(question.get("stem", "")))
        if card:
            matched_cards += 1
        if dry_run:
            continue

        payload = question_payload(question, card)
        extracted = None
        failure_reason = "invalid_or_empty_extraction"
        for attempt in range(3):
            try:
                extracted, failure_reason = extract_record(client, payload)
                if extracted:
                    break
            except Exception as error:
                print(f"  {subject}/{unit}/{number} attempt {attempt + 1}: {error}")
                time.sleep(2**attempt)
        if not extracted:
            failures.append({"questionNumber": number, "reason": failure_reason})
            continue
        records.append(build_record(subject, unit, question, extracted))

    return {
        "schemaVersion": 2,
        "subject": subject,
        "unit": unit,
        "records": records,
        "quality": {
            "sourceQuestionCount": len(questions),
            "cardMatchCount": matched_cards,
            "recordCount": len(records),
            "failureCount": len(failures),
            "failures": failures,
        },
    }


def available_units(subject: str) -> list[int]:
    parsed_folder = "sungjik" if subject == "success" else "kongil"
    directory = TEXTBOOK_DIR / "parsed" / parsed_folder / "all"
    units: list[int] = []
    for path in directory.glob("*단원.json"):
        digits = "".join(char for char in path.stem if char.isdigit())
        if digits:
            units.append(int(digits))
    return sorted(set(units))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", choices=["success", "kongil"], required=True)
    parser.add_argument("--unit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--question-number", type=int)
    parser.add_argument(
        "--source-exam",
        help="Only process source filenames containing this text. Use with --question-number when numbers repeat.",
    )
    args = parser.parse_args()

    key = load_api_key()
    if not args.dry_run and not key:
        print("OPENAI_API_KEY or GAP_OPENAI_KEY is required unless --dry-run is used.")
        sys.exit(1)
    client = OpenAI(api_key=key or "dry-run")

    output_dir = TEXTBOOK_DIR / "question-patterns" / "dna" / args.subject
    report_dir = TEXTBOOK_DIR / "question-patterns" / "dna" / "reports"
    output_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    units = [args.unit] if args.unit else available_units(args.subject)
    reports: list[dict[str, Any]] = []
    for unit in units:
        output_path = output_dir / f"{unit}단원.v2.json"
        if output_path.exists() and not args.force and not args.dry_run:
            print(f"skip {args.subject}/{unit}: {output_path.name} exists")
            continue

        print(f"extract {args.subject}/{unit}")
        result = extract_unit(
            client,
            args.subject,
            unit,
            args.dry_run,
            args.limit,
            args.question_number,
            args.source_exam,
        )
        reports.append({"unit": unit, "quality": result.get("quality", {})})
        if not args.dry_run and result.get("status") != "missing_source":
            output_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"  wrote {len(result['records'])} records")

    report_path = report_dir / f"{args.subject}-v2-report.json"
    report_path.write_text(
        json.dumps({"subject": args.subject, "units": reports}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"quality report: {report_path}")


if __name__ == "__main__":
    main()
