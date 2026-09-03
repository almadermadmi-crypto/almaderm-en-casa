// netlify/functions/mp-webhook.js
//
// Mercado Pago llama automáticamente a esta función cuando un pago cambia de estado
// (por ejemplo, cuando se aprueba). Nunca confiamos ciegamente en lo que llega aquí:
// siempre verificamos directo con la API de Mercado Pago que el pago sea real y
// esté aprobado, antes de actualizar el pedido.
//
// Usa las mismas variables de entorno que create-preference.js:
// MP_ACCESS_TOKEN
// GOOGLE_SHEETS_URL

exports.handler = async (event) => {
  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;

  try {
    // Mercado Pago manda la notificación como query params o en el body, según el tipo.
    const params = event.queryStringParameters || {};
    let paymentId = params['data.id'] || params['id'];
    const topic = params['type'] || params['topic'];

    // Si vino como POST con body (otro formato que también usa Mercado Pago)
    if (!paymentId && event.body) {
      try {
        const body = JSON.parse(event.body);
        paymentId = body?.data?.id || paymentId;
      } catch (e) {
        // body no era JSON válido, lo ignoramos
      }
    }

    // Solo nos interesan notificaciones de pagos, no de otros tipos (merchant_order, etc.)
    if (!paymentId) {
      return { statusCode: 200, body: 'Sin payment id, ignorado.' };
    }

    // ── Verificamos el pago directo con Mercado Pago (nunca confiamos en la notificación sola) ──
    const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });

    if (!paymentResp.ok) {
      return { statusCode: 200, body: 'No se pudo verificar el pago, ignorado.' };
    }

    const payment = await paymentResp.json();

    if (payment.status !== 'approved') {
      // Pago pendiente, rechazado, etc. No hacemos nada todavía.
      return { statusCode: 200, body: 'Pago no aprobado aún: ' + payment.status };
    }

    const folio = payment.external_reference;

    if (!folio) {
      return { statusCode: 200, body: 'Pago aprobado pero sin folio (external_reference).' };
    }

    // ── Confirmamos el pedido en el Google Sheet ──
    await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'confirmarPedido',
        folio: folio
      })
    });

    return { statusCode: 200, body: 'Pedido ' + folio + ' confirmado.' };

  } catch (err) {
    // Siempre regresamos 200 para que Mercado Pago no siga reintentando de más,
    // pero dejamos el error en el log para poder revisarlo.
    console.error('Error en webhook de Mercado Pago:', err.message);
    return { statusCode: 200, body: 'Error interno, revisar logs.' };
  }
};
