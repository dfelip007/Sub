document.querySelector('#checkout').addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('#result').textContent = 'Botão acionado manualmente. Esta demonstração não efetua compras.';
});
