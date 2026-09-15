# Notebook header — design QA

## Comparison target

- Source visual truth: `/Users/ccclaptop/.codex/generated_images/01a05b4f-9287-7c51-a09c-91ad313473ce/exec-87dbd2ea-987c-4476-8d6a-87aa5acce961.png`
- Implementation screenshot: `/private/tmp/dialogue-clipper-notebook-header-320.png`
- Implementation evidence: browser-rendered QA harness using the production notebook-header markup and production CSS at `qa/notebook-header-qa.html`.
- State: existing notebook titled `摘录系统本身讨论`, empty description, closed actions menu, compact 320px content-width state.
- Source pixels: 1774 × 887.
- Implementation pixels: 600 × 240.
- CSS viewport: 600 × 240 browser viewport with a 320px content-width constraint to exercise the narrow sidepanel state.
- Density normalization: no resampling; the source is treated as a concept reference and the focused notebook-header region is compared for structure, hierarchy, and responsive behavior.

## Evidence

### Full-view comparison

The implementation keeps the source concept's core composition: a single large notebook title, a compact switch control beside it, a `+` action, a right-aligned overflow action, and the optional description directly below. The removed `Current notebook` label and full-width select/delete row eliminate the duplicated title and reclaim the previous vertical space.

### Focused region comparison

The focused title/action row was required because the source visual is primarily a header composition. At 320px content width, all four controls remain visible and the title remains the dominant element. The source uses a larger desktop-scale title and more generous spacing; the implementation intentionally uses a sidepanel-sized title and tighter 27px controls while preserving the same hierarchy.

## Findings

- No actionable P0/P1/P2 differences remain after the responsive fix.
- P3 / expected difference: the browser-native select arrow is used for notebook switching rather than a custom illustration. This preserves keyboard and native menu behavior in the extension and keeps the title from being duplicated.
- P3 / expected difference: the generated concept uses a larger desktop canvas; the implementation scales typography and controls for the real sidepanel width.

## Comparison history

1. Initial implementation: the title input inherited the global `width: 100%` rule. In a narrow screenshot, the title group consumed the full row and pushed `+` and the overflow control beyond the captured viewport.
2. Fix: added `width: auto` to `.notebook-title-group .title-input`, allowing the flex row to reserve space for the action group.
3. Post-fix evidence: `/private/tmp/dialogue-clipper-notebook-header-320.png` shows the title, switcher, `+`, and overflow control together within the 320px content-width state.

## Validation

- TypeScript: passed.
- Automated tests: 62 passed across 13 test files.
- WXT Chrome MV3 production build: passed.
- `git diff --check`: passed.
- Primary interaction paths represented in the implementation: switch notebook via the compact select, create notebook via `+`, delete notebook via the overflow menu, edit title/description via the existing blur-save behavior.

## Implementation checklist

- [x] Remove duplicated notebook selector row from the main layout.
- [x] Keep the notebook title as the single visual title and preserve inline editing.
- [x] Add compact notebook switching beside the title.
- [x] Move new-notebook and delete actions into the compact header.
- [x] Verify narrow-width layout and production build.

final result: passed
