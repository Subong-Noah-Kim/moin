function getSourceValue(source, name) {
  if (typeof source?.get === 'function') {
    return source.get(name);
  }

  return source?.[name];
}

function getTextValue(source, name) {
  return String(getSourceValue(source, name) || '').trim();
}

const checkoutPaymentMethods = ['간편결제', '카드', '계좌이체'];

export function createPublicFieldId(...parts) {
  return parts
    .map((part) => String(part || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'field')
    .join('-');
}

export function createPublicApplicationPayload(source) {
  return {
    name: getTextValue(source, 'name'),
    interest: getTextValue(source, 'interest'),
    email: getTextValue(source, 'email'),
  };
}

export function createPublicCheckoutPayload(source) {
  const paymentMethod = getTextValue(source, 'method');

  return {
    payerName: getTextValue(source, 'payer'),
    paymentMethod: checkoutPaymentMethods.includes(paymentMethod) ? paymentMethod : '간편결제',
  };
}
