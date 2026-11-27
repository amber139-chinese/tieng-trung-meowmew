# Meow Meow Dictionary (猫猫词典)

Module từ điển Trung – Việt độc lập tại `/dictionary/`. Không sửa trang hay file nào khác của website.

## Cấu trúc
| Đường dẫn | Vai trò |
|---|---|
| `dictionary/index.html, dictionary.css` | Trang và giao diện (tông hồng pastel, bám các trang từ vựng HSK) |
| `dictionary/dictionary.js` | Điều hướng (`?q=` kết quả, `?w=` chi tiết), gợi ý khi gõ, lịch sử tra cứu |
| `dictionary/search-engine.js` | Bộ máy tìm kiếm (chạy cả trên trình duyệt lẫn Node để kiểm thử) |
| `dictionary/data-loader.js` | Nạp shard dữ liệu + cache IndexedDB theo phiên bản dữ liệu |
| `dictionary/word-detail.js` | Trang chi tiết một từ (loại từ, nghĩa theo từ loại, ví dụ có nút nghe, cấp HSK) |
| `dictionary/speech.js` | Phát âm: chọn giọng giống các bài HSK (ưu tiên giọng nữ tự nhiên của trình duyệt), tốc độ 0,88 |
| `CVDICT.json` | Nguồn gốc, **không bị sửa** |
| `data/dictionary/` | Dữ liệu đã dựng (đừng sửa tay, trừ `supplements.json`) |
| `scripts/import-hsk-vocab.py` | Lấy loại từ, câu ví dụ, cấp HSK từ `hsk2/3/4/789-vocab.html` → `data/dictionary/hsk-import.json` |
| `scripts/build-dictionary.py` | Dựng dữ liệu từ `CVDICT.json` + dữ liệu bổ sung |
| `scripts/validate-dictionary.py` | Kiểm tra toàn vẹn dữ liệu |
| `scripts/test-dictionary.js` | Kiểm thử bộ máy tìm kiếm thật trên dữ liệu thật |
| `.github/workflows/build-dictionary.yml` | Tự dựng lại + kiểm tra + commit khi nguồn đổi |

## Dựng lại dữ liệu
```
python scripts/build-dictionary.py      # đọc CVDICT.json
python scripts/import-hsk-vocab.py      # đọc các trang hsk*-vocab.html ở thư mục gốc
python scripts/build-dictionary.py      # ghép dữ liệu bổ sung vào chỉ mục (chạy lại sau bước import)
python scripts/validate-dictionary.py   # kiểm tra
node scripts/test-dictionary.js         # kiểm thử tìm kiếm
```
Hoặc trên GitHub: Actions → *Build dictionary data* → Run workflow (làm đủ các bước trên).

## Dữ liệu bổ sung (loại từ, ví dụ, HSK, Hán Việt)
Có hai nguồn, ghép lại theo từng trường, **biên soạn tay đè lên nhập tự động**:
1. `data/dictionary/hsk-import.json`: tự sinh từ các trang từ vựng HSK2, HSK3, HSK4, HSK7–9. Chỉ lấy đúng những gì các trang đó có
   (HSK2/3: loại từ + nghĩa theo từ loại + ví dụ; HSK4: nghĩa + ví dụ; HSK7–9: nghĩa + cấp). Từ nào không khớp chắc chắn một mục
   CVDICT thì bị bỏ qua và ghi vào `hsk-import-report.txt`. Trang HSK1 lấy dữ liệu từ Google Sheet nên chưa nhập được.
2. `data/dictionary/supplements.json`: biên soạn tay (xem bên dưới).

Kết quả được chia thành `data/dictionary/supp/s-NNN.json` (mỗi file phục vụ 1000 mục từ), chỉ tải khi có kết quả cần.

## Thêm dữ liệu biên soạn riêng (Hán Việt, ví dụ, HSK…)
Sửa `data/dictionary/supplements.json`, thêm vào `entries` với khoá `"giản thể|pinyin có dấu cách âm tiết"`
(đúng như hiển thị ở mục CVDICT, ví dụ `"学习|xué xí"`). Chỉ ghi trường thật sự có nguồn; trường chưa có thì bỏ trống.
Đặt `"verified": false` nếu chưa kiểm chứng để trang hiển thị nhãn "chưa xác minh". Sau khi lưu, workflow sẽ dựng lại chỉ mục
để các từ khoá Hán Việt / nghĩa biên soạn tìm được.

Trường hỗ trợ: `simplified, traditional, pinyin, pinyin_display, han_viet, part_of_speech[], meanings[], examples[{zh,vi}],
synonyms[], antonyms[], related_words[], hsk_level, usage_notes, source, verified, updated_at`.

## Chuẩn hoá dữ liệu CVDICT (build-dictionary.py)
- Gộp mục trùng (cùng giản thể + phồn thể + pinyin) thành một mục nhiều nghĩa; mục khác cách đọc (行 háng / xíng) giữ riêng.
- `u:` → `ü` (kể cả có dấu thanh: `lǔ:` → `lǚ`); pinyin số thanh trong ghi chú `[bi1]` → `[bī]`.
- Tách lượng từ `LT:` thành trường riêng. Không tự thêm Hán Việt, từ loại, ví dụ hay HSK.

## Giấy phép dữ liệu
CVDICT: CC BY-SA 4.0, dựa trên CC-CEDICT. Phải giữ ghi công ở chân trang; dữ liệu phái sinh trong `data/dictionary/` giữ cùng giấy phép.
