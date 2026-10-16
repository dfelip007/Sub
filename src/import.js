(() => {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    nome: 'buyerName', nomecompleto: 'buyerName', comprador: 'buyerName', nomedocomprador: 'buyerName', buyername: 'buyerName',
    cpf: 'cpf', nascimento: 'birthDate', datadenascimento: 'birthDate', birthdate: 'birthDate',
    cartao: 'cardNumber', numerodocartao: 'cardNumber', cardnumber: 'cardNumber',
    titular: 'cardHolder', nomedotitular: 'cardHolder', cardholder: 'cardHolder',
    validade: 'cardExpiry', cardexpiry: 'cardExpiry', cvv: 'cardCvv', cvc: 'cardCvv', cardcvv: 'cardCvv',
    pais: 'country', country: 'country', cep: 'postalCode', postalcode: 'postalCode',
    cidade: 'city', city: 'city', estado: 'state', uf: 'state', state: 'state',
    rua: 'street', logradouro: 'street', street: 'street', numero: 'streetNumber', streetnumber: 'streetNumber',
    parcelas: 'installments', installments: 'installments'
  };
  globalThis.CheckoutImport = {
    parse(text) {
      const values = {};
      let ignored = 0;
      for (const line of text.split(/\r?\n/).filter(line => line.trim())) {
        const split = line.indexOf(':');
        if (split < 1) { ignored++; continue; }
        const key = aliases[normalize(line.slice(0, split))];
        const value = line.slice(split + 1).trim();
        if (key && value) values[key] = value;
        else ignored++;
      }
      return { values, ignored };
    }
  };
})();
