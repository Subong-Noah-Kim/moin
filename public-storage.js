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
