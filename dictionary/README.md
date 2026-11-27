# Meow Meow Dictionary (猫猫词典)

Module từ điển Trung – Việt độc lập tại `/dictionary/`. Không sửa trang hay file nào khác của website.

## Cấu trúc
| Đường dẫn | Vai trò |
|---|---|
| `dictionary/index.html, dictionary.css` | Trang và giao diện (tông hồng pastel, bám các trang từ vựng HSK) |
| `dictionary/dictionary.js` | Điều hướng (`?q=` kết quả, `?w=` chi tiết), gợi ý khi gõ, lịch sử tra cứu |
| `dictionary/search-engine.js` | Bộ máy tìm kiếm (chạy cả trên trình duyệt lẫn Node để kiểm thử) |
| `dictionary/data-loader.js` | Nạp shard dữ liệu + cache IndexedDB theo phiên bản dữ liệu |
| `dictionary/word-detail.js` | Trang chi tiết một từ |
| `CVDICT.json` | Nguồn gốc, **không bị sửa** |
| `data/dictionary/` | Dữ liệu đã dựng (đừng sửa tay, trừ `supplements.json`) |
| `scripts/build-dictionary.py` | Dựng dữ liệu từ `CVDICT.json` |
| `scripts/validate-dictionary.py` | Kiểm tra toàn vẹn dữ liệu |
| `scripts/test-dictionary.js` | Kiểm thử bộ máy tìm kiếm thật trên dữ liệu thật |
| `.github/workflows/build-dictionary.yml` | Tự dựng lại + kiểm tra + commit khi nguồn đổi |

## Dựng lại dữ liệu
```
python scripts/build-dictionary.py      # đọc CVDICT.json + data/dictionary/supplements.json
python scripts/validate-dictionary.py   # kiểm tra
node scripts/test-dictionary.js         # kiểm thử tìm kiếm
```
Hoặc trên GitHub: Actions → *Build dictionary data* → Run workflow.

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
