(function(){
const C=window.HSK_CONFIG,L=window.LESSON,$=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let h=`<header><small>Tiếng Trung Meow Meow · Sổ tay New HSK 1</small><h1>Bài ${L.n}: ${L.zh}</h1><small>${L.vi}</small></header><main>`;
h+=`<nav class="lessons">`+Array.from({length:15},(_,i)=>`<a href="bai${i+1}.html">${i+1}</a>`).join('')+`<a href="baithi.html">Thi thử</a></nav>`;
h+=`<div class="card student"><input id="sName" placeholder="Họ và tên"><input id="sCls" placeholder="Lớp"></div>`;
L.sections.forEach(sec=>{
  const src=(C.AUDIO[sec.audio]||'').replace('{n}',L.n);
  h+=`<div class="card"><div class="sec-title">${esc(sec.zh)}<span>${esc(sec.vi)} ${sec.track?'· 🔊 '+sec.track:''}</span></div>`+(sec.audio?`<audio controls preload="none" src="${src}" onerror="this.nextElementSibling.style.display='block'"></audio><div class="missing" style="display:none">Chưa tìm thấy file ${esc(sec.audio)}.mp3 (${src})</div>`:'');
  sec.parts.forEach(p=>{
    h+=`<h3>${p.num?p.num+'. ':''}${esc(p.zh||'')} <span class="vi">${esc(p.vi||'')}</span></h3>`;
    if(p.type==='listen'){
      h+=`<div class="grid" style="grid-template-columns:repeat(${p.cols||4},1fr)">`+p.cells.map(c=>`<div>${esc(c)}</div>`).join('')+`</div>`;
    }else if(p.type==='images'){
      h+=`<div class="pool">`+p.items.map(it=>`<figure><img src="${it.img}" alt="${esc(it.label)}"><figcaption>${esc(it.label)}</figcaption></figure>`).join('')+`</div>`;
    }else if(p.type==='note'){
      h+=`<div class="note">`+p.lines.map(l=>`<div>${l}</div>`).join('')+`</div>`;
    }else if(p.type==='fill'){
      h+=`<div class="fillrow">`+p.items.map((it,i)=>`<label>${esc(it.pre||'')}<input class="blank" data-k="${p.id}|${i+1}|${esc((it.pre||'')+'_'+(it.post||''))}" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(it.post||'')}</label>`).join('')+`</div>`;
    }else if(p.type==='choice'){
      h+=`<div class="q ${p.cls||''}">`+p.items.map((it,i)=>`<div class="qi">${it.img?`<img src="${it.img}" alt="Câu ${i+1}">`:''}<div class="qn">${it.label||('Câu '+(i+1))}${it.text?': '+it.text:''}</div>`+`<div class="opts">`+
        it.opts.map(o=>`<label class="opt"><input type="radio" name="${p.id}_${i}" data-k="${p.id}|${i+1}" value="${esc(o.k)}">${o.img?`<img src="${o.img}" alt="${esc(o.k)}">`:''}${o.html}</label>`).join('')+`</div></div>`).join('')+`</div>`;
    }
  });
  h+=`</div>`;
});
h+=`<button class="send" id="send">📨 Nộp bài</button><div id="msg"></div></main>`;
document.body.innerHTML=h;
document.addEventListener('change',e=>{if(e.target.type==='radio'){document.querySelectorAll(`input[name="${e.target.name}"]`).forEach(r=>r.closest('.opt').classList.toggle('sel',r.checked))}});
['sName','sCls'].forEach(id=>{const el=$('#'+id);el.value=localStorage.getItem('hsk_'+id)||'';el.oninput=()=>localStorage.setItem('hsk_'+id,el.value)});
$('#send').onclick=async()=>{
  const name=$('#sName').value.trim(),cls=$('#sCls').value.trim(),m=$('#msg');
  if(!name){m.className='err';m.textContent='Nhập họ tên trước khi nộp nhé.';return}
  const answers=[];
  document.querySelectorAll('input.blank').forEach(i=>{const[id,n,ctx]=i.dataset.k.split('|');answers.push({section:id,q:n+' ('+ctx+')',answer:i.value.trim()})});
  const seen={};document.querySelectorAll('input[type=radio]').forEach(r=>{if(r.checked){const[id,n]=r.dataset.k.split('|');answers.push({section:id,q:r.closest('.qi').querySelector('.qn').textContent.split(':')[0],answer:r.value});seen[r.name]=1}});
  const payload={lesson:L.n,student:{name,cls},time:new Date().toLocaleString('vi-VN'),answers};
  m.className='';m.textContent='Đang gửi...';
  const btn=$('#send');btn.disabled=true;
  try{
    if(C.SUPABASE_URL&&C.SUPABASE_KEY){
      if(!window.supabase){
        await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';s.onload=ok;s.onerror=()=>no(new Error('Không tải được thư viện Supabase (kiểm tra mạng).'));document.head.appendChild(s)});
      }
      const db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY);
      const {data:{session}}=await db.auth.getSession();
      const meta=(session&&session.user.user_metadata)||{};
      const ans={};
      answers.forEach((a,i)=>{ans[String(i+1)]='['+a.section+'] '+a.q+': '+(a.answer||'(bỏ trống)')});
      const row={
        exercise_id:'hsk1-bai'+String(L.n).padStart(2,'0'),
        exercise_title:'HSK1 · Bài '+L.n+': '+L.zh,
        display_name:name+(cls?' - '+cls:''),
        user_id:(session&&session.user.id)||null,
        username:meta.username||null,
        score:null,
        answers:ans,
        submitted_at:new Date().toISOString()
      };
      const {error}=await db.from('submissions').insert(row);
      if(error)throw error;
      m.className='ok';m.textContent='✅ Đã gửi bài thành công!';
    }else if(C.ENDPOINT){
      await fetch(C.ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)});
      m.className='ok';m.textContent='✅ Đã gửi bài thành công!';
    }else{
      const body=answers.map(a=>`[${a.section}] ${a.q}: ${a.answer}`).join('\n');
      location.href=`mailto:${C.FALLBACK_EMAIL}?subject=${encodeURIComponent('Bài tập HSK1 - Bài '+L.n+' - '+name+' - '+cls)}&body=${encodeURIComponent(body)}`;
      m.textContent='Chưa cấu hình, đang mở ứng dụng email dự phòng.';
    }
  }catch(e){m.className='err';m.textContent='Gửi lỗi: '+(e.message||e)+' — thử lại nhé.'}
  btn.disabled=false;
};
})();
