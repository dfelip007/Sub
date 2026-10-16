'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('../../node_modules/jsdom');
const { readTickets } = require('../app/ticket-reader.cjs');
function read(html) {
  const dom = new JSDOM(html, { url: 'https://meaple.com.br/checkout' });
  try { return readTickets(dom.window.document); } finally { dom.window.close(); }
}
const item = (lot, price, extra = '') => `<article><h3>Pista inteira</h3><p>${lot}</p><p>Quantidade: 2</p><p>Valor unitário: R$ ${price}</p>${extra}</article>`;
test('identifica evento, vários lotes, quantidades e valor unitário sem confundir taxas e total', () => {
  const result = read(`<aside><h2>Resumo da compra</h2><p>Evento: Submundo teste</p>${item('1º lote', '50,00')}${item('Lote 2', '75,00')}<p>Taxas: R$ 25,00</p><p>Total: R$ 275,00</p></aside>`);
  assert.equal(result.event, 'Submundo teste'); assert.equal(result.totalCents, 27500);
  assert.deepEqual(result.items, [{ description: 'Pista inteira', lot: '1º lote', quantity: 2, unitCents: 5000 }, { description: 'Pista inteira', lot: 'Lote 2', quantity: 2, unitCents: 7500 }]);
});
test('preço sem indicação de unidade não vira preço unitário; dados parciais ficam explícitos', () => {
  const result = read('<aside><h2>Resumo do pedido</h2><div><h3>Camarote</h3><p>Lote: Pré-venda</p><p>R$ 200,00</p></div></aside>');
  assert.deepEqual(result.items, [{ description: 'Camarote', lot: 'Pré-venda', quantity: null, unitCents: null }]);
  assert.equal(result.totalCents, null);
});
test('preços e quantidades conflitantes na mesma linha ficam sem valor confirmado', () => {
  const result = read(`<aside><h2>Resumo da compra</h2>${item('1º lote', '50,00', '<p>Valor unitário: R$ 60,00</p><p>Quantidade: 3</p>')}</aside>`);
  assert.equal(result.items[0].unitCents, null); assert.equal(result.items[0].quantity, null);
});
test('aceita expressão quantidade x preço e mantém linhas idênticas separadas', () => {
  const row = '<li><strong>VIP</strong><p>Segundo lote</p><p>3 x R$ 1.500,25</p></li>';
  const result = read(`<aside><h2>Seu carrinho</h2><ul>${row}${row}</ul><p>Total a pagar: R$ 9.001,50</p></aside>`);
  assert.equal(result.items.length, 2); assert.equal(result.items[0].quantity, 3); assert.equal(result.items[0].unitCents, 150025); assert.equal(result.totalCents, 900150);
});
test('ignora resumo oculto, publicidade, seguro e valores de parcelas', () => {
  const result = read(`<section hidden><h2>Resumo da compra</h2>${item('3º lote', '100,00')}</section><section><h2>Ingressos disponíveis</h2>${item('4º lote', '150,00')}</section><aside><h2>Resumo da compra</h2>${item('1º lote', '50,00', '<p>Seguro proteção R$ 9,60</p>')}<div>Próximo lote 2 x R$ 10,00</div><div>1º lote Parcelado 2 x R$ 55,00 sem juros</div></aside>`);
  assert.equal(result.items.length, 0);
  assert.equal(read('<h2>Dados do Comprador</h2><input value="Evento: Privado"><p>1º lote R$ 100,00</p>').items.length, 0);
});
test('dois resumos visíveis ou totais conflitantes não são somados nem escolhidos arbitrariamente', () => {
  const section = `<aside><h2>Resumo da compra</h2>${item('1º lote', '50,00')}</aside>`;
  assert.equal(read(section + section).items.length, 0);
  const result = read(`<aside><h2>Resumo da compra</h2>${item('1º lote', '50,00')}<p>Total: R$ 100,00</p><p>Total: R$ 110,00</p></aside>`);
  assert.equal(result.totalCents, null);
});
