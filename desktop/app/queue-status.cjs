'use strict';
const { canFill } = require('./policy.cjs');

// Serialized into the isolated world. Read visible page signals only. No queue
// token, cookie, network request, click or refresh is needed for these labels.
function readQueuePage(document) {
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const visibility = new WeakMap();
  function visible(element) {
    if (visibility.has(element)) return visibility.get(element);
    const style = document.defaultView.getComputedStyle(element);
    const result = !element.matches('[hidden],[aria-hidden="true"]') && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0' && (!element.parentElement || visible(element.parentElement));
    visibility.set(element, result); return result;
  }
  const pageTitle = String(document.title || '').slice(0, 250);
  const headings = [...document.querySelectorAll('h1,h2,[role="heading"]')].filter(visible).map(element => normalize(element.textContent).slice(0, 160)).filter(Boolean).slice(0, 20);
  const title = normalize(pageTitle);
  const error = /\b(?:erro|error|acesso negado|access denied|pagina nao encontrada|page not found|nao foi possivel|indisponivel|unavailable|not available|403|404|500|502|503)\b/;
  if (error.test(title) || headings.some(text => error.test(text))) return { kind: 'error' };
  const waiting = /\b(?:sala de espera|fila de espera|waiting room)\b/;
  if (waiting.test(title) || headings.some(text => /^(?:sala de espera|fila de espera|waiting room)$/.test(text))) return { kind: 'waiting', pageTitle };
  if (/^\/orders(?:\/|$)/.test(document.location.pathname)) return { kind: 'checkout' };
  const buy = [...document.querySelectorAll('button,[role="button"],a[href]')].some(element => visible(element) && /^(?:comprar(?: ingressos?)?|comprar agora|adquirir ingressos?|garantir ingressos?|selecionar ingressos?|escolher ingressos?|ver ingressos?|ingressos)(?:\s|$)/.test(normalize(element.textContent || element.getAttribute('aria-label')).slice(0, 100)));
  if (headings.length && buy) return { kind: 'event', pageTitle, headings };
  return { kind: 'unknown' };
}

class QueueStatus {
  constructor(smoke = false) { this.smoke = smoke; this.status = 'unknown'; this.waiting = null; }
  observe(reading, value) {
    if (!canFill(value, this.smoke)) return this.status = 'outside';
    const url = new URL(value);
    if (url.username || url.password || url.protocol === 'https:' && url.port) return this.status = 'outside';
    const key = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const title = normalize(reading?.pageTitle);
    if (reading?.kind === 'waiting') {
      this.waiting = { key, name: title.split(/\b(?:sala de espera|fila de espera|waiting room)\b/)[0].trim() };
      return this.status = 'waiting';
    }
    if (reading?.kind === 'event') {
      const names = [title, ...(reading.headings || []).map(normalize)];
      const sameEvent = this.waiting && (this.waiting.key === key || this.waiting.name.length >= 4 && names.some(name => ` ${name} `.includes(` ${this.waiting.name} `)));
      return this.status = sameEvent ? 'released' : 'event';
    }
    return this.status = ['checkout', 'error'].includes(reading?.kind) ? reading.kind : 'unknown';
  }
}
module.exports = { readQueuePage, QueueStatus };
