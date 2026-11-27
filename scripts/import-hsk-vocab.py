#!/usr/bin/env python3
"""
Nhập loại từ, câu ví dụ, cấp HSK từ các trang từ vựng của Meow Meow vào từ điển.

Đọc : hsk2-vocab.html, hsk3-vocab.html, hsk4-vocab.html, hsk789-vocab.html   (mảng RAW_WORDS trong từng trang)
Ghi : data/dictionary/hsk-import.json        (khoá "giản thể|pinyin có dấu, cách âm tiết", khớp với mục CVDICT)
      data/dictionary/hsk-import-report.txt  (những từ không khớp được mục nào, để rà soát)

Chỉ dùng dữ liệu có sẵn trong các trang đó. Từ nào không khớp chắc chắn MỘT mục CVDICT thì KHÔNG gán, chỉ ghi vào báo cáo.
Trang HSK1 lấy dữ liệu từ Google Sheet nên chưa nhập được.
Cần chạy scripts/build-dictionary.py trước (để có data/dictionary/entries).
"""
import json, re, sys, unicodedata, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "dictionary"
LISTS = [  # (file, cấp HSK, nhãn nguồn)
    ("hsk2-vocab.html", "2", "Từ vựng HSK2 của Meow Meow"),
    ("hsk3-vocab.html", "3", "Từ vựng HSK3 của Meow Meow"),
    ("hsk4-vocab.html", "4", "Từ vựng HSK4 của Meow Meow"),
    ("hsk789-vocab.html", "7–9", "Từ vựng HSK7–9 của Meow Meow"),
]
LEVEL_ORDER = {"2": 2, "3": 3, "4": 4, "7–9": 7}


def grab_array(text: str, name: str):
    m = re.search(r"(?:const|let|var)\s+" + name + r"\s*=\s*\[", text)
    if not m:
        return None
    i = m.end() - 1
    depth, in_str, esc = 0, False, False
    for k in range(i, len(text)):
        c = text[k]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    return json.loads(text[i:k + 1])
    return None


def norm_py(p: str) -> str:
    p = unicodedata.normalize("NFC", p).lower().replace("u:", "ü")
    return re.sub(r"[^a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]", "", p)


def toneless(p: str) -> str:
    t = "".join(c for c in unicodedata.normalize("NFD", p) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z]", "", t.lower())


def load_entries():
    by_s = collections.defaultdict(list)
    man = json.loads((OUT / "index.json").read_text(encoding="utf-8"))
    n = man["entryShard"]
    for fi, f in enumerate(sorted((OUT / "entries").glob("e-*.json"))):
        for j, e in enumerate(json.loads(f.read_text(encoding="utf-8"))):
            by_s[e["s"]].append((fi * n + j, e))
    return by_s


def variants(hanzi: str):
    return [v.strip() for v in re.split(r"[|｜／]", hanzi) if v.strip()]


def main():
    if not (OUT / "entries").exists():
        sys.exit("Chưa có data/dictionary/entries. Chạy scripts/build-dictionary.py trước.")
    by_s = load_entries()
    result, report, stats = {}, [], {}
    for fname, level, label in LISTS:
        path = ROOT / fname
        if not path.exists():
            report.append(f"[{fname}] không thấy file, bỏ qua")
            continue
        words = grab_array(path.read_text(encoding="utf-8", errors="ignore"), "RAW_WORDS")
        if not words:
            report.append(f"[{fname}] không đọc được RAW_WORDS")
            continue
        ok = amb = miss = 0
        for w in words:
            hz = w.get("hz") or w.get("hanzi") or ""
            page_py = norm_py(w.get("pinyin", ""))
            cands = []
            for v in variants(hz):
                cands += by_s.get(v, [])
            if not cands:
                miss += 1
                report.append(f"[{fname}] #{w.get('id')} {hz} ({w.get('pinyin')}): không có trong CVDICT")
                continue
            # các mục CVDICT cùng giản thể + cùng cách đọc (khác nhau ở chữ phồn thể) dùng chung một dữ liệu
            chosen = [c for c in cands if norm_py(c[1]["p"]) == page_py]
            if not chosen:
                if len(cands) == 1:
                    chosen = cands
                else:
                    same_tl = [c for c in cands if toneless(c[1]["p"]) == toneless(page_py)]
                    chosen = same_tl if len({(c[1]["s"], c[1]["p"]) for c in same_tl}) == 1 else []
            if not chosen or len({(c[1]["s"], c[1]["p"]) for c in chosen}) != 1:
                amb += 1
                report.append(f"[{fname}] #{w.get('id')} {hz} ({w.get('pinyin')}): không chọn được cách đọc ({', '.join(sorted({c[1]['p'] for c in cands}))})")
                continue
            e = chosen[0][1]
            key = f"{e['s']}|{e['p']}"
            rec = result.setdefault(key, {"simplified": e["s"], "pinyin": e["p"], "senses": [], "examples": [], "sources": []})
            senses = w.get("senses") or ([{"meaning": w["meaning"]}] if w.get("meaning") else [])
            for s in senses:
                s2 = {k: v for k, v in (("pos", s.get("pos")), ("meaning", s.get("meaning"))) if v}
                if not s2:
                    continue
                same = [x for x in rec["senses"] if x.get("meaning") == s2.get("meaning")]
                if same:                       # cùng nghĩa xuất hiện ở nhiều danh sách: giữ một, bổ sung loại từ nếu thiếu
                    if s2.get("pos") and not same[0].get("pos"):
                        same[0]["pos"] = s2["pos"]
                elif s2 not in rec["senses"]:
                    rec["senses"].append(s2)
            if w.get("exampleZh"):
                ex = {"zh": w["exampleZh"].strip()}
                if w.get("exampleVi"):
                    ex["vi"] = w["exampleVi"].strip()
                if ex not in rec["examples"]:
                    rec["examples"].append(ex)
            lv = rec.get("hsk_level")
            if lv is None or LEVEL_ORDER[level] < LEVEL_ORDER[lv]:
                rec["hsk_level"] = level
            if label not in rec["sources"]:
                rec["sources"].append(label)
            ok += 1
        stats[fname] = (len(words), ok, amb, miss)

    for rec in result.values():
        pos = []
        for s in rec["senses"]:
            if s.get("pos") and s["pos"] not in pos:
                pos.append(s["pos"])
        if pos:
            rec["part_of_speech"] = pos
        rec["source"] = "; ".join(rec.pop("sources"))
        if not rec["examples"]:
            rec.pop("examples")
        if not rec["senses"]:
            rec.pop("senses")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "hsk-import.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    lines = [f"{f}: {t} từ → khớp {o}, không chọn được cách đọc {a}, không có trong CVDICT {m}" for f, (t, o, a, m) in stats.items()]
    (OUT / "hsk-import-report.txt").write_text("\n".join(lines + [""] + report), encoding="utf-8")
    print("\n".join(lines))
    print(f"→ {len(result):,} mục có dữ liệu HSK; các từ không khớp: data/dictionary/hsk-import-report.txt")


if __name__ == "__main__":
    main()
