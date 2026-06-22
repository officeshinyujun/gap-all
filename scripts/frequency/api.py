import base64
import json
import time
from io import BytesIO

import requests
from openai import OpenAI
from pdf2image import convert_from_path
from PIL import Image

from .config import KEYS_FILE, LLM_MODEL


def load_api_keys():
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line:
                k, v = line.split("=", 1)
                keys[k.strip()] = v.strip()
    return keys


def get_llm_client(api_key):
    return OpenAI(api_key=api_key)


class RoundRobinClient:
    def __init__(self, api_keys):
        self.clients = [OpenAI(api_key=k.strip()) for k in api_keys if k.strip()]
        self.index = 0

    def next(self):
        client = self.clients[self.index % len(self.clients)]
        self.index += 1
        return client


_rr_client = None


def get_round_robin_client(api_keys_str):
    global _rr_client
    if _rr_client is None:
        keys = [k.strip() for k in api_keys_str.split(",") if k.strip()]
        _rr_client = RoundRobinClient(keys)
    return _rr_client


def llm_call(client, messages, temperature=0.1, max_retries=5):
    actual_client = client
    if isinstance(client, RoundRobinClient):
        actual_client = client.next()

    for attempt in range(max_retries):
        try:
            response = actual_client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                temperature=temperature,
                max_tokens=16000,
            )
            content = response.choices[0].message.content
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            return json.loads(content.strip())
        except json.JSONDecodeError:
            return {"raw_text": content}
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                if isinstance(client, RoundRobinClient):
                    actual_client = client.next()
                    print(f"    Rate limited, switching key...", flush=True)
                    time.sleep(1)
                else:
                    wait = (2 ** attempt) * 2
                    print(f"    Rate limited, waiting {wait}s...", flush=True)
                    time.sleep(wait)
                continue
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise
            raise


def pdf_to_base64_images(pdf_path, dpi=200):
    images = convert_from_path(str(pdf_path), dpi=dpi)
    results = []
    for img in images:
        buf = BytesIO()
        img.save(buf, format="PNG")
        results.append(base64.b64encode(buf.getvalue()).decode("utf-8"))
    return results


from openai import AsyncOpenAI
import asyncio


class AsyncRoundRobinClient:
    def __init__(self, api_keys):
        self.clients = [AsyncOpenAI(api_key=k.strip()) for k in api_keys if k.strip()]
        self.index = 0
        self._lock = asyncio.Lock()

    async def next(self):
        async with self._lock:
            client = self.clients[self.index % len(self.clients)]
            self.index += 1
            return client


def get_async_round_robin_client(api_keys_str):
    keys = [k.strip() for k in api_keys_str.split(",") if k.strip()]
    return AsyncRoundRobinClient(keys)


async def async_llm_call(client, messages, temperature=0.1, max_retries=5):
    if isinstance(client, AsyncRoundRobinClient):
        actual_client = await client.next()
    else:
        actual_client = client

    for attempt in range(max_retries):
        try:
            response = await actual_client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                temperature=temperature,
                max_tokens=16000,
            )
            content = response.choices[0].message.content
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            return json.loads(content.strip())
        except json.JSONDecodeError:
            return {"raw_text": content}
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                if isinstance(client, AsyncRoundRobinClient):
                    actual_client = await client.next()
                    await asyncio.sleep(1)
                else:
                    wait = (2 ** attempt) * 2
                    await asyncio.sleep(wait)
                continue
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
                continue
            raise


def ocr_page(ocr_api_key, b64_image):
    url = "https://integrate.api.nvidia.com/v1/infer"
    headers = {
        "Authorization": f"Bearer {ocr_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "input": [{"type": "image_url", "url": f"data:image/png;base64,{b64_image}"}],
        "merge_levels": ["paragraph"],
    }
    for attempt in range(5):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=60)
            if resp.status_code == 429:
                wait = (2 ** attempt) * 2
                print(f"    OCR rate limited, waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict) and "text" in data:
                return data["text"]
            if isinstance(data, dict) and "content" in data:
                return data["content"]
            if isinstance(data, list):
                return "\n".join(str(item) for item in data)
            return json.dumps(data, ensure_ascii=False)
        except Exception as e:
            if attempt < 4:
                time.sleep(2)
                continue
            raise
    return ""
