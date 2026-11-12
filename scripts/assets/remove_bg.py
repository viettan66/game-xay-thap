"""Tách nền trắng của ảnh gốc bằng rembg (chạy offline sau khi đã tải model lần đầu).

Đọc assets/raw/*.png (KHÔNG sửa ảnh gốc), ghi ảnh nền trong suốt cùng kích thước vào assets/work/nobg/.
Bước sau: `npm run assets:build` cắt các ảnh này thành từng file trong assets/game/.

Cách làm:
1. Tìm từng vật trên nền trắng (vùng không trắng, gộp các mảnh gần nhau như tia lửa cạnh búa).
2. Cắt riêng từng vật (chừa lề) rồi mới chạy rembg, để nhân vật nhỏ trong sprite sheet được tách nét hơn.
3. Làm sạch: bỏ đốm lẻ, làm tròn alpha gần 0 / gần 255, và khử viền trắng bám mép
   (tính lại màu thật của điểm bán trong suốt: F = (C - (1 - a) * 255) / a).
4. ui_kit.png đã có nền trong suốt sẵn: chỉ làm sạch alpha, không chạy rembg.

Chạy:  .venv\\Scripts\\python.exe scripts\\assets\\remove_bg.py [tên_ảnh ...]
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "assets" / "work" / "nobg"

# Ảnh nền trắng cần tách. Model birefnet-general-lite giữ viền tốt nhất với vật màu sáng
# (bia đá, trụ trì), không để lại vệt sáng ở mép. (Ảnh tầng tháp, chóp tháp cũ đã bỏ sau R4.)
SHEETS = {
    "abbot_poses": {"model": "birefnet-general-lite"},
    "stele": {"model": "birefnet-general-lite"},
    # R3b: đống vật liệu (gạch, gỗ, ngói, đá – 3 mức; cát, giá cưa, ròng rọc, thang, quang gánh, xe cút kít).
    "props": {"model": "birefnet-general-lite"},
    # 4b: múa lân (phần thưởng khi đủ mục tiêu tim): lân nhìn thẳng, lân đi ngang, người đánh trống, chũm chọe, ông Địa.
    "lion_dance": {"model": "birefnet-general-lite"},
    # 4c: nhân vật (5 loại × đi lại / làm việc), xe trâu và voi, tượng võ tướng đá ở ô ghi danh.
    "chars_danphu_nam_walk": {"model": "birefnet-general-lite"},
    "chars_danphu_nam_work": {"model": "birefnet-general-lite"},
    "chars_danphu_nu_walk": {"model": "birefnet-general-lite"},
    "chars_danphu_nu_work": {"model": "birefnet-general-lite"},
    "chars_thomoc_walk": {"model": "birefnet-general-lite"},
    "chars_thomoc_work": {"model": "birefnet-general-lite"},
    "chars_thone_walk": {"model": "birefnet-general-lite"},
    "chars_thone_work": {"model": "birefnet-general-lite"},
    "chars_tusi_walk": {"model": "birefnet-general-lite"},
    "chars_tusi_work": {"model": "birefnet-general-lite"},
    "vehicles": {"model": "birefnet-general-lite"},
    "honor_statues": {"model": "birefnet-general-lite"},
}
ALREADY_TRANSPARENT = ["ui_kit"]

WHITE_THRESHOLD = 246  # kênh màu nhỏ nhất ≥ ngưỡng này coi là nền trắng
MERGE_DILATE = 10  # gộp các mảnh cách nhau dưới ~20px thành một vật
MARGIN = 24


def find_items(rgb: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Khung bao (x0, y0, x1, y1) của từng vật trên nền trắng, theo thứ tự đọc (trên → dưới, trái → phải)."""
    mask = rgb.min(axis=2) < WHITE_THRESHOLD
    mask = ndimage.binary_opening(mask, iterations=1)  # bỏ nhiễu 1 điểm ảnh
    merged = ndimage.binary_dilation(mask, iterations=MERGE_DILATE)
    labels, n = ndimage.label(merged)
    boxes = []
    for sl in ndimage.find_objects(labels):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        inner = mask[y0:y1, x0:x1]
        if inner.sum() < 300:
            continue
        ys, xs = np.nonzero(inner)
        boxes.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1))
    return reading_order(boxes)


def reading_order(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Gom thành hàng (hai vật cùng hàng nếu chồng nhau theo chiều dọc ≥ 30%), rồi trái → phải."""
    rows: list[dict] = []
    for b in sorted(boxes, key=lambda b: b[1]):
        h = b[3] - b[1]
        for row in rows:
            overlap = min(b[3], row["y1"]) - max(b[1], row["y0"])
            if overlap >= 0.3 * min(h, row["y1"] - row["y0"]):
                row["items"].append(b)
                row["y0"], row["y1"] = min(row["y0"], b[1]), max(row["y1"], b[3])
                break
        else:
            rows.append({"y0": b[1], "y1": b[3], "items": [b]})
    rows.sort(key=lambda r: r["y0"])
    return [b for row in rows for b in sorted(row["items"], key=lambda b: b[0])]


def refine(rgba: np.ndarray, core: np.ndarray) -> np.ndarray:
    """Làm sạch alpha và khử viền trắng."""
    out = rgba.astype(np.float32)
    a = out[..., 3] / 255.0
    a[a < 8 / 255] = 0
    a[a > 247 / 255] = 1
    # Chỉ giữ các vùng chạm vào vật thật (bỏ mảng nền rembg giữ nhầm ở xa).
    labels, n = ndimage.label(a > 16 / 255)
    if n > 1:
        keep = np.unique(labels[core & (labels > 0)])
        a[~np.isin(labels, keep)] = 0
    semi = (a > 0) & (a < 1)
    for c in range(3):
        ch = out[..., c]
        ch[semi] = np.clip((ch[semi] - (1 - a[semi]) * 255.0) / a[semi], 0, 255)
    out[..., 3] = a * 255.0
    out[a == 0, :3] = 0
    return out.round().astype(np.uint8)


def raw_file(name: str) -> Path:
    """Ảnh gốc theo tên trong SPEC: tên cũ dạng <name>.png, hoặc tên tiếng Việt khai báo trong assets/raw-files.json."""
    direct = RAW / f"{name}.png"
    if direct.exists():
        return direct
    mapping = json.loads((ROOT / "assets" / "raw-files.json").read_text("utf8"))
    return RAW / mapping[name]


def process_sheet(name: str, model: str, session_cache: dict) -> dict:
    from rembg import new_session, remove

    if model not in session_cache:
        session_cache[model] = new_session(model)
    session = session_cache[model]
    src = Image.open(raw_file(name)).convert("RGB")
    rgb = np.asarray(src)
    h, w = rgb.shape[:2]
    sheet = np.zeros((h, w, 4), np.uint8)
    boxes = find_items(rgb)
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        t = time.time()
        cx0, cy0 = max(0, x0 - MARGIN), max(0, y0 - MARGIN)
        cx1, cy1 = min(w, x1 + MARGIN), min(h, y1 + MARGIN)
        crop = src.crop((cx0, cy0, cx1, cy1))
        cut = np.asarray(remove(crop, session=session).convert("RGBA"))
        core = np.zeros(cut.shape[:2], bool)
        core[y0 - cy0 : y1 - cy0, x0 - cx0 : x1 - cx0] = rgb[y0:y1, x0:x1].min(axis=2) < 200
        clean = refine(cut, core)
        region = sheet[cy0:cy1, cx0:cx1]
        take = clean[..., 3] > region[..., 3]
        region[take] = clean[take]
        print(f"  {name} vật {i + 1}/{len(boxes)} ({x1 - x0}×{y1 - y0}) xong trong {time.time() - t:.0f}s", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, "RGBA").save(OUT / f"{name}.png", optimize=True)
    return {"items": len(boxes), "boxes": [list(map(int, b)) for b in boxes], "model": model}


def clean_transparent(name: str) -> dict:
    """Ảnh đã trong suốt sẵn: phần thân gần đục (alpha 240–254) đưa về 255, alpha rất nhỏ (≤ 6) về 0."""
    rgba = np.asarray(Image.open(RAW / f"{name}.png").convert("RGBA")).copy()
    a = rgba[..., 3]
    a[a >= 240] = 255
    a[a <= 6] = 0
    rgba[a == 0, :3] = 0
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(OUT / f"{name}.png", optimize=True)
    return {"items": None, "model": None}


def main() -> None:
    # Máy Windows có thể dùng bảng mã khác (ví dụ cp932) khi ghi log ra file: ép UTF-8 để in được tiếng Việt.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    only = set(sys.argv[1:])
    report_file = OUT / "report.json"
    report = json.loads(report_file.read_text("utf8")) if report_file.exists() else {}
    cache: dict = {}
    for name, opt in SHEETS.items():
        if only and name not in only:
            continue
        print(f"Tách nền {name} (model {opt['model']})...", flush=True)
        report[name] = process_sheet(name, opt["model"], cache)
    for name in ALREADY_TRANSPARENT:
        if only and name not in only:
            continue
        print(f"Làm sạch alpha {name}...", flush=True)
        report[name] = clean_transparent(name)
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf8")
    print("Xong. Ảnh nằm trong assets/work/nobg/")


if __name__ == "__main__":
    main()
