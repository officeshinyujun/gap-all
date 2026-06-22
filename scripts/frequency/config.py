from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
KEYS_FILE = BASE_DIR / "question" / "api_keys.txt"

YEAR_WEIGHTS = {
    "2027": 1.5, "2026": 1.5, "2025": 1.5,
    "2024": 1.3, "2023": 1.1, "2022": 1.0, "2021": 0.8,
}

LLM_MODEL = "gpt-4o-mini"
MAX_CONCEPTS_PER_UNIT = 10

SOURCE_MAP = {
    "moi_kongil": {
        "pdf_pattern": "question/moi/kongil/**/*.pdf",
        "subject": "공업일반",
        "slug": "kongil",
        "output_dir": "textbook/kongil_cards_moi",
        "source_type": "moi",
    },
    "moi_success": {
        "pdf_pattern": "question/moi/sungjik/**/*.pdf",
        "subject": "성공적인 직업생활",
        "slug": "success",
        "output_dir": "textbook/success_cards_moi",
        "source_type": "moi",
    },
    "suteck_kongil": {
        "pdf_pattern": "question/suteck/공일_*단원_문제.pdf",
        "subject": "공업일반",
        "slug": "kongil",
        "output_dir": "textbook/kongil_cards_suteck",
        "source_type": "suteck",
    },
    "suteck_success": {
        "pdf_pattern": "question/suteck/성직_*단원_문제.pdf",
        "subject": "성공적인 직업생활",
        "slug": "success",
        "output_dir": "textbook/success_cards_suteck",
        "source_type": "suteck",
    },
}
