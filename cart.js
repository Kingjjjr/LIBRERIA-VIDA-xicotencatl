// vida-cart.js (corregido)
(() => {
  const CART_KEY = 'vida_cart_v1';
  const WA_NUMBER = '528443288521'; // cámbialo si hace falta

  const money = (n) =>
    Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  const safeParse = (v) => { try { return JSON.parse(v); } catch { return null; } };
  const read  = () => safeParse(localStorage.getItem(CART_KEY)) || [];
  const write = (items) => { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch(e) { console.error(e); } };

  function refresh(){
    const itemsEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    // acepta cualquiera de los dos contadores que usas en el HTML
    const countEls = [document.getElementById('cartCount'), document.getElementById('cartCountClone')].filter(Boolean);

    if (!itemsEl || !totalEl) return; // pinta sólo si existe el mini-cart

    const items = read();
    itemsEl.innerHTML = '';
    let total = 0;

    if (!items.length){
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'Aún no has agregado productos.';
      itemsEl.appendChild(li);
    } else {
      items.forEach((it, idx) => {
        total += it.price * it.qty;
        const li = document.createElement('li');
        li.className = 'mini-item';
        li.innerHTML = `
          <div class="title">${it.title}</div>
          <div class="qty">
            <button data-idx="${idx}" class="minus" aria-label="Quitar uno">−</button>
            <strong>${it.qty}</strong>
            <button data-idx="${idx}" class="plus" aria-label="Agregar uno">+</button>
          </div>
          <div class="price">${money(it.price * it.qty)}</div>`;
        itemsEl.appendChild(li);
      });
    }

    const count = items.reduce((a,b)=>a + (Number(b.qty)||0), 0);
    countEls.forEach(el => el.textContent = String(count));
    totalEl.textContent = money(total);

    // por si otros módulos quieren reaccionar
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { total, count, items } }));
  }

  function add({title, price, qty=1}){
    if(!title) return false;
    const p = parseFloat(String(price).replace(/[^\d.]/g,'')); if(!isFinite(p) || p<=0) return false;
    const q = Math.max(1, parseInt(qty,10) || 1);
    const items = read();
    const i = items.findIndex(x=>x.title===title && Number(x.price)===p);
    if(i>=0) items[i].qty += q; else items.push({title, price:p, qty:q});
    write(items); refresh();

    const mini = document.querySelector('.mini-cart'); 
    const toggle = document.querySelector('.mini-cart__toggle, #miniCartToggle');
    if(mini && toggle){ mini.classList.add('open'); toggle.setAttribute('aria-expanded','true'); }
    return true;
  }

  function clear(){ localStorage.removeItem(CART_KEY); refresh(); }

  function openWhatsCheckout(){
    const items = read();
    if(!items.length){ alert('Tu carrito está vacío.'); return; }

    const lines = items.map((it,i)=> `${i+1}) ${it.title} x${it.qty} — ${money(it.price*it.qty)}`);
    const total = items.reduce((a,it)=> a + it.price*it.qty, 0);

    // 🔹 Agrega info de referidos si tu módulo vidaRef existe
    const extraRef = (window.vidaRef?.buildExtraWhatsInfo?.() || '').trim();
    if (extraRef) { lines.push('', extraRef); }

    const msg = [
      'Hola, quiero finalizar mi compra:',
      '',
      ...lines,
      '',
      `Total: ${money(total)}`,
      '',
      '¿Me apoyas con el proceso?'
    ].join('\n');

    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener');

    // opcional: recompensa por compra
    window.vidaRef?.rewardAfterPurchase?.();
  }

  // === Delegación +/- dentro del mini-cart ===
  document.addEventListener('click', (e)=>{
    const btn = e.target;
    const idx = btn?.dataset?.idx; 
    if(idx==null) return;
    const items = read();
    if(btn.classList.contains('plus'))  items[idx].qty++;
    if(btn.classList.contains('minus')) items[idx].qty = Math.max(0, items[idx].qty-1);
    write(items.filter(i=>i.qty>0)); refresh();
  });

  // Espera al DOM para enganchar botones
  window.addEventListener('DOMContentLoaded', () => {
    // Toggle del mini-cart
    document.querySelector('.mini-cart__toggle, #miniCartToggle')
      ?.addEventListener('click', ()=>{
        const mini = document.querySelector('.mini-cart'); if(!mini) return;
        const toggle = document.querySelector('.mini-cart__toggle, #miniCartToggle');
        const open = mini.classList.toggle('open');
        toggle?.setAttribute('aria-expanded', String(open));
      });

    // Botón de WhatsApp checkout
    document.getElementById('openCheckout')?.addEventListener('click', openWhatsCheckout);

    refresh();
  });

  // Exponer API
  window.vidaCart = { read, write, add, refresh, clear, money };
})();
document.addEventListener('click', (ev)=>{
  const btn = ev.target.closest('.add-cart');
  if(!btn) return;
  const card = btn.closest('.card-product');
  if(!card) return;
  Cart.add({
    id:   card.dataset.id || (card.dataset.title||'PROD')+'-'+Date.now(),
    title:card.dataset.title || card.querySelector('h3')?.textContent || 'Producto',
    price:Number(card.dataset.price || 0),
    image:card.dataset.image || card.querySelector('img')?.src || ''
  }, 1);
});
(function ensureCheckoutModal(){
  if(document.querySelector('#checkoutModal')) return;
  const tpl = `
  <div id="checkoutModal" class="modal" aria-hidden="true">
    <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle">
      <button id="checkoutClose" class="modal__close" aria-label="Cerrar" type="button">×</button>
      <h3 id="checkoutTitle">Confirmar pedido</h3>
      <form id="checkoutForm" class="form-grid" novalidate>
        <fieldset>
          <legend>Datos del cliente</legend>
          <label>Nombre completo <input name="name" required></label>
          <label>Correo <input name="email" type="email" required></label>
          <label>Teléfono <input name="phone" type="tel" required></label>
        </fieldset>
        <fieldset>
          <legend>Entrega</legend>
          <label><input type="radio" name="delivery" value="envio" checked> Envío a domicilio</label>
          <label><input type="radio" name="delivery" value="pickup"> Recoger en tienda</label>
          <div id="addressGroup">
            <label>C.P. <input name="zip"></label>
            <label>Calle y número <input name="street"></label>
            <label>Interior <input name="int"></label>
            <label>Colonia <input name="neighborhood"></label>
            <label>Ciudad <input name="city"></label>
            <label>Estado <input name="state"></label>
            <label class="col-1">Referencias <textarea name="refs" rows="2"></textarea></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Pago</legend>
          <label><input type="radio" name="payment" value="mercado_pago" checked> Mercado Pago</label>
          <label><input type="radio" name="payment" value="transferencia"> Transferencia</label>
          <label><input type="radio" name="payment" value="contraentrega"> Contraentrega</label>
        </fieldset>
        <fieldset>
          <legend>Notas</legend>
          <label class="col-1">Mensaje (opcional) <textarea name="note" rows="2"></textarea></label>
        </fieldset>
        <div class="row">
          <button class="btn" type="button" id="checkoutCancel">Cancelar</button>
          <button class="btn primary" type="submit" id="checkoutConfirm">Confirmar y enviar por WhatsApp</button>
        </div>
        <small id="checkoutMsg" class="muted" aria-live="polite"></small>
      </form>
    </div>
    <div class="modal__backdrop" aria-hidden="true"></div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', tpl);
})();
window.Cart = window.Cart || (function(){
  let cfg = {
    storageKeys: { cart:'vida_cart_v1', orders:'vida_orders_v1' },
    storeWA: '+528443288521',
    selectors: {}
  };

  function read(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)||'null') ?? fallback; }catch{ return fallback; } }
  function write(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{} }
  function getCart(){
    const items = read(cfg.storageKeys.cart, []) || [];
    let total = 0;
    items.forEach(it => total += Number(it.price||0) * Number(it.qty||1));
    return { items, total };
  }
  function setCart(items){
    write(cfg.storageKeys.cart, items||[]);
    renderMini();
  }
  function add(item, qty){
    qty = Number(qty||1);
    const cart = getCart().items;
    const idx = cart.findIndex(x => x.id === item.id);
    if(idx>=0){ cart[idx].qty = Number(cart[idx].qty||1) + qty; }
    else { cart.push({ id:item.id, title:item.title, price:Number(item.price||0), image:item.image||'', qty }); }
    setCart(cart);
  }
  function remove(id){
    const cart = getCart().items.filter(x => x.id !== id);
    setCart(cart);
  }
  function clear(){ setCart([]); }

  function money(n){ return Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'}); }

  function renderMini(){
    const els = cfg.selectors;
    const uiList = document.querySelector(els.list);
    const uiTotal = document.querySelector(els.total);
    const uiQty = document.querySelector(els.qtyBadge);
    const cart = getCart();
    if(uiList){
      uiList.innerHTML = cart.items.map(it => `
        <li>
          <div><strong>${it.title}</strong> · ${money(it.price)} × ${it.qty}</div>
          <button class="btn danger" data-remove="${it.id}" type="button">Quitar</button>
        </li>`).join('') || '<li>Tu carrito está vacío.</li>';
    }
    if(uiTotal) uiTotal.textContent = money(cart.total);
    if(uiQty) uiQty.textContent = String(cart.items.reduce((s,x)=>s+Number(x.qty||1),0));
  }

  function openPanel(){
    const p = document.querySelector(cfg.selectors.panel);
    const b = document.querySelector(cfg.selectors.btnOpen);
    if(!p) return;
    p.hidden = false;
    if(b) b.setAttribute('aria-expanded','true');
  }
  function closePanel(){
    const p = document.querySelector(cfg.selectors.panel);
    const b = document.querySelector(cfg.selectors.btnOpen);
    if(!p) return;
    p.hidden = true;
    if(b) b.setAttribute('aria-expanded','false');
  }

  function attachUI(){
    const s = cfg.selectors;
    const btnOpen = document.querySelector(s.btnOpen);
    if(btnOpen){
      btnOpen.addEventListener('click', ()=>{
        const p = document.querySelector(s.panel);
        if(!p) return;
        const open = p.hidden !== false;
        open ? openPanel() : closePanel();
      });
    }
    const panel = document.querySelector(s.panel);
    if(panel){
      panel.addEventListener('click', (e)=>{
        const btn = e.target.closest('button[data-remove]');
        if(btn){ remove(btn.getAttribute('data-remove')); }
      });
    }
    const clearBtn = document.querySelector(s.clearBtn);
    if(clearBtn){ clearBtn.addEventListener('click', clear); }

    // abrir checkout
    const openCheckout = document.querySelector(s.openCheckout);
    const modal = document.querySelector(s.checkoutModal);
    const closeBtn = modal && modal.querySelector('#checkoutClose');
    const cancelBtn = modal && modal.querySelector('#checkoutCancel');
    function show(){ modal && modal.setAttribute('aria-hidden','false'); }
    function hide(){ modal && modal.setAttribute('aria-hidden','true'); }
    if(openCheckout && modal){ openCheckout.addEventListener('click', ()=>{
      if(!getCart().items.length){ alert('Tu carrito está vacío.'); return; }
      show();
    });}
    if(closeBtn)  closeBtn.addEventListener('click', hide);
    if(cancelBtn) cancelBtn.addEventListener('click', hide);

    // submit checkout → guardar pedido + WhatsApp
    const form = document.querySelector(s.checkoutForm);
    const msg  = document.querySelector(s.checkoutMsg);
    if(form){
      form.addEventListener('submit', (ev)=>{
        ev.preventDefault();
        const f = form.elements;
        const name  = (f['name'].value||'').trim();
        const email = (f['email'].value||'').trim();
        const phone = (f['phone'].value||'').trim();
        if(!name||!email||!phone){ if(msg) msg.textContent='Completa nombre, correo y teléfono.'; return; }

        const delivery = f['delivery'].value||'envio';
        const payment  = f['payment'].value||'mercado_pago';
        const note     = (f['note'].value||'').trim();
        const addr = (delivery==='envio') ? {
          zip: f['zip'].value, street:f['street'].value, int:f['int'].value,
          neighborhood:f['neighborhood'].value, city:f['city'].value, state:f['state'].value, refs:f['refs'].value
        } : null;

        const cart = getCart();
        const id = 'VIDA-' + Date.now().toString(36).toUpperCase();
        const order = {
          id, createdAt: new Date().toISOString(), status:'pendiente',
          payment, delivery, note,
          customer:{name,email,phone}, address:addr,
          items: cart.items, total: cart.total
        };

        // guardar pedido
        const all = read(cfg.storageKeys.orders, []) || [];
        all.unshift(order);
        write(cfg.storageKeys.orders, all);

        // abrir WhatsApp
        const lines = [];
        lines.push('👋 ¡Hola Librería Vida!');
        lines.push('Quiero confirmar mi pedido:');
        lines.push('', '🧾 Pedido: '+id, '👤 '+name, '📧 '+email, '📱 '+phone, '💳 Pago: '+payment, '🚚 Entrega: '+(delivery==='envio'?'Envío a domicilio':'Recoger en tienda'));
        if(addr){
          const a = [addr.street, addr.int, addr.neighborhood, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
          if(a) lines.push('📦 Dirección: '+a);
          if(addr.refs) lines.push('🧭 Referencias: '+addr.refs);
        }
        if(note) lines.push('📝 Nota: '+note);
        lines.push('', '🛒 Artículos:');
        order.items.forEach((it,i)=>{ lines.push(`${i+1}. ${it.title} — ${it.qty} x ${money(it.price)} = ${money(it.qty*it.price)}`); });
        lines.push('', 'Total: '+money(order.total));
        const wa = 'https://wa.me/'+cfg.storeWA.replace(/\D/g,'')+'?text='+encodeURIComponent(lines.join('\n'));
        window.open(wa,'_blank','noopener');

        if(msg) msg.textContent = '¡Pedido creado! Abriendo WhatsApp…';
        setTimeout(hide, 300);
      });
    }

    // cotizar rápido por WA (sin formulario)
    const waBtn = document.querySelector(s.waQuote);
    if(waBtn){
      waBtn.addEventListener('click', ()=>{
        const c = getCart();
        if(!c.items.length){ alert('Tu carrito está vacío.'); return; }
        const lines = ['Hola, me interesa este pedido:',''];
        c.items.forEach((it,i)=> lines.push(`${i+1}. ${it.title} × ${it.qty}`));
        lines.push('', 'Total: '+money(c.total));
        const wa = 'https://wa.me/'+cfg.storeWA.replace(/\D/g,'')+'?text='+encodeURIComponent(lines.join('\n'));
        window.open(wa, '_blank','noopener');
      });
    }

    renderMini();
  }

  function init(userCfg){
    cfg = Object.assign({}, cfg, userCfg||{});
    attachUI();
  }

  return { init, add, remove, clear, getCart };
})();
