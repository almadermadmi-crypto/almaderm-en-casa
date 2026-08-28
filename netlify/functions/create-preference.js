// netlify/functions/create-preference.js
//
// Esta función corre en el SERVIDOR de Netlify, nunca en el navegador del cliente.
// Recibe el carrito desde el sitio, crea la "preferencia de pago" en Mercado Pago,
// y regresa solo la URL segura a la que hay que redirigir al cliente para pagar.
//
// El Access Token NUNCA se pone aquí escrito directamente. Se lee desde una
// variable de entorno configurada en Netlify (Site settings > Environment variables),
// con el nombre: MP_ACCESS_TOKEN
//
// Cómo se usa desde el sitio (ejemplo, en el checkout del HTML):
//
//   const res = await fetch('/.netlify/functions/create-preference', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       items: [
//         { title: 'Crema Haenkenium', quantity: 1, unit_price: 1300 },
//         { title: 'Cover Up Dark', quantity: 1, unit_price: 1400 }
//       ],
//       shipping: 0, // 0 o 250, ya calculado por el sitio según la cantidad de productos
//       payer_email: 'cliente@correo.com'
//     })
//   });
//   const data = await res.json();
//   window.location.href = data.init_point; // redirige al cliente a pagar en Mercado Pago
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta configurar MP_ACCESS_TOKEN en las variables de entorno de Netlify.' })
    };
  }
  try {
    const { items, shipping, payer_email } = JSON.parse(event.body);
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'El carrito está vacío.' }) };
    }
    // Armamos la lista de items para Mercado Pago. Si hay costo de envío,
    // lo agregamos como un ítem más (así aparece desglosado para el cliente).
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
    const preference = {
      items: mpItems,
      payer: payer_email ? { email: payer_email } : undefined,
      back_urls: {
        success: process.env.SITE_URL + '/gracias',
        failure: process.env.SITE_URL + '/pago-fallido',
        pending: process.env.SITE_URL + '/pago-pendiente'
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
    // Solo regresamos lo necesario para redirigir al cliente — nunca el Access Token.
    return {
      statusCode: 200,
      body: JSON.stringify({
        init_point: data.init_point,           // URL de pago real
        sandbox_init_point: data.sandbox_init_point, // URL de pago de PRUEBA
        preference_id: data.id
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno al crear la preferencia.', detalle: err.message })
    };
  }
};
