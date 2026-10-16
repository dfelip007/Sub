(() => {
  'use strict';
  const digits = value => String(value || '').replace(/\D/g, '');
  const group = (value, sizes) => {
    let offset = 0;
    return sizes.map(size => { const part = value.slice(offset, offset + size); offset += size; return part; }).filter(Boolean).join('/');
  };
  function birth(value) {
    const text = String(value || '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const separated = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (separated) return `${separated[1].padStart(2, '0')}/${separated[2].padStart(2, '0')}/${separated[3]}`;
    return group(digits(text).slice(0, 8), [2, 2, 4]);
  }
  function expiry(value) {
    const text = String(value || '').trim();
    const separated = /^(\d{1,2})[/-](\d{2}|\d{4})$/.exec(text);
    if (separated) return `${separated[1].padStart(2, '0')}/${separated[2].slice(-2)}`;
    const raw = digits(text);
    return raw.length === 6 ? `${raw.slice(0, 2)}/${raw.slice(-2)}` : raw.length > 6 ? text : group(raw, [2, 4]);
  }
  function validBirth(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birth(value));
    if (!match || Number(match[3]) < 1900) return false;
    const date = new Date(Date.UTC(+match[3], +match[2] - 1, +match[1]));
    return date.getUTCFullYear() === +match[3] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[1] && date.getTime() <= Date.now();
  }
  const validExpiry = value => /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry(value));
  function apply(form) {
    form.elements.birthDate.value = birth(form.elements.birthDate.value);
    form.elements.cardExpiry.value = expiry(form.elements.cardExpiry.value);
  }
  function bind(element, kind) {
    const mask = value => group(digits(value).slice(0, kind === 'birth' ? 8 : 6), kind === 'birth' ? [2, 2, 4] : [2, 4]);
    const move = (count) => {
      let cursor = 0;
      while (cursor < element.value.length && count > 0) if (/\d/.test(element.value[cursor++])) count--;
      element.setSelectionRange(cursor, cursor);
    };
    element.addEventListener('input', () => {
      const cursor = element.selectionStart ?? element.value.length;
      const before = digits(element.value.slice(0, cursor)).length;
      // Preserve a complete ISO date pasted into the birth input.
      element.value = kind === 'birth' && /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})$/.test(element.value) ? birth(element.value) : mask(element.value);
      move(before);
    });
    element.addEventListener('beforeinput', event => {
      const cursor = element.selectionStart;
      if (event.inputType !== 'deleteContentBackward' || cursor !== element.selectionEnd || cursor < 2 || element.value[cursor - 1] !== '/') return;
      event.preventDefault();
      const before = digits(element.value.slice(0, cursor - 2)).length;
      element.value = mask(element.value.slice(0, cursor - 2) + element.value.slice(cursor));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      move(before);
    });
    element.addEventListener('blur', () => { element.value = kind === 'birth' ? birth(element.value) : expiry(element.value); });
  }
  globalThis.CheckoutDates = { birth, expiry, validBirth, validExpiry, apply, bind };
})();
