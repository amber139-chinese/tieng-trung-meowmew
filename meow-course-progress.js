(function(){
  function fmtScore(v){return v===null||v===undefined?'':`${v}/100`}

  async function start(){
    const course=document.body.dataset.course;
    if(!course) return;

    const {client,user,isAdmin}=await new Promise(resolve=>{
      if(window.meowSupabase && window.meowUser){
        resolve({client:window.meowSupabase,user:window.meowUser,isAdmin:window.meowIsAdmin});
      }else{
        window.addEventListener('meow-auth-ready',e=>resolve(e.detail),{once:true});
      }
    });

    const {data:rows}=await client
      .from('lesson_progress')
      .select('lesson_no,status,best_score,last_score,last_opened_at')
      .eq('user_id',user.id)
      .eq('course',course)
      .order('lesson_no');

    const data=rows||[];
    const total=document.querySelectorAll('.lesson-card').length;
    const completed=data.filter(x=>x.status==='completed').length;
    const avg=data.filter(x=>x.best_score!==null).length
      ? Math.round(data.filter(x=>x.best_score!==null).reduce((a,x)=>a+x.best_score,0)/data.filter(x=>x.best_score!==null).length)
      : 0;

    const hero=document.querySelector('.lesson-hero .container');
    if(hero){
      const box=document.createElement('div');
      box.className='meow-progress-box';
      box.innerHTML=`
        <div><b>Tiến độ của tôi</b><span>${completed}/${total} bài hoàn thành</span></div>
        <div class="meow-progress-track"><i style="width:${total?Math.round(completed/total*100):0}%"></i></div>
        <div class="meow-progress-meta">
          <span>Điểm cao nhất trung bình: <b>${avg||0}/100</b></span>
          <a href="ranking.html?course=${course}">Xem bảng xếp hạng →</a>
          ${isAdmin?'<a href="admin.html">Quản lý lớp →</a>':''}
        </div>`;
      hero.appendChild(box);

      const st=document.createElement('style');
      st.textContent=`
        .meow-progress-box{margin-top:24px;padding:16px 18px;border:1px solid #D7E9ED;border-radius:16px;background:#fff;max-width:760px}
        .meow-progress-box>div:first-child{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#536970}
        .meow-progress-box>div:first-child b{color:#315F6E}
        .meow-progress-track{height:8px!important;margin:10px 0!important;background:#EAF6F8!important;border-radius:99px!important;overflow:hidden}
        .meow-progress-track i{display:block;height:100%;background:#6FAFC4;border-radius:99px}
        .meow-progress-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#687980}
        .meow-progress-meta a{color:#3F8198;text-decoration:none;font-weight:700}
        .lesson-status{margin-top:10px;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
        .lesson-status span{font-size:11px;border-radius:999px;padding:4px 7px;background:#F3FAFB;border:1px solid #D7E9ED;color:#5E747B}
        .lesson-status .done{background:#EEF8F3;border-color:#CFE8DA;color:#31775F}
      `;
      document.head.appendChild(st);
    }

    const map=new Map(data.map(x=>[Number(x.lesson_no),x]));
    document.querySelectorAll('.lesson-card').forEach(card=>{
      const href=card.getAttribute('href')||'';
      const m=href.match(/bai(\d+)\.html/i);
      if(!m)return;
      const n=Number(m[1]),r=map.get(n);
      const status=document.createElement('div');
      status.className='lesson-status';
      if(!r){
        status.innerHTML='<span>Chưa học</span>';
      }else if(r.status==='completed'){
        status.innerHTML=`<span class="done">Đã hoàn thành</span>${r.best_score!==null?`<span>Cao nhất ${fmtScore(r.best_score)}</span>`:''}`;
      }else{
        status.innerHTML=`<span>Đang học</span>${r.best_score!==null?`<span>Cao nhất ${fmtScore(r.best_score)}</span>`:''}`;
      }
      const desc=card.querySelector('.lesson-desc');
      if(desc) desc.after(status);
      else card.querySelector('div')?.appendChild(status);
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start);
  }else start();
})();
