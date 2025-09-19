async function enviarPedidoAlBackend(formData, carrito) {
  const payload = {
    customer: {
      name: formData.name,
      phone: formData.phone,
      email: formData.email || "",
      address: formData.address || ""
    },
    delivery_method: formData.delivery,
    notes: formData.notes || "",
    items: carrito.map(i => ({
      sku: i.sku || i.title,
      title: i.title,
      price_cents: Math.round(Number(i.price) * 100),
      qty: i.qty
    }))
  };

  const res = await fetch("http://localhost:8000/orders", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    alert("No pudimos crear tu pedido. Intenta de nuevo.");
    return;
  }
  const data = await res.json();

  // Tracking local
  localStorage.setItem("vida_last_order", JSON.stringify({
    order_id: data.order_id,
    order_number: data.order_number,
    total_cents: data.total_cents
  }));

  // Abrir WhatsApp con el resumen oficial
  window.open(data.whatsapp_link, "_blank", "noopener");

  // Vacía carrito unificado
  localStorage.removeItem("vida_cart_v1");
}
/* ========================================
   Admin: lectura y gestión de pedidos
======================================== */
(function(){
  'use strict';

  var ORDERS_KEY = 'vida_orders_v1';
  function $(s, r){ return (r||document).querySelector(s); }
  function readLS(k, f){ try{ var raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : (f||null); } catch(e){ return (f||null); } }
  function writeLS(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function money(n){ return Number(n||0).toLocaleString('es-MX', {style:'currency', currency:'MXN'}); }

  var list = $('#ordersList');
  var btnRefresh = $('#ordersRefresh');

  function render(){
    var orders = readLS(ORDERS_KEY, []) || [];
    if(!list) return;
    if(!orders.length){
      list.innerHTML = '<p>No hay pedidos por ahora.</p>';
      return;
    }
    list.innerHTML = orders.map(function(o, idx){
      var itemsHtml = (o.items||[]).map(function(it){
        var qty = Number(it.qty||1);
        var price = Number(it.price||it.precio||0);
        var title = it.title || it.name || it.titulo || 'Producto';
        return '<li>'+ title +' — '+ qty +' x '+ money(price) +' = '+ money(qty*price) +'</li>';
      }).join('');

      return (
        '<article class="order" data-id="'+ o.id +'">' +
          '<header class="row row--between">' +
            '<h3>Pedido '+ o.id +'</h3>' +
            '<small>'+ new Date(o.createdAt).toLocaleString('es-MX') +'</small>' +
          '</header>' +
          '<p><strong>Estatus:</strong> <span class="status">'+ o.status +'</span></p>' +
          '<p><strong>Pago:</strong> '+ o.payment +' — <strong>Entrega:</strong> '+ o.delivery +'</p>' +
          '<p><strong>Cliente:</strong> '+ o.customer.name +' · '+ o.customer.phone +' · '+ o.customer.email +'</p>' +
          (o.address ? ('<p><strong>Dirección:</strong> '+ [o.address.street,o.address.int,o.address.neighborhood,o.address.city,o.address.state,o.address.zip].filter(Boolean).join(', ') +'</p>') : '') +
          (o.note ? ('<p><strong>Nota:</strong> '+ o.note +'</p>') : '') +
          '<ul>'+ itemsHtml +'</ul>' +
          '<p><strong>Total:</strong> '+ money(o.total) +'</p>' +
          '<div class="row">' +
            '<button class="btn" data-action="confirm" data-id="'+ o.id +'">Marcar como confirmado</button>' +
            '<button class="btn" data-action="paid" data-id="'+ o.id +'">Marcar como pagado</button>' +
            '<button class="btn danger" data-action="cancel" data-id="'+ o.id +'">Cancelar</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function setStatus(id, status){
    var orders = readLS(ORDERS_KEY, []) || [];
    var idx = orders.findIndex(function(x){ return x.id === id; });
    if(idx >= 0){
      orders[idx].status = status;
      writeLS(ORDERS_KEY, orders);
      render();
    }
  }

  if(list){
    list.addEventListener('click', function(ev){
      var btn = ev.target.closest('button[data-action]');
      if(!btn) return;
      var id = btn.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      if(action === 'confirm') setStatus(id, 'confirmado');
      if(action === 'paid')    setStatus(id, 'pagado');
      if(action === 'cancel')  setStatus(id, 'cancelado');
    });
  }

  if(btnRefresh){ btnRefresh.addEventListener('click', render); }
  render();
})();
