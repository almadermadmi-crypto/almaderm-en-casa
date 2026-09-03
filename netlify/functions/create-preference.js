// netlify/functions/create-preference.js
//
// Esta función corre en el SERVIDOR de Netlify, nunca en el navegador del cliente.
// Recibe el carrito desde el sitio, primero genera un folio de pedido (pendiente de pago)
// en el mismo Google Sheet que ya usa el bot de WhatsApp, y luego crea la
// "preferencia de pago" en Mercado Pago, ligada a ese folio.
//
// El Access Token NUNCA se pone aquí escrito directamente. Se lee desde una
// variable de entorno configurada en Netlify (Site settings > Environment variables),
// con el nombre: MP_ACCESS_TOKEN
//
// También usa dos variables de entorno más:
// SITE_URL          -> la URL pública de tu sitio (ej. https://almaderm-en-casa.netlify.app)
// GOOGLE_SHEETS_URL -> la misma URL de Apps Script que ya usa el bot de WhatsApp

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;

  if (!ACCESS_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta configurar MP_ACCESS_TOKEN en las variables de entorno de Netlify.' })
    };
  }

  if (!GOOGLE_SHEETS_URL) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta configurar GOOGLE_SHEETS_URL en las variables de entorno de Netlify.' })
    };
  }

  try {
    const { items, shipping, payer_email } = JSON.parse(event.body);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'El carrito está vacío.' }) };
    }

    const mpItems = items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency_id: 'MXN'
    }));

    if (shipping && shipping > 0) {
      mpItems.push({
        title: 'Envío',
        quantity: 1,
        unit_price: shipping,
        currency_id: 'MXN'
      });
    }

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const total = subtotal + (shipping || 0);
    const productosTexto = items.map(item => `${item.quantity}x ${item.title}`).join(', ');

    const folioResp = await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crearPedidoPendiente',
        nombre: payer_email || '',
        productos: productosTexto,
        total: total
      })
    });

    const folioData = await folioResp.json();

    if (!folioData.ok || !folioData.folio) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No se pudo generar el folio del pedido.', detalle: folioData })
      };
    }

    const folio = folioData.folio;

    const preference = {
      items: mpItems,
      payer: payer_email ? { email: payer_email } : undefined,
      external_reference: folio,
      notification_url: process.env.SITE_URL + '/.netlify/functions/mp-webhook',
      back_urls: {
        success: process.env.SITE_URL + '/',
        failure: process.env.SITE_URL + '/',
        pending: process.env.SITE_URL + '/'
      },
      auto_return: 'approved',
      payment_methods: {
        installments: 1,
        default_installments: 1
      }
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      },
      body: JSON.stringify(preference)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Mercado Pago rechazó la solicitud.', detalle: data })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        init_point: data.init_point,
        sandbox_init_point: data.sandbox_init_point,
        preference_id: data.id,
        folio: folio
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno al crear la preferencia.', detalle: err.message })
    };
  }
};
