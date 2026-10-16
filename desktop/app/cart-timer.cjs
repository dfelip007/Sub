'use strict';
const { canFill } = require('./policy.cjs');

// Serialized into the isolated checkout world. Read visible text only; never
// infer a reservation length or read inputs, cookies, storage, or payment data.
function readCartTimer(document) {
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const excluded = 'script,style,noscript,template,input,select,textarea,button';
  const visibility = new WeakMap();
  const texts = new WeakMap();
  function visible(element) {
    if (visibility.has(element)) return visibility.get(element);
    if (element.closest('[hidden],[aria-hidden="true"]')) return false;
    const style = document.defaultView.getComputedStyle(element);
    const result = style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0'
      && (!element.parentElement || visible(element.parentElement));
    visibility.set(element, result);
    return result;
  }
  function textOf(element) {
    if (texts.has(element)) return texts.get(element);
    // textContent would include hidden timers, scripts, and select options.
    let text = '';
    for (const child of element.childNodes) {
      if (child.nodeType === 3) text += child.nodeValue;
      else if (child.nodeType === 1 && !child.matches(excluded) && visible(child)) text += ` ${textOf(child)} `;
      if (text.length > 300) break;
    }
    const result = normalize(text);
    texts.set(element, result);
    return result;
  }
  function secondsIn(text) {
    const clocks = [...text.matchAll(/(?<![\d:])(\d{1,3})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?(?![\d:])/g)];
    if (clocks.length === 1) {
      const [, first, second, third] = clocks[0];
      if (+second > 59 || (third != null && (+third > 59 || +first > 23))) return null;
      return third == null ? +first * 60 + +second : +first * 3600 + +second * 60 + +third;
    }
    if (clocks.length) return null;
    const duration = text.match(/(?<!\d)(\d{1,3})\s*(?:minutos?|min\b|m\b)(?:\s*(?:e\s*)?(\d{1,2})\s*(?:segundos?|seg\b|s\b))?/);
    if (duration) return +(duration[2] || 0) < 60 ? +duration[1] * 60 + +(duration[2] || 0) : null;
    const seconds = text.match(/(?<!\d)(\d{1,2})\s*(?:segundos?|seg\b|s\b)/);
    return seconds && +seconds[1] < 60 ? +seconds[1] : null;
  }
  // A checkout route or buyer/payment headings disambiguate a generic "tempo
  // restante". Event/lote countdowns must never become cart deadlines.
  const checkout = /\/(?:checkout|carrinho|cart|pagamento|orders)(?:[/?#.]|$)/i.test(document.location.pathname)
    || [...document.querySelectorAll('h1,h2,h3')].some(element => visible(element) && /dados do comprador|metodo de pagamento/.test(normalize(element.textContent)));
  const values = new Set();
  for (const element of document.querySelectorAll('p,span,div,section,aside,header,footer,strong,b,time,[role="timer"],[role="alert"],[role="status"]')) {
    // Keep the contextual scope small. Whole-page text can mix an event date,
    // payment amount, and an unrelated countdown.
    if (element.matches(excluded) || !visible(element)) continue;
    const text = textOf(element);
    if (!text || text.length > 240) continue;
    let context = text;
    let parent = element.parentElement;
    for (let depth = 0; parent && depth < 2 && !parent.matches('body,main,form,html'); depth++, parent = parent.parentElement) {
      const surrounding = textOf(parent);
      if (surrounding.length > 300) break;
      context = surrounding;
    }
    if (/inicio do evento|evento (?:comeca|inicia)|(?:proximo|virada de) lote|venda (?:comeca|inicia|encerra)|fila de espera/.test(context)) continue;
    const cart = /carrinho|reserva|(?:finalizar|finalize|finalizacao|concluir|conclua|conclusao|completar) (?:a |sua |o |seu )?(?:compra|pagamento|pedido)|checkout/.test(text);
    const timed = /tempo restante|tempo (?:limite|disponivel)|(?:expira|expirara|expiracao|esgota|esgotara|restam|resta|faltam|prazo)|(?:voce tem|tem apenas)/.test(text);
    const ended = /(?:carrinho|reserva|prazo|tempo) (?:foi |esta |ja )?(?:expirad[oa]|esgotad[oa]|encerrad[oa])/.test(text);
    if (ended && (cart || checkout)) { values.add(0); continue; }
    if (!timed || !(cart || checkout && /tempo restante|tempo (?:limite|disponivel)/.test(text))) continue;
    const seconds = secondsIn(text);
    if (seconds != null) values.add(seconds);
  }
  // Conflicting timers are ambiguous. Returning unknown is safer than choosing
  // whichever value happened to appear first in the DOM.
  if (values.size !== 1) return null;
  const [seconds] = values;
  return { status: seconds === 0 ? 'expired' : 'running', seconds };
}

function freshTimer(entry, now = Date.now()) {
  return entry.timer && now - entry.timerReadAt < 5000 && !entry.error ? entry.timer : null;
}

// The user supplied the ten-minute rule for /orders/. Keep one absolute
// deadline per profile/order during this app session, shared by its windows.
// Reloads, query/hash changes and returning to an old order cannot renew it.
class OrderTimers {
  constructor(smoke = false) { this.smoke = smoke; this.deadlines = new Map(); }
  key(profileId, value) {
    if (!canFill(value, this.smoke)) return null;
    const url = new URL(value);
    const route = url.pathname.match(/^\/orders(?:\/([^/]+))?(?:\/|$)/);
    if (url.username || url.password || url.port && url.protocol === 'https:' || !route) return null;
    return JSON.stringify([profileId, url.origin, route[1] || '']);
  }
  observe(profileId, url, now = Date.now()) {
    const key = this.key(profileId, url);
    if (key && !this.deadlines.has(key)) this.deadlines.set(key, now + 600000);
  }
  limit(profileId, url, seconds, now = Date.now()) {
    const key = this.key(profileId, url);
    if (key && this.deadlines.has(key) && Number.isInteger(seconds) && seconds >= 0) {
      this.deadlines.set(key, Math.min(this.deadlines.get(key), now + seconds * 1000));
    }
  }
  timer(profileId, url, now = Date.now()) {
    const deadlineAt = this.deadlines.get(this.key(profileId, url));
    if (deadlineAt == null) return null;
    const seconds = Math.max(0, Math.min(600, Math.ceil((deadlineAt - now) / 1000)));
    return { status: seconds === 0 ? 'expired' : 'running', seconds, source: 'orders', deadlineAt };
  }
}

module.exports = { readCartTimer, freshTimer, OrderTimers };
