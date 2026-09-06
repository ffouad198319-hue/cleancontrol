(function(){
  const start=()=>{
    $('loginBtn').onclick=login;
    $('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
    if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
    if(token)afterLogin();
  };
  const load=(src,next)=>{const s=document.createElement('script');s.src=src;s.onload=next;s.onerror=next;document.head.appendChild(s)};
  load('./nav-fix.js?v=17',()=>load('./accounts-fix.js?v=17',start));
})();