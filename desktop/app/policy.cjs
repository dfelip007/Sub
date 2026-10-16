'use strict';
const FIELDS = new Set(['buyerName', 'cpf', 'email', 'phone', 'birthDate', 'cardNumber', 'cardHolder', 'cardExpiry', 'cardCvv', 'country', 'postalCode', 'city', 'state', 'street', 'streetNumber', 'installments']);
function canFill(url, demo = false) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'meaple.com.br' || parsed.hostname.endsWith('.meaple.com.br')) || demo && parsed.origin === 'http://127.0.0.1:8080';
  } catch { return false; }
}
function canNavigate(url, demo = false) {
  try { return new URL(url).protocol === 'https:' || demo && new URL(url).origin === 'http://127.0.0.1:8080' || url === 'about:blank'; }
  catch { return false; }
}
function eventUrl(value, demo = false) {
  const invalid = () => { throw new Error('Cole um link HTTPS da Meaple, como https://meaple.com.br/evento.'); };
  if (typeof value !== 'string' || value.length > 2048) return invalid();
  const clean = value.trim();
  if (!clean || /[\u0000-\u0020\u007f]/.test(clean)) return invalid();
  let parsed;
  try { parsed = new URL(clean); } catch { return invalid(); }
  if (parsed.username || parsed.password || !canFill(parsed.href, demo) || (parsed.protocol === 'https:' && parsed.port)) return invalid();
  return parsed.href;
}
function validateValues(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Dados de preenchimento inválidos.');
  const clean = {};
  for (const [key, value] of Object.entries(values)) {
    if (!FIELDS.has(key) || typeof value !== 'string' || value.length > 500) throw new Error('Campo de preenchimento inválido.');
    clean[key] = value;
  }
  return clean;
}
module.exports = { canFill, canNavigate, validateValues, eventUrl };
