(() => {
  "use strict";

  const FUNCTION_NAME = "grade-writing";
  const MIN_LENGTH = 10;
  const MAX_LENGTH = 8000;

  const $ = (s, root = document) => root.querySelector(s);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#039;"
    }[ch]));
  }

  function cleanQuestion(text) {
    return String(text || "")
      .replace(/^\s*\d+\s*[.)、．]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function detectPageContext() {
    const custom = window.MEOW_WRITING_CONTEXT || {};
    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    const m = file.match(/^(hsk\d+)\.bai(\d+)\.html$/i);

    const course = String(
      custom.course ||
      (m ? m[1] : "") ||
      document.documentElement.dataset.course ||
      "hsk4"
    ).toLowerCase();

    const lesson = Number(
      custom.lesson ||
      (m ? m[2] : 0) ||
      document.documentElement.dataset.lesson
    ) || null;

    const grammarFocus = Array.isArray(custom.grammarFocus)
      ? custom.grammarFocus.map(String).filter(Boolean).slice(0, 30)
      : [];

    return {
      course,
      level: String(custom.level || course.toUpperCase()).toUpperCase(),
      lesson,
      lesson_title:
        String(custom.lessonTitle || $("#lessonTitle")?.textContent || "").trim(),
      lesson_theme:
        String(custom.lessonTheme || $("#theme")?.textContent || "").trim(),
      grammar_focus: grammarFocus
    };
  }

  async function getAuth() {
    if (window.meowSupabase && window.meowUser) {
      return { client: window.meowSupabase, user: window.meowUser };
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Meow Meow chưa nhận ra bạn đang đăng nhập nè. Bạn đăng nhập lại giúp Meow Meow nha 🐱"));
      }, 9000);

      window.addEventListener("meow-auth-ready", event => {
        clearTimeout(timer);
        resolve({
          client: event.detail.client,
          user: event.detail.user
        });
      }, { once: true });
    });
  }

  function ensureStyles() {
    if ($("#meow-ai-writing-style")) return;

    const style = document.createElement("style");
    style.id = "meow-ai-writing-style";
    style.textContent = `
      .ai-result{
        display:none;margin-top:12px;border:1px solid #efd6df;border-radius:16px;
        background:#fff;padding:15px;box-shadow:0 9px 24px rgba(157,76,107,.06)
      }
      .ai-result.show,.ai-result.loading,.ai-result.error{display:block}
      .ai-result.loading{background:#fff9fb;color:#765d67}
      .ai-result.error{background:#fff2f4;border-color:#efc7ce;color:#9b4251}
      .ai-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start}
      .ai-title{font-weight:900;color:#a24b6a;font-size:1rem}
      .ai-sub{font-size:11px;color:#927a84;margin-top:3px;line-height:1.55}
      .ai-total{font-size:30px;line-height:1;font-weight:950;color:#a24b6a;white-space:nowrap}
      .ai-rubric{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:14px}
      .ai-rubric-card{border:1px solid #f0dce3;background:#fff8fa;border-radius:11px;padding:9px 6px;text-align:center}
      .ai-rubric-card b{display:block;color:#9e4766;font-size:15px}
      .ai-rubric-card span{display:block;color:#8b727c;font-size:10px;margin-top:2px}
      .ai-section{margin-top:14px;padding-top:12px;border-top:1px solid #f1e3e8;line-height:1.7}
      .ai-section h4{margin:0 0 7px;color:#5f4650;font-size:.9rem}
      .ai-section ul{margin:5px 0 0;padding-left:20px}
      .ai-correction{margin-top:8px;padding:10px;border:1px solid #f0dce3;border-radius:11px;background:#fffafa}
      .ai-original{color:#a44757}.ai-fixed{color:#2f7d62;margin-top:4px}
      .ai-reason{font-size:12px;color:#806b73;margin-top:4px}
      .ai-model-answer{white-space:pre-wrap;background:#fffaf0;border:1px solid #eddcb9;border-radius:11px;padding:11px;line-height:1.8}
      .ai-meta{font-size:11px;color:#98808a;margin-top:11px}
      .ai-spinner{display:inline-block;width:15px;height:15px;border:2px solid #e7c5d1;border-top-color:#b95173;border-radius:50%;animation:aiSpin .7s linear infinite;vertical-align:-2px;margin-right:7px}
      .ai-grade-btn[disabled]{opacity:.55;cursor:wait}
      @keyframes aiSpin{to{transform:rotate(360deg)}}
      @media(max-width:760px){
        .ai-rubric{grid-template-columns:1fr 1fr}
        .ai-head{display:block}.ai-total{margin-top:8px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderReview(box, review, context) {
    const scores = review.scores || {};
    const corrections = Array.isArray(review.corrections) ? review.corrections : [];
    const strengths = Array.isArray(review.strengths) ? review.strengths : [];
    const requirements = Array.isArray(review.requirement_check) ? review.requirement_check : [];

    box.className = "ai-result show";
    box.innerHTML = `
      <div class="ai-head">
        <div>
          <div class="ai-title">AI chấm bài viết</div>
          <div class="ai-sub">
            ${escapeHtml(context.level)}
            ${context.lesson ? ` · Bài ${escapeHtml(context.lesson)}` : ""}
            · AI đọc trực tiếp đề đang hiển thị trên trang
          </div>
        </div>
        <div class="ai-total">${escapeHtml(review.total_score)}/100</div>
      </div>

      <div class="ai-rubric">
        <div class="ai-rubric-card"><b>${escapeHtml(scores.task_response ?? "—")}/25</b><span>Đúng yêu cầu</span></div>
        <div class="ai-rubric-card"><b>${escapeHtml(scores.grammar ?? "—")}/30</b><span>Ngữ pháp</span></div>
        <div class="ai-rubric-card"><b>${escapeHtml(scores.vocabulary ?? "—")}/20</b><span>Từ vựng</span></div>
        <div class="ai-rubric-card"><b>${escapeHtml(scores.coherence ?? "—")}/15</b><span>Mạch lạc</span></div>
        <div class="ai-rubric-card"><b>${escapeHtml(scores.level_fit ?? "—")}/10</b><span>Phù hợp HSK</span></div>
      </div>

      ${requirements.length ? `
        <div class="ai-section">
          <h4>Kiểm tra yêu cầu của đề</h4>
          <ul>${requirements.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
        </div>` : ""}

      <div class="ai-section">
        <h4>Nhận xét chung</h4>
        <div>${escapeHtml(review.overall_feedback_vi || "")}</div>
      </div>

      ${strengths.length ? `
        <div class="ai-section">
          <h4>Điểm làm tốt</h4>
          <ul>${strengths.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
        </div>` : ""}

      <div class="ai-section">
        <h4>Câu cần sửa</h4>
        ${corrections.length
          ? corrections.map(item => `
              <div class="ai-correction">
                <div class="ai-original">Bản viết: ${escapeHtml(item.original)}</div>
                <div class="ai-fixed">Gợi ý sửa: ${escapeHtml(item.corrected)}</div>
                <div class="ai-reason">${escapeHtml(item.explanation_vi)}</div>
              </div>`).join("")
          : `<div>Không phát hiện lỗi đáng kể cần sửa ở trình độ này.</div>`}
      </div>

      <div class="ai-section">
        <h4>Bản tham khảo đã chỉnh</h4>
        <div class="ai-model-answer">${escapeHtml(review.improved_answer || "")}</div>
      </div>

      <div class="ai-meta">
        AI hỗ trợ luyện tập và phản hồi nhanh. Nếu đây là bài tính điểm chính thức, giáo viên vẫn là người quyết định điểm cuối cùng.
      </div>
    `;
  }

  async function gradeWriting(button) {
    const task = button.closest(".task, .writing-task, [data-ai-writing]");
    if (!task) return;

    const textarea = $("textarea, .writing-answer", task);
    const questionNode = $("h3, .writing-question, [data-writing-question]", task);
    const resultBox = $(".ai-result", task) || (() => {
      const div = document.createElement("div");
      div.className = "ai-result";
      task.appendChild(div);
      return div;
    })();

    const studentText = String(textarea?.value || "").trim();
    const question = cleanQuestion(questionNode?.textContent || "");
    const context = detectPageContext();

    if (!question) {
      resultBox.className = "ai-result error";
      resultBox.textContent = "Meow Meow chưa đọc được đề bài của ô này nè 🐱";
      return;
    }

    if (studentText.length < MIN_LENGTH) {
      resultBox.className = "ai-result error";
      resultBox.textContent = "Bài viết còn hơi ngắn nè. Bạn viết thêm một chút rồi gửi Meow Meow chấm nha 🐱";
      return;
    }

    if (studentText.length > MAX_LENGTH) {
      resultBox.className = "ai-result error";
      resultBox.textContent = `Bài viết hơi dài quá nè. Giới hạn hiện tại là ${MAX_LENGTH} ký tự nha 🐱`;
      return;
    }

    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Đang chấm...";
    resultBox.className = "ai-result loading";
    resultBox.innerHTML = `<span class="ai-spinner"></span>Meow Meow đang đọc đề và chấm bài nè... Nếu hệ thống chính đang bận, Meow Meow sẽ tự thử hệ thống dự phòng cho bạn nha 🐱`;

    try {
      const { client } = await getAuth();

      const { data, error } = await client.functions.invoke(FUNCTION_NAME, {
        body: {
          ...context,
          question,
          student_text: studentText,
          page_path: location.pathname
        }
      });

      if (error) {
        let msg = error.message || "Không gọi được hệ thống chấm.";
        try {
          if (error.context && typeof error.context.json === "function") {
            const detail = await error.context.json();
            msg = detail?.error || detail?.message || msg;
          }
        } catch (_) {}
        throw new Error(msg);
      }

      if (!data?.ok || !data.review) {
        throw new Error(data?.error || "AI chưa trả kết quả chấm.");
      }

      renderReview(resultBox, data.review, context);

      window.dispatchEvent(new CustomEvent("meow-ai-writing-graded", {
        detail: {
          course: context.course,
          lesson: context.lesson,
          question,
          score: Number(data.review.total_score || 0)
        }
      }));
    } catch (err) {
      resultBox.className = "ai-result error";
      resultBox.innerHTML = `
        <b>Meow Meow chưa chấm được bài này nè 🐱</b>
        <div style="margin-top:5px">${escapeHtml(err?.message || err)}</div>
        <div class="ai-meta">Bạn thử gửi lại sau một chút nha. Iuuuuuu 🐱</div>
      `;
    } finally {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }

  function boot() {
    ensureStyles();

    document.addEventListener("click", event => {
      const button = event.target.closest(".ai-grade-btn");
      if (!button) return;
      event.preventDefault();
      gradeWriting(button);
    });
  }

  window.MeowAIWriting = {
    grade: gradeWriting,
    context: detectPageContext
  };

  boot();
})();