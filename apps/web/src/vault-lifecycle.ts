const KEY = "coredrill-vault-ui-generation-v1";
const EXPECTED_KEY = "coredrill-vault-initialized-v1";
/** Recovery hint only: no identity, name or canonical record is stored here. */
export const expectsLocalVault = (): boolean => {
  try {
    return localStorage.getItem(EXPECTED_KEY) === "true";
  } catch {
    return false;
  }
};
export const markLocalVaultInitialized = (): void => {
  try {
    localStorage.setItem(EXPECTED_KEY, "true");
  } catch {
    /* SQLite remains canonical. */
  }
};
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
    localStorage.removeItem(EXPECTED_KEY);
  } catch {
    /* Current deletion remains authoritative. */
  }
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
