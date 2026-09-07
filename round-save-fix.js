// CleanControl round-save hardening layer v20.
// Local-first persistence, context refresh, fresh-checklist validation,
// safe retry, duplicate-tap protection and actionable server diagnostics.
(function(){
  function setSaveButtonState(disabled,label){
    const btn=document.querySelector('button[onclick="saveRound()"]');
    if(!btn)return;
    btn.disabled=disabled;
    if(label)btn.textContent=label;
  }

  function errorText(e){
    const parts=[];
    if(e?.message)parts.push(e.message);
    if(e?.code)parts.push(`code: ${e.code}`);
    if(e?.status)parts.push(`HTTP ${e.status}`);
    return parts.join(' — ')||'خطأ غير معروف';
  }

  async function validateRoundContext(payload){
    const fresh=await api('bootstrap');
    boot=fresh;
    me=fresh.user||me;
    const b=(fresh.buildings||[]).find(x=>x.code===payload.building_code);
    if(!b)throw new Error('هذا المبنى غير مسند لهذا المشرف أو لم يعد متاحًا.');
    const f=(b.floors||[]).find(x=>String(x.label)===String(payload.floor_label));
    if(!f)throw new Error('هذا الطابق غير متاح لهذا المشرف حاليًا.');
    return true;
  }

  async function refreshChecklistIds(payload){
    const j=await api('checklist',{building_code:payload.building_code,floor_label:payload.floor_label});
    const fresh=Array.isArray(j.items)?j.items:[];
    if(!fresh.length)throw new Error('لا توجد Checklist فعالة لهذا الموقع.');
    const freshIds=new Set(fresh.map(x=>Number(x.id)));
    const old=payload.results||[];
    if(old.every(x=>freshIds.has(Number(x.item_id))))return payload;
    // Older queued rounds may have stale checklist IDs. Only remap when item counts are identical,
    // which preserves the original order and avoids guessing when the checklist structure changed.
    if(old.length!==fresh.length)throw new Error('تم تعديل Checklist بعد تنفيذ الجولة؛ يلزم مراجعة الإدارة قبل المزامنة.');
    return {...payload,results:old.map((x,i)=>({...x,item_id:fresh[i].id}))};
  }

  async function submitWithRecovery(payload,offlineSource){
    await validateRoundContext(payload);
    try{
      return await sendQueuedRound(payload,offlineSource);
    }catch(firstErr){
      const retryable=firstErr?.status>=500||/الخادم|server|استجابة غير صالحة|تعذر تنفيذ الطلب|فشل/i.test(firstErr?.message||'');
      if(!retryable)throw firstErr;
      await new Promise(r=>setTimeout(r,600));
      await validateRoundContext(payload);
      const refreshed=await refreshChecklistIds(payload);
      // Keep the same client_uuid. Never generate a second UUID automatically after a server error,
      // because the first request may already have created the round server-side.
      return await sendQueuedRound(refreshed,offlineSource);
    }
  }

  window.saveRound=async function(){
    const r=currentRound,msg=$('roundMsg');
    if(!r||!Array.isArray(r.items))return;
    if(window._ccRoundSaving)return;
    window._ccRoundSaving=true;
    setSaveButtonState(true,'جاري حفظ الجولة...');
    try{
      const results=[];
      for(const x of r.items){
        const box=document.querySelector(`[data-item="${x.id}"]`),status=box?.dataset?.status;
        if(!status)throw new Error('يجب اختيار مطابق أو غير مطابق لكل البنود');
        const note=$(`note_${x.id}`)?.value.trim()||'';
        if(status==='bad'&&!note)throw new Error('الملاحظة مطلوبة لكل بند غير مطابق');
        const file=$(`file_${x.id}`)?.files?.[0]||null;
        results.push({item_id:x.id,item_text:x.item_text||'',status,note,file:await fileMeta(file)});
      }

      const payload={building_code:r.code,floor_label:r.floor,started_at:r.started_at,completed_at:new Date().toISOString(),client_uuid:r.client_uuid||crypto.randomUUID(),results};
      r.client_uuid=payload.client_uuid;
      await queuePut(payload);
      await updatePending();
      if(msg)msg.innerHTML='<span class="badge amber">تم حفظ الجولة على الهاتف — جاري إرسالها للسيرفر</span>';

      if(!navigator.onLine){
        if(msg)msg.innerHTML='<span class="badge amber">الجولة محفوظة على الهاتف — بانتظار الإنترنت للمزامنة</span>';
        toast('تم حفظ الجولة على الهاتف ولن تضيع');
        setTimeout(home,1200);
        return;
      }

      try{
        const saved=await submitWithRecovery(payload,false);
        await queueDel(payload.client_uuid);
        await updatePending();
        if(msg)msg.innerHTML='<span class="badge green">تم حفظ الجولة على السيرفر بنجاح</span>';
        toast('تم حفظ الجولة بنجاح');
        setTimeout(home,900);
        return saved;
      }catch(sendErr){
        await updatePending();
        const detail=errorText(sendErr);
        if(msg)msg.innerHTML=`<div class="notice"><b>الجولة محفوظة على الهاتف ولن تضيع.</b><br><span class="small">فشل الإرسال إلى السيرفر: ${esc(detail)}</span><br><span class="small">رقم الجولة المحلي: ${esc(payload.client_uuid)}</span><br><span class="small">لا تعِد تنفيذ الجولة. سيتم الاحتفاظ بها للمزامنة.</span></div>`;
        toast('الجولة محفوظة محليًا — فشل إرسالها للسيرفر');
        setSaveButtonState(false,'إعادة محاولة الإرسال');
        return;
      }
    }catch(e){
      if(msg)msg.innerHTML=`<div class="error">${esc(errorText(e))}</div>`;
      setSaveButtonState(false,'حفظ الجولة');
    }finally{window._ccRoundSaving=false;}
  };

  window.syncQueue=async function(){
    if(syncing||!navigator.onLine||!token)return;
    syncing=true;
    try{
      const all=await queueAll();
      for(const p of all){
        try{
          const fixed=await refreshChecklistIds(p);
          await submitWithRecovery(fixed,true);
          await queueDel(p.client_uuid);
        }catch(e){
          console.warn('CleanControl sync pending',p?.client_uuid,errorText(e));
        }
      }
    }finally{
      syncing=false;
      await updatePending();
    }
  };
})();