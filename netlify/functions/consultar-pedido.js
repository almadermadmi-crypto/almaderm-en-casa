// netlify/functions/consultar-pedido.js
//
// El sitio llama a esta función con un folio y un correo. Consulta el Google Sheet
// (vía Apps Script) y solo responde si AMBOS coinciden. Si no coinciden, la respuesta
// es siempre la misma ("no encontrado"), para que nadie pueda averiguar qué folios existen.
//
// Usa la variable de entorno: GOOGLE_SHEETS_URL

function construirLinkRastreo(paqueteria, guia) {
  const p = String(paqueteria || '').toLowerCase();
  const g = encodeURIComponent(String(guia || '').trim());
  if (!g) return null;
  if (p.includes('dhl')) {
    return `https://www.dhl.com/mx-es/home/rastreo.html?tracking-id=${g}&submit=1`;
  }
  if (p.includes('paquete') || p.includes('express')) {
    return `https://www.paquetexpress.com.mx/en/rastreo/${g}`;
  }
  if (p.includes('sendex')) {
    // Sendex no permite un link directo con la guía; se manda a su página de rastreo.
    return 'https://www.sendex.mx/Rastreo/Rastreo/';
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
  if (!GOOGLE_SHEETS_URL) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta configurar GOOGLE_SHEETS_URL en Netlify.' })
    };
  }

  try {
    const { folio, email } = JSON.parse(event.body || '{}');

    if (!folio || !email) {
      return { statusCode: 200, body: JSON.stringify({ encontrado: false }) };
    }

    const url = GOOGLE_SHEETS_URL +
      '?accion=consultarPedido' +
      '&folio=' + encodeURIComponent(String(folio).trim()) +
      '&email=' + encodeURIComponent(String(email).trim());

    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.encontrado) {
      return { statusCode: 200, body: JSON.stringify({ encontrado: false }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        encontrado: true,
        folio: data.folio,
        fecha: data.fecha,
        estado: data.estado,
        paqueteria: data.paqueteria,
        guia: data.guia,
        link: construirLinkRastreo(data.paqueteria, data.guia)
      })
    };

  } catch (err) {
    console.error('Error en consultar-pedido:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No se pudo consultar el pedido.' })
    };
  }
};
