/* =========================================================
   Librería Vida — java.js (tema claro + failsafe)
   ========================================================= */
(function () {
  'use strict';

  // Utils
  if (typeof window.$ !== 'function') window.$ = (s, r=document) => r.querySelector(s);
  if (typeof window.$$ !== 'function') window.$$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const money   = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  const debounce= (fn, ms=160)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const escapeHtml = (s)=> String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  // Storage carrito
  const CART_KEY='vida_cart_v1';
  const readCart = ()=>{ try{ return JSON.parse(localStorage.getItem(CART_KEY)||'[]'); }catch{return [];} };
  const writeCart= (v)=>{ try{ localStorage.setItem(CART_KEY, JSON.stringify(v)); }catch{} };
  const cartQty  = (items)=> items.reduce((a,b)=> a + Number(b.qty||0), 0);
  const cartSum  = (items)=> items.reduce((a,b)=> a + Number(b.price||0)*Number(b.qty||0), 0);

  // Safe runner
  const ERR = [];
  function safe(name, fn){ try{ fn(); }catch(e){ console.error('[LV:'+name+']', e); ERR.push([name,e]); } }

  document.addEventListener('DOMContentLoaded', () => {

    /* ---------------- Menú móvil ---------------- */
    safe('menu', () => {
      const toggles = $$('.menu-toggle, #menuToggle, [data-menu-toggle]');
      const nav = $('#nav') || $('.nav') || $('[data-nav]');
      if (!toggles.length || !nav) return;

      let backdrop = $('.nav-backdrop');
      if (!backdrop){
        backdrop = document.createElement('div');
        backdrop.className = 'nav-backdrop';
        backdrop.setAttribute('hidden','');
        document.body.appendChild(backdrop);
      }
      const isMobile = ()=> matchMedia('(max-width: 860px)').matches;
      const setExpanded = (v)=> toggles.forEach(b=>b.setAttribute('aria-expanded', v?'true':'false'));
      const openMenu = ()=>{
        nav.classList.add('open');
        backdrop.removeAttribute('hidden');
        setExpanded(true);
        const first = nav.querySelector('a,button,[tabindex]:not([tabindex="-1"])');
        first && first.focus({preventScroll:true});
      };
      const closeMenu = ()=>{
        nav.classList.remove('open');
        backdrop.setAttribute('hidden','');
        setExpanded(false);
      };
      const toggleMenu = ()=> nav.classList.contains('open') ? closeMenu() : openMenu();

      toggles.forEach(btn=>{
        btn.setAttribute('aria-expanded','false');
        if (!btn.hasAttribute('aria-controls') && nav.id) btn.setAttribute('aria-controls', nav.id);
        btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleMenu(); }, {passive:false});
      });

      backdrop.addEventListener('click', closeMenu);
      document.addEventListener('click', (e)=>{
        if (!isMobile() || !nav.classList.contains('open')) return;
        const inside = nav.contains(e.target) || toggles.some(b=>b.contains(e.target));
        if (!inside) closeMenu();
      });
      document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && nav.classList.contains('open')) closeMenu(); });
      nav.addEventListener('click', (e)=>{ const a=e.target.closest('a[href]'); if (a && isMobile()) closeMenu(); });
      window.addEventListener('resize', debounce(()=>{ if (!isMobile()) closeMenu(); }, 120));
    });

    /* ---------------- Mini–carrito ---------------- */
    safe('cart', () => {
      const headerCartBtn   = $('#cartToggle') || $('#headerCartBtn');
      const headerCartPanel = $('#miniCartPanel') || $('#headerCartPanel');
      const cartQtyBadge    = $('#cartCount') || $('#cartQty');
      const cartItemsList   = $('#cartItems');
      const cartTotalEl     = $('#cartTotal');
      const cartClearBtn    = $('#cartClear');
      const waBtn           = $('#cartWhats') || $('#waCheckout');

      function renderCart(){
        const items=readCart();
        cartQtyBadge && (cartQtyBadge.textContent = String(cartQty(items)));
        cartItemsList && (cartItemsList.innerHTML = items.length
          ? items.map(it=>`<li class="mini-row" style="display:flex;justify-content:space-between;gap:8px;margin:.4rem 0">
              <span>${escapeHtml(it.title)} × ${it.qty}</span>
              <strong>${money(Number(it.price||0)*Number(it.qty||1))}</strong>
            </li>`).join('')
          : `<li class="muted">Tu carrito está vacío.</li>`);
        cartTotalEl && (cartTotalEl.textContent = money(cartSum(items)));
      }
      function toggleCart(open){
        if (!headerCartPanel || !headerCartBtn) return;
        const willOpen = open ?? headerCartPanel.hasAttribute('hidden');
        if (willOpen) { headerCartPanel.removeAttribute('hidden'); headerCartBtn.setAttribute('aria-expanded','true'); }
        else          { headerCartPanel.setAttribute('hidden','');  headerCartBtn.setAttribute('aria-expanded','false'); }
      }

      headerCartBtn && headerCartBtn.addEventListener('click', () => toggleCart());
      document.addEventListener('click', (e)=>{
        if (!headerCartPanel || headerCartPanel.hasAttribute('hidden')) return;
        const inside = headerCartPanel.contains(e.target) || (headerCartBtn && headerCartBtn.contains(e.target));
        if (!inside) toggleCart(false);
      }, true);
      cartClearBtn && cartClearBtn.addEventListener('click', ()=>{ writeCart([]); renderCart(); });
      waBtn && waBtn.addEventListener('click', ()=>{
        const items=readCart();
        const lines=items.map(it=>`• ${it.title} × ${it.qty} — ${money(it.price*it.qty)}`).join('%0A');
        const total=money(cartSum(items));
        const msg=encodeURIComponent(`Hola, quiero cotizar:%0A${decodeURIComponent(lines)}%0ATotal: ${total}`);
        window.open(`https://wa.me/528443288521?text=${msg}`,'_blank','noopener');
      });

      renderCart();
    });

    /* ---------------- Slider ---------------- */
    safe('slider', () => {
      const slides = $('.slides');
      const imgs   = $$('.slides img');
      const prev   = $('.slider-btn.prev');
      const next   = $('.slider-btn.next');
      const dotsEl = $('.dots');
      if (!slides || !imgs.length) return;

      let slideIdx = 0, timerId = null;
      function go(i){
        slideIdx = (i+imgs.length)%imgs.length;
        slides.style.transform = `translateX(-${slideIdx*100}%)`;
        $$('.dots button').forEach((d,j)=> d.classList.toggle('active', j===slideIdx));
      }
      function start(){ if (timerId) clearInterval(timerId); timerId=setInterval(()=>go(slideIdx+1), 5000); }

      imgs.forEach((_,i)=>{
        const b=document.createElement('button');
        b.setAttribute('aria-label','Ir a slide '+(i+1));
        b.addEventListener('click', ()=>{ go(i); start(); });
        dotsEl && dotsEl.appendChild(b);
      });
      prev && prev.addEventListener('click', ()=>{ go(slideIdx-1); start(); });
      next && next.addEventListener('click', ()=>{ go(slideIdx+1); start(); });
      slides.addEventListener('pointerenter', ()=> clearInterval(timerId));
      slides.addEventListener('pointerleave',  start);
      go(0); start();
    });

    /* ---------------- Filtros + búsqueda ---------------- */
    safe('filters', () => {
      const chips  = $$('.chip');
      const grid   = $('#grid');
      const searchTop  = $('#searchTop');

      let activeFilter = 'all';
      function apply(){
        const q = (searchTop?.value||'').trim().toLowerCase();
        let visible = 0;
        if (!grid) return;
        $$('.card-product', grid).forEach(card=>{
          const title = (card.dataset.title||'').toLowerCase();
          const cat   = (card.className.match(/\b(BIBLIAS|LIBROS|REGALOS|CUADROS)\b/)||['',''])[0] || '';
          const byCat = (activeFilter==='all') || (activeFilter===cat);
          const byTxt = !q || title.includes(q);
          const show  = byCat && byTxt;
          card.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        $('#emptyState')?.toggleAttribute('hidden', visible!==0);
      }

      chips.forEach(ch=>{
        ch.addEventListener('click', ()=>{
          chips.forEach(x=>x.classList.remove('active'));
          ch.classList.add('active');
          activeFilter = ch.dataset.filter || 'all';
          apply();
        });
      });
      searchTop && searchTop.addEventListener('input', debounce(apply, 120));
      apply();
    });

    /* ---------------- Modal producto + galería ---------------- */
    safe('product-modal', () => {
      const productModal = $('#productModal'); if (!productModal) return;
      const pmClose = productModal.querySelector('.modal__close');
      const pmMain  = $('#galleryMain');
      const pmThumbs= $('#galleryThumbs');
      const pmPrev  = $('.gallery__nav.left');
      const pmNext  = $('.gallery__nav.right');
      const pmTitle = $('#modalTitle');
      const pmWhats = $('#whatsBuy');

      let gImgs = [], gIndex = 0;

      function renderStage(){
        if (!pmMain || !gImgs.length) return;
        pmMain.src = gImgs[gIndex] || '';
        pmMain.alt = 'Imagen ' + (gIndex+1);
        $$('.thumbs img', productModal).forEach((t,i)=> t.classList.toggle('active', i===gIndex));
      }
      function openModal(card){
        const title  = card.dataset.title || 'Producto';
        const price  = Number(card.dataset.price || 0);
        gImgs = (card.dataset.images||'').split(/[|,]/).map(s=>s.trim()).filter(Boolean);
        gIndex = 0;

        pmTitle && (pmTitle.textContent = title);
        if (pmThumbs){
          pmThumbs.innerHTML='';
          gImgs.forEach((src,i)=>{ const im=document.createElement('img'); im.src=src; im.alt=`${title} miniatura ${i+1}`;
            im.addEventListener('click', ()=>{ gIndex=i; renderStage(); }); pmThumbs.appendChild(im); });
        }
        renderStage();

        const msg = encodeURIComponent(`Hola, me interesa: ${title}${price?(' - '+money(price)) : ''}\n¿Disponible?`);
        pmWhats && pmWhats.setAttribute('href', `https://wa.me/528443288521?text=${msg}`);

        productModal.classList.add('open');
        productModal.setAttribute('aria-hidden','false');
        document.body.style.overflow='hidden';
      }
      function closeModal(){
        productModal.classList.remove('open');
        productModal.setAttribute('aria-hidden','true');
        document.body.style.overflow='';
      }

      pmPrev && pmPrev.addEventListener('click', ()=>{ if(!gImgs.length) return; gIndex=(gIndex-1+gImgs.length)%gImgs.length; renderStage(); });
      pmNext && pmNext.addEventListener('click', ()=>{ if(!gImgs.length) return; gIndex=(gIndex+1)%gImgs.length; renderStage(); });
      pmClose && pmClose.addEventListener('click', closeModal);
      productModal.querySelector('.modal__backdrop')?.addEventListener('click', closeModal);
      document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && productModal.classList.contains('open')) closeModal(); });

      // Delegación desde las cards
      const grid = $('#grid');
      grid && grid.addEventListener('click', (e)=>{
        const btn = e.target.closest('.view');
        if(!btn) return;
        const card = e.target.closest('.card-product');
        card && openModal(card);
      });
    });

    /* ---------------- Swatches ---------------- */
    safe('swatches', () => {
      document.addEventListener('click', (e)=>{
        const sw = e.target.closest('.sw'); if(!sw) return;
        const wrap = sw.closest('.swashes, .swatches') || sw.parentElement;
        wrap && wrap.querySelectorAll('.sw.active').forEach(b=>b.classList.remove('active'));
        sw.classList.add('active');

        const imgUrl = sw.getAttribute('data-image');
        const pmMain = $('#galleryMain');
        const productModal = $('#productModal');
        if (productModal?.classList.contains('open') && imgUrl && pmMain){
          pmMain.src = imgUrl;
          const label = sw.getAttribute('aria-label') || sw.getAttribute('data-color') || '';
          pmMain.alt = `Variante (color: ${label})`;
        }
      }, {passive:true});
    });

    /* ---------------- Add to cart ---------------- */
    safe('add-to-cart', () => {
      const grid = $('#grid'); if (!grid) return;
      grid.addEventListener('click', (e)=>{
        const add = e.target.closest('.add-cart'); if(!add) return;
        const card = e.target.closest('.card-product'); if(!card) return;

        const id    = card.dataset.id || (card.dataset.title||'').toLowerCase().replace(/\s+/g,'-');
        const title = card.dataset.title || 'Producto';
        const fromBadge = Number((card.querySelector('.badge.price')?.textContent||'').replace(/[^0-9.]/g,'')) || 0;
        const price = Number(card.dataset.price||0) || fromBadge || 0;

        const items = readCart();
        const i = items.findIndex(x=>x.id===id);
        if (i>-1) items[i].qty = Number(items[i].qty||0) + 1;
        else items.push({id, title, price, qty:1});
        writeCart(items);

        // mini render
        $('#cartCount') && ($('#cartCount').textContent = String(cartQty(items)));
        $('#cartItems') && $('#cartItems').insertAdjacentHTML('beforeend',
          `<li class="mini-row" style="display:flex;justify-content:space-between;gap:8px;margin:.4rem 0">
            <span>${escapeHtml(title)} × 1</span><strong>${money(price)}</strong></li>`);
        $('#cartTotal') && ($('#cartTotal').textContent = money(cartSum(items)));
      });
    });

    /* ---------------- Misc ---------------- */
    safe('footer-year', () => { const y=$('#year'); if (y) y.textContent = String(new Date().getFullYear()); });

    if (ERR.length) console.warn('LV init with warnings:', ERR);
  });
})();
