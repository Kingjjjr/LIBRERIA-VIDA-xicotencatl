/* FILE: biblias.js (fixed) */
/* =========================================================================================
   POLYFILLS + HELPERS GLOBALES
   ========================================================================================= */
(function () {
  if (typeof window.$ !== 'function') {
    window.$ = function (s, r) { return (r || document).querySelector(s); };
  }
  if (typeof window.$$ !== 'function') {
    window.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  }
  if (typeof window.money !== 'function') {
    window.money = function (n) { return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }); };
  }
  if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (s) {
      return String(s || '').replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m];
      });
    };
  }
})();

/* =========================================================================================
   APP
   ========================================================================================= */
(function () {
  'use strict';

  /* ========== Storage Keys ========== */
  var CART_KEY  = 'vida_cart_v1',
      VIEW_KEY  = 'vida_bibles_view_v1',
      SORT_KEY  = 'vida_bibles_sort_v1',
      SEARCH_KEY= 'vida_bibles_search_v1';
  var CK_KEY    = 'vida_checkout_info_v1'; // info de checkout

  /* ========== Utils ========== */
  function read(k, fallback) {
    try { var raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function deb(fn, ms) { var t; ms = ms || 160; return function () { clearTimeout(t); var a = arguments; t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function cryptoId() { return 'BIB-' + Math.random().toString(36).slice(2, 7).toUpperCase(); }
  function clearNode(n) { while (n && n.firstChild) { n.removeChild(n.firstChild); } }

  // ÚNICA versión (robusta) de cloneTemplate — con fallback incluso en navegadores viejos
  function cloneTemplate(id) {
    var t = document.getElementById(id);
    if (!t) return null;

    var node = null;

    // Ruta moderna
    if ('content' in t && t.content) {
      node = t.content.firstElementChild ? t.content.firstElementChild.cloneNode(true) : null;
    }

    // Fallback
    if (!node) {
      var wrap = document.createElement('div');
      wrap.innerHTML = (t.innerHTML || '').trim();
      node = wrap.firstElementChild ? wrap.firstElementChild.cloneNode(true) : null;
    }
    return node;
  }

  /* ========== Estado ========== */
  var state = {
    view: read(VIEW_KEY, 'grid'),
    sort: read(SORT_KEY, 'relevance'),
    search: (read(SEARCH_KEY, '') || '').toLowerCase().trim(),
    filters: { variant: [], version: [], size: [], binding: [], min: null, max: null },
    cards: []
  };

  /* =======================================================================================
     CATÁLOGO (desde HTML)
     ======================================================================================= */
  function mapCard(el) {
    var data = {
      el: el,
      id: el.dataset.id || cryptoId(),
      title: el.dataset.title || (el.querySelector('h3') ? el.querySelector('h3').textContent.trim() : 'Producto'),
      price: Number(el.dataset.price || 0),
      variant: (el.dataset.variant || '').toLowerCase(),
      version: (el.dataset.version || '').toLowerCase(),
      size: (el.dataset.size || '').toLowerCase(),
      binding: (el.dataset.binding || '').toLowerCase(),
      images: (el.dataset.images || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean),
      desc: el.dataset.desc || 'Edición con excelentes materiales y acabado profesional.'
    };
    el.dataset.id = data.id;
    var badge = el.querySelector('.badge'); if (badge) badge.textContent = money(data.price);
    return data;
  }

  function readFiltersFromForm() {
    var f = { variant: [], version: [], size: [], binding: [], min: null, max: null };
    ['variant', 'version', 'size', 'binding'].forEach(function (g) {
      $$('#filtersForm input[name="' + g + '"]:checked').forEach(function (chk) {
        f[g].push(String(chk.value || '').toLowerCase());
      });
    });
    var minEl = $('#minPrice'), maxEl = $('#maxPrice');
    var min = minEl && minEl.value !== '' ? Number(minEl.value) : NaN;
    var max = maxEl && maxEl.value !== '' ? Number(maxEl.value) : NaN;
    f.min = isFinite(min) ? min : null;   // acepta 0 como válido
    f.max = isFinite(max) ? max : null;   // acepta 0 como válido
    state.filters = f;
  }

  function sortList(list, mode, q) {
    function by(f) { return list.slice().sort(function (a, b) { var A = f(a), B = f(b); return A > B ? 1 : A < B ? -1 : 0; }); }
    function byN(f) { return list.slice().sort(function (a, b) { return f(a) - f(b); }); }
    switch (mode) {
      case 'price-asc': return byN(function (p) { return p.price; });
      case 'price-desc': return byN(function (p) { return -p.price; });
      case 'title-asc': return by(function (p) { return p.title.toLowerCase(); });
      case 'title-desc': { var s = by(function (p) { return p.title.toLowerCase(); }); return s.reverse(); }
      default:
        if (!q) return list;
        var qq = q.toLowerCase();
        return list.slice().sort(function (a, b) {
          var aT = a.title.toLowerCase(), bT = b.title.toLowerCase();
          var ai = aT.indexOf(qq), bi = bT.indexOf(qq);
          return (ai < 0) - (bi < 0) || ai - bi;
        });
    }
  }

  function applyAll() {
    var q = state.search;
    var f = state.filters;
    var list = state.cards.filter(function (c) {
      var text = (c.title + ' ' + c.version + ' ' + c.variant + ' ' + c.binding).toLowerCase();
      var passText = !q || text.indexOf(q) > -1;
      function pass(arr, val) { return !(arr && arr.length) || arr.indexOf(String(val || '').toLowerCase()) > -1; }
      var okFacets = pass(f.variant, c.variant) && pass(f.version, c.version) && pass(f.size, c.size) && pass(f.binding, c.binding);
      var okPrice = (f.min == null || c.price >= f.min) && (f.max == null || c.price <= f.max);
      return passText && okFacets && okPrice;
    });

    list = sortList(list, state.sort, q);

    var grid = $('#grid'); if (!grid) return;
    var frag = document.createDocumentFragment();
    list.forEach(function (c) { frag.appendChild(c.el); });
    clearNode(grid);
    grid.appendChild(frag);

    var rc = $('#resultsCount'); if (rc) rc.textContent = String(list.length);
  }

  function restoreUI() {
    state.cards = $$('#grid .card-product').map(mapCard);
    var searchVal = read(SEARCH_KEY, '');
    var sEl = $('#search'); if (sEl) sEl.value = searchVal;
    state.search = (searchVal || '').toLowerCase().trim();
    var sortEl = $('#sort'); if (sortEl) sortEl.value = state.sort;
    setView(state.view);
    var rc = $('#resultsCount'); if (rc) rc.textContent = String(state.cards.length);
  }

  function bindSwatches() {
    $$('#grid .card-product').forEach(function (card) {
      var img = card.querySelector('img');
      var sws = $$('.sw', card);
      if (!sws.length) return;
      sws.forEach(function (b, ix) {
        if (ix === 0) { b.dataset.selected = 'true'; card.dataset.selectedColor = b.dataset.color || ''; }
        b.addEventListener('click', function () {
          sws.forEach(function (x) { x.dataset.selected = 'false'; });
          b.dataset.selected = 'true';
          var src = b.dataset.image; if (src && img) img.src = src;
          card.dataset.selectedColor = b.dataset.color || '';
        });
      });
    });
  }

  /* =======================================================================================
     Vista grid/lista y toolbar
     ======================================================================================= */
  function setView(v) {
    state.view = v === 'list' ? 'list' : 'grid';
    write(VIEW_KEY, state.view);
    var grid = $('#grid');
    if (grid) { grid.classList.toggle('list', state.view === 'list'); }
    var gv = $('#gridView'), lv = $('#listView');
    if (gv) { gv.classList.toggle('active', state.view === 'grid'); gv.setAttribute('aria-pressed', String(state.view === 'grid')); }
    if (lv) { lv.classList.toggle('active', state.view === 'list'); lv.setAttribute('aria-pressed', String(state.view === 'list')); }
  }
  function toolbarInit() {
    var sEl = $('#search');
    if (sEl) {
      sEl.addEventListener('input', deb(function (e) {
        var val = (e && e.target) ? (e.target.value || '') : '';
        state.search = val.toLowerCase().trim();
        write(SEARCH_KEY, val);
        applyAll();
      }, 140));
    }
    var sort = $('#sort');
    if (sort) {
      sort.addEventListener('change', function (e) {
        state.sort = e.target ? e.target.value : 'relevance';
        write(SORT_KEY, state.sort); applyAll();
      });
    }
    var gv = $('#gridView'), lv = $('#listView');
    if (gv) gv.addEventListener('click', function () { setView('grid'); });
    if (lv) lv.addEventListener('click', function () { setView('list'); });
  }

  function filtersDrawerInit() {
    var openBtn = $('#openFilters'), closeBtn = $('#closeFilters'), drawer = $('#filtersDrawer'), backdrop = $('#filtersBackdrop');
    function open() { if (drawer) drawer.setAttribute('aria-hidden', 'false'); if (backdrop) { backdrop.hidden = false; backdrop.style.display = 'block'; } if (openBtn) openBtn.setAttribute('aria-expanded', 'true'); }
    function close() { if (drawer) drawer.setAttribute('aria-hidden', 'true'); if (backdrop) { backdrop.hidden = true; backdrop.style.display = 'none'; } if (openBtn) openBtn.setAttribute('aria-expanded', 'false'); }
    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    var apply = $('#applyFilters'), clear = $('#clearFilters');
    if (apply) apply.addEventListener('click', function () { readFiltersFromForm(); applyAll(); close(); });
    if (clear) clear.addEventListener('click', function () {
      $$('#filtersForm input[type="checkbox"]').forEach(function (chk) { chk.checked = false; });
      var mi = $('#minPrice'), ma = $('#maxPrice'); if (mi) mi.value = ''; if (ma) ma.value = '';
      readFiltersFromForm(); applyAll();
    });
  }

  /* =======================================================================================
     Modal Producto (fullscreen) — usa template #fsModalTmpl
     ======================================================================================= */
  function renderStockAndPromoFromDataset(dataset, root) {
    var promoWrap = root.querySelector('#modalPromo');
    var promoTxt = root.querySelector('.promo-text');
    var stockWrap = root.querySelector('#modalStock');
    var stockTxt = root.querySelector('.stock-text');

    var price = Number(dataset.price || 0);
    var compareAt = Number(dataset.compareat || dataset.compareAt || 0);
    var offerText = dataset.offertext || dataset.offerText || '';

    if (promoWrap && promoTxt) {
      if (compareAt > price) {
        var pct = Math.round((1 - (price / compareAt)) * 100);
        promoTxt.textContent = 'Antes: ' + money(compareAt) + ' • ' + pct + '% OFF';
        promoWrap.hidden = false;
      } else if (offerText) {
        promoTxt.textContent = offerText;
        promoWrap.hidden = false;
      } else {
        promoWrap.hidden = true;
      }
    }

    var stock = isFinite(Number(dataset.stock)) ? Number(dataset.stock) : Infinity;
    if (stockWrap && stockTxt) {
      stockWrap.classList.remove('low', 'out');
      if (stock === 0) { stockTxt.textContent = 'Agotado'; stockWrap.classList.add('out'); }
      else if (stock <= 5) { stockTxt.textContent = '¡Quedan ' + stock + ' pzs!'; stockWrap.classList.add('low'); }
      else if (stock === Infinity) { stockTxt.textContent = 'En stock'; }
      else { stockTxt.textContent = 'En stock (' + stock + ')'; }
    }
  }

  function openProductFSModal(card) {
    if (!card) return;
    var ds = card.dataset;
    var title = ds.title || (card.querySelector('h3') ? card.querySelector('h3').textContent : 'Producto');
    var price = Number(ds.price || 0);
    var compareAt = Number(ds.compareat || ds.compareAt || 0);
    var images = (ds.images || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    var fallbackImg = (card.querySelector('img') ? card.querySelector('img').getAttribute('src') : '');
    if (!images.length && fallbackImg) images.push(fallbackImg);

    var root = cloneTemplate('fsModalTmpl');
    if (!root) { alert('Falta template: #fsModalTmpl'); return; }
    document.body.appendChild(root);

    var modal = root.querySelector('.fs-modal');
    if (modal) modal.setAttribute('aria-label', title);

    var titleEl = root.querySelector('.fs-title'); if (titleEl) titleEl.textContent = title;
    var nowEl = root.querySelector('.fs-price .now'); if (nowEl) nowEl.textContent = money(price);
    var beforeEl = root.querySelector('.fs-price .before');
    if (beforeEl) { beforeEl.textContent = money(compareAt); beforeEl.style.display = compareAt > price ? '' : 'none'; }

    var stage = root.querySelector('.fs-stage');
    var nav = root.querySelector('.fs-nav');
    var idx = 0;
    var imgs = images.length ? images.slice() : (fallbackImg ? [fallbackImg] : []);

    function renderStage() {
      if (!stage) return;
      clearNode(stage);
      var img = document.createElement('img');
      img.alt = title;
      img.src = imgs[idx] || imgs[0] || '';
      stage.appendChild(img);
      if (nav) {
        $$('.fs-thumb', nav).forEach(function (t, i) { t.setAttribute('aria-current', String(i === idx)); });
      }
    }
    function renderNav() {
      if (!nav) return;
      clearNode(nav);
      imgs.forEach(function (src, i) {
        var btn = document.createElement('button');
        btn.className = 'fs-thumb';
        btn.setAttribute('data-i', String(i));
        btn.setAttribute('aria-current', String(i === 0));
        var img = document.createElement('img');
        img.src = src;
        img.alt = 'Vista ' + (i + 1);
        btn.appendChild(img);
        btn.addEventListener('click', function () {
          idx = i; renderStage();
        });
        nav.appendChild(btn);
      });
    }
    renderNav(); renderStage();

    var left = root.querySelector('.fs-arrow.left');
    var right = root.querySelector('.fs-arrow.right');
    if (left) left.addEventListener('click', function () { idx = (idx - 1 + imgs.length) % imgs.length; renderStage(); });
    if (right) right.addEventListener('click', function () { idx = (idx + 1) % imgs.length; renderStage(); });

    var sx = 0, sy = 0;
    if (stage) {
      stage.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      stage.addEventListener('touchend', function (e) {
        var dx = (e.changedTouches[0].clientX - sx), dy = (e.changedTouches[0].clientY - sy);
        if (Math.abs(dx) > 40 && Math.abs(dy) < 60) { idx = dx < 0 ? (idx + 1) % imgs.length : (idx - 1 + imgs.length) % imgs.length; renderStage(); }
      }, { passive: true });
    }

    function close() { root.parentNode && root.parentNode.removeChild(root); }
    var xbtn = root.querySelector('.fs-close'); if (xbtn) xbtn.addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });

    // Swatches en modal
    var swSrc = card.querySelector('.swatches') || card.querySelector('.color-inline');
    var swDst = root.querySelector('#fsSwatches');
    if (swSrc && swDst) {
      clearNode(swDst);
      $$('.sw', swSrc).forEach(function (sw, i) {
        var clone = sw.cloneNode(true);
        clone.removeAttribute('style');
        clone.classList.add('sw');
        clone.setAttribute('role', 'radio');
        clone.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
        clone.addEventListener('click', function () {
          $$('.fs-swatches .sw', root).forEach(function (x) { x.setAttribute('aria-checked', 'false'); });
          clone.setAttribute('aria-checked', 'true');
          var imgUrl = clone.dataset.image;
          if (imgUrl) {
            var found = imgs.indexOf(imgUrl);
            if (found > -1) { idx = found; } else { imgs[idx] = imgUrl; }
            renderStage();
          }
        });
        swDst.appendChild(clone);
      });
    } else if (swDst && swDst.parentNode) { swDst.parentNode.removeChild(swDst); }

    renderStockAndPromoFromDataset(ds, root);

    var fsAdd = root.querySelector('#fsAdd'), fsBuy = root.querySelector('#fsBuy');
    if (fsAdd) fsAdd.addEventListener('click', function () {
      window.dispatchEvent(new CustomEvent('vida:add-to-cart', {
        detail: {
          id: ds.id, name: title, price: Number(ds.price || 0), qty: 1, color: card.dataset.selectedColor || 'Único'
        }
      }));
    });
    if (fsBuy) fsBuy.addEventListener('click', function () {
      window.dispatchEvent(new CustomEvent('vida:add-to-cart', {
        detail: {
          id: ds.id, name: title, price: Number(ds.price || 0), qty: 1, color: card.dataset.selectedColor || 'Único'
        }
      }));
      var w = window.open('https://wa.me/528443288521?text=' + encodeURIComponent('Hola 👋, quiero comprar ' + title + ' (' + money(price) + ')'), '_blank', 'noopener');
      if (!w) alert('Activa las ventanas emergentes para continuar con WhatsApp.');
      close();
    });
  }

  /* =======================================================================================
     Carrito (mini) — UNA SOLA FUENTE DE VERDAD
     ======================================================================================= */
  function readCart() { return read(CART_KEY, []); }
  function writeCart(it) {
    write(CART_KEY, it);
    try { window.dispatchEvent(new Event('vida:cart-updated')); } catch (e) { }
  }
  function addToCart(o) {
    var title = o.title, price = Number(o.price || 0), qty = Number(o.qty || 1), color = o.color || 'Único';
    var it = readCart(); var i = -1;
    for (var k = 0; k < it.length; k++) {
      if (it[k].title === title && Number(it[k].price) === price && String(it[k].color || 'Único') === color) { i = k; break; }
    }
    if (i >= 0) it[i].qty += qty; else it.push({ title: title, price: price, qty: qty, color: color });
    writeCart(it);
  }
  function renderCart() {
    var it = readCart();
    var qty = it.reduce(function (a, b) { return a + Number(b.qty || 0); }, 0);
    var total = it.reduce(function (a, b) { return a + b.price * b.qty; }, 0);

    // Totales visibles
    var ct = $('#cartTotal'); if (ct) ct.textContent = money(total);
    var list = $('#cartItems'); if (list) {
      clearNode(list);
      it.forEach(function (x, ix) {
        var li = document.createElement('li');

        var left = document.createElement('div');
        var strong = document.createElement('strong'); strong.textContent = x.title;
        left.appendChild(strong);
        if (x.color) {
          var sm = document.createElement('small'); sm.style.opacity = '.75'; sm.textContent = ' (' + x.color + ')';
          left.appendChild(document.createTextNode(' '));
          left.appendChild(sm);
        }
        var muted = document.createElement('div'); muted.style.opacity = '.8';
        muted.textContent = money(x.price) + ' × ' + x.qty;
        left.appendChild(muted);

        var right = document.createElement('div'); right.style.display = 'flex'; right.style.gap = '6px'; right.style.alignItems = 'center';
        function mkBtn(txt, cls, act) {
          var b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = txt; b.dataset.act = act; b.dataset.ix = String(ix); return b;
        }
        right.appendChild(mkBtn('−', 'ghost', 'minus'));
        right.appendChild(mkBtn('+', 'ghost', 'plus'));
        right.appendChild(mkBtn('✕', 'danger', 'del'));

        li.appendChild(left); li.appendChild(right);
        list.appendChild(li);
      });
    }

    // Actualiza FAB inmediatamente (además de eventos)
    var fabBadge = $('#cartFabCount'); if (fabBadge) fabBadge.textContent = String(qty);

    try { window.dispatchEvent(new Event('vida:cart-updated')); } catch (e) { }
  }

  // Abre el drawer del carrito (usa window.openCartDrawer si existe)
  function openMiniCart() {
    if (typeof window.openCartDrawer === 'function') { window.openCartDrawer(); return; }
    // fallback mínimo con clases del drawer
    var panel = document.querySelector('.mini-cart__panel');
    var backdrop = document.getElementById('cartBackdrop');
    if (panel) panel.classList.add('is-open');
    if (backdrop){ backdrop.hidden = false; void backdrop.offsetWidth; backdrop.classList.add('is-open'); }
    document.documentElement.style.overflow = 'hidden';
  }

  function bindCart() {
    // + / − / eliminar
    var items = $('#cartItems');
    if (items) items.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      var act = b.dataset.act, ix = Number(b.dataset.ix);
      var it = readCart(); if (!it[ix]) return;
      if (act === 'plus') it[ix].qty++;
      if (act === 'minus') it[ix].qty = Math.max(0, it[ix].qty - 1);
      if (act === 'del') it.splice(ix, 1);
      writeCart(it.filter(function (x) { return x.qty > 0; })); renderCart();
    });

    var clr = $('#cartClear'); if (clr) clr.addEventListener('click', function () { writeCart([]); renderCart(); });

    // Checkout — SIEMPRE formulario
    var chk = $('#openCheckout');
    function openCheckoutFromCart() {
      var it = readCart();
      if (!it.length) { alert('Tu carrito está vacío'); return; }
      openCheckoutModal(it);
    }
    if (chk) chk.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); openCheckoutFromCart(); });

    // Agregar desde modal/landing
    window.addEventListener('vida:add-to-cart', function (ev) {
      var d = (ev && ev.detail) ? ev.detail : {};
      addToCart({ title: d.name || d.title, price: Number(d.price || 0), qty: Number(d.qty || 1), color: d.color || 'Único' });
      renderCart(); openMiniCart();
    });
  }

  /* =======================================================================================
     Música (FAB flotante)
     ======================================================================================= */
  function musicInit() {
    var btn = $('#musicToggle');
    var panel = $('#musicPanel');
    var list = $('#musicList');
    var player = $('#musicPlayer');
    if (!btn || !panel) return;

    btn.addEventListener('click', function () {
      var open = !panel.hasAttribute('hidden');
      if (open) {
        panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
      } else {
        panel.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        if (list && player) {
          var url = list.value;
          if (url) {
            player.src = url;
            var p = player.play(); if (p && p.catch) { p.catch(function () { }); }
          }
        }
      }
    });

    function loadTrack() {
      if (!list || !player) return;
      var url = list.value;
      if (url) {
        player.src = url;
        var p = player.play(); if (p && p.catch) { p.catch(function () { }); }
      }
    }
    if (list) list.addEventListener('change', loadTrack);
  }

  /* =======================================================================================
     Menú móvil
     ======================================================================================= */
  function menuInit() {
    var btn = $('.menu-toggle'), nav = $('.nav');
    if (btn) btn.addEventListener('click', function () {
      var open = nav && nav.style.display === 'block';
      if (nav) nav.style.display = open ? '' : 'block';
      btn.setAttribute('aria-expanded', String(!open));
    });
  }

  /* =======================================================================================
     Delegación de clics (ver / agregar)
     ======================================================================================= */
  function clicksDelegation() {
    document.addEventListener('click', function (e) {
      var addBtn = e.target.closest ? e.target.closest('.add-cart') : null;
      var viewBtn = e.target.closest ? e.target.closest('.view') : null;
      var card = e.target.closest ? e.target.closest('.card-product') : null;
      if (viewBtn && card) {
        if (e.preventDefault) e.preventDefault();
        openProductFSModal(card);
        return;
      }
      if (addBtn && card) {
        var data = state.cards.find(function (x) { return x.el === card; }) || mapCard(card);
        var selected = card.querySelector('.sw[data-selected="true"]');
        var color = (card.dataset && card.dataset.selectedColor) ? card.dataset.selectedColor : (selected ? selected.dataset.color : 'Único');
        addToCart({ title: data.title, price: data.price, qty: 1, color: color });
        renderCart(); openMiniCart();
        return;
      }
    });
  }

  /* =======================================================================================
     Checkout Modal — usa template #coModalTmpl (con envío y total)
     ======================================================================================= */
  function readCK() { try { return JSON.parse(localStorage.getItem(CK_KEY) || '{}'); } catch (e) { return {}; } }
  function writeCK(data) {
    try {
      var prev = readCK();
      localStorage.setItem(CK_KEY, JSON.stringify(Object.assign({}, prev, data || {})));
    } catch (e) { }
  }

  window.openCheckoutModal = function (cartItems) {
    var subtotal = cartItems.reduce(function (a, b) { return a + (Number(b.price) || 0) * (Number(b.qty) || 0); }, 0);

    var root = cloneTemplate('coModalTmpl');
    if (!root) { alert('Falta template: #coModalTmpl'); return; }
    document.body.appendChild(root);

    var saved = readCK();

    // Campos cliente
    function setVal(sel, val) { var el = root.querySelector(sel); if (el) { el.value = val || ''; } }
    setVal('#coName', saved.name);
    setVal('#coPhone', saved.phone);
    setVal('#coEmail', saved.email);
    setVal('#coStreet', saved.street);
    setVal('#coCol', saved.col);
    setVal('#coCP', saved.cp);
    setVal('#coCity', saved.city);
    setVal('#coState', saved.state);
    setVal('#coNotes', saved.notes);
    var terms = root.querySelector('#coTerms'); if (terms) terms.checked = !!saved.terms;

    // Resumen
    var sum = root.querySelector('#coSummary'); if (sum) { clearNode(sum); }
    cartItems.forEach(function (x) {
      var row = document.createElement('div'); row.className = 'co-item';
      var left = document.createElement('span');
      left.textContent = (x.color && x.color !== 'Único') ? (x.title + ' (' + x.color + ') × ' + x.qty) : (x.title + ' × ' + x.qty);
      var right = document.createElement('span'); right.textContent = money(x.price * x.qty);
      row.appendChild(left); row.appendChild(right);
      if (sum) sum.appendChild(row);
    });

    // Envío + total
    var SHIP_COST = 99, FREE_AT = 999;
    var envio = subtotal >= FREE_AT ? 0 : SHIP_COST;
    var shipRow = root.querySelector('#coShipRow');
    var shipVal = root.querySelector('#coShipVal');
    if (shipRow && shipVal) {
      shipRow.style.display = 'flex';
      shipVal.textContent = envio ? money(envio) : 'Gratis';
    }
    var totEl = root.querySelector('#coTotal'); if (totEl) totEl.textContent = money(subtotal + envio);

    // Cerrar
    function close() { if (root && root.parentNode) root.parentNode.removeChild(root); }
    var xbtn = root.querySelector('.co-close'); if (xbtn) xbtn.addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });

    // Helpers
    function val(id) { var el = root.querySelector('#' + id); return (el && el.value || '').trim(); }
    function setErr(id, on) {
      var input = root.querySelector('#' + id);
      var field = input ? input.closest('.co-field') : null;
      if (!field) return;
      if (on) field.classList.add('error'); else field.classList.remove('error');
    }
    function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
    function isPhone(s) { return /^\d{10}$/.test(s.replace(/\D/g, '')); }
    function isCP(s) { return /^\d{5}$/.test(s); }

    // Guardado en vivo
    ['coName', 'coPhone', 'coEmail', 'coStreet', 'coCol', 'coCP', 'coCity', 'coState', 'coNotes'].forEach(function (id) {
      var el = root.querySelector('#' + id);
      if (el) el.addEventListener('input', function () {
        writeCK({
          name: val('coName'), phone: val('coPhone').replace(/\D/g, ''),
          email: val('coEmail'), street: val('coStreet'), col: val('coCol'),
          cp: val('coCP'), city: val('coCity'), state: val('coState'),
          notes: val('coNotes')
        });
      });
    });
    var termsEl = root.querySelector('#coTerms');
    if (termsEl) termsEl.addEventListener('change', function (e) { writeCK({ terms: !!e.target.checked }); });

    // Cancelar
    var cancel = root.querySelector('#coCancel'); if (cancel) cancel.addEventListener('click', close);

    // Enviar
    var submit = root.querySelector('#coSubmit');
    if (submit) submit.addEventListener('click', function () {
      var ok = true;
      var name = val('coName'); setErr('coName', !name); ok = ok && !!name;
      var phone = val('coPhone').replace(/\D/g, ''); setErr('coPhone', !isPhone(phone)); ok = ok && isPhone(phone);
      var email = val('coEmail'); setErr('coEmail', !isEmail(email)); ok = ok && isEmail(email);
      var street = val('coStreet'); setErr('coStreet', !street); ok = ok && !!street;
      var col = val('coCol'); setErr('coCol', !col); ok = ok && !!col;
      var cp = val('coCP'); setErr('coCP', !isCP(cp)); ok = ok && isCP(cp);
      var city = val('coCity'); setErr('coCity', !city); ok = ok && !!city;
      var state = val('coState'); setErr('coState', !state); ok = ok && !!state;
      var termsOK = termsEl ? termsEl.checked : false; if (!termsOK) { alert('Debes aceptar los Términos y el Aviso de Privacidad.'); ok = false; }
      if (!ok) return;

      writeCK({ name: name, phone: phone, email: email, street: street, col: col, cp: cp, city: city, state: state, notes: val('coNotes'), terms: true });

      var lines = cartItems.map(function (x) {
        var label = x.color && x.color !== 'Único' ? (x.title + ' (' + x.color + ')') : x.title;
        return '• ' + label + ' × ' + x.qty + ' = ' + money(x.price * x.qty);
      }).join('\n');

      var msg = 'Hola 👋, quiero finalizar este pedido:\n' +
        lines + '\nSubtotal: ' + money(subtotal) +
        '\nEnvío: ' + (envio ? money(envio) : 'Gratis') +
        '\nTotal: ' + money(subtotal + envio) +
        '\n\nDatos de envío/contacto:\n' +
        'Nombre: ' + name + '\n' +
        'Tel: ' + phone + '\n' +
        'Correo: ' + email + '\n' +
        'Dirección: ' + street + ', Col. ' + col + ', C.P. ' + cp + ', ' + city + ', ' + state + '\n' +
        (val('coNotes') ? 'Notas: ' + val('coNotes') + '\n' : '') +
        '\nConfirmo que acepto Términos y Aviso de Privacidad.';

      var w = window.open('https://wa.me/528443288521?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      if (!w) alert('Activa las ventanas emergentes para continuar con WhatsApp.');
      close();
    });
  };

  /* =======================================================================================
     FAB del carrito (contador flotante) — escucha vida:cart-updated
     ======================================================================================= */
  (function () {
    function getQty() {
      try {
        var it = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        return it.reduce(function (a, b) { return a + (Number(b.qty) || 0); }, 0);
      } catch (e) { return 0; }
    }
    function updateBadge() {
      var n = getQty();
      var b = document.getElementById('cartFabCount');
      if (b) b.textContent = String(n);
    }
    document.addEventListener('DOMContentLoaded', function () {
      updateBadge();

      var fab = document.getElementById('cartFab');
      if (fab) fab.addEventListener('click', function () {
        if (typeof window.openCartDrawer === 'function') {
          var panel = document.querySelector('.mini-cart__panel');
          var open = panel && panel.classList.contains('is-open');
          if (open && typeof window.closeCartDrawer === 'function') window.closeCartDrawer();
          else window.openCartDrawer();
        } else {
          openMiniCart();
        }
      });

      window.addEventListener('storage', function (e) {
        if (e.key === CART_KEY) updateBadge();
      });
      document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.add-cart')) {
          setTimeout(updateBadge, 50);
        }
      });
      window.addEventListener('vida:cart-updated', updateBadge);
    });
  })();

  /* =======================================================================================
     Inicio
     ======================================================================================= */
  document.addEventListener('DOMContentLoaded', function () {
    restoreUI();
    bindSwatches();
    toolbarInit();
    filtersDrawerInit();
    bindCart();
    renderCart();
    applyAll();
    musicInit();
    menuInit();
    clicksDelegation();
  });

  /* Exponer algunas utilidades por compatibilidad externa */
  window.readCart = window.readCart || readCart;
  window.writeCart = writeCart;
  window.renderCart = renderCart;

})();

/* =========================================================
   Checkout unificado + Drawer del carrito (expuesto en window)
========================================================= */
(function(){
  'use strict';

  var CART_KEY   = 'vida_cart_v1';
  var ORDERS_KEY = 'vida_orders_v1';
  var STORE_WA   = '+528443288521';

  function readLS(key, fallback){
    try{ var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : (fallback||null); }
    catch(e){ return (fallback||null); }
  }
  function writeLS(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
  function money(n){ return Number(n || 0).toLocaleString('es-MX', { style:'currency', currency:'MXN' }); }
  function uid(){ return 'VIDA-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7).toUpperCase(); }

  function getCart(){
    var items = readLS(CART_KEY, []) || [];
    var total = 0;
    items.forEach(function(it){
      var qty = Number(it.qty || 1);
      var price = Number(it.price || it.precio || 0);
      total += price * qty;
    });
    return { items: items, total: total };
  }

  // ==== Drawer del carrito (expuesto a window) ====
  function openCartDrawer() {
    var panel = document.querySelector('.mini-cart__panel');
    var backdrop = document.getElementById('cartBackdrop');
    if (!panel) return;

    panel.classList.add('is-open');
    if (backdrop) {
      backdrop.hidden = false;
      void backdrop.offsetWidth;
      backdrop.classList.add('is-open');
    }
    document.documentElement.style.overflow = 'hidden';
  }
  function closeCartDrawer() {
    var panel = document.querySelector('.mini-cart__panel');
    var backdrop = document.getElementById('cartBackdrop');
    if (!panel) return;

    panel.classList.remove('is-open');
    if (backdrop) {
      backdrop.classList.remove('is-open');
      setTimeout(function(){ backdrop.hidden = true; }, 200);
    }
    document.documentElement.style.overflow = '';
  }
  // Exponer global
  window.openCartDrawer = openCartDrawer;
  window.closeCartDrawer = closeCartDrawer;

  // Backdrop y ESC cierran
  document.addEventListener('DOMContentLoaded', function(){
    var backdrop = document.getElementById('cartBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeCartDrawer);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') closeCartDrawer();
    });
  });

  // ======= Checkout a Admin + WhatsApp =======
  var checkoutForm   = document.getElementById('checkoutForm') || null;
  var checkoutMsg    = document.getElementById('checkoutMsg')  || null;
  var waCheckoutBtn  = document.getElementById('waCheckout')    || null;

  function buildWaText(order){
    var lines = [];
    lines.push('👋 ¡Hola Librería Vida!');
    lines.push('Quiero confirmar mi pedido:');
    lines.push('');
    lines.push('🧾 Pedido: ' + order.id);
    lines.push('👤 ' + order.customer.name);
    lines.push('📧 ' + order.customer.email);
    lines.push('📱 ' + order.customer.phone);
    lines.push('💳 Pago: ' + order.payment);
    lines.push('🚚 Entrega: ' + (order.delivery === 'envio' ? 'Envío a domicilio' : 'Recoger en tienda'));
    if(order.delivery === 'envio'){
      var a = order.address || {};
      lines.push('📦 Dirección: ' + [a.street, a.int, a.neighborhood, a.city, a.state, a.zip].filter(Boolean).join(', '));
      if(a.refs) lines.push('🧭 Referencias: ' + a.refs);
    }
    if(order.note){ lines.push('📝 Nota: ' + order.note); }
    lines.push('');
    lines.push('🛒 Artículos:');
    order.items.forEach(function(it, idx){
      var line = (idx+1) + '. ' + (it.title || it.name || it.titulo || 'Producto');
      var qty = Number(it.qty || 1);
      var price = Number(it.price || it.precio || 0);
      line += ' — ' + qty + ' x ' + money(price) + ' = ' + money(qty*price);
      lines.push(line);
    });
    lines.push('');
    lines.push('Total: ' + money(order.total));
    return lines.join('\n');
  }

  function createOrder(payload){
    var orders = readLS(ORDERS_KEY, []) || [];
    orders.unshift(payload);
    writeLS(ORDERS_KEY, orders);
  }

  if(checkoutForm){
    checkoutForm.addEventListener('submit', function(ev){
      ev.preventDefault();

      var cart = getCart();
      if(!cart.items.length){
        if (checkoutMsg) checkoutMsg.textContent = 'Tu carrito está vacío.';
        return;
      }

      var f = checkoutForm.elements;
      var name  = (f['name']?.value || '').trim();
      var email = (f['email']?.value || '').trim();
      var phone = (f['phone']?.value || '').trim();
      var delivery = (f['delivery']?.value || 'envio');
      var payment  = (f['payment']?.value || 'mercado_pago');
      var note     = (f['note']?.value || '').trim();

      if(!name || !email || !phone){
        if (checkoutMsg) checkoutMsg.textContent = 'Completa nombre, correo y teléfono.';
        return;
      }

      var address = null;
      if(delivery === 'envio'){
        address = {
          zip: (f['zip']?.value || '').trim(),
          street: (f['street']?.value || '').trim(),
          int: (f['int']?.value || '').trim(),
          neighborhood: (f['neighborhood']?.value || '').trim(),
          city: (f['city']?.value || '').trim(),
          state: (f['state']?.value || '').trim(),
          refs: (f['refs']?.value || '').trim()
        };
      }

      var order = {
        id: uid(),
        createdAt: new Date().toISOString(),
        status: 'pendiente',
        payment: payment,
        delivery: delivery,
        customer: { name: name, email: email, phone: phone },
        address: address,
        note: note,
        items: cart.items,
        total: cart.total,
      };

      // 1) Guardar pedido para Admin
      createOrder(order);

      // 2) Abrir WhatsApp con resumen
      var text = buildWaText(order);
      var waUrl = 'https://wa.me/' + STORE_WA.replace(/\D/g,'') + '?text=' + encodeURIComponent(text);
      window.open(waUrl, '_blank', 'noopener');

      if (checkoutMsg) checkoutMsg.textContent = '¡Pedido creado! Te abrimos WhatsApp con el resumen.';
    });
  }

  // Atajo: "Cotizar WhatsApp" (sin formulario)
  if(waCheckoutBtn){
    waCheckoutBtn.addEventListener('click', function(){
      var cart = getCart();
      if(!cart.items.length){
        alert('Tu carrito está vacío.');
        return;
      }
      var pseudo = {
        id: uid(),
        createdAt: new Date().toISOString(),
        status: 'cotizacion',
        payment: 'por_definir',
        delivery: 'por_definir',
        customer: { name: '-', email: '-', phone: '-' },
        address: null,
        note: '',
        items: cart.items,
        total: cart.total
      };
      var text = buildWaText(pseudo);
      var waUrl = 'https://wa.me/' + STORE_WA.replace(/\D/g,'') + '?text=' + encodeURIComponent(text);
      window.open(waUrl, '_blank', 'noopener');
    });
  }
})();
clone.addEventListener('click', ()=>{
  $$('.fs-swatches .sw', root).forEach(x=> x.setAttribute('aria-checked','false'));
  clone.setAttribute('aria-checked','true');

  // NUEVO: actualiza el color seleccionado en la card para que viaje al carrito
  card.dataset.selectedColor = clone.dataset.color || card.dataset.selectedColor || 'Único';

  const imgUrl = clone.dataset.image;
  if (imgUrl){
    const found = images.indexOf(imgUrl);
    if (found>-1) idx=found; else images[idx]=imgUrl;
    renderStage();
  }
});
function openProductModal({title, price, images, variant, size, desc}) {
  if (!productModal) return;
  gTitle = title; gPrice = price; gVariant = variant || ''; gSize = size || '';
  pmTitle && (pmTitle.textContent = title);
  pmPrice && (pmPrice.textContent = money(price));
  
  // 👉 Aquí usamos el data-desc de la tarjeta
  pmDesc && (pmDesc.textContent = desc || 'Producto de alta calidad disponible en Librería Vida.');
  
  if (pmSpecs){
    const v = pmSpecs.querySelector('[data-spec="variant"]');
    const s = pmSpecs.querySelector('[data-spec="size"]');
    v && (v.textContent = (variant || '—').toUpperCase());
    s && (s.textContent = (size || '—').toUpperCase());
  }
  pmQty && (pmQty.value = '1');

  gImgs = images; gIndex = 0; renderGallery();
  productModal.classList.add('open');
  productModal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}

const openFrom = () => {
  const title = card.dataset.title || 'Producto';
  const price = Number(card.dataset.price || 0);
  const images = (card.dataset.images || '').split('|').map(s=>s.trim()).filter(Boolean);
  const variant = (card.dataset.variant || '').toLowerCase();
  const size    = (card.dataset.size || '').toLowerCase();
  const desc    = card.dataset.desc || '';   // 👈 nuevo
  openProductModal({title, price, images, variant, size, desc});
};
