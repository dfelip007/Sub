'use strict';

// Runs in the isolated world of a permitted checkout. Only return product
// descriptions and explicitly labelled prices, never form or payment fields.
function readTickets(document) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visibility = new WeakMap(), texts = new WeakMap();
  function visible(element) {
    if (visibility.has(element)) return visibility.get(element);
    const style = document.defaultView.getComputedStyle(element);
    const result = !element.matches('[hidden],[aria-hidden="true"]') && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0' && (!element.parentElement || visible(element.parentElement));
    visibility.set(element, result); return result;
  }
  function text(element) {
    if (texts.has(element)) return texts.get(element);
    let value = '';
    for (const child of element.childNodes) {
      if (child.nodeType === 3) value += child.nodeValue;
      else if (child.nodeType === 1 && !child.matches('input,select,textarea,button,script,style,noscript,template') && visible(child)) value += `\n${text(child)}\n`;
      if (value.length > 12000) break;
    }
    value = value.replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    texts.set(element, value); return value;
  }
  const moneyPattern = 'R\\$\\s*(\\d{1,3}(?:\\.\\d{3})*|\\d+),(\\d{2})(?!\\d)';
  const amount = match => match ? Number(match[1].replaceAll('.', '')) * 100 + Number(match[2]) : null;
  const summaryHeading = /^(?:resumo (?:da compra|do pedido)|seu pedido|seu carrinho|ingressos selecionados)\s*:?$/;
  const scopes = new Set();
  for (const heading of document.querySelectorAll('h1,h2,h3,h4,strong,[role="heading"]')) {
    if (!visible(heading) || !summaryHeading.test(normalize(text(heading)))) continue;
    let scope = heading.parentElement;
    for (let depth = 0; scope && depth < 3; depth++, scope = scope.parentElement) {
      if (scope.matches('body,main,form,html') || text(scope).length > 12000 || scope.querySelector('input[type="password"]')) break;
      if (/lote/i.test(text(scope))) { scopes.add(scope); break; }
    }
  }
  if (scopes.size !== 1) return { event: '', items: [], totalCents: null };
  const items = [], totals = new Set(), events = new Set();
  for (const scope of scopes) {
    const content = text(scope);
    const event = content.match(/(?:^|\n)Evento\s*:\s*([^\n]{1,160})/i);
    if (event) events.add(event[1].trim());
    for (const match of content.matchAll(new RegExp('(?:^|\\n)Total(?: da compra| do pedido| a pagar)?\\s*:?\\s*' + moneyPattern, 'gi'))) {
      totals.add(Number(match[1].replaceAll('.', '')) * 100 + Number(match[2]));
    }
    const candidates = [...scope.querySelectorAll('li,article,tr,div,section,[data-ticket-item]')].filter(element => {
      if (!visible(element)) return false;
      const value = normalize(text(element));
      return value.length <= 900 && /\blote\b/.test(value) && /r\$/.test(value) && !/seguro|protecao|parcelas|parcelado|sem juros|proximo lote|virada de lote/.test(value);
    });
    for (const row of candidates.filter(element => !candidates.some(other => other !== element && element.contains(other)))) {
      const value = text(row), flat = value.replace(/\s+/g, ' ');
      const labelledLot = value.match(/(?:^|\n)Lote\s*:\s*([^\n]{1,80})/i);
      const numberedLot = flat.match(/\b(?:\d{1,3}\s*[ºªo]?\s*lote|lote\s*\d{1,3}|(?:primeiro|segundo|terceiro|quarto|quinto)\s+lote)\b/i);
      const lots = [...flat.matchAll(/\b(?:\d{1,3}\s*[ºªo]?\s*lote|lote\s*\d{1,3}|(?:primeiro|segundo|terceiro|quarto|quinto)\s+lote)\b/gi)];
      if (new Set(lots.map(match => normalize(match[0]))).size > 1) continue;
      const lot = (labelledLot?.[1] || numberedLot?.[0] || '').trim();
      if (!lot) continue;
      const quantities = new Set([...flat.matchAll(/(?:quantidade|qtd\.?)\s*:?\s*(\d{1,4})\b/gi), ...flat.matchAll(/\b(\d{1,4})\s*(?:x\s*R\$|ingressos?\b)/gi)].map(match => +match[1]));
      const quantityValue = [...quantities][0];
      const quantity = quantities.size === 1 && quantityValue >= 1 && quantityValue <= 1000 ? quantityValue : null;
      const units = new Set([...flat.matchAll(new RegExp('(?:valor unit[aá]rio|pre[cç]o unit[aá]rio|cada ingresso|por ingresso)\\s*:?\\s*' + moneyPattern, 'gi')),
        ...flat.matchAll(new RegExp('\\b\\d{1,4}\\s*x\\s*' + moneyPattern, 'gi'))].map(amount));
      const unitCents = units.size === 1 ? [...units][0] : null;
      const labelledName = value.match(/(?:^|\n)(?:Ingresso|Tipo|Setor|Categoria)\s*:\s*([^\n]{1,160})/i);
      const title = [...row.querySelectorAll('h3,h4,h5,strong,b')].find(element => visible(element) && !/lote|r\$|quantidade|qtd/i.test(text(element)) && text(element).length <= 160);
      const description = (labelledName?.[1] || (title ? text(title) : '')).trim();
      items.push({ description, lot, quantity, unitCents });
      if (items.length >= 50) break;
    }
  }
  return { event: events.size === 1 ? [...events][0] : '', items: items.slice(0, 50), totalCents: totals.size === 1 ? [...totals][0] : null };
}
module.exports = { readTickets };
