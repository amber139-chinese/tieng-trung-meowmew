// Supabase Edge Function: Meow Meow Streak nhắn nhẹ qua email khi học viên sắp đứt chuỗi.
//
// Chạy mỗi ngày lúc 19:30 (giờ VN) bằng pg_cron (xem len-lich-nhac-streak.sql).
// Gửi cho học viên thoả CẢ 4 điều kiện:
//   1) đã tự bật nhắc email trong popup của mèo (reminder_on = true, có reminder_email)
//   2) hôm qua có học (last_day = hôm qua) nhưng hôm nay chưa mở web => chuỗi sắp đứt
//   3) chuỗi hiện tại >= MIN_STREAK ngày (có gì đó để mất)
//   4) hôm nay chưa được nhắc (last_reminded_day) => tối đa 1 email / ngày
//
// Biến môi trường (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   khoá API của Resend (resend.com)
//   REMINDER_SECRET  mật khẩu bí mật tự đặt; cron gửi kèm header x-cron-secret, cũng dùng ký link huỷ đăng ký
//   REMINDER_FROM    (tuỳ chọn) vd: Meow Meow Streak <meo@tiengtrungmeowmeow.online>  — domain phải verify trên Resend
//   SITE_URL         (tuỳ chọn) mặc định https://tiengtrungmeowmeow.online
// SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY được Supabase tự cấp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SECRET = Deno.env.get("REMINDER_SECRET") ?? "";
const FROM = Deno.env.get("REMINDER_FROM") ?? "Meow Meow Streak <meo@tiengtrungmeowmeow.online>";
const SITE = (Deno.env.get("SITE_URL") ?? "https://tiengtrungmeowmeow.online").replace(/\/$/, "");
const MIN_STREAK = 2;
const MAX_PER_RUN = 150;       // Resend gói free ~2 email/giây; 150 mail ≈ 90 giây
const GAP_MS = 600;

const enc = new TextEncoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Ngày theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD
function vnDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}

async function sign(uid: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(uid)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function buildEmail(name: string, streak: number, freezes: number, unsubUrl: string) {
  const hasFreeze = freezes > 0;
  const subject = hasFreeze
    ? `Meow Meow Streak: chuỗi ${streak} ngày của bạn đang chờ bạn quay lại 🐱`
    : `Meow Meow Streak: chuỗi ${streak} ngày sắp đứt rồi, ghé học 5 phút nhé 🐱`;
  const line = hasFreeze
    ? `Hôm nay bạn chưa ghé lớp. Bạn còn <b>${freezes} thẻ đóng băng ❄</b> nên chuỗi chưa mất ngay, nhưng mèo muốn bạn giữ thẻ lại cho lúc thật sự bận.`
    : `Hôm nay bạn chưa ghé lớp, và bạn không còn thẻ đóng băng nào. Chỉ cần mở web học vài phút là chuỗi <b>${streak} ngày</b> được giữ nguyên.`;
  const html = `<!doctype html><html><body style="margin:0;background:#FFF7E6;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#4A2A22">
<div style="max-width:480px;margin:0 auto;padding:20px">
  <div style="background:#C8102E;color:#FFE9B8;border-radius:18px 18px 0 0;padding:14px 18px;font-weight:800;letter-spacing:.04em">福喵 · MEOW MEOW STREAK</div>
  <div style="background:#fff;border:3px solid #F2B632;border-top:0;border-radius:0 0 18px 18px;padding:22px 20px;text-align:center">
    <div style="font-size:44px;line-height:1">🐱🔥</div>
    <div style="font-size:46px;font-weight:900;color:#C8102E;margin-top:6px">${streak} <span style="font-size:18px">ngày</span></div>
    <h2 style="margin:10px 0 6px;color:#7A1020;font-size:20px">${esc(name)} ơi, mèo nhớ bạn!</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#6A463C">${line}</p>
    <a href="${SITE}" style="display:inline-block;background:#C8102E;color:#FFE9B8;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:99px">Học tiếp thôi! 加油</a>
  </div>
  <p style="font-size:12px;color:#8A6A4A;text-align:center;margin:14px 0 0;line-height:1.5">
    Bạn nhận email này vì đã bật nhắc trong popup của mèo.<br>
    <a href="${unsubUrl}" style="color:#C8102E">Tắt nhắc nhở qua email</a>
  </p>
</div></body></html>`;
  const text = `${name} ơi, chuỗi ${streak} ngày của bạn ${hasFreeze ? "đang chờ bạn quay lại" : "sắp đứt rồi"}.\nMở web học vài phút nhé: ${SITE}\nTắt nhắc: ${unsubUrl}`;
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !SECRET) return new Response("Thiếu cấu hình môi trường", { status: 500 });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  // --- Link huỷ đăng ký trong email: GET ?unsub=<user_id>&sig=<chữ ký> ---
  if (req.method === "GET" && url.searchParams.has("unsub")) {
    const uid = url.searchParams.get("unsub") ?? "";
    const sig = url.searchParams.get("sig") ?? "";
    const okSig = /^[0-9a-f-]{36}$/i.test(uid) && safeEq(sig, await sign(uid));
    if (!okSig) return new Response("Link không hợp lệ.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    await db.from("user_streaks").update({ reminder_on: false }).eq("user_id", uid);
    return new Response("Đã tắt nhắc nhở. Meow Meow Streak sẽ không gửi email cho bạn nữa. Bạn có thể bật lại trong popup của mèo trên web.", {
      status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // --- Lượt chạy hằng ngày: chỉ cron (có secret) được gọi ---
  if (req.method !== "POST" || !safeEq(req.headers.get("x-cron-secret") ?? "", SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  let body: { dry?: boolean } = {};
  try { body = await req.json(); } catch { /* body rỗng cũng được */ }
  const dry = !!body.dry;

  if (!dry && !RESEND_KEY) return new Response("Thiếu RESEND_API_KEY", { status: 500 });

  const today = vnDay(0), yesterday = vnDay(-1);
  const { data: rows, error } = await db.from("user_streaks")
    .select("user_id,current_streak,freezes,reminder_email,last_reminded_day")
    .eq("reminder_on", true)
    .eq("last_day", yesterday)
    .gte("current_streak", MIN_STREAK)
    .not("reminder_email", "is", null)
    .limit(MAX_PER_RUN * 2);
  if (error) return new Response("Lỗi đọc dữ liệu: " + error.message, { status: 500 });

  const due = (rows ?? []).filter((r) => r.last_reminded_day !== today).slice(0, MAX_PER_RUN);
  const ids = due.map((r) => r.user_id);
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await db.from("profiles").select("id,display_name,username").in("id", ids);
    (ps ?? []).forEach((p) => names.set(p.id, p.display_name || p.username || "Bạn"));
  }

  const results: { user_id: string; email?: string; status: string }[] = [];
  for (const r of due) {
    const unsubUrl = `${SUPABASE_URL}/functions/v1/streak-reminder?unsub=${r.user_id}&sig=${await sign(r.user_id)}`;
    const mail = buildEmail(names.get(r.user_id) ?? "Bạn", r.current_streak, r.freezes ?? 0, unsubUrl);
    if (dry) { results.push({ user_id: r.user_id, email: r.reminder_email, status: "dry-run" }); continue; }

    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM, to: [r.reminder_email], subject: mail.subject, html: mail.html, text: mail.text,
          headers: { "List-Unsubscribe": `<${unsubUrl}>` },
        }),
      });
      if (resp.ok) {
        await db.from("user_streaks").update({ last_reminded_day: today }).eq("user_id", r.user_id);
        results.push({ user_id: r.user_id, status: "sent" });
      } else {
        results.push({ user_id: r.user_id, status: "resend " + resp.status });
      }
    } catch (e) {
      results.push({ user_id: r.user_id, status: "error " + String(e).slice(0, 80) });
    }
    await sleep(GAP_MS);
  }

  return new Response(JSON.stringify({ day: today, dry, candidates: due.length, results }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});
