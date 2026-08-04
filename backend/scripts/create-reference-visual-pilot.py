import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/reference-visual-pilot-v3"

TARGETS = [
    ("moi:kongil:2024:6월_모의평가", 2, 1, (180, 1280, 820, 1780)),
    ("moi:kongil:2024:6월_모의평가", 3, 1, (880, 450, 1540, 900)),
    ("moi:kongil:2024:6월_모의평가", 7, 2, (150, 1300, 840, 1900)),
    ("moi:kongil:2024:6월_모의평가", 9, 2, (870, 980, 1560, 1450)),
    ("moi:kongil:2024:6월_모의평가", 11, 3, (150, 270, 820, 900)),
    ("moi:kongil:2024:6월_모의평가", 12, 3, (150, 1320, 820, 1980)),
    ("moi:kongil:2024:6월_모의평가", 15, 3, (870, 1370, 1570, 1950)),
    ("suteck:kongil:6", 4, 2, (80, 250, 610, 900)),
    ("suteck:kongil:6", 8, 3, (90, 210, 600, 720)),
    ("suteck:kongil:6", 9, 3, (90, 930, 610, 1330)),
]


def safe(value: str) -> str:
    return "".join(c if c.isascii() and (c.isalnum() or c in "._-") else "_" for c in value)


def main() -> None:
    corpus_root = ROOT / "artifacts/reference-corpus-v2"
    for source_key, question_number, page, box in TARGETS:
        corpus_path = next(
            path
            for path in corpus_root.glob("*.json")
            if json.loads(path.read_text())["source"]["sourceKey"] == source_key
        )
        corpus = json.loads(corpus_path.read_text())
        evidence_root = next(
            path / "1"
            for path in (ROOT / "artifacts/reference-evidence-v2").iterdir()
            if (path / "1" / "metadata.json").exists()
            and json.loads((path / "1" / "metadata.json").read_text())["sourceKey"] == source_key
        )
        image_path = evidence_root / f"page-{page}.png"
        image = Image.open(image_path)
        crop = image.crop(box)
        output = OUT / safe(source_key) / f"q{question_number}-visual.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        crop.save(output)
        for question in corpus["questions"]:
            if question["questionNumber"] == question_number:
                question.setdefault("visual", {})["cropPath"] = str(output.relative_to(ROOT))
                question["visual"]["cropStatus"] = "crop_ready"
        corpus_path.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"crops": len(TARGETS), "output": str(OUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
