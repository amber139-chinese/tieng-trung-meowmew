(function(){
  const SUPABASE_URL = "https://xmtvmwcjjqqzscmkdlwd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_R5TEjUNB6lDTJuN4MNdhVQ_ANwIaKLP";

  function loadSupabase(){
    return new Promise((resolve,reject)=>{
      if(window.supabase) return resolve();
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload=resolve;
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  function currentFile(){
    return location.pathname.split('/').pop() || 'hsk1.html';
  }

  function injectAccountBar(user){
    if(document.getElementById('meow-account-bar')) return;
    const name=(user.user_metadata && user.user_metadata.display_name) ||
               (user.user_metadata && user.user_metadata.username) ||
               'Học viên';
    const style=document.createElement('style');
    style.textContent=`
      #meow-account-bar{position:fixed;right:14px;top:14px;z-index:99999;
      display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid #D7E9ED;
      border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 7px 22px rgba(55,110,125,.12);
      font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:#4D6871;backdrop-filter:blur(10px)}
      #meow-account-bar button{border:0;background:#EAF6F8;color:#3F8198;border-radius:999px;
      padding:6px 9px;font:700 11px/1 system-ui;cursor:pointer}
    `;
    document.head.appendChild(style);
    const bar=document.createElement('div');
    bar.id='meow-account-bar';
    bar.innerHTML=`<span>Xin chào, ${name}</span><button type="button">Đăng xuất</button>`;
    document.body.appendChild(bar);
    bar.querySelector('button').onclick=async()=>{
      await window.meowSupabase.auth.signOut();
      location.replace('login.html');
    };
  }

  async function start(){
    await loadSupabase();
    const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    window.meowSupabase=client;
    const {data,error}=await client.auth.getSession();
    if(error || !data.session){
      const next=encodeURIComponent(currentFile());
      location.replace(`login.html?next=${next}`);
      return;
    }
    window.meowUser=data.session.user;
    injectAccountBar(data.session.user);
    window.dispatchEvent(new CustomEvent('meow-auth-ready',{detail:{user:data.session.user,client}}));
  }
  start().catch(()=>{
    const next=encodeURIComponent(currentFile());
    location.replace(`login.html?next=${next}`);
  });
})();
