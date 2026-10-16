(() => {
  'use strict';
  const MAX = 99999999999;
  function normalize(summary) {
    if (!summary || typeof summary !== 'object' || !Array.isArray(summary.items) || summary.items.length > 50) throw new Error('Confira os ingressos: máximo de 50 linhas por compra.');
    const text = (value, limit) => String(value ?? '').trim().slice(0, limit);
    const ids = new Set();
    const items = summary.items.map(item => {
      const quantity = item.quantity === '' || item.quantity == null ? null : Number(item.quantity);
      const unitCents = item.unitCents === '' || item.unitCents == null ? null : item.unitCents;
      if (quantity != null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000)) throw new Error('Quantidade deve ser um número inteiro entre 1 e 1.000.');
      if (unitCents != null && (!Number.isSafeInteger(unitCents) || unitCents < 0 || unitCents > MAX)) throw new Error('Confira o valor unitário do ingresso.');
      if (quantity != null && unitCents != null && quantity * unitCents > MAX) throw new Error('Total dos ingressos fora do limite.');
      const id = /^[0-9a-f-]{36}$/i.test(item.id || '') && !ids.has(item.id) ? item.id : crypto.randomUUID(); ids.add(id);
      return { id, description: text(item.description, 160), lot: text(item.lot, 80), quantity, unitCents };
    });
    return { event: text(summary.event, 160), items };
  }
  function costs(order) {
    const items = order.tickets?.items || [];
    if (!items.length || !items.every(item => item.quantity != null && item.unitCents != null)) return items.map(() => null);
    let basis = items.map(item => item.quantity * item.unitCents);
    if (!basis.some(value => value > 0)) basis = items.map(item => item.quantity);
    const total = basis.reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(order.amountCents)) return items.map(() => null);
    // BigInt keeps allocations exact even at the largest accepted totals.
    const shares = basis.map(value => BigInt(value) * BigInt(order.amountCents));
    const allocated = shares.map(value => Number(value / BigInt(total)));
    let remainder = order.amountCents - allocated.reduce((a, b) => a + b, 0);
    const indices = shares.map((value, i) => ({ i, remainder: value % BigInt(total) })).sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
    for (const { i } of indices) { if (remainder <= 0) break; allocated[i]++; remainder--; }
    return allocated;
  }
  function ready(order) {
    return Boolean(order.tickets?.event && order.tickets.items.length && order.tickets.items.every(item => item.description && item.lot && item.quantity != null && item.unitCents != null) && costs(order).every(value => value != null));
  }
  function csv(orders) {
    const quote = value => {
      let text = String(value ?? '');
      if (!/^-?\d+(?:,\d{1,2})?$/.test(text)) text = text.replace(/^[\s]*[=+\-@]/, "'$&");
      return `"${text.replaceAll('"', '""')}"`;
    };
    const decimal = value => value == null ? '' : (value / 100).toFixed(2).replace('.', ',');
    const rows = [['Compra', 'Pedido', 'Evento', 'Ingresso', 'Lote', 'Quantidade', 'Valor unitário ingresso', 'Total pago da compra (1ª linha)', 'Custo total com taxas', 'Custo médio por ingresso', 'Revenda por ingresso', 'Receita prevista', 'Resultado previsto', 'Revisão']];
    for (const order of orders.filter(item => item.status === 'confirmed')) {
      const allocated = costs(order);
      const items = order.tickets?.items?.length ? order.tickets.items : [{}];
      items.forEach((item, i) => {
        const revenue = item.resaleCents != null && item.quantity != null ? item.resaleCents * item.quantity : null;
        rows.push([order.id, order.reference, order.tickets?.event, item.description, item.lot, item.quantity, decimal(item.unitCents), i === 0 ? decimal(order.amountCents) : '', decimal(allocated[i]), decimal(allocated[i] != null && item.quantity ? allocated[i] / item.quantity : null), decimal(item.resaleCents), decimal(revenue), decimal(revenue != null && allocated[i] != null ? revenue - allocated[i] : null), ready(order) ? 'Completo' : 'Revisar dados']);
      });
    }
    return '\ufeff' + rows.map(row => row.map(quote).join(';')).join('\r\n');
  }
  globalThis.CheckoutTickets = { normalize, costs, ready, csv };
})();
