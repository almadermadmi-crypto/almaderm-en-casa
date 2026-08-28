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
      return { statusCode: 400,
