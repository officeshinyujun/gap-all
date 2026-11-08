"""reference-corpus-v3 검수 페이지: 문항별로 v3 렌더링과 v2 원본 payload를 나란히 보여 준다.

usage: python3 scripts/render-reference-v3-review.py
output: artifacts/reference-corpus-v3/review.html (로컬 전용, 외부 게시 금지 — 시험지 저작권 콘텐츠)
"""

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V3 = ROOT / "artifacts/reference-corpus-v3"


def esc(text) -> str:
    return html.escape(str(text or "")).replace("\n", "<br>")


def render_block(block: dict, figures: dict) -> str:
    kind = block["type"]
    if kind == "text":
        return f"<p>{esc(block['text'])}</p>"
    if kind == "dialogue":
        return "<div class=dlg>" + "".join(
            f"<div><b>{esc(line['speaker'])}</b> {esc(line['text'])}</div>" for line in block["lines"]
        ) + "</div>"
    if kind == "table":
        head = "".join("<tr>" + "".join(f"<th>{esc(c)}</th>" for c in row) + "</tr>" for row in block.get("headers") or [])
        body = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in row) + "</tr>" for row in block["rows"])
        title = f"<div class=cap>{esc(block['title'])}</div>" if block.get("title") else ""
        caption = f"<div class=cap>{esc(block['caption'])}</div>" if block.get("caption") else ""
        return f"{title}<table>{head}{body}</table>{caption}"
    if kind == "figure":
        figure = figures.get(block["figureId"])
        return render_figure(figure) if figure else f"<p class=err>missing {block['figureId']}</p>"
    return f"<pre>{esc(json.dumps(block, ensure_ascii=False))}</pre>"


def render_figure(figure: dict) -> str:
    src = "../../" + figure["cropPath"]
    return (
        f"<figure><img src='{src}'><figcaption><b>{figure['id']} · {figure['kind']}</b> "
        f"{esc(figure['description'])}</figcaption></figure>"
    )


def render_v3(payload: dict) -> str:
    figures = {f["id"]: f for f in payload["figures"]}
    placed = {b["figureId"] for b in payload["stimulusBlocks"] if b["type"] == "figure"}
    parts = [f"<p class=stem>{esc(payload['stem'])} <span class=pt>[{payload['points']}점]</span></p>"]
    parts += [render_block(b, figures) for b in payload["stimulusBlocks"]]
    parts += [render_figure(f) for fid, f in figures.items() if fid not in placed]
    if payload["viewItems"]:
        parts.append("<div class=view><div class=cap>&lt;보 기&gt;</div>" + "".join(f"<div>{esc(v)}</div>" for v in payload["viewItems"]) + "</div>")
    if payload.get("choiceTable"):
        t = payload["choiceTable"]
        parts.append("<table><tr><th></th>" + "".join(f"<th>{esc(h)}</th>" for h in t["headers"]) + "</tr>" + "".join(
            f"<tr><td>{'①②③④⑤'[i]}</td>" + "".join(f"<td>{esc(c)}</td>" for c in row) + "</tr>" for i, row in enumerate(t["rows"])
        ) + "</table>")
    parts.append("<ol class=choices>" + "".join(
        f"<li class={'ans' if i + 1 == payload['correctAnswer'] else ''}>{esc(c)}</li>" for i, c in enumerate(payload["choices"])
    ) + "</ol>")
    if payload["explanation"]:
        parts.append(f"<details><summary>공식 해설</summary><p>{esc(payload['explanation'])}</p></details>")
    return "".join(parts)


def render_v2(payload: dict) -> str:
    if not payload:
        return "<p class=err>v2 행 없음</p>"
    keys = ("stem", "stimulus", "viewItems", "choices", "correctAnswer", "explanation", "generatedExplanation")
    return "<pre>" + esc(json.dumps({k: payload.get(k) for k in keys}, ensure_ascii=False, indent=1)) + "</pre>"


def main() -> None:
    v2 = {r["logical_source_id"]: r for r in json.loads((V3 / "v2-snapshot.json").read_text())}
    sections, toc = [], []
    for built in sorted((V3 / "built").glob("*.json")):
        rows = json.loads(built.read_text())
        key = rows[0]["source_payload"]["extraction"]["sourceKey"]
        toc.append(f"<a href='#{built.stem}'>{esc(key)}</a>")
        sections.append(f"<h2 id='{built.stem}'>{esc(key)}</h2>")
        for row in rows:
            p = row["source_payload"]
            ids = p["extraction"]["v2LogicalSourceIds"]
            old = v2[ids[0]]["source_payload"] if ids else {}
            meta = f"unit_number={row['unit_number']} unit_numbers={row['unit_numbers']} · 개념 {', '.join(p['targetConcepts'])} · p.{p['extraction']['pages']}"
            sections.append(
                f"<section><h3>Q{p['questionNumber']} <small>{esc(meta)}</small></h3>"
                f"<div class=cols><div class=v3>{render_v3(p)}</div><div class=v2><div class=cap>v2 (현재 DB)</div>{render_v2(old)}</div></div></section>"
            )
    page = f"""<!doctype html><html lang=ko><head><meta charset=utf-8><title>Reference v3 검수</title><style>
body{{font:15px/1.6 -apple-system,'Apple SD Gothic Neo',sans-serif;margin:0 auto;max-width:1500px;padding:16px;background:#f6f6f4;color:#222}}
nav{{position:sticky;top:0;background:#f6f6f4;padding:8px 0;border-bottom:1px solid #ddd;z-index:1}} nav a{{margin-right:16px}}
section{{background:#fff;border:1px solid #ddd;border-radius:8px;margin:16px 0;padding:12px 16px}}
h3 small{{font-weight:normal;color:#777;font-size:12px}} .cols{{display:grid;grid-template-columns:3fr 2fr;gap:16px}}
.v2 pre{{white-space:pre-wrap;font-size:12px;background:#fafafa;padding:8px;color:#555}}
table{{border-collapse:collapse;margin:8px 0}} td,th{{border:1px solid #999;padding:4px 8px;vertical-align:top}} th{{background:#eee}}
.view{{border:1px solid #999;padding:8px 12px;margin:8px 0}} .cap{{text-align:center;color:#666;font-size:13px}}
.dlg{{border-left:3px solid #9bd;padding-left:10px}} .stem{{font-weight:600}} .pt{{color:#c60}}
figure{{margin:8px 0}} figure img{{max-width:100%;border:1px solid #ccc}} figcaption{{font-size:12px;color:#555}}
.choices{{list-style:none;padding:0}} .choices li.ans{{background:#e3f6e3;font-weight:600}} .err{{color:#c00}}
@media(max-width:900px){{.cols{{grid-template-columns:1fr}}}}
</style></head><body><h1>Reference v3 검수</h1><nav>{''.join(toc)}</nav>{''.join(sections)}</body></html>"""
    (V3 / "review.html").write_text(page)
    print(V3 / "review.html")


if __name__ == "__main__":
    main()
