import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const app = express();
app.use(cors());
app.use(express.json());

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

app.post('/api/checkout/mp/preference', async (req, res) => {
  try {
    const { items = [], payer = {}, back_urls = {} } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'empty_items' });
    }

    const preference = await new Preference(client).create({
      body: {
        items: items.map(i => ({
          title: String(i.title || 'Producto'),
          quantity: Number(i.quantity || 1),
          currency_id: 'MXN',
          unit_price: Number(i.unit_price || 0)
        })),
        payer: {
          name: payer.name,
          email: payer.email
        },
        back_urls: {
          success: back_urls.success || `${process.env.PUBLIC_URL}/exito.html`,
          failure: back_urls.failure || `${process.env.PUBLIC_URL}/error.html`,
          pending: back_urls.pending || `${process.env.PUBLIC_URL}/pendiente.html`
        },
        auto_return: 'approved'
        // Si quieres notificaciones de estado:
        // notification_url: `${process.env.PUBLIC_URL}/api/checkout/mp/webhook`
      }
    });

    res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point
    });
  } catch (e) {
    console.error('MP preference error:', e?.message || e);
    res.status(500).json({ error: 'mp_preference_error' });
  }
});

// Webhook opcional (deja registro y responde 200)
app.post('/api/checkout/mp/webhook', (req, res) => {
  console.log('Webhook MP:', req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API escuchando en http://localhost:${PORT}`));
