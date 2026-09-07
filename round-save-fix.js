// CleanControl round-save hardening layer.
// Persists each completed round locally before attempting server submission,
// prevents duplicate taps, and keeps failed submissions queued for later sync.
(function(){
  function setSaveButtonState(disabled,label){
    const btn=document.querySelector('button[onclick="saveRound()"]');
    if(!btn)return;
    btn.disabled=disabled;
    if(label)btn.textContent=label;
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

      // Local-first: write before any network operation so the round cannot be lost.
      await queuePut(payload);
      await updatePending();
      if(msg)msg.innerHTML='<span class="badge amber">تم حفظ الجولة على الهاتف — جاري إرسالها للسيرفر</span>';

      if(!navigator.onLine){
        toast('تم حفظ الجولة على الهاتف وستتم المزامنة عند عودة الإنترنت');
        setTimeout(home,900);
        return;
      }

      try{
        await sendQueuedRound(payload,false);
        await queueDel(payload.client_uuid);
        await updatePending();
        if(msg)msg.innerHTML='<span class="badge green">تم حفظ الجولة على السيرفر بنجاح</span>';
        toast('تم حفظ الجولة بنجاح');
        setTimeout(home,700);
      }catch(sendErr){
        // Keep queue item intact. Do not lose the completed round.
        await updatePending();
        if(msg)msg.innerHTML='<span class="badge amber">الجولة محفوظة على الهاتف وبانتظار المزامنة</span>';
        toast('تعذر الإرسال الآن؛ الجولة محفوظة ولن تضيع');
        setTimeout(home,1000);
      }
    }catch(e){
      if(msg)msg.textContent=e?.message||'تعذر حفظ الجولة';
      setSaveButtonState(false,'حفظ الجولة');
    }finally{
      window._ccRoundSaving=false;
    }
  };

  // Safer queue sync: only delete local copy after confirmed server save.
  window.syncQueue=async function(){
    if(syncing||!navigator.onLine||!token)return;
    syncing=true;
    try{
      const all=await queueAll();
      for(const p of all){
        try{
          await sendQueuedRound(p,true);
          await queueDel(p.client_uuid);
        }catch(e){
          // Leave failed round in queue and continue with the rest.
          console.warn('CleanControl sync pending',p?.client_uuid,e?.message||e);
        }
      }
    }finally{
      syncing=false;
      await updatePending();
    }
  };
})();
