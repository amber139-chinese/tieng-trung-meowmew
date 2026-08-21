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

  function currentTarget(){
    return (location.pathname.split('/').pop() || 'hsk1.html') + location.search;
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
      border-radius:999px;background:rgba(255,255,255,.95);box-shadow:0 7px 22px rgba(55,110,125,.12);
      font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:#4D6871;backdrop-filter:blur(10px)}
      #meow-account-bar button,#meow-account-bar a{border:0;background:#EAF6F8;color:#3F8198;border-radius:999px;
      padding:6px 9px;font:700 11px/1 system-ui;text-decoration:none;cursor:pointer}
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

  async function isAdmin(client,user){
    const {data,error}=await client
      .from('admin_users')
      .select('id')
      .eq('id',user.id)
      .maybeSingle();
    return !error && !!data;
  }

  async function start(){
    await loadSupabase();
    const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    window.meowSupabase=client;

    const {data,error}=await client.auth.getUser();
    const user=data && data.user;

    if(error || !user){
      location.replace(`login.html?next=${encodeURIComponent(currentTarget())}`);
      return;
    }

    window.meowUser=user;
    injectAccountBar(user);

    const admin=await isAdmin(client,user);
    window.meowIsAdmin=admin;

    if(admin){
      const bar=document.getElementById('meow-account-bar');
      if(bar && !bar.querySelector('[data-admin]')){
        const a=document.createElement('a');
        a.href='admin.html';
        a.dataset.admin='1';
        a.textContent='Quản lý';
        bar.insertBefore(a,bar.querySelector('button'));
      }
    }

    window.dispatchEvent(new CustomEvent('meow-auth-ready',{
      detail:{user,client,isAdmin:admin}
    }));
  }

  start().catch(()=>{
    location.replace(`login.html?next=${encodeURIComponent(currentTarget())}`);
  });
})();
