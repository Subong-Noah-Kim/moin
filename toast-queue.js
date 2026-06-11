export function createToastQueue({ show, hide, displayMs = 2200, gapMs = 250, schedule = setTimeout }) {
  const queue = [];
  let showing = false;
  let currentMessage = null;

  function showNext() {
    if (!queue.length) {
      showing = false;
      currentMessage = null;
      return;
    }

    showing = true;
    currentMessage = queue.shift();
    show(currentMessage);
    schedule(() => {
      hide();
      schedule(showNext, gapMs);
    }, displayMs);
  }

  return {
    push(message) {
      const tail = queue.length ? queue[queue.length - 1] : currentMessage;

      if (message === tail) {
        return false;
      }

      queue.push(message);

      if (!showing) {
        showNext();
      }

      return true;
    },
  };
}
