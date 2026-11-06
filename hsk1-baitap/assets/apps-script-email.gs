// Google Apps Script: Deploy > New deployment > Web app > Execute as: Me, Access: Anyone
const TO = "EMAIL_CUA_BAN@gmail.com";
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  let body = "Học sinh: " + d.student.name + " | Lớp: " + d.student.cls + "\nBài: " + d.lesson + "\nThời gian: " + d.time + "\n\n";
  d.answers.forEach(a => body += "[" + a.section + "] " + a.q + ": " + a.answer + "\n");
  MailApp.sendEmail(TO, "Bài tập HSK1 - Bài " + d.lesson + " - " + d.student.name, body);
  return ContentService.createTextOutput("ok");
}
