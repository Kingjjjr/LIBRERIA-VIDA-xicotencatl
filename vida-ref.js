/* =========================================================
   vida-ref.js — Cuenta + Referidos + 5% + VidaCash (LocalStorage)
   - Sin <script>…</script>
   - Sin dobles DOMContentLoaded
   - Compatible (sin optional chaining / sin usar crypto directo)
========================================================= */
(function(){
  var LS_USER='vida_user_v1', LS_REF_CAND='vida_ref_candidate',
      LS_REF_USED='vida_ref_used_v1', LS_VIDACASH='vida_cash_v1',
      LS_ONCE='vida_account_prompted_v1';

  var $ = function(s,c){ return (c||document).querySelector(s); };
  var on = function(el,ev,fn,opt){ if(el) el.addEventListener(ev,fn,opt); };

  function slug(s){
    s = (s||'').toLowerCase();
    s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'') : s;
    return s.replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }
  function rnd6(){
    try{
      var w = (typeof window!=='undefined'? window : globalThis);
      var c = (w.crypto || w.msCrypto);
      if (c && c.getRandomValues){
        var a = new Uint8Array(6); c.getRandomValues(a);
        return Array.from(a).map(function(b){ return (b%36).toString(36).toUpperCase(); }).join('');
      }
    }catch(e){}
    return Math.random().toString(36).slice(2,8).toUpperCase();
  }
  function money(n){
    try{ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n||0); }
    catch(e){ return '$' + (n||0); }
  }
  function read(k,def){ try{ var v=localStorage.getItem(k); return v==null? def: JSON.parse(v); }catch(e){ return def; } }
  function write(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  function getUser(){ return read(LS_USER,null); }
  function setUser(u){ write(LS_USER,u); }

  // ?ref=XXXX -> candidato
  function captureRefFromURL(){
    var p = new URLSearchParams(location.search);
    var ref = (p.get('ref')||'').trim();
    if (ref) write(LS_REF_CAND, ref);
  }

  // Modal Cuenta (si existe en el HTML)
  function initAccountUI(){
    var modal = $('#accountModal'); if (!modal) return;

    var form   = $('#accountForm', modal);
    var okBox  = $('#accountOk', modal);
    var codeEl = $('#myRefCode', modal);
    var linkEl = $('#myRefLink', modal);
    var copyBt = $('#copyRefCode', modal);

    function open(){ modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
    function close(){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }

    on($('.modal__close', modal), 'click', close);
    on(modal,'click', function(e){ if (e.target.classList.contains('modal__backdrop')) close(); });

    var u = getUser();
    if (u){
      if (form) form.style.display='none';
      if (okBox) okBox.style.display='block';
      if (codeEl) codeEl.textContent = u.code;
      if (linkEl) linkEl.textContent = location.origin + location.pathname + '?ref=' + encodeURIComponent(u.code);
      if (copyBt){
        on(copyBt,'click', function(){
          try{ navigator.clipboard.writeText(u.code); copyBt.textContent='¡Copiado!'; setTimeout(function(){ copyBt.textContent='Copiar'; },1200); }catch(e){}
        });
      }
      return;
    }

    on(form,'submit', function(e){
      e.preventDefault();
      var fd = new FormData(form);
      var name  = (fd.get('name')||'').trim();
      var phone = (fd.get('phone')||'').trim();
      var email = (fd.get('email')||'').trim();
      if(!name || !phone){ alert('Nombre y teléfono son obligatorios.'); return; }

      var base = (slug(name).replace(/-/g,'').slice(0,6).toUpperCase() || 'USER');
      var code = 'VIDA-' + base + '-' + rnd6();

      var user = { name:name, phone:phone, email:email, code:code, createdAt: Date.now() };
      setUser(user);

      if (form) form.style.display='none';
      if (okBox) okBox.style.display='block';
      if (codeEl) codeEl.textContent = code;
      if (linkEl) linkEl.textContent = location.origin + location.pathname + '?ref=' + encodeURIComponent(code);
      if (copyBt){
        on(copyBt,'click', function(){
          try{ navigator.clipboard.writeText(code); copyBt.textContent='¡Copiado!'; setTimeout(function(){ copyBt.textContent='Copiar'; },1200); }catch(e){}
        });
      }
    });

    var skip = new URLSearchParams(location.search).has('noaccount');
    if (!getUser() && !read(LS_ONCE,false) && !skip){ open(); write(LS_ONCE,true); }
  }

  // API global
  window.vidaRef = {
    getUser: getUser,
    getMyCode: function(){ var u=getUser(); return u? u.code : null; },
    getCandidate: function(){ return read(LS_REF_CAND,null); },
    setCandidate: function(code){ write(LS_REF_CAND, code||null); },
    getVidaCash: function(){ return read(LS_VIDACASH,0); },

    computeDiscount: function(subtotal){
      subtotal = Number(subtotal||0);
      var u = getUser();
      var myCode = u && u.code ? u.code : '';
      var used   = !!read(LS_REF_USED,false);
      var inp    = $('#referralInput');
      var typed  = (inp && inp.value ? inp.value.trim() : '');
      var cand   = typed || read(LS_REF_CAND, null);

      if (!cand) return {discount:0, appliedCode:null, reason:'sin_codigo'};
      if (used)  return {discount:0, appliedCode:null, reason:'ya_usado'};
      if (myCode && cand===myCode) return {discount:0, appliedCode:null, reason:'no_autoreferido'};

      var discount = Math.round(subtotal * 0.05);
      return {discount:discount, appliedCode:cand, reason:'ok'};
    },

    buildExtraWhatsInfo: function(subtotal){
      var u = getUser();
      var lines = [];
      if (u){ lines.push('Cliente: ' + u.name + ' (' + u.phone + ')'); lines.push('Mi código: ' + u.code); }
      else  { lines.push('Cliente: invitado'); }

      var d = this.computeDiscount(subtotal);
      if (d.appliedCode && d.discount>0){
        lines.push('Código referido: ' + d.appliedCode);
        lines.push('Descuento aplicado: ' + money(d.discount) + ' (5%)');
        lines.push('Para administración: acreditar VidaCash al dueño del código: ' + money(d.discount));
      } else {
        var inp=$('#referralInput');
        if (inp && inp.value){ lines.push('Código referido ingresado: ' + inp.value + ' (no aplicó: ' + d.reason + ')'); }
      }
      var cash = this.getVidaCash();
      if (cash>0) lines.push('Saldo VidaCash (local): ' + money(cash));
      return lines.join('\n');
    },

    rewardAfterPurchase: function(subtotal){
      var d = this.computeDiscount(subtotal);
      if (d.appliedCode && d.discount>0){
        write(LS_REF_USED, true);
        write(LS_VIDACASH, read(LS_VIDACASH,0) + d.discount);
        write(LS_REF_CAND, null);
      }
    }
  };

  // único init
  document.addEventListener('DOMContentLoaded', function(){
    captureRefFromURL();
    initAccountUI();
    var cand = read(LS_REF_CAND,null);
    var inp = $('#referralInput'); if (cand && inp) inp.value = cand;
  });
})();
