// Final navigation layer: admin sees all controls; assistants see only explicitly granted permissions.
(function(){
  const previousGo=go;
  window.buildNav=function(){
    const admin=me?.role==='admin', assistant=me?.role==='assistant', supervisor=me?.role==='supervisor', perms=me?.permissions||{};
    const allowed=k=>admin||(assistant&&perms[k]===true);
    const buttons=[['home','الرئيسية'],...(supervisor?[['mySchedule','خطتي']]:[]),...(admin||supervisor||allowed('notes')?[['notes','الملاحظات']]:[]),...(allowed('operations')?[['operations','مركز العمليات']]:[]),...(allowed('checklists')?[['checklists','Checklist']]:[]),...(admin?[['profiles','المشرفون والمساعدون'],['buildings','المباني']]:[]),...(allowed('schedules')?[['schedules','خطة الجولات']]:[]),...(allowed('reports')?[['reports','التقارير والطباعة']]:[]),...(allowed('storage')?[['storage','التخزين']]:[]),...(allowed('audit')?[['audit','سجل التدقيق']]:[]),['settings','الإعدادات']];
    $('nav').innerHTML=buttons.map(([k,l])=>`<button data-nav="${k}">${l}</button>`).join('')+`<button class="danger" id="logoutBtn">خروج</button>`;
    document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>go(b.dataset.nav));$('logoutBtn').onclick=logout;
  };
  window.go=async function(k){if(k==='buildings'){activeNav(k);return buildings()}return previousGo(k)};
})();