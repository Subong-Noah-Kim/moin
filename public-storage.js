export const publicStateMaxItems = 100;
export const publicStateMaxValueLength = 120;

function getDefaultStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readPublicStringSet(key, storage = getDefaultStorage()) {
  try {
    const rawValue = storage?.getItem(key);

    if (!rawValue) {
      return new Set();
    }

    const values = JSON.parse(rawValue);

    if (!Array.isArray(values)) {
      storage?.removeItem(key);
      return new Set();
    }

    return new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value && value.length <= publicStateMaxValueLength)
        .slice(0, publicStateMaxItems),
    );
  } catch {
    try {
      storage?.removeItem(key);
    } catch {
      // Ignore storage cleanup failures so the public page can keep rendering.
    }

    return new Set();
  }
}

export function persistPublicStringSet(key, set, storage = getDefaultStorage()) {
  try {
    storage?.setItem(key, JSON.stringify([...set]));
  } catch {
    // Public UI state persistence is best-effort and should not block the flow.
  }
}

function isStorableMapEntry([entryKey, entryValue]) {
  return typeof entryKey === 'string'
    && entryKey.length > 0
    && entryKey.length <= publicStateMaxValueLength
    && typeof entryValue === 'string'
    && entryValue.length > 0
    && entryValue.length <= publicStateMaxValueLength;
}

export function readPublicStringMap(key, storage = getDefaultStorage()) {
  try {
    const rawValue = storage?.getItem(key);

    if (!rawValue) {
      return new Map();
    }

    const entries = JSON.parse(rawValue);

    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      storage?.removeItem(key);
      return new Map();
    }

    return new Map(
      Object.entries(entries)
        .filter(isStorableMapEntry)
        .slice(0, publicStateMaxItems),
    );
  } catch {
    try {
      storage?.removeItem(key);
    } catch {
      // Ignore storage cleanup failures so the public page can keep rendering.
    }

    return new Map();
  }
}

export function persistPublicStringMap(key, map, storage = getDefaultStorage()) {
  try {
    const entries = [...map.entries()]
      .filter(isStorableMapEntry)
      .slice(0, publicStateMaxItems);

    storage?.setItem(key, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Public UI state persistence is best-effort and should not block the flow.
  }
}
