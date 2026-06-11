const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function setInert(element, isInert) {
  if (!element) return;
  element.inert = isInert;

  if (isInert) {
    element.setAttribute('inert', '');
  } else {
    element.removeAttribute('inert');
  }
}

export function isModalOpen(modal) {
  return modal && modal.getAttribute('aria-hidden') === 'false';
}

export function getFocusableElements(container) {
  return [...container.querySelectorAll(focusableSelector)].filter((element) => {
    if (element.disabled || element.getAttribute('aria-hidden') === 'true') return false;
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  });
}

export function focusElement(element) {
  if (!element || !document.contains(element)) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

export function focusFirstInModal(modal, preferredSelector) {
  const preferred = preferredSelector ? modal.querySelector(preferredSelector) : null;
  if (focusElement(preferred)) return;

  const firstFocusable = getFocusableElements(modal)[0];
  if (focusElement(firstFocusable)) return;

  focusElement(modal.querySelector('[role="dialog"]'));
}

export function openModal(modal, bodyClass, restoreFocusElement, preferredSelector) {
  modal.hidden = false;
  setInert(modal, false);
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add(bodyClass);
  requestAnimationFrame(() => focusFirstInModal(modal, preferredSelector));

  return restoreFocusElement && document.contains(restoreFocusElement)
    ? restoreFocusElement
    : document.activeElement;
}

export function closeModal(modal, bodyClass, restoreFocusElement, shouldRestoreFocus = true) {
  modal.setAttribute('aria-hidden', 'true');
  setInert(modal, true);
  modal.hidden = true;
  document.body.classList.remove(bodyClass);

  if (shouldRestoreFocus && restoreFocusElement) {
    focusElement(restoreFocusElement);
  }
}

export function trapFocus(event, modal) {
  const focusableElements = getFocusableElements(modal);

  if (!focusableElements.length) {
    event.preventDefault();
    focusFirstInModal(modal);
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
}
