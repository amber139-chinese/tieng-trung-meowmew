#!/usr/bin/env python3
"""Kiểm tra toàn vẹn dữ liệu đã dựng trong data/dictionary/. Thoát mã 1 nếu có lỗi.  Chạy: python scripts/validate-dictionary.py"""
import json, re, sys, collections, unicodedata
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "data" / "dictionary"
errors, warns = [], []
def err(m): errors.append(m)
def u16(s): return s.encode("utf-16-be")

man = json.loads((D / "index.json").read_text(encoding="utf-8"))
entries = []
files = sorted((D / "entries").glob("e-*.json"))
if len(files) != man["entryFiles"]:
    err(f"số file entries {len(files)} != manifest {man['entryFiles']}")
for i, f in enumerate(files):
    try:
        chunk = json.loads(f.read_text(encoding="utf-8"))
    except Exception as e:
        err(f"{f.name}: JSON lỗi {e}"); continue
    if i < len(files) - 1 and len(chunk) != man["entryShard"]:
        err(f"{f.name}: {len(chunk)} mục (cần {man['entryShard']})")
    entries += chunk
N = len(entries)
if N != man["counts"]["entries"]:
    err(f"tổng mục {N} != manifest {man['counts']['entries']}")

seen = collections.Counter()
ctrl = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]")
for i, e in enumerate(entries):
    for k in ("s", "p", "m"):
        if k not in e: err(f"id {i}: thiếu trường {k}")
    if not e.get("m") or any(not str(m).strip() for m in e["m"]): err(f"id {i} ({e.get('s')}): nghĩa rỗng")
    if "u:" in e["p"]: err(f"id {i} ({e['s']}): còn 'u:' trong pinyin")
    if re.search(r"[1-5]\b", e["p"]) and re.search(r"[a-z][1-5]", e["p"]): warns.append(f"id {i} ({e['s']}): pinyin còn số thanh '{e['p']}'")
    if ctrl.search(json.dumps(e, ensure_ascii=False)): err(f"id {i} ({e['s']}): ký tự lỗi/điều khiển")
    if unicodedata.normalize("NFC", e["s"]) != e["s"]: warns.append(f"id {i}: giản thể không ở dạng NFC")
    if "t" in e and e["t"] == e["s"]: err(f"id {i}: t trùng s (phải bỏ)")
    seen[(e["s"], e.get("t", e["s"]), e["p"])] += 1
dups = [k for k, v in seen.items() if v > 1]
if dups: err(f"{len(dups)} mục trùng (giản+phồn+pinyin), vd {dups[:3]}")

for name, info in man["indexes"].items():
    total, prev_last = 0, None
    for si, (first, fn) in enumerate(info["shards"]):
        rows = json.loads((D / name / fn).read_text(encoding="utf-8"))
        if not rows or rows[0][0] != first: err(f"{name}/{fn}: khoá đầu không khớp manifest")
        for r in rows:
            k = r[0]
            if prev_last is not None and not u16(prev_last) < u16(k): err(f"{name}: khoá không tăng dần quanh '{k}'"); break
            prev_last = k
            d = r[1]
            ids = [d[0]]
            for x in d[1:]:
                if x <= 0: err(f"{name}/{k}: chênh lệch id <= 0")
                ids.append(ids[-1] + x)
            if ids[-1] >= N or ids[0] < 0: err(f"{name}/{k}: id ngoài phạm vi")
            if name in ("py", "vm") and (len(r) < 3 or len(r[2]) != len(ids)): err(f"{name}/{k}: dữ liệu phụ lệch số id")
        total += len(rows)
    if total != info["keys"]: err(f"{name}: {total} khoá != manifest {info['keys']}")

# --- dữ liệu bổ sung ---
size = man.get("suppSize", 1000)
n_supp = 0
allowed = {"han_viet", "part_of_speech", "senses", "meanings", "examples", "synonyms", "antonyms", "related_words", "hsk_level",
           "usage_notes", "source", "verified", "updated_at"}
for n in man.get("suppShards", []):
    f = D / "supp" / f"s-{n:03d}.json"
    if not f.exists(): err(f"thiếu {f.name}"); continue
    for k, rec in json.loads(f.read_text(encoding="utf-8")).items():
        i = int(k); n_supp += 1
        if not (n * size <= i < (n + 1) * size and i < N): err(f"supp {f.name}: id {i} ngoài phạm vi")
        extra = set(rec) - allowed
        if extra: warns.append(f"supp id {i} ({entries[i]['s']}): trường lạ {sorted(extra)}")
        for ex in rec.get("examples", []):
            if not ex.get("zh"): err(f"supp id {i}: ví dụ thiếu tiếng Trung")
        if rec.get("part_of_speech") and not all(isinstance(x, str) and x for x in rec["part_of_speech"]): err(f"supp id {i}: part_of_speech lỗi")
if n_supp != man["counts"]["supplements"]: err(f"supp: {n_supp} mục != manifest {man['counts']['supplements']}")
# các khoá biên soạn tay phải khớp mục CVDICT
index = {(e["s"], e["p"]) for e in entries}
cur = json.loads((D / "supplements.json").read_text(encoding="utf-8")).get("entries", {}) if (D / "supplements.json").exists() else {}
for key, sp in cur.items():
    s_, _, p_ = key.partition("|")
    if (s_, p_) not in index: err(f"supplements.json '{key}': không khớp mục nào trong CVDICT")
supp = cur

print(f"Mục từ: {N:,} | chỉ mục: " + ", ".join(f"{k} {v['keys']:,} khoá/{len(v['shards'])} file" for k, v in man["indexes"].items()) + f" | có dữ liệu bổ sung: {n_supp:,} mục (biên soạn tay: {len(supp)})")
for w in warns[:10]: print("  cảnh báo:", w)
if errors:
    print(f"\n{len(errors)} LỖI:"); [print("  ✗", e) for e in errors[:30]]; sys.exit(1)
print("Dữ liệu hợp lệ ✓")
