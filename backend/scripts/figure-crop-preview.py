"""그림 bbox 보정용 미리보기. bbox 주변을 확대하고 비율 좌표 격자와 빨간 bbox 테두리를 그린다.

usage: python3 scripts/figure-crop-preview.py <page.png> x0 y0 x1 y1 <out.png>
  - 좌표는 페이지 대비 비율(0~1)
  - 격자는 0.01 간격(0.05마다 굵게, 값 표시)
출력 이미지를 보고, 그림 전체가 빨간 테두리 안에 들어가면서 본문·표 테두리·다른 문항이 섞이지 않을 때까지 bbox를 조정한다.
"""

import sys

from PIL import Image, ImageDraw

MARGIN = 0.04
SCALE_MAX = 1400


def main() -> None:
    page_path, *coords, out_path = sys.argv[1:]
    x0, y0, x1, y1 = map(float, coords)
    page = Image.open(page_path).convert("RGB")
    w, h = page.size
    cx0, cy0 = max(0.0, x0 - MARGIN), max(0.0, y0 - MARGIN)
    cx1, cy1 = min(1.0, x1 + MARGIN), min(1.0, y1 + MARGIN)
    region = page.crop((int(cx0 * w), int(cy0 * h), int(cx1 * w), int(cy1 * h)))
    scale = min(SCALE_MAX / region.width, SCALE_MAX / region.height, 3.0)
    region = region.resize((int(region.width * scale), int(region.height * scale)))
    draw = ImageDraw.Draw(region)

    def to_px(fx: float, fy: float) -> tuple:
        return ((fx - cx0) * w * scale, (fy - cy0) * h * scale)

    step = 0.01
    v = round(cx0 - cx0 % step, 2)
    while v <= cx1:
        px, _ = to_px(v, 0)
        bold = round(v * 100) % 5 == 0
        draw.line([(px, 0), (px, region.height)], fill=(0, 120, 255) if bold else (170, 210, 255), width=1)
        if bold:
            draw.text((px + 2, 2), f"{v:.2f}", fill=(0, 90, 220))
        v = round(v + step, 2)
    v = round(cy0 - cy0 % step, 2)
    while v <= cy1:
        _, py = to_px(0, v)
        bold = round(v * 100) % 5 == 0
        draw.line([(0, py), (region.width, py)], fill=(0, 120, 255) if bold else (170, 210, 255), width=1)
        if bold:
            draw.text((2, py + 2), f"{v:.2f}", fill=(0, 90, 220))
        v = round(v + step, 2)
    draw.rectangle([to_px(x0, y0), to_px(x1, y1)], outline=(230, 0, 0), width=3)
    region.save(out_path)
    print(out_path, region.size)


if __name__ == "__main__":
    main()
