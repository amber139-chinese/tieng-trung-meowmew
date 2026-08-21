(function(){
  async function ready(){
    if(window.meowSupabase && window.meowUser) return {client:window.meowSupabase,user:window.meowUser};
    return new Promise(resolve=>{
      window.addEventListener('meow-auth-ready',e=>resolve({client:e.detail.client,user:e.detail.user}),{once:true});
    });
  }

  window.MeowTracking = {
    async openLesson(course, lessonNo){
      const {client,user}=await ready();
      const now=new Date().toISOString();
      const {data:old}=await client
        .from('lesson_progress')
        .select('id,status,best_score')
        .eq('user_id',user.id)
        .eq('course',course)
        .eq('lesson_no',lessonNo)
        .maybeSingle();

      const row={
        user_id:user.id,
        course,
        lesson_no:lessonNo,
        status:old?.status || 'started',
        best_score:old?.best_score ?? null,
        last_opened_at:now
      };

      return client.from('lesson_progress')
        .upsert(row,{onConflict:'user_id,course,lesson_no'});
    },

    async saveGame(course, lessonNo, gameId, score){
      const {client,user}=await ready();
      score=Math.max(0,Math.min(100,Math.round(Number(score)||0)));

      await client.from('game_results').insert({
        user_id:user.id, course, lesson_no:lessonNo, game_id:gameId, score
      });

      const {data:old}=await client
        .from('lesson_progress')
        .select('best_score')
        .eq('user_id',user.id)
        .eq('course',course)
        .eq('lesson_no',lessonNo)
        .maybeSingle();

      const best=Math.max(score, old?.best_score ?? 0);

      return client.from('lesson_progress').upsert({
        user_id:user.id,
        course,
        lesson_no:lessonNo,
        status:'started',
        last_score:score,
        best_score:best,
        last_opened_at:new Date().toISOString()
      },{onConflict:'user_id,course,lesson_no'});
    },

    async completeLesson(course, lessonNo, score=null){
      const {client,user}=await ready();
      const payload={
        user_id:user.id,
        course,
        lesson_no:lessonNo,
        status:'completed',
        completed_at:new Date().toISOString(),
        last_opened_at:new Date().toISOString()
      };
      if(score!==null){
        score=Math.max(0,Math.min(100,Math.round(Number(score)||0)));
        payload.last_score=score;
        payload.best_score=score;
      }
      return client.from('lesson_progress')
        .upsert(payload,{onConflict:'user_id,course,lesson_no'});
    }
  };
})();
