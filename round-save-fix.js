// CleanControl round-save hardening layer v19.
// Local-first persistence, server-side validation refresh, one safe retry,
// duplicate-tap protection, and detailed failure handling without data loss.
(function(){
  function setSaveButtonState(disabled,label){
    const btn=document.querySelector('button[onclick="saveRound()"]');
    if(!btn)return;
    btn.disabled=disabled;
    if(label)btn.textContent=label;
  }

  async function validateRoundContext(payload){
    const fresh=await api('bootstrap');
    boot=fresh;
    me=fresh.user||me;
    const b=(fresh.buildings||[]).find(x=>x.code===payload.building_code);
    if(!b)throw new Error('هذا المبنى غير مسند لهذا المشرف أو لم يعد متاحًا. يرجى الرجوع للإدارة.');
    const f=(b.floors||[]).find(x=>String(x.label)===String(payload.floor_label));
    if(!f)throw new Error('هذا الطابق غير متاح لهذا المشرف حاليًا. يرجى الرجوع للإدارة.');
    return true;
  }

  async function submitWithRecovery(payload,offlineSource){
    try{
      await validateRoundContext(payload);
      return await sendQueuedRound(payload,offlineSource);
    }catch(firstErr){
      const retryable=firstErr?.status>=500||/الخادم|server|استجابة غير صالحة|تعذر تنفيذ الطلب/i.test(firstErr?.message||'');
      if(!retryable)throw firstErr;
      // Refresh account/assignment/checklist context once, then retry the same idempotent payload.
      await new Promise(r=>setTimeout(r,450));
      await validateRoundContext(payload);
      return await sendQueuedRound(payload,offlineSource);
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
        results.push({item_id:x.id,status,note,file:await fileMeta(file)});
      }

      const payload={
        building_code:r.code,
        floor_label:r.floor,
        started_at:r.started_at,
        completed_at:new Date().toISOString(),
        client_uuid:r.client_uuid||crypto.randomUUID(),
        results
      };
      r.client_uuid=payload.client_uuid;

      await queuePut(payload);
      await updatePending();
      if(msg)msg.innerHTML='<span class="badge amber">تم حفظ الجولة على الهاتف — جاري التحقق والإرسال للسيرفر</span>';

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
        const detail=sendErr?.message||'حدث خطأ غير معروف أثناء الإرسال';
        if(msg)msg.innerHTML=`<div class="notice"><b>الجولة محفوظة على الهاتف ولن تضيع.</b><br><span class="small">تعذر الحفظ على السيرفر: ${esc(detail)}</span><br><span class="small">سيتم إعادة المحاولة تلقائيًا عند توفر الاتصال. لا تعِد تنفيذ الجولة.</span></div>`;
        toast('الجولة محفوظة محليًا — فشل إرسالها للسيرفر');
        setSaveButtonState(false,'إعادة محاولة الإرسال');
        return;
      }
    }catch(e){
      if(msg)msg.innerHTML=`<div class="error">${esc(e?.message||'تعذر حفظ الجولة')}</div>`;
      setSaveButtonState(false,'حفظ الجولة');
    }finally{
      window._ccRoundSaving=false;
    }
  };

  window.syncQueue=async function(){
    if(syncing||!navigator.onLine||!token)return;
    syncing=true;
    try{
      const all=await queueAll();
      for(const p of all){
        try{
          await submitWithRecovery(p,true);
          await queueDel(p.client_uuid);
        }catch(e){
          console.warn('CleanControl sync pending',p?.client_uuid,e?.message||e);
        }
      }
    }finally{
      syncing=false;
      await updatePending();
    }
  };
})();
