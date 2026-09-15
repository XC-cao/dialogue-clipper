const CONTENT_RUNTIME_KEY = '__dialogueClipperContentRuntime';
const CONTENT_RUNTIME_VERSION = 2;

/** Prevent duplicate listeners when the registered script is repaired concurrently. */
export function claimContentRuntime(scope: Record<string, unknown>): boolean {
  if (scope[CONTENT_RUNTIME_KEY] === CONTENT_RUNTIME_VERSION) return false;
  scope[CONTENT_RUNTIME_KEY] = CONTENT_RUNTIME_VERSION;
  return true;
}
