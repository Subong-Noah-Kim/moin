const moneyFormatter = new Intl.NumberFormat('ko-KR');

function getSourceValue(source, name) {
  if (typeof source?.get === 'function') {
    return source.get(name);
  }

  return source?.[name];
}

function hasSourceValue(source, name) {
  if (typeof source?.has === 'function') {
    return source.has(name);
  }

  return Object.prototype.hasOwnProperty.call(source || {}, name);
}

export function formatAdminMeetupMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))}원`;
}

export function normalizeAdminMeetupPriceLabel(priceLabel, amount) {
  const trimmed = String(priceLabel || '').trim();

  if (!trimmed) {
    return formatAdminMeetupMoney(amount);
  }

  if (/^\d+$/.test(trimmed)) {
    return formatAdminMeetupMoney(trimmed);
  }

  return trimmed;
}

export function splitAdminMeetupList(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createAdminMeetupId(title, timestamp = Date.now()) {
  const timestampValue = typeof timestamp === 'function' ? timestamp() : timestamp;
  const slug = String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  return `${slug || 'meetup'}-${Number(timestampValue || 0).toString(36)}`;
}

export function getCapacityPayloadValue(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return null;
  }

  const capacity = Number(trimmed);

  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error('정원은 비워두거나 1명 이상의 정수로 입력해주세요.');
  }

  return capacity;
}

export function getRegistrationStatusPayloadValue(value) {
  return value === 'closed' ? 'closed' : 'open';
}

export function getAdminMeetupImageUrlPayloadValue(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : '';
  } catch {
    return '';
  }
}

export function createAdminMeetupPayload(source, { includeId = false, timestamp = Date.now() } = {}) {
  const priceAmount = Number(getSourceValue(source, 'price_amount') || 0);
  const title = String(getSourceValue(source, 'title') || '').trim();
  const registrationStatus = getRegistrationStatusPayloadValue(getSourceValue(source, 'registration_status'));
  const closeReason = String(getSourceValue(source, 'close_reason') || '').trim();
  const payload = {
    type: String(getSourceValue(source, 'type') || 'regular'),
    category: String(getSourceValue(source, 'category') || '').trim(),
    title,
    description: String(getSourceValue(source, 'description') || '').trim(),
    host_name: String(getSourceValue(source, 'host_name') || '').trim(),
    host_role: String(getSourceValue(source, 'host_role') || '').trim(),
    status_label: String(getSourceValue(source, 'status_label') || '').trim(),
    date_label: String(getSourceValue(source, 'date_label') || '').trim(),
    time_label: String(getSourceValue(source, 'time_label') || '').trim(),
    location: String(getSourceValue(source, 'location') || '').trim(),
    price_amount: priceAmount,
    price_label: normalizeAdminMeetupPriceLabel(getSourceValue(source, 'price_label'), priceAmount),
    capacity: getCapacityPayloadValue(getSourceValue(source, 'capacity')),
    registration_status: registrationStatus,
    close_reason: registrationStatus === 'closed' && closeReason ? closeReason : null,
    tags: splitAdminMeetupList(getSourceValue(source, 'tags')),
    image_url: getAdminMeetupImageUrlPayloadValue(getSourceValue(source, 'image_url')),
    schedule: splitAdminMeetupList(getSourceValue(source, 'schedule')),
    is_published: hasSourceValue(source, 'is_published'),
  };

  if (includeId) {
    payload.id = String(getSourceValue(source, 'id') || '').trim() || createAdminMeetupId(title, timestamp);
  }

  return payload;
}
