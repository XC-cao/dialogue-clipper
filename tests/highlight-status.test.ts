import { describe, expect, it } from 'vitest';
import { isMissingHighlightConfirmed, recordMissingHighlight } from '../lib/highlight-status';

describe('highlight missing-status confirmation', () => {
  it('preserves the first missing time across repeated checks', () => {
    const first = recordMissingHighlight(undefined, 1_000);
    const second = recordMissingHighlight(first, 1_500);
    const third = recordMissingHighlight(second, 2_200);

    expect(third).toEqual({ count: 3, firstMissingAt: 1_000 });
    expect(isMissingHighlightConfirmed(third, 2_200, 3, 1_200)).toBe(true);
  });

  it('requires both the count and grace period', () => {
    expect(isMissingHighlightConfirmed({ count: 2, firstMissingAt: 1_000 }, 2_500, 3, 1_200)).toBe(false);
    expect(isMissingHighlightConfirmed({ count: 3, firstMissingAt: 1_000 }, 2_100, 3, 1_200)).toBe(false);
  });
});
