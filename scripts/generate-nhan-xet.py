"""Quét thư mục assets/nhan-xet và ghi danh sách ảnh vào danh-sach.json.
Trang gioi-thieu.html đọc file JSON này để tự hiện ảnh nhận xét của học viên."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "assets" / "nhan-xet"
OUT = FOLDER / "danh-sach.json"
EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def natural_key(name: str):
    # 2.jpg đứng trước 10.jpg
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def main():
    FOLDER.mkdir(parents=True, exist_ok=True)
    files = sorted(
        (p.name for p in FOLDER.iterdir() if p.is_file() and p.suffix.lower() in EXT),
        key=natural_key,
    )
    data = json.dumps({"images": files}, ensure_ascii=False, indent=2) + "\n"
    if OUT.exists() and OUT.read_text(encoding="utf-8") == data:
        print("danh-sach.json đã mới nhất.")
        return
    OUT.write_text(data, encoding="utf-8")
    print(f"Đã ghi {len(files)} ảnh vào {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
