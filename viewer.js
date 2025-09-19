(() => {
  // ===== Utilidades =========================================================
  const $  = (s, c=document) => c.querySelector(s);
  const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));
  const money = (n) => Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
  const slug  = (t) => (t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  const CART_KEY = 'vida_cart_v1';

  // ===== Límite de 30 productos con "Mostrar más" ==========================
  const PAGE_SIZE = 30;
  let currentPage = 1;
  function enforceCap() {
    const grid = $('#grid');
    if (!grid) return;
    const visibles = $$('.card-product', grid).filter(c => c.style.display !== 'none');
    const maxShow  = PAGE_SIZE * currentPage;

    visibles.forEach((el,i) => {
      const show = i < maxShow;
      el.style.visibility   = show ? '' : 'hidden';
      el.style.position     = show ? '' : 'absolute';
      el.style.pointerEvents= show ? '' : 'none';
      el.style.opacity      = show ? '' : '0';
    });

    let btn = $('#loadMore');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'loadMore';
      btn.type = 'button';
      btn.className = 'btn ghost';
      btn.textContent = 'Mostrar más';
      grid.insertAdjacentElement('afterend', btn);
      btn.addEventListener('click', () => { currentPage++; enforceCap(); });
    }
    btn.style.display = (visibles.length > maxShow) ? '' : 'none';
  }

  // Reaplica el tope cuando haya filtros/búsqueda en tu propia página
  const reCap = () => requestAnimationFrame(enforceCap);
  ['input','change','click'].forEach(evt=>{
    document.addEventListener(evt, (e)=>{
      // Heurística: si tocó search, filtros o sort conocidos, recapitula
      if (e.target?.id && /search|minPrice|maxPrice|sort/.test(e.target.id)) { currentPage = 1; reCap(); }
      if (e.target?.closest?.('#filtersForm')) { currentPage = 1; reCap(); }
    }, true);
  });
  document.addEventListener('DOMContentLoaded', enforceCap);

  // ===== Modal (inyectable) =================================================
  function ensureModal(){
    let modal = $('#productModal');
    if (modal) return modal; // si ya tienes uno, se reutiliza

    // Inyección de un modal estándar si el HTML no lo incluye
    const tpl = document.createElement('div');
    tpl.innerHTML = `
    <div class="modal" id="productModal" aria-hidden="true">
      <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <button class="modal__close" aria-label="Cerrar">&times;</button>
        <div class="modal__header">
          <h3 id="modalTitle">Producto</h3>
          <span id="modalPrice" class="modal__price"></span>
        </div>
        <div class="product-gallery">
          <div class="gallery__stage">
            <button class="gallery__nav left" aria-label="Anterior">&#10094;</button>
            <img id="galleryMain" src="" alt="">
            <button class="gallery__nav right" aria-label="Siguiente">&#10095;</button>
          </div>
          <div class="thumbs" id="galleryThumbs"></div>
        </div>
        <div class="modal__body">
          <div class="modal__desc">
            <h4>Descripción</h4>
            <p id="modalDesc">Edición con excelentes materiales y acabado profesional.</p>
            <ul id="modalSpecs" class="specs">
              <li>Tipo: <span data-spec="variant">—</span></li>
              <li>Empaste: <span data-spec="size">—</span></li>
            </ul>
            <div class="pv-actions" style="margin-top:.6rem;display:flex;gap:8px;flex-wrap:wrap">
              <button id="pvFav"  class="btn ghost" type="button" aria-pressed="false">☆ Favorito</button>
              <button id="pvShare" class="btn ghost" type="button">Compartir</button>
            </div>
          </div>
          <div class="modal__buy">
            <label for="qty">Cantidad</label>
            <input id="qty" type="number" min="1" step="1" value="1">
            <div class="modal__actions">
              <a id="whatsBuy" class="btn ghost" target="_blank" rel="noopener">Preguntar por WhatsApp</a>
              <button id="addFromModal" class="btn primary">Agregar al carrito</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal__backdrop"></div>
    </div>`;
    document.body.appendChild(tpl.firstElementChild);
    return $('#productModal');
  }

  // ===== Estado del visor ===================================================
  const state = {
    title:'', price:0, variant:'', size:'', imgs:[], idx:0, slug:''
  };
  let touchStartX = 0, touchActive = false, isZoom = false, pan = {x:0,y:0}, startPan = null;

  // ===== Abrir / Cerrar =====================================================
  function openProductModal({title, price, images, variant, size, desc}){
    const modal = ensureModal();
    const pmTitle = $('#modalTitle', modal);
    const pmPrice = $('#modalPrice', modal);
    const pmDesc  = $('#modalDesc', modal);
    const pmSpecs = $('#modalSpecs', modal);
    const pmQty   = $('#qty', modal);
    const pmWhats = $('#whatsBuy', modal);
    const gMain   = $('#galleryMain', modal);
    const gThumbs = $('#galleryThumbs', modal);
    const favBtn  = $('#pvFav', modal);
    const shareBt = $('#pvShare', modal);

    // Estado
    state.title = title || 'Producto';
    state.price = Number(price||0);
    state.variant = (variant||'').toLowerCase();
    state.size    = (size||'').toLowerCase();
    state.imgs    = (images||[]).length ? images : ['IMAGENES/placeholder.jpg'];
    state.idx     = 0;
    state.slug    = slug(state.title);

    // UI básica
    if (pmTitle) pmTitle.textContent = state.title;
    if (pmPrice) pmPrice.textContent = money(state.price);
    if (pmDesc)  pmDesc.textContent  = desc || 'Edición con excelentes materiales y acabado profesional.';
    pmSpecs?.querySelector('[data-spec="variant"]') && (pmSpecs.querySelector('[data-spec="variant"]').textContent = (state.variant||'—').toUpperCase());
    pmSpecs?.querySelector('[data-spec="size"]') && (pmSpecs.querySelector('[data-spec="size"]').textContent = (state.size||'—').toUpperCase());
    if (pmQty) pmQty.value = '1';

    if (pmWhats){
      pmWhats.href = `https://wa.me/528443288521?text=${encodeURIComponent('Hola, me interesa ' + state.title + ' (' + money(state.price) + ')')}`;
    }

    // Galería
    function render(){
      if (!gMain || !gThumbs) return;
      gMain.src = state.imgs[state.idx];
      gMain.alt = `${state.title} – imagen ${state.idx+1}`;
      gThumbs.innerHTML = '';
      state.imgs.forEach((src,i)=>{
        const t = new Image();
        t.src = src; t.alt = `miniatura ${i+1}`;
        if (i===state.idx) t.classList.add('active');
        t.addEventListener('click', ()=>{ state.idx=i; render(); });
        gThumbs.appendChild(t);
      });
      // Preload sig/ant
      const next = new Image(); next.src = state.imgs[(state.idx+1)%state.imgs.length];
      const prev = new Image(); prev.src = state.imgs[(state.idx-1+state.imgs.length)%state.imgs.length];
    }
    render();

    // Gestos (swipe)
    const stage = $('.gallery__stage', modal);
    stage?.addEventListener('touchstart', (e)=>{ touchActive=true; touchStartX = e.touches[0].clientX; }, {passive:true});
    stage?.addEventListener('touchend', (e)=>{
      if (!touchActive) return; touchActive=false;
      const dx = (e.changedTouches[0].clientX - touchStartX);
      if (Math.abs(dx) > 45){
        state.idx = (state.idx + (dx<0?1:-1) + state.imgs.length) % state.imgs.length; render();
      }
    });

    // Zoom/pan (doble clic / doble toque)
    function resetPan(){ pan.x=0; pan.y=0; gMain.style.transform = isZoom ? `scale(1.8) translate(${pan.x}px, ${pan.y}px)` : ''; }
    stage?.addEventListener('dblclick', ()=>{ isZoom = !isZoom; resetPan(); });
    stage?.addEventListener('pointerdown', (e)=>{
      if (!isZoom) return;
      startPan = {x:e.clientX - pan.x, y:e.clientY - pan.y};
      gMain.setPointerCapture(e.pointerId);
    });
    stage?.addEventListener('pointermove', (e)=>{
      if (!isZoom || !startPan) return;
      pan.x = e.clientX - startPan.x; pan.y = e.clientY - startPan.y;
      gMain.style.transform = `scale(1.8) translate(${pan.x}px, ${pan.y}px)`;
    });
    stage?.addEventListener('pointerup', ()=>{ startPan=null; });

    // Nav
    $('.gallery__nav.left', modal)?.addEventListener('click', ()=>{ state.idx = (state.idx - 1 + state.imgs.length) % state.imgs.length; render(); });
    $('.gallery__nav.right', modal)?.addEventListener('click', ()=>{ state.idx = (state.idx + 1) % state.imgs.length; render(); });

    // Favoritos
    const FAV_KEY = 'vida_favs_v1';
    const readFavs  = () => JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    const writeFavs = (x) => localStorage.setItem(FAV_KEY, JSON.stringify(x));
    const isFav = () => readFavs().some(f => f.slug === state.slug);
    function paintFav(){ if (favBtn){ favBtn.textContent = isFav() ? '★ Favorito' : '☆ Favorito'; favBtn.setAttribute('aria-pressed', isFav().toString()); } }
    favBtn?.addEventListener('click', ()=>{
      const favs = readFavs();
      const i = favs.findIndex(f => f.slug === state.slug);
      if (i>=0) favs.splice(i,1);
      else favs.push({ slug: state.slug, title: state.title, price: state.price, img: state.imgs[0] });
      writeFavs(favs);
      paintFav();
    });
    paintFav();

    // Compartir
    shareBt?.addEventListener('click', async ()=>{
      const url = new URL(location.href);
      url.hash = `p=${state.slug}`;
      try{
        if (navigator.share){
          await navigator.share({ title: state.title, text: `${state.title} – ${money(state.price)}`, url: url.toString() });
        }else{
          await navigator.clipboard?.writeText(url.toString());
          shareBt.textContent = 'Enlace copiado';
          setTimeout(()=> shareBt.textContent = 'Compartir', 1400);
        }
      }catch{}
    });

    // Mostrar modal
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';

    // Cerrar
    const close = ()=>{
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
      document.body.style.overflow='';
      if (location.hash.startsWith('#p=')) history.replaceState('', document.title, location.pathname + location.search);
      isZoom=false; resetPan();
    };
    $('.modal__close', modal)?.addEventListener('click', close, {once:true});
    $('.modal__backdrop', modal)?.addEventListener('click', close, {once:true});
    const escH = (e)=>{ if(e.key==='Escape'){ close(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);

    // Carrito desde modal
    $('#addFromModal', modal)?.addEventListener('click', ()=>{
      const q = Math.max(1, Number($('#qty', modal)?.value || 1));
      addToCart(state.title, state.price, q);
    }, {once:true});

    // Deep-link en URL (#p=slug)
    const url = new URL(location.href);
    url.hash = `p=${state.slug}`;
    history.replaceState('', document.title, url.toString());
  }

  function addToCart(title, price, qty=1){
    const items = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    const i = items.findIndex(x => x.title===title && x.price===price);
    if (i>=0) items[i].qty += qty; else items.push({title, price, qty});
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('vida:cart-updated', {detail:{items}}));
  }

  // ===== Obtener datos desde una tarjeta ====================================
  function productFromCard(card){
    const title = card.dataset.title || card.querySelector('h3')?.textContent?.trim() || 'Producto';
    const price = Number(card.dataset.price || 0);
    const variant= (card.dataset.variant || '').toLowerCase();
    const size   = (card.dataset.size || '').toLowerCase();

    // Imágenes: 1) data-images, 2) todas las <img> dentro de la card
    let images = (card.dataset.images || '')
      .split('|').map(s=>s.trim()).filter(Boolean);
    if (!images.length){
      images = $$('.card-media img, img', card).map(img => img.currentSrc || img.src).filter(Boolean);
    }
    const desc = card.querySelector('.info p')?.textContent?.trim() || '';

    return {title, price, images, variant, size, desc};
  }

  // ===== Delegación de eventos: abrir por click =============================
  function bindOpener(){
    const grid = $('#grid') || document;
    grid.addEventListener('click', (e)=>{
      const btn = e.target.closest?.('.view');
      const img = e.target.closest?.('.card-media img');
      const ttl = e.target.closest?.('.info h3');
      const card = e.target.closest?.('.card-product');
      if (!card) return;
      // Evitar conflicto con "Agregar"
      if (e.target.closest?.('.add-cart')) return;

      if (btn || img || ttl){
        const data = productFromCard(card);
        openProductModal(data);
      }
    });
  }

  // ===== Apertura por hash (#p=slug) ========================================
  function openFromHash(){
    const m = location.hash.match(/#p=([a-z0-9-]+)/i);
    if (!m) return;
    const want = m[1];
    const card = $$('.card-product').find(c => slug(c.dataset.title || c.querySelector('h3')?.textContent||'') === want);
    if (card){
      openProductModal(productFromCard(card));
    }
  }

  // ===== Inicializar ========================================================
  document.addEventListener('DOMContentLoaded', ()=>{
    bindOpener();
    enforceCap();
    openFromHash();
  });
})();
