export const COREDRILL_PHASE0_APP_ORIGIN = "https://app.coredrill.test" as const;

export interface HostedAppMessageSender {
  readonly id?: string;
  readonly origin?: string;
  readonly url?: string;
  readonly frameId?: number;
  readonly nativeApplication?: string;
  readonly tab?: { readonly incognito?: boolean };
}

export function isTrustedHostedAppSender(
  sender: HostedAppMessageSender,
  allowedOrigin = COREDRILL_PHASE0_APP_ORIGIN,
): boolean {
  if (
    sender.id !== undefined ||
    sender.nativeApplication !== undefined ||
    sender.origin !== allowedOrigin ||
    sender.url === undefined ||
    sender.frameId !== 0 ||
    sender.tab === undefined ||
    sender.tab.incognito === true
  ) {
    return false;
  }
  try {
    const url = new URL(sender.url);
    return url.origin === allowedOrigin && url.protocol === "https:";
  } catch {
    return false;
  }
}
