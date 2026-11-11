"""Tách hình từng công trình trên bản đồ map_built bằng rembg (mục 7, giai đoạn R2).

Đọc khung cắt trong assets/map-cuts.json. Với mỗi phần "object": cắt ảnh gốc theo khung (chừa lề PAD),
chạy rembg, lưu mặt nạ (ảnh xám 0–255, cùng kích thước vùng cắt) vào assets/work/map/rembg/<id>_<k>.png.
Ảnh gốc KHÔNG bị sửa. Bước sau (`npm run assets:map`, hoặc nút "Cắt lại" trên trang /tools/assets)
ghép mặt nạ này với phần khác biệt giữa map_built và map_empty để ra ảnh công trình.

Chạy:  .venv\\Scripts\\python.exe scripts\\assets\\map_segment.py [id_công_trình ...] [--force]
Không ghi id thì làm mọi công trình; phần nào khung không đổi và đã có mặt nạ thì bỏ qua (trừ khi --force).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CUTS = ROOT / "assets" / "map-cuts.json"
RAW_FILES = ROOT / "assets" / "raw-files.json"
OUT = ROOT / "assets" / "work" / "map" / "rembg"
INDEX = OUT / "index.json"
MODEL = "birefnet-general-lite"
PAD = 16


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    cuts = json.loads(CUTS.read_text(encoding="utf-8"))
    raw_name = json.loads(RAW_FILES.read_text(encoding="utf-8"))["map_built"]
    src = Image.open(ROOT / "assets" / "raw" / raw_name).convert("RGB")
    W, H = src.size
    OUT.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else {}

    jobs = []
    for b in cuts["buildings"]:
        if args and b["id"] not in args:
            continue
        for k, part in enumerate(b["parts"]):
            if part["mode"] != "object":
                continue
            key = f"{b['id']}_{k}"
            x0, y0, x1, y1 = part["box"]
            crop = [max(0, x0 - PAD), max(0, y0 - PAD), min(W, x1 + PAD), min(H, y1 + PAD)]
            done = index.get(key)
            if not force and done and done.get("crop") == crop and (OUT / f"{key}.png").exists():
                print(f"- {key}: khung không đổi, bỏ qua", flush=True)
                continue
            jobs.append((key, crop))

    if not jobs:
        print("Không có gì cần tách.", flush=True)
        return 0

    print(f"Đang nạp model {MODEL} (lần đầu có thể tải về khoảng 200MB)…", flush=True)
    from rembg import new_session, remove

    session = new_session(MODEL)
    for key, crop in jobs:
        t = time.time()
        part = src.crop(tuple(crop))
        cut = remove(part, session=session)
        alpha = np.array(cut)[:, :, 3]
        Image.fromarray(alpha, mode="L").save(OUT / f"{key}.png")
        index[key] = {"crop": crop}
        INDEX.write_text(json.dumps(index, indent=2), encoding="utf-8")
        print(f"- {key}: xong ({time.time() - t:.1f} giây)", flush=True)
    print("Xong. Chạy tiếp: npm run assets:map", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
