// ===== CẤU HÌNH CHUNG (sửa 1 lần, áp dụng cho cả 15 bài) =====
window.HSK_CONFIG = {
  // Nộp bài về Supabase (cùng project với trang quan-ly-bai-tap.html)
  SUPABASE_URL: "https://xmtvmwcjjqqzscmkdlwd.supabase.co",
  SUPABASE_KEY: "sb_publishable_R5TEjUNB6lDTJuN4MNdhVQ_ANwIaKLP",
  // Dán URL Web App của Google Apps Script (xem apps-script-email.gs). Để trống = dùng mailto dự phòng.
  ENDPOINT: "",
  // Email dự phòng khi chưa có ENDPOINT
  FALLBACK_EMAIL: "",
  // {n} = số bài
  // 语音.mp3 = phần ngữ âm | 听读练.mp3 = phần nghe-đọc-luyện | 模拟测练.mp3 = bài thi (bài 4+)
  AUDIO: {
    "语音": "audio/bai{n}/语音.mp3",
    "听读练": "audio/bai{n}/听读练.mp3",
    "模拟测练": "audio/bai{n}/模拟测练.mp3"
  }
};
