/**
 * Restore after rendering only if the interaction still owns the user's focus.
 * Capture origin before asynchronous work; assign one restorer per interaction result.
 */
export const restoreFocusAfterChange = (
  origin: Element | null,
  resolveTarget: () => HTMLElement | null,
): void => {
  requestAnimationFrame(() => {
    const current = document.activeElement;
    if (current !== null && current !== document.body && current !== origin && current.isConnected)
      return;
    const target = resolveTarget();
    if (target?.isConnected === true) target.focus();
  });
};
