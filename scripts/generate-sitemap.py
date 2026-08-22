
from pathlib import Path
from urllib.parse import quote

BASE_URL = "https://amber139-chinese.github.io/tieng-trung-meowmew"

ROOT = Path(__file__).resolve().parents[1]

EXCLUDE_NAMES = {
    "admin.html",
    "login.html",
    "404.html",
}

def should_include(path: Path) -> bool:
    if path.suffix.lower() != ".html":
        return False

    # Không đưa file xác minh Google vào sitemap.
    if path.name.startswith("google") and path.name.endswith(".html"):
        return False

    if path.name in EXCLUDE_NAMES:
        return False

    # Bỏ các thư mục nội bộ / workflow / dependencies nếu có.
    parts = set(path.parts)
    if ".git" in parts or ".github" in parts or "node_modules" in parts:
        return False

    return True

def to_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()

    # index.html của root => URL trang chủ đẹp
    if rel == "index.html":
        return f"{BASE_URL}/"

    # Encode an toàn từng path segment nhưng giữ dấu /
    encoded = "/".join(quote(part) for part in rel.split("/"))
    return f"{BASE_URL}/{encoded}"

html_files = sorted(
    [p for p in ROOT.rglob("*.html") if should_include(p)],
    key=lambda p: p.relative_to(ROOT).as_posix().lower()
)

urls = [to_url(p) for p in html_files]

lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
]

for url in urls:
    lines += [
        "  <url>",
        f"    <loc>{url}</loc>",
        "  </url>",
    ]

lines.append("</urlset>")

(ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")

print(f"Generated sitemap.xml with {len(urls)} public HTML URLs.")
for url in urls:
    print(url)
