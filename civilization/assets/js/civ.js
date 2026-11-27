/* Danh sách bài: thêm bài mới chỉ cần thêm 1 dòng ở đây.
   [slug, chữ Hán, tên Việt, mô tả ngắn, nhóm, thời kỳ, phút đọc] */
const LESSONS=[
["pangu","盘古开天地","Bàn Cổ khai thiên lập địa","Thuở hỗn mang như quả trứng khổng lồ, và người khổng lồ chống trời tách đất.","myth","Thần thoại khởi nguyên",6],
["nuwa","女娲补天","Nữ Oa vá trời","Nữ thần luyện đá ngũ sắc vá bầu trời nứt vỡ, dựng lại trật tự thế gian.","myth","Thần thoại cổ đại",7],
["houyi-change","后羿射日与嫦娥奔月","Hậu Nghệ bắn mặt trời · Hằng Nga bay lên cung trăng","Người anh hùng, thuốc trường sinh và nguồn gốc của ánh trăng mùa thu.","myth","Thần thoại cổ đại",8],
["rice-cultivation","水稻种植","Nguồn gốc nghề trồng lúa nước","Từ hạt lúa hoang bên Trường Giang đến nền nông nghiệp định cư.","craft","Thời tiền sử",7],
["silk-sericulture","养蚕与丝绸","Nghề nuôi tằm và dệt lụa","Con tằm, cành dâu và sợi tơ nối Trung Hoa với thế giới trên Con đường Tơ lụa.","craft","Từ thời Tân thạch khí",7],
["papermaking","造纸术","Nghề làm giấy","Từ vỏ cây, giẻ rách đến tờ giấy – phát minh đổi thay cách con người ghi chép.","invention","Thời Hán",7],
["woodblock-printing","雕版印刷术","In mộc bản","Khắc chữ lên ván gỗ để nhân bản sách vở, mở đường cho tri thức lan rộng.","invention","Thời Đường – Tống",7],
["compass-maritime","指南针与航海","La bàn và hàng hải","Từ muôi đá nam châm đến những đoàn bảo thuyền vượt đại dương.","invention","Thời Tống – Minh",7]];
const GROUPS=[["myth","Thần thoại & truyền thuyết","神话","Những câu chuyện kể về khởi nguyên của trời đất, con người và các vị anh hùng."],
["craft","Nông nghiệp & nghề thủ công","农桑","Hạt lúa, con tằm – nền tảng của đời sống và nền văn minh nông nghiệp."],
["invention","Phát minh","发明","Giấy, in ấn, la bàn – những sáng chế làm đổi thay lịch sử."]];
const LS=(()=>{try{return window.localStorage}catch(e){return null}})();
const isDone=s=>{try{return LS&&LS.getItem("civ:done:"+s)==="1"}catch(e){return false}};
document.documentElement.classList.add("js");
(()=>{const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
/* ===== TRANG CHỦ THƯ VIỆN ===== */
const root=$("#library");
if(root){
 const done=LESSONS.filter(l=>isDone(l[0])).length,pct=Math.round(done/LESSONS.length*100);
 const pr=$("#progress");if(pr){pr.style.setProperty("--p",pct);pr.innerHTML=`<span class="ring"></span><span>Đã đọc <b>${done}/${LESSONS.length}</b> bài</span>`}
 const card=l=>`<a class="card ${isDone(l[0])?"is-done":""}" href="${l[0]}.html" data-g="${l[4]}"><div class="cover"><img src="assets/img/${l[0]}.svg" alt="" loading="lazy"><span class="no">${String(LESSONS.indexOf(l)+1).padStart(2,"0")}</span><span class="read">✓ ĐÃ ĐỌC</span></div><div class="body"><span class="zh">${l[1]}</span><h3>${l[2]}</h3><p>${l[3]}</p><div class="meta"><span class="era">${l[5]}</span><span>${l[6]} phút đọc</span><span class="go">Đọc truyện →</span></div></div></a>`;
 root.innerHTML=GROUPS.map(g=>`<section class="group" data-g="${g[0]}"><header><h2><small>${g[2]}</small>${g[1]}</h2><span class="zh-tag">${g[2]}</span></header><div class="cards">${LESSONS.filter(l=>l[4]===g[0]).map(card).join("")}</div></section>`).join("");
 const f=$("#filters");
 if(f){f.innerHTML=`<button aria-pressed="true" data-f="all">Tất cả</button>`+GROUPS.map(g=>`<button aria-pressed="false" data-f="${g[0]}">${g[1].split(" & ")[0]}</button>`).join("");
  f.onclick=e=>{const b=e.target.closest("button");if(!b)return;$$("button",f).forEach(x=>x.setAttribute("aria-pressed",x===b));$$(".group",root).forEach(g=>g.hidden=b.dataset.f!=="all"&&g.dataset.g!==b.dataset.f)}}
 const p=$("#path");if(p)p.innerHTML=LESSONS.map(l=>`<li class="${isDone(l[0])?"is-done":""}"><a href="${l[0]}.html"><span class="z">${l[1].slice(0,4)}</span><span class="v">${l[2].split(" · ")[0]}</span></a></li>`).join("");
 return}
/* ===== TRANG BÀI ĐỌC ===== */
const slug=document.body.dataset.slug,KEY="civ:done:"+slug;
const bar=$("#bar");if(bar)addEventListener("scroll",()=>{const h=document.documentElement;bar.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight||1)*100)+"%"},{passive:true});
/* hiện nội dung: có IntersectionObserver thì làm hiệu ứng, luôn có phương án dự phòng */
const rv=$$(".rv");
if("IntersectionObserver"in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.04});rv.forEach(e=>io.observe(e));setTimeout(()=>rv.forEach(e=>e.classList.add("in")),2500)}else rv.forEach(e=>e.classList.add("in"));
const toc=$(".toc");const secs=$$("article section[id]");
if(toc){secs.forEach(s=>{const a=document.createElement("a");a.href="#"+s.id;a.textContent=s.dataset.t||s.id;toc.append(a)});
 const so=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)$$(".toc a").forEach(a=>{const on=a.hash==="#"+e.target.id;a.classList.toggle("on",on);if(on&&innerWidth<=860)a.scrollIntoView({inline:"center",block:"nearest"})})}),{rootMargin:"-25% 0px -65% 0px"});secs.forEach(s=>so.observe(s))}
/* nét bút thủy mặc: làm các hình minh hoạ trong bài hơi "run tay" như vẽ cọ */
const NS="http://www.w3.org/2000/svg",hid=document.createElementNS(NS,"svg");hid.setAttribute("width","0");hid.setAttribute("height","0");hid.setAttribute("aria-hidden","true");hid.style.cssText="position:absolute;width:0;height:0";
hid.innerHTML=`<defs><filter id="rough" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .26  0 0 0 0 .12  0 0 0 .11 0"/></filter></defs>`;document.body.prepend(hid);
$$("article figure svg").forEach(s=>{const kids=[...s.children].filter(c=>!/^(defs|title|desc|style)$/i.test(c.localName));let run=[];const flush=()=>{if(!run.length)return;const g=document.createElementNS(NS,"g");g.setAttribute("filter","url(#rough)");run[0].before(g);run.forEach(n=>g.append(n));run=[]};
 kids.forEach(c=>{if(c.localName==="text"||c.querySelector&&c.querySelector("text"))flush();else run.push(c)});flush();
 const vb=(s.getAttribute("viewBox")||"0 0 900 340").split(/[ ,]+/).map(Number),r=document.createElementNS(NS,"rect");r.setAttribute("x",vb[0]);r.setAttribute("y",vb[1]);r.setAttribute("width",vb[2]);r.setAttribute("height",vb[3]);r.setAttribute("filter","url(#grain)");r.setAttribute("pointer-events","none");s.append(r)});
/* phóng to */
const lb=$("#lb");$$("figure svg,.hero-art").forEach(s=>{s.tabIndex=0;s.setAttribute("role","img");const open=()=>{const c=s.cloneNode(true);c.removeAttribute("tabindex");c.style.height="auto";c.style.maxHeight="92vh";lb.replaceChildren(c);lb.classList.add("on")};s.onclick=open;s.onkeydown=e=>e.key==="Enter"&&open()});
lb.onclick=()=>lb.classList.remove("on");addEventListener("keydown",e=>e.key==="Escape"&&lb.classList.remove("on"));
/* câu hỏi ôn tập */
const qs=$$(".q");let right=0,answered=0;const score=document.createElement("div");score.className="quiz-score";score.setAttribute("aria-live","polite");if(qs.length)qs[qs.length-1].after(score);
qs.forEach(q=>{const c=+q.dataset.a,bs=$$("button",q);bs.forEach((b,i)=>b.onclick=()=>{if(q.classList.contains("done"))return;q.classList.add("done");b.classList.add(i===c?"ok":"no");bs[c].classList.add("ok");answered++;if(i===c)right++;if(answered===qs.length){score.innerHTML=`<b>${right}/${qs.length}</b><span>${right===qs.length?"Xuất sắc! Bạn đã nắm chắc bài này.":right>=qs.length-2?"Tốt lắm! Đọc lại vài đoạn để chắc hơn nhé.":"Hãy đọc lại bài một lượt rồi thử lần nữa."}</span>`;score.classList.add("on")}})});
/* hoàn thành */
const btn=$("#done"),set=()=>{const d=isDone(slug);btn.classList.toggle("done",d);btn.textContent=d?"✓ Đã hoàn thành bài này":"Đánh dấu đã đọc xong"};
btn.onclick=()=>{try{LS.setItem(KEY,isDone(slug)?"0":"1")}catch(e){}set()};set();
/* bài trước / sau */
const i=LESSONS.findIndex(l=>l[0]===slug),pn=$(".pn"),mk=(l,c,t)=>`<a class="${c}" href="${l[0]}.html"><small>${t}</small><span class="z">${l[1]}</span><span>${l[2].split(" · ")[0]}</span></a>`;
pn.innerHTML=(i>0?mk(LESSONS[i-1],"prev","← Bài trước"):"")+(i>=0&&i<LESSONS.length-1?mk(LESSONS[i+1],"next","Bài tiếp theo →"):"");
})();
