/**
 * Attaches a listener whose handler may be async.
 *
 * `addEventListener` discards whatever its handler returns, so handing it an
 * `async` function leaves a promise nobody awaits: a rejection inside one
 * surfaces as an unhandled rejection rather than anything a user or a log can
 * be traced back to. This awaits it on the listener's behalf and reports what
 * it throws.
 */
export function on<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void | Promise<void>,
): void {
  element.addEventListener(type, (event: HTMLElementEventMap[K]) => {
    void (async () => {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Ultra Budget Tracker: ${type} handler failed`, error);
      }
    })();
  });
}

/**
 * Keeps a sideways swipe on `element` from reaching Obsidian mobile, which
 * opens a sidebar on any horizontal swipe in the view. A row that scrolls
 * sideways, or a row of buttons a thumb drags across, means the swipe for
 * itself.
 */
export function keepSwipesInside(element: HTMLElement): void {
  const stop = (event: TouchEvent): void => event.stopPropagation();
  element.addEventListener("touchstart", stop, { passive: true });
  element.addEventListener("touchmove", stop, { passive: true });
}
