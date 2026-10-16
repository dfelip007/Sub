(() => {
  'use strict';
  const MAX_CENTS = 99999999999;
  function cents(text, signed = false) {
    let value = String(text ?? '').trim().replace(/^R\$\s*/, '');
    const negative = value.startsWith('-');
    if (negative) value = value.slice(1);
    if (negative && !signed) throw new Error('Informe um valor positivo.');
    if (value.includes(',')) {
      if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) throw new Error('Use um valor como 1.500,00.');
      value = value.replaceAll('.', '').replace(',', '.');
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replaceAll('.', '');
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Use um valor como 1.500,00.');
    const [whole, decimal = ''] = value.split('.');
    const amount = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
    if (!Number.isSafeInteger(amount) || amount > MAX_CENTS) throw new Error('Valor fora do limite permitido.');
    return negative ? -amount : amount;
  }
  const money = value => value == null ? 'Não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
  const inputMoney = value => value == null ? '' : (value / 100).toFixed(2).replace('.', ',');
  const spent = (data, id) => (data.orders || []).filter(order => order.cardId === id && order.status === 'confirmed').reduce((sum, order) => sum + order.amountCents, 0);
  class Wallet extends CheckoutVault.Vault {
    constructor(storage) { super(storage, { sessionMs: 30 * 60 * 1000, credentialFormat: 'pin4' }); }
    get pinConfigured() { return this.envelope?.credential === 'pin4'; }
    validatePassword(pin) { if (typeof pin !== 'string' || !/^[0-9]{4}$/.test(pin)) throw new Error('O PIN deve ter exatamente 4 números.'); }
    async unlock(secret) {
      await this.load();
      if (this.pinConfigured) this.validatePassword(secret);
      try { await super.unlock(secret); }
      catch (error) {
        if (this.pinConfigured && error.message.startsWith('Senha incorreta')) throw new Error('PIN incorreto ou cofre danificado. Os dados foram preservados.');
        throw error;
      }
    }
    cards() { return this.list('cards'); }
    orders() { this.list('cards'); return structuredClone(this.data.orders || []).sort((a, b) => b.createdAt - a.createdAt); }
    summary(id) {
      const card = this.cards().find(item => item.id === id);
      if (!card) throw new Error('Selecione um cartão cadastrado.');
      const used = spent(this.data, id);
      return { used, available: card.budgetCents == null ? null : card.budgetCents - used };
    }
    saveCard(id, label, values, { saveCvv = false, available = '' } = {}) {
      if (!String(label).trim()) return Promise.reject(new Error('Dê um nome ao cartão.'));
      const selected = Object.fromEntries(CheckoutVault.cardFields.map(key => [key, String(values[key] || '').trim()]));
      if (!/^\d{13,19}$/.test(selected.cardNumber.replace(/[ -]/g, '')) || !selected.cardHolder || !CheckoutDates.validExpiry(selected.cardExpiry)) return Promise.reject(new Error('Confira número, titular e validade do cartão.'));
      if (saveCvv && !/^\d{3,4}$/.test(String(values.cardCvv || '').trim())) return Promise.reject(new Error('Informe um CVV com 3 ou 4 dígitos para salvar.'));
      const balance = String(available).trim() ? cents(available, true) : null;
      if (saveCvv) selected.cardCvv = String(values.cardCvv).trim();
      const recordId = id || crypto.randomUUID();
      return this.change('cards', (cards, data) => {
        if (cards.some(item => item.id !== recordId && item.values.cardNumber.replace(/\D/g, '') === selected.cardNumber.replace(/\D/g, ''))) throw new Error('Este número de cartão já está cadastrado. Edite o cartão existente para manter um único controle de limite.');
        const index = cards.findIndex(item => item.id === recordId);
        if (id && index < 0) throw new Error('Cartão não encontrado.');
        const budgetCents = balance == null ? null : balance + spent(data, recordId);
        if (budgetCents != null && Math.abs(budgetCents) > MAX_CENTS) throw new Error('Limite fora do valor permitido.');
        const record = { id: recordId, label: String(label).trim().slice(0, 80), values: selected, budgetCents };
        if (index < 0) cards.push(record); else cards[index] = record;
        return recordId;
      });
    }
    remove(kind, id) {
      return this.change(kind, (items, data) => {
        if (kind === 'cards' && (data.orders || []).some(order => order.cardId === id && ['pending', 'confirmed'].includes(order.status))) throw new Error('Este cartão tem compras pendentes ou confirmadas. Preserve-o para manter o controle de limite.');
        const index = items.findIndex(item => item.id === id);
        if (index < 0) throw new Error('Cadastro não encontrado.');
        items.splice(index, 1);
      });
    }
    stageOrder({ scope, cardId, buyer, buyerId = '', profile, amount = '', tickets }) {
      const amountCents = String(amount).trim() ? cents(amount) : null;
      const ticketData = tickets == null ? null : CheckoutTickets.normalize(tickets);
      if (amountCents != null && amountCents <= 0) return Promise.reject(new Error('O valor da compra deve ser maior que zero.'));
      return this.change('cards', (cards, data) => {
        const card = cards.find(item => item.id === cardId);
        if (!card) throw new Error('Selecione um cartão cadastrado.');
        if (typeof scope !== 'string' || !scope || scope.length > 200) throw new Error('Destino da compra inválido.');
        data.orders ||= [];
        let order = data.orders.find(item => item.scope === scope && item.cardId === cardId && item.buyerId === buyerId && item.status === 'pending');
        if (!order) {
          if (data.orders.length >= 5000) throw new Error('O histórico atingiu o limite de 5.000 registros.');
          order = { id: crypto.randomUUID(), scope, createdAt: Date.now(), status: 'pending' };
          data.orders.push(order);
        }
        Object.assign(order, { cardId, buyerId, cardLabel: card.label, cardLast4: card.values.cardNumber.replace(/\D/g, '').slice(-4), buyer: String(buyer).slice(0, 100), profile: String(profile).slice(0, 100), amountCents });
        if (ticketData) order.tickets = ticketData;
        return order.id;
      });
    }
    updateTickets(id, tickets) {
      const normalized = CheckoutTickets.normalize(tickets);
      return this.change('cards', (_cards, data) => {
        const order = (data.orders || []).find(item => item.id === id);
        if (!order || !['pending', 'confirmed'].includes(order.status)) throw new Error('Esta compra não pode ser editada.');
        for (const item of normalized.items) {
          const previous = order.tickets?.items.find(other => other.id === item.id);
          if (previous?.resaleCents != null) item.resaleCents = previous.resaleCents;
          if (item.resaleCents != null && item.quantity != null && item.resaleCents * item.quantity > MAX_CENTS) throw new Error('Valor de revenda fora do limite.');
        }
        order.tickets = normalized;
      });
    }
    setResalePrice(id, itemId, price) {
      const resaleCents = String(price).trim() ? cents(price) : null;
      return this.change('cards', (_cards, data) => {
        const order = (data.orders || []).find(item => item.id === id && item.status === 'confirmed');
        const item = order?.tickets?.items.find(item => item.id === itemId);
        if (!item) throw new Error('Ingresso não encontrado nesta compra paga.');
        if (resaleCents != null && item.quantity != null && resaleCents * item.quantity > MAX_CENTS) throw new Error('Valor de revenda fora do limite.');
        item.resaleCents = resaleCents;
      });
    }
    confirmOrder(id, amount, reference = '') {
      const amountCents = cents(amount);
      if (amountCents <= 0) return Promise.reject(new Error('O valor da compra deve ser maior que zero.'));
      const ref = String(reference).trim().slice(0, 100);
      return this.change('cards', (cards, data) => {
        const order = (data.orders || []).find(item => item.id === id);
        if (!order || !['pending', 'confirmed'].includes(order.status)) throw new Error('Este registro não está disponível para confirmação.');
        if (order.status === 'confirmed') {
          if (order.amountCents === amountCents && order.reference === ref) return id;
          throw new Error('Esta compra já foi registrada. Desfaça o registro para corrigir.');
        }
        if (!cards.some(item => item.id === order.cardId)) throw new Error('O cartão desta compra foi removido.');
        if (ref && data.orders.some(item => item.id !== id && item.cardId === order.cardId && item.status === 'confirmed' && item.reference === ref)) throw new Error('Este número de pedido já foi registrado neste cartão.');
        Object.assign(order, { amountCents, reference: ref, status: 'confirmed', confirmedAt: Date.now() });
        return id;
      });
    }
    finishOrder(id, status) {
      return this.change('cards', (_cards, data) => {
        const order = (data.orders || []).find(item => item.id === id);
        if (!order || !['canceled', 'reversed'].includes(status)) throw new Error('Registro inválido.');
        if (order.status === status) return;
        if (order.status !== (status === 'reversed' ? 'confirmed' : 'pending')) throw new Error('O estado desta compra mudou. Confira o histórico.');
        Object.assign(order, { status, updatedAt: Date.now() });
      });
    }
  }
  globalThis.CheckoutWallet = { Wallet, cents, money, inputMoney };
})();
