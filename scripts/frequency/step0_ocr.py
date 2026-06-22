import json
import time

from .api import pdf_to_base64_images
from .config import LLM_MODEL


def ocr_page_with_vision(client, b64_image, max_retries=5):
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=LLM_MODEL,
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": "이 이미지의 모든 텍스트를 정확히 추출하세요. 문제 번호, 지문, 표, 선지 모두 포함. 원본 그대로 추출만 하세요."},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}}
                ]}],
                max_tokens=8000,
                temperature=0.1,
            )
            return response.choices[0].message.content
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                wait = (2 ** attempt) * 2
                print(f"    Rate limited, waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise
    return ""


def step0_ocr(client, pdf_files, output_dir):
    save_path = output_dir / "_step0_ocr.json"
    if save_path.exists():
        print("[Step 0] 이전 OCR 결과 로드", flush=True)
        data = json.loads(save_path.read_text(encoding="utf-8"))
        if isinstance(data, list) and data and isinstance(data[0], list):
            flat = []
            for item in data:
                if isinstance(item, list):
                    flat.extend(item)
                else:
                    flat.append(item)
            return flat
        return data

    print("[Step 0] PDF → Kimi Vision OCR...", flush=True)
    results = []
    for pdf_file in pdf_files:
        print(f"  OCR: {pdf_file.name}", flush=True)
        try:
            images = pdf_to_base64_images(pdf_file)
            pages_text = []
            for i, img_b64 in enumerate(images):
                text = ocr_page_with_vision(client, img_b64)
                pages_text.append(text)
                print(f"    페이지 {i+1}/{len(images)} 완료", flush=True)
                time.sleep(1)
            results.append({
                "file": str(pdf_file),
                "filename": pdf_file.name,
                "pages": pages_text,
                "full_text": "\n\n".join(pages_text),
            })
            print(f"    {len(images)}페이지 전체 완료", flush=True)
        except Exception as e:
            print(f"    실패: {e}", flush=True)
            results.append({"file": str(pdf_file), "filename": pdf_file.name, "error": str(e)})

    save_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return results
