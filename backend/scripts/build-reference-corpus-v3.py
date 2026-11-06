"""reference-corpus-v3 빌드: raw 추출 JSON -> 그림 크롭 + 검증 + v2 메타데이터 병합 + diff 리포트.

입력
  artifacts/reference-corpus-v3/raw/<sourceDir>.json      (EXTRACTION_SPEC.md 형식)
  artifacts/reference-corpus-v3/pages/<sourceDir>/p-N.png (150dpi 렌더)
  artifacts/reference-corpus-v3/v2-snapshot.json          (reference_questions 백업)
출력
  artifacts/reference-corpus-v3/built/<sourceDir>.json    (reference_questions 행 형식)
  artifacts/reference-corpus-v3/figures/<sourceDir>/q<N>-<F>.png
  artifacts/reference-corpus-v3/report.md

DB에는 쓰지 않는다.
usage: python3 scripts/build-reference-corpus-v3.py [sourceDir ...]
"""

import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
V3 = ROOT / "artifacts/reference-corpus-v3"
PARSE_VERSION = "reference-pdf-v3"
CHOICE_MARKS = "①②③④⑤"
VIEW_LABELS = "ㄱㄴㄷㄹㅁ"
SUBJECT_DB = {"kongil": "kongil", "sungjik": "success"}
SUBJECT_KOR = {"kongil": "공업 일반", "sungjik": "성공적인 직업생활"}
CROP_PAD = 0.0


def load_manifest() -> dict:
    manifest = json.loads((ROOT / "artifacts/reference-source-manifest-v2.json").read_text())
    return {s["sourceKey"]: s for s in manifest["sources"]}


def v2_index() -> dict:
    index: dict = {}
    for row in json.loads((V3 / "v2-snapshot.json").read_text()):
        payload = row["source_payload"]
        source = payload.get("source") or {}
        if source.get("type") == "moi":
            key = ("moi", row["subject"], source.get("year"), source.get("examType"))
        else:
            key = ("suteck", row["subject"], source.get("unitNumber"))
        index.setdefault(key + (payload.get("questionNumber"),), []).append(row)
    return index


def v2_key(source: dict, question_number: int) -> tuple:
    subject = SUBJECT_DB[source["subject"]]
    if source["sourceType"] == "moi":
        return ("moi", subject, source["year"], source["examType"], question_number)
    return ("suteck", subject, source["unitNumber"], question_number)


def source_filename(source: dict) -> str:
    # 생성기의 sourceId(과목:단원:filename:문항)에 쓰인다. 모의고사 PDF 이름은 회차마다 같아서
    # ("03 공업 일반_문제지.pdf") v2처럼 과목·연도·회차를 앞에 붙여 고유하게 만든다.
    name = Path(source["questionPdf"]).name
    if source["sourceType"] == "moi":
        return f"{source['subject']}_{source['year']}_{source['examType']}_{name}"
    return name


def flatten_blocks(blocks: list, figures: dict) -> str:
    parts = []
    for block in blocks:
        kind = block["type"]
        if kind == "text":
            parts.append(block["text"])
        elif kind == "dialogue":
            parts.append("\n".join(f"{line['speaker']}: {line['text']}" for line in block["lines"]))
        elif kind == "table":
            lines = [block["title"]] if block.get("title") else []
            lines += [" | ".join(row) for row in block.get("headers", [])]
            lines += [" | ".join(row) for row in block["rows"]]
            if block.get("caption"):
                lines.append(block["caption"])
            parts.append("\n".join(lines))
        elif kind == "figure":
            figure = figures.get(block["figureId"])
            parts.append(f"[그림 {block['figureId']}: {figure['description']}]" if figure else f"[그림 {block['figureId']}]")
    return "\n\n".join(p for p in parts if p)


def validate(source: dict, raw: dict) -> list:
    errors = []
    questions = raw["questions"]
    numbers = [q["questionNumber"] for q in questions]
    if len(set(numbers)) != len(numbers):
        errors.append(f"duplicate questionNumber: {numbers}")
    if source["sourceType"] == "moi" and sorted(numbers) != list(range(1, 21)):
        errors.append(f"moi exam should have 1..20, got {sorted(numbers)}")
    for q in questions:
        tag = f"Q{q['questionNumber']}"
        choices = q.get("choices") or []
        if len(choices) != 5:
            errors.append(f"{tag}: {len(choices)} choices")
        for i, choice in enumerate(choices):
            if not choice.startswith(CHOICE_MARKS[i]):
                errors.append(f"{tag}: choice {i + 1} does not start with {CHOICE_MARKS[i]}")
        if q.get("correctAnswer") not in (1, 2, 3, 4, 5):
            errors.append(f"{tag}: correctAnswer={q.get('correctAnswer')}")
        if q.get("points") not in (2, 3):
            errors.append(f"{tag}: points={q.get('points')}")
        if re.match(r"^\s*\d+\s*\.", q["stem"]) or "[3점]" in q["stem"]:
            errors.append(f"{tag}: stem still has number or [3점]")
        labels = [item[0] for item in q.get("viewItems") or []]
        if labels and labels != list(VIEW_LABELS[: len(labels)]):
            errors.append(f"{tag}: viewItems labels {labels}")
        used = set(re.findall(f"[{VIEW_LABELS}]", " ".join(c[1:] for c in choices))) if labels else set()
        if used - set(labels):
            errors.append(f"{tag}: choices reference {sorted(used - set(labels))} missing from viewItems")
        table = q.get("choiceTable")
        if table and len(table["rows"]) != 5:
            errors.append(f"{tag}: choiceTable has {len(table['rows'])} rows")
        figure_ids = {f["id"] for f in q.get("figures") or []}
        referenced = {b["figureId"] for b in q.get("stimulusBlocks") or [] if b["type"] == "figure"}
        referenced |= set(re.findall(r"\[그림 (F\d+)\]", json.dumps(q, ensure_ascii=False)))
        if referenced - figure_ids:
            errors.append(f"{tag}: figure refs without figure {sorted(referenced - figure_ids)}")
        for f in q.get("figures") or []:
            x0, y0, x1, y1 = f["bbox"]
            if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
                errors.append(f"{tag}: bad bbox {f['bbox']}")
        if source["sourceType"] == "moi" and not q.get("generatedExplanation"):
            errors.append(f"{tag}: moi question without generatedExplanation")
        if source["sourceType"] == "suteck" and not q.get("officialExplanation"):
            errors.append(f"{tag}: suteck question without officialExplanation")
    return errors


def crop_figures(source_dir: str, q: dict) -> list:
    out = []
    for figure in q.get("figures") or []:
        page = Image.open(V3 / "pages" / source_dir / f"p-{figure['page']}.png")
        w, h = page.size
        x0, y0, x1, y1 = figure["bbox"]
        box = (
            max(0, int((x0 - CROP_PAD) * w)),
            max(0, int((y0 - CROP_PAD) * h)),
            min(w, int((x1 + CROP_PAD) * w)),
            min(h, int((y1 + CROP_PAD) * h)),
        )
        path = V3 / "figures" / source_dir / f"q{q['questionNumber']}-{figure['id']}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        page.crop(box).save(path)
        out.append({**figure, "cropPath": str(path.relative_to(ROOT)), "storagePath": None})
    return out


def norm(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def build(source_dir: str, manifest: dict, v2: dict, overrides: dict) -> tuple:
    raw = json.loads((V3 / "raw" / f"{source_dir}.json").read_text())
    source = manifest[raw["sourceKey"]]
    errors = validate(source, raw)
    rows, diffs = [], []
    for q in sorted(raw["questions"], key=lambda item: item["questionNumber"]):
        number = q["questionNumber"]
        matches = v2.get(v2_key(source, number), [])
        old = matches[0] if matches else None
        override = overrides.get(f"v3:{raw['sourceKey']}:q{number}")
        if override:
            # v2 행이 없거나 매핑이 틀린 문항은 unit-overrides.json 값이 우선한다.
            old = {**(old or {"logical_source_id": None}), "unit_number": override["unit_number"], "unit_numbers": override["unit_numbers"],
                   "source_payload": {**(old["source_payload"] if old else {}), "targetConcepts": override["targetConcepts"]}}
        old_payload = old["source_payload"] if old else {}
        payload = {
            "stem": q["stem"],
            "points": q["points"],
            "stimulus": flatten_blocks(q.get("stimulusBlocks") or [], {f["id"]: f for f in q.get("figures") or []}),
            "stimulusBlocks": q.get("stimulusBlocks") or [],
            "viewItems": q.get("viewItems") or [],
            "choices": q["choices"],
            "choiceTable": q.get("choiceTable"),
            "correctAnswer": q["correctAnswer"],
            "explanation": q.get("officialExplanation") or "",
            "generatedExplanation": q.get("generatedExplanation") or "",
            "generatedExplanationVersion": PARSE_VERSION if q.get("generatedExplanation") else None,
            "generatedExplanationProvenance": "claude-written-from-transcribed-question-and-answer-key" if q.get("generatedExplanation") else None,
            "questionNumber": number,
            "targetConcepts": old_payload.get("targetConcepts") or [],
            "figures": crop_figures(source_dir, q),
            "source": {
                "type": source["sourceType"],
                "subject": SUBJECT_DB[source["subject"]],
                "subjectKor": SUBJECT_KOR[source["subject"]],
                "year": source.get("year"),
                "examType": source.get("examType"),
                "chapter": source.get("unitNumber"),
                "section": q.get("section"),
                "filename": source_filename(source),
                "unitNumber": old["unit_number"] if old else None,
            },
            "extraction": {
                "version": PARSE_VERSION,
                "method": "claude-vision-transcription",
                "sourceKey": raw["sourceKey"],
                "pages": q.get("pages") or [],
                "v2LogicalSourceIds": [m["logical_source_id"] for m in matches],
                "unitMapping": "override" if override else ("v2" if matches else "missing"),
            },
        }
        body = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        rows.append({
            "logical_source_id": f"v3:{raw['sourceKey']}:q{number}",
            "content_hash": "sha256:" + hashlib.sha256(body.encode()).hexdigest(),
            "subject": SUBJECT_DB[source["subject"]],
            "unit_number": old["unit_number"] if old else None,
            "unit_numbers": (old["unit_numbers"] or [old["unit_number"]]) if old else [],
            "provenance_path": source["questionPdf"],
            "parse_version": PARSE_VERSION,
            "source_payload": payload,
        })
        if old is None and not override:
            errors.append(f"Q{number}: no v2 row -> unit/targetConcepts need manual mapping")
        elif not override and old["unit_numbers"] and old["unit_number"] not in old["unit_numbers"]:
            errors.append(f"Q{number}: v2 unit_number {old['unit_number']} not in unit_numbers {old['unit_numbers']}")
        if len(matches) > 1:
            errors.append(f"Q{number}: {len(matches)} v2 rows matched (v2 duplicate)")
        diffs.append({
            "q": number,
            "v2": bool(matches),
            "answer": (old_payload.get("correctAnswer"), q["correctAnswer"]),
            "stem": similarity(old_payload.get("stem", ""), q["stem"]) if matches else None,
            "stimulus": similarity(old_payload.get("stimulus", ""), payload["stimulus"]) if matches else None,
            "choices": similarity(" ".join(old_payload.get("choices") or []), " ".join(q["choices"])) if matches else None,
            "figures": len(payload["figures"]),
            "tables": sum(1 for b in payload["stimulusBlocks"] if b["type"] == "table"),
            "choiceTable": payload["choiceTable"] is not None,
            "hadExplanation": bool(old_payload.get("explanation")),
        })
    out = V3 / "built" / f"{source_dir}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    return raw, errors, diffs


def fmt(value) -> str:
    return "-" if value is None else f"{value:.2f}"


def main() -> None:
    manifest, v2 = load_manifest(), v2_index()
    # 단원·개념 재매핑 결과. 에이전트별 파일(unit-overrides/*.json)을 합친다.
    overrides = {}
    for path in sorted((V3 / "unit-overrides").glob("*.json")):
        overrides.update(json.loads(path.read_text()))
    targets = sys.argv[1:] or sorted(p.stem for p in (V3 / "raw").glob("*.json"))
    lines = ["# reference-corpus-v3 빌드 리포트", ""]
    for source_dir in targets:
        raw, errors, diffs = build(source_dir, manifest, v2, overrides)
        start = len(lines)
        lines += [f"## {raw['sourceKey']} (`{source_dir}`)", ""]
        lines += [f"- 문항 {len(diffs)}개, v2 매칭 {sum(d['v2'] for d in diffs)}개"]
        lines += [f"- 검증 이슈 {len(errors)}건"] + [f"  - {e}" for e in errors]
        lines += [f"- 추출 노트"] + [f"  - {n}" for n in raw.get("notes") or []]
        lines += ["", "| Q | 정답 v2→v3 | stem | stimulus | choices | 표 | 선지표 | 그림 | v2해설 |", "|---|---|---|---|---|---|---|---|---|"]
        for d in diffs:
            a_old, a_new = d["answer"]
            answer = f"{a_old}→{a_new}" + (" ⚠️" if a_old is not None and a_old != a_new else "")
            lines.append(
                f"| {d['q']} | {answer} | {fmt(d['stem'])} | {fmt(d['stimulus'])} | {fmt(d['choices'])} "
                f"| {d['tables']} | {'O' if d['choiceTable'] else ''} | {d['figures']} | {'O' if d['hadExplanation'] else ''} |"
            )
        lines.append("")
        (V3 / "built" / f"{source_dir}.report.md").write_text("\n".join(lines[start:]))
        print(f"{source_dir}: {len(diffs)} questions, {len(errors)} issues")
    if not sys.argv[1:]:
        (V3 / "report.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
