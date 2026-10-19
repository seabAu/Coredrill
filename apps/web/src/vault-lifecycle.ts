const KEY = "coredrill-vault-ui-generation-v1";
const generation = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Invalidation token only, never canonical vault data or private content. */
export const invalidateDeletedVaultViews = (): void => {
  try {
    localStorage.setItem(KEY, crypto.randomUUID());
  } catch {
    /* Current window still replaces its document. */
  }
};

export const installVaultViewInvalidation = (): void => {
  const openedGeneration = generation();
  const check = () => {
    if (generation() !== openedGeneration) window.location.reload();
  };
  window.addEventListener("pageshow", check);
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) check();
  });
};
