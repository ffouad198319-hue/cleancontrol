// Reliable account-management layer: use the main CleanControl API for supervisors/assistants.
(function(){
  const PERMISSIONS={operations:'مركز العمليات',notes:'الملاحظات',reports:'التقارير والطباعة',schedules:'خطة الجولات',checklists:'Checklist',audit:'سجل التدقيق',storage:'التخزين'};
  function permsText(x={}){const a=Object.entries(PERMISSIONS).filter(([k])=>x?.[k]===true).map(([,v])=>v);return a.length?a.join('، '):'بدون صلاحيات إدارية'}
  async function getProfiles(){const j=await api('admin_profiles');window._ccProfiles=j.profiles||[];if(!window._ccBuildings?.length){try{const b=await api('bootstrap');window._ccBuildings=b.buildings||[]}catch{window._ccBuildings=boot?.buildings||[]}}return j}
  window.profiles=async function(){
    $('view').innerHTML='<div class="card">جاري تحميل الحسابات...</div>';
    try{
      await getProfiles();
      $('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>المشرفون والمساعدون</h2><div class="small">يمكن إضافة مشرف أو مساعد للأدمن، تعديل الحساب، أو إيقافه دون حذف الجولات أو الملاحظات أو السجل السابق.</div></div><button class="primary" onclick="editProfile(null)">+ إضافة مشرف أو مساعد</button></div><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>المباني / الصلاحيات</th><th>الإجراء</th></tr></thead><tbody>${window._ccProfiles.map(p=>`<tr><td>${esc(p.full_name)}</td><td>${esc(p.username)}</td><td>${p.role==='assistant'?'مساعد للأدمن':p.role==='admin'?'أدمن':'مشرف'}</td><td>${p.active?'نشط':'موقوف'}</td><td>${p.role==='assistant'?permsText(p.permissions):(p.assignments||[]).map(a=>esc(a.buildings?.name||'')).filter(Boolean).join('، ')||'—'}</td><td>${p.role==='admin'?'—':`<button class="secondary" onclick="editProfile('${p.id}')">تعديل</button> <button class="${p.active?'danger':'success'}" onclick="toggleProfile('${p.id}')">${p.active?'إيقاف':'تفعيل'}</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
    }catch(e){$('view').innerHTML=`<div class="error">${esc(e.message||'تعذر تحميل الحسابات')}</div>`}
  };
  window.editProfile=function(id){
    const p=(window._ccProfiles||[]).find(x=>String(x.id)===String(id));
    const bs=(window._ccBuildings||boot?.buildings||[]).filter(b=>b.active!==false);
    const assigned=new Set((p?.assignments||[]).map(a=>a.buildings?.code).filter(Boolean));
    modal(`<h3>${p?'تعديل الحساب':'إضافة مشرف أو مساعد'}</h3><input id="pName" value="${esc(p?.full_name||'')}" placeholder="الاسم الكامل"><div style="height:8px"></div><input id="pUser" value="${esc(p?.username||'')}" placeholder="اسم المستخدم"><div style="height:8px"></div><select id="pRole" onchange="profileRoleFields()"><option value="supervisor" ${p?.role!=='assistant'?'selected':''}>مشرف</option><option value="assistant" ${p?.role==='assistant'?'selected':''}>مساعد للأدمن</option></select>${p?'':`<div style="height:8px"></div><input id="pPass" type="password" autocomplete="new-password" placeholder="كلمة مرور مؤقتة: 8 خانات + حرف + رقم + رمز">`}<div id="pBuildings" style="margin-top:10px"><b>المباني المسندة للمشرف</b><div class="check-days">${bs.map(b=>`<label><input type="checkbox" name="pBuilding" value="${esc(b.code)}" ${assigned.has(b.code)?'checked':''}>${esc(b.name)}</label>`).join('')}</div></div><div id="pPermissions" style="margin-top:10px"><b>صلاحيات مساعد الأدمن</b><div class="small">حدد فقط الصلاحيات المطلوبة. إدارة الحسابات تبقى للأدمن الرئيسي.</div><div class="check-days">${Object.entries(PERMISSIONS).map(([k,v])=>`<label><input type="checkbox" name="pPerm" value="${k}" ${p?.permissions?.[k]===true?'checked':''}>${v}</label>`).join('')}</div></div><div class="actions" style="margin-top:12px"><button class="primary" onclick="saveProfile('${p?.id||''}')">حفظ</button><button class="secondary" onclick="closeModal()">إلغاء</button></div>`);
    profileRoleFields();
  };
  window.profileRoleFields=function(){const a=$('pRole')?.value==='assistant';if($('pBuildings'))$('pBuildings').style.display=a?'none':'block';if($('pPermissions'))$('pPermissions').style.display=a?'block':'none'};
  window.saveProfile=async function(id=''){
    const btn=document.querySelector('#modalRoot .primary');if(btn)btn.disabled=true;
    try{
      const role=$('pRole').value,codes=[...document.querySelectorAll('[name=pBuilding]:checked')].map(x=>x.value),permissions={};
      document.querySelectorAll('[name=pPerm]').forEach(x=>permissions[x.value]=x.checked);
      const data={id:id||null,full_name:$('pName').value.trim(),username:$('pUser').value.trim(),role,building_codes:role==='supervisor'?codes:[],permissions:role==='assistant'?permissions:{}};
      if(!id)data.password=$('pPass').value;
      await api('save_profile',data);
      closeModal();toast(id?'تم تعديل الحساب بنجاح':'تمت إضافة الحساب بنجاح');await profiles();
    }catch(e){toast(e.message||'تعذر حفظ الحساب');if(btn)btn.disabled=false}
  };
  window.toggleProfile=async function(id){
    if(!confirm('تغيير حالة هذا الحساب؟ لن يتم حذف أي بيانات أو جولات سابقة.'))return;
    try{await api('toggle_profile',{id});toast('تم تحديث حالة الحساب');await profiles()}catch(e){toast(e.message||'تعذر تحديث الحساب')}
  };
})();