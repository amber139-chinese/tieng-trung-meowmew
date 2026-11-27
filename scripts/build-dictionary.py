#!/usr/bin/env python3
"""
Meow Meow Dictionary - dựng dữ liệu tra cứu từ CVDICT.json.

Chạy:   python scripts/build-dictionary.py
Đọc:    CVDICT.json                          (nguồn gốc, KHÔNG bị sửa)
        data/dictionary/supplements.json     (dữ liệu biên soạn riêng, chỉ dùng để lập chỉ mục tìm kiếm)
Ghi:    data/dictionary/index.json           (manifest: phiên bản, số liệu, danh sách shard)
        data/dictionary/entries/e-NNN.json   (1000 mục từ / file, tra theo id)
        data/dictionary/{han,py,vm,vi}/...   (chỉ mục tra cứu, chia shard theo khoảng khoá đã sắp xếp)

Nguyên tắc: không xoá/gộp mất thông tin. Mục trùng (cùng giản thể + phồn thể + pinyin) được gộp
thành MỘT mục có nhiều nghĩa; các mục khác cách đọc (行 háng / xíng) vẫn là các mục riêng.
"""
import json, re, sys, unicodedata, collections, shutil, hashlib, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "CVDICT.json"
OUT = ROOT / "data" / "dictionary"
SUPP = OUT / "supplements.json"        # biên soạn tay (ưu tiên cao nhất)
HSK = OUT / "hsk-import.json"          # nhập tự động từ các trang từ vựng (scripts/import-hsk-vocab.py)
DROP_FIELDS = {"simplified", "traditional", "pinyin", "pinyin_display"}   # đã có sẵn trong mục từ

SUPP_SIZE = 1000            # mỗi file supp/ phục vụ bấy nhiêu mục từ (id liên tiếp)
ENTRY_SHARD = 250           # số mục từ mỗi file entries (nhỏ để mỗi lần tra chỉ tải vài chục KB)
INDEX_LIMIT = 200_000       # ~byte tối đa mỗi shard chỉ mục (chưa nén gzip)
MAX_PHRASE = 60             # nghĩa dài hơn mức này không đưa vào chỉ mục cụm nghĩa

TONES = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}
VOWELS = "aeiouü"


# ---------- pinyin ----------
def add_tone(syl: str, tone: int) -> str:
    s = syl.replace("u:", "ü").replace("U:", "Ü")
    if tone not in (1, 2, 3, 4):
        return s
    low = s.lower()
    idx = -1
    if "a" in low:
        idx = low.index("a")
    elif "e" in low:
        idx = low.index("e")
    elif "ou" in low:
        idx = low.index("o")
    else:
        for i in range(len(low) - 1, -1, -1):
            if low[i] in VOWELS:
                idx = i
                break
    if idx < 0:
        return s
    ch = s[idx]
    marked = TONES[ch.lower()][tone - 1]
    if ch.isupper():
        marked = marked.upper()
    return s[:idx] + marked + s[idx + 1:]


UMLAUT = {"u:": "ü", "U:": "Ü", "ū:": "ǖ", "ú:": "ǘ", "ǔ:": "ǚ", "ù:": "ǜ", "Ū:": "Ǖ", "Ú:": "Ǘ", "Ǔ:": "Ǚ", "Ù:": "Ǜ"}
UMLAUT_RE = re.compile("|".join(re.escape(k) for k in UMLAUT))


def fix_umlaut(s: str) -> str:
    """CEDICT viết ü là 'u:' (kể cả khi có dấu thanh: 'lǔ:' -> 'lǚ')."""
    return UMLAUT_RE.sub(lambda m: UMLAUT[m.group(0)], s)


SYL_NUM = re.compile(r"([A-Za-züÜ]+(?::)?(?:[A-Za-züÜ]*?))([1-5])")
TOKEN_OK = re.compile(r"(?:[A-Za-züÜ:]+[1-5])+|[A-Za-züÜ:]+")


def num2accent(text: str) -> str:
    """'tian1gan1' -> 'tiāngān'; 'Xue2' -> 'Xué'."""
    return SYL_NUM.sub(lambda m: add_tone(m.group(1), int(m.group(2))), text)


def convert_brackets(meaning: str) -> str:
    """Đổi pinyin số thanh trong [..] của ghi chú CEDICT sang pinyin có dấu."""
    def repl(m):
        inner = m.group(1)
        toks = [t for t in re.split(r"[\s·\-,']+", inner) if t]
        if toks and re.search(r"[1-5]", inner) and all(TOKEN_OK.fullmatch(t) for t in toks):
            return "[" + num2accent(inner) + "]"
        return m.group(0)
    return re.sub(r"\[([^\]]+)\]", repl, meaning)


def strip_marks(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def toneless(p: str) -> str:
    return re.sub(r"[^a-z]", "", strip_marks(p).lower())


SYL = re.compile(r"^(?:[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+|[A-Z][a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)$")


def display_pinyin(p: str) -> str:
    toks = p.split()
    if 1 <= len(toks) <= 4 and all(SYL.match(t) for t in toks):
        out = toks[0]
        for t in toks[1:]:
            first = strip_marks(t)[0].lower()
            out += ("'" if first in "aeo" else "") + t
        return out
    return p


# ---------- tiếng Việt ----------
def strip_vn(s: str) -> str:
    return strip_marks(s.replace("đ", "d").replace("Đ", "D")).lower()


def clean_for_search(meaning: str) -> str:
    m = re.sub(r"\[[^\]]*\]", " ", meaning)       # bỏ ghi chú [pinyin]
    return m


def vn_tokens(meaning: str):
    return re.findall(r"[a-z0-9]+", strip_vn(clean_for_search(meaning)))


VN_TOKEN = re.compile(r"[0-9A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+")


def phrase_keys(meaning: str):
    """Cụm nghĩa để tra khớp nguyên cụm (tách theo ';', bỏ phần trong ngoặc).
    Trả về [(khoá không dấu, cụm có dấu)] - cụm có dấu để xếp kết quả khớp đúng dấu lên trước."""
    out = []
    for part in clean_for_search(meaning).split(";"):
        part = re.sub(r"\([^)]*\)", " ", part)
        toks = VN_TOKEN.findall(unicodedata.normalize("NFC", part).lower())
        if toks:
            k = " ".join(strip_vn(t) for t in toks)
            if len(k) <= MAX_PHRASE:
                out.append((k, " ".join(toks)))
    return out


# ---------- lượng từ ----------
LT_ITEM = re.compile(r"^\s*(?:([^|\[\],]+)\|)?([^|\[\],]+)\[([^\]]+)\]\s*$")


def parse_lt(chunk: str):
    items = []
    for part in re.split(r",\s*", chunk.strip()):
        m = LT_ITEM.match(part)
        if not m:
            return None
        _trad, simp, py = m.groups()
        items.append(f"{simp.strip()} {num2accent(py)}")
    return items


def split_measure_words(meanings):
    lt, kept = [], []
    for mn in meanings:
        m_full = re.fullmatch(r"\s*LT:\s*(.+?)\s*", mn)
        if m_full:
            items = parse_lt(m_full.group(1))
            if items:
                lt += items
                continue
        def sub(mm):
            items = parse_lt(mm.group(1))
            if items:
                lt.extend(items)
                return ""
            return mm.group(0)
        new = re.sub(r"\s*\(LT:\s*([^)]+)\)", sub, mn).strip()
        new = re.sub(r"\s*;\s*LT:\s*([^;()]+)$", sub, new).strip()
        if new:
            kept.append(new)
    seen, out = set(), []
    for x in lt:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return kept, out


# ---------- ghi shard ----------
def u16key(s: str):
    return s.encode("utf-16-be")        # cùng thứ tự với so sánh chuỗi của JavaScript


def write_index(name: str, mapping: dict, extra=None):
    # extra: hàm (khoá, id) -> chuỗi, ghi kèm theo từng id
    """Mỗi dòng: [khoá, [id đầu, chênh lệch...]] (+ [chuỗi phụ theo từng id] nếu có extra)."""
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    keys = sorted(mapping, key=u16key)
    shards, cur, cur_size = [], [], 0
    for k in keys:
        ids = sorted(set(mapping[k]))
        row = [k, [ids[0]] + [b - a for a, b in zip(ids, ids[1:])]]
        if extra is not None:
            row.append([extra(k, i) for i in ids])
        size = len(json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + 1
        if cur and cur_size + size > INDEX_LIMIT:
            shards.append(cur)
            cur, cur_size = [], 0
        cur.append(row)
        cur_size += size
    if cur:
        shards.append(cur)
    manifest = []
    for i, rows in enumerate(shards):
        fn = f"{name}-{i:03d}.json"
        (d / fn).write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        manifest.append([rows[0][0], fn])
    return {"keys": len(keys), "shards": manifest}


def main():
    if not SRC.exists():
        sys.exit(f"Không thấy {SRC}")
    raw = json.loads(SRC.read_text(encoding="utf-8"))
    print(f"Đọc {len(raw):,} mục từ CVDICT.json")

    # 1) chuẩn hoá + gộp mục trùng (giản + phồn + pinyin)
    groups = collections.OrderedDict()
    for e in raw:
        s = e["simplified"].strip()
        t = e["traditional"].strip()
        p = re.sub(r"\s+", " ", fix_umlaut(e["pinyin"])).strip()
        key = (s, t, p)
        g = groups.setdefault(key, [])
        for m in e["meanings"]:
            m = m.strip()
            if m and m not in g:
                g.append(m)
    merged = len(raw) - len(groups)

    entries = []
    for (s, t, p), ms in groups.items():
        ms = [convert_brackets(m) for m in ms]
        ms, lt = split_measure_words(ms)
        if not ms:                      # chỉ còn lượng từ: giữ nguyên bản gốc để không mất nghĩa
            ms = [convert_brackets(m) for m in groups[(s, t, p)]]
            lt = []
        e = {"s": s}
        if t != s:
            e["t"] = t
        e["p"] = p
        d = display_pinyin(p)
        if d != p:
            e["d"] = d
        e["m"] = ms
        if lt:
            e["lt"] = lt
        entries.append(e)

    # 2) id: từ ngắn lên trước (xếp hạng mặc định), rồi theo pinyin
    entries.sort(key=lambda e: (len(e["s"]), toneless(e["p"]), e["s"], e.get("t", "")))
    print(f"Sau khi gộp: {len(entries):,} mục (gộp {merged:,} mục trùng)")

    # 3) ghi entries
    ed = OUT / "entries"
    if ed.exists():
        shutil.rmtree(ed)
    ed.mkdir(parents=True)
    n_shards = (len(entries) + ENTRY_SHARD - 1) // ENTRY_SHARD
    for n in range(n_shards):
        chunk = entries[n * ENTRY_SHARD:(n + 1) * ENTRY_SHARD]
        (ed / f"e-{n:03d}.json").write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # 4) chỉ mục
    han = collections.defaultdict(list)
    py = collections.defaultdict(list)
    vm = collections.defaultdict(list)
    vm_acc = collections.defaultdict(set)
    vi = collections.defaultdict(list)
    acc = {}
    for i, e in enumerate(entries):
        acc[i] = unicodedata.normalize("NFC", re.sub(r"[^a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]", "", e["p"].lower()))
        han[e["s"]].append(i)
        if "t" in e:
            han[e["t"]].append(i)
        k = toneless(e["p"])
        if k:
            py[k].append(i)
        for m in e["m"]:
            for pk, pa in phrase_keys(m):
                vm[pk].append(i)
                vm_acc[(pk, i)].add(pa)
            for tok in set(vn_tokens(m)):
                vi[tok].append(i)

    # 5) dữ liệu bổ sung (loại từ, ví dụ, HSK, Hán Việt...): hsk-import.json + supplements.json (biên soạn tay đè lên từng trường)
    hsk = json.loads(HSK.read_text(encoding="utf-8")) if HSK.exists() else {}
    cur = json.loads(SUPP.read_text(encoding="utf-8")).get("entries", {}) if SUPP.exists() else {}
    ids_by_key = collections.defaultdict(list)
    for i, e in enumerate(entries):
        ids_by_key[(e["s"], e["p"])].append(i)
    supp_by_id = {}
    for key in sorted(set(hsk) | set(cur)):
        s_, _, p_ = key.partition("|")
        ids = ids_by_key.get((s_, p_))
        if not ids:
            print(f"  ! bổ sung: không khớp mục nào trong CVDICT cho '{key}'")
            continue
        rec = {}
        for src in (hsk.get(key), cur.get(key)):            # biên soạn tay đứng sau nên đè lên
            for k, v in (src or {}).items():
                if k not in DROP_FIELDS and v not in (None, "", [], {}):
                    rec[k] = v
        for i in ids:
            supp_by_id[i] = rec
        texts = [rec.get("han_viet", "")] + list(rec.get("meanings", [])) + [x.get("meaning", "") for x in rec.get("senses", [])]
        for i in ids:
            for tx in texts:
                if not tx:
                    continue
                for pk, pa in phrase_keys(tx):
                    vm[pk].append(i)
                    vm_acc[(pk, i)].add(pa)
                for tok in set(vn_tokens(tx)):
                    vi[tok].append(i)
    sd = OUT / "supp"
    if sd.exists():
        shutil.rmtree(sd)
    sd.mkdir(parents=True)
    per_shard = collections.defaultdict(dict)
    for i, rec in supp_by_id.items():
        per_shard[i // SUPP_SIZE][str(i)] = rec
    for n, mp in per_shard.items():
        (sd / f"s-{n:03d}.json").write_text(json.dumps(mp, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    supp_n = len(supp_by_id)

    manifest = {
        "version": hashlib.sha1(SRC.read_bytes() + (SUPP.read_bytes() if SUPP.exists() else b"") + (HSK.read_bytes() if HSK.exists() else b"")).hexdigest()[:10],
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": {"name": "CVDICT", "license": "CC BY-SA 4.0", "url": "https://github.com/ph0ngp/CVDICT"},
        "counts": {"source_entries": len(raw), "entries": len(entries), "merged_duplicates": merged, "supplements": supp_n},
        "entryShard": ENTRY_SHARD,
        "entryFiles": n_shards,
        "suppSize": SUPP_SIZE,
        "suppShards": sorted(per_shard),
        "indexes": {},
    }
    for name, mp in (("han", han), ("py", py), ("vm", vm), ("vi", vi)):
        d = OUT / name
        if d.exists():
            shutil.rmtree(d)
        if name == "py":
            ex = lambda k, i: acc[i]
        elif name == "vm":
            ex = lambda k, i: "|".join(sorted(vm_acc[(k, i)]))
        else:
            ex = None
        manifest["indexes"][name] = write_index(name, mp, ex)
        info = manifest["indexes"][name]
        print(f"  chỉ mục {name:3}: {info['keys']:>7,} khoá, {len(info['shards'])} shard")
    (OUT / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("Xong. Phiên bản dữ liệu:", manifest["version"])


if __name__ == "__main__":
    main()
