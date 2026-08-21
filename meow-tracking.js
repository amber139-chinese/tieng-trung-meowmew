(function(){
  const sent = new Set();
  let watchStarted = false;

  async function ready(){
    if(window.meowSupabase && window.meowUser){
      return {client:window.meowSupabase,user:window.meowUser};
    }
    return new Promise(resolve=>{
      window.addEventListener('meow-auth-ready',e=>{
        resolve({client:e.detail.client,user:e.detail.user});
      },{once:true});
    });
  }

  function clampScore(v){
    return Math.max(0,Math.min(100,Math.round(Number(v)||0)));
  }

  function parseScore(text){
    text=String(text||'').replace(/\s+/g,' ').trim();
    if(!text) return null;

    const frac=text.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    if(frac){
      const a=Number(frac[1]),b=Number(frac[2]);
      if(b>0 && a<=b) return clampScore(a/b*100);
    }

    const pct=text.match(/(?:điểm|kết quả|score)[^0-9]{0,10}(\d{1,3})(?:\s*%|\s*điểm)?/i);
    if(pct) return clampScore(pct[1]);

    return null;
  }

  function gameIdFor(el){
    if(el.id) return el.id;
    const task=el.closest && el.closest('.task,.qcard,.game-card,.adv-section,.card');
    if(task){
      if(task.id) return task.id;
      const parent=task.parentElement;
      if(parent){
        const idx=[...parent.children].indexOf(task);
        return `${task.className.split(/\s+/)[0]||'task'}-${idx+1}`;
      }
    }
    return 'score';
  }

  async function logActivity(course,lessonNo,type,detail={}){
    const {client,user}=await ready();
    return client.from('activity_logs').insert({
      user_id:user.id,
      course,
      lesson_no:Number(lessonNo),
      activity_type:type,
      detail
    });
  }

  async function maybeComplete(course,lessonNo){
    const {client,user}=await ready();

    const {data,error}=await client
      .from('game_results')
      .select('game_id')
      .eq('user_id',user.id)
      .eq('course',course)
      .eq('lesson_no',Number(lessonNo));

    if(error || !data) return;

    const unique=new Set(data.map(x=>x.game_id));
    if(unique.size < 3) return;

    const now=new Date().toISOString();
    await client.from('lesson_progress').upsert({
      user_id:user.id,
      course,
      lesson_no:Number(lessonNo),
      status:'completed',
      completed_at:now,
      last_opened_at:now
    },{onConflict:'user_id,course,lesson_no'});

    const key=`complete:${course}:${lessonNo}`;
    if(!sent.has(key)){
      sent.add(key);
      await logActivity(course,lessonNo,'lesson_complete',{scored_activities:unique.size});
    }
  }

  window.MeowTracking = {
    async openLesson(course, lessonNo){
      const {client,user}=await ready();
      const now=new Date().toISOString();

      const {data:old}=await client
        .from('lesson_progress')
        .select('status,best_score,last_score,completed_at')
        .eq('user_id',user.id)
        .eq('course',course)
        .eq('lesson_no',Number(lessonNo))
        .maybeSingle();

      await client.from('lesson_progress').upsert({
        user_id:user.id,
        course,
        lesson_no:Number(lessonNo),
        status:old?.status || 'started',
        best_score:old?.best_score ?? null,
        last_score:old?.last_score ?? null,
        completed_at:old?.completed_at ?? null,
        last_opened_at:now
      },{onConflict:'user_id,course,lesson_no'});

      const visitKey=`open:${course}:${lessonNo}:${new Date().toISOString().slice(0,13)}`;
      if(!sent.has(visitKey)){
        sent.add(visitKey);
        await logActivity(course,lessonNo,'lesson_open',{page:location.pathname.split('/').pop()});
      }
    },

    async saveGame(course, lessonNo, gameId, score){
      score=clampScore(score);
      const dedupe=`game:${course}:${lessonNo}:${gameId}:${score}`;
      if(sent.has(dedupe)) return;
      sent.add(dedupe);

      const {client,user}=await ready();

      await client.from('game_results').insert({
        user_id:user.id,
        course,
        lesson_no:Number(lessonNo),
        game_id:String(gameId),
        score
      });

      const {data:old}=await client
        .from('lesson_progress')
        .select('best_score,status,completed_at')
        .eq('user_id',user.id)
        .eq('course',course)
        .eq('lesson_no',Number(lessonNo))
        .maybeSingle();

      const best=Math.max(score,old?.best_score ?? 0);

      await client.from('lesson_progress').upsert({
        user_id:user.id,
        course,
        lesson_no:Number(lessonNo),
        status:old?.status || 'started',
        last_score:score,
        best_score:best,
        completed_at:old?.completed_at ?? null,
        last_opened_at:new Date().toISOString()
      },{onConflict:'user_id,course,lesson_no'});

      await logActivity(course,lessonNo,'game_score',{game_id:String(gameId),score});
      await maybeComplete(course,lessonNo);
    },

    async completeLesson(course, lessonNo, score=null){
      const {client,user}=await ready();
      const payload={
        user_id:user.id,
        course,
        lesson_no:Number(lessonNo),
        status:'completed',
        completed_at:new Date().toISOString(),
        last_opened_at:new Date().toISOString()
      };
      if(score!==null){
        payload.last_score=clampScore(score);
        payload.best_score=clampScore(score);
      }
      await client.from('lesson_progress')
        .upsert(payload,{onConflict:'user_id,course,lesson_no'});
      await logActivity(course,lessonNo,'lesson_complete',{manual:true,score});
    },

    startAutoScoreTracking(course,lessonNo){
      if(watchStarted) return;
      watchStarted=true;

      const selectors=[
        '[id^="scoreG"]',
        '#customScore',
        '#advScore',
        '#overallScore',
        '.grade-big',
        '.score'
      ].join(',');

      function scan(root){
        const list=[];
        if(root.nodeType===1 && root.matches && root.matches(selectors)) list.push(root);
        if(root.querySelectorAll) list.push(...root.querySelectorAll(selectors));

        list.forEach(el=>{
          const score=parseScore(el.textContent);
          if(score===null) return;
          const gid=gameIdFor(el);
          window.MeowTracking.saveGame(course,lessonNo,gid,score);
        });
      }

      scan(document);

      const observer=new MutationObserver(muts=>{
        muts.forEach(m=>{
          scan(m.target);
          m.addedNodes.forEach(n=>scan(n));
        });
      });
      observer.observe(document.body,{subtree:true,childList:true,characterData:true});
      window.meowScoreObserver=observer;
    }
  };
})();
