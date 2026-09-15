# Connect to control audit

## Verdict

The connection capability should remain, but the persistent `Connect to` select should be removed from every clip card. The clip map should be the primary place for changing hierarchy, with a keyboard-friendly parent picker in the map detail panel as the fallback.

## Evidence

1. `01-clip-cards.png` — The control repeats on every card. A root clip can expose a select with only the already-selected root option, and long clip labels are truncated inside a narrow field.
2. `02-clip-map.png` — The same `parentClipId` relationship is already represented and editable in the dedicated clip-map workspace.

## Recommended behavior

- Unconnected card: show no connection control.
- Connected card: show a compact read-only status such as `Under: {parent label}`; clicking it opens and focuses the clip in the clip map.
- Clip map: keep drag-to-connect as the primary spatial interaction.
- Clip-map detail panel: add `Change parent…` and `Move to notebook root` actions so keyboard and assistive-technology users do not depend on drawing an edge.
- Empty/default state: treat `Notebook topic (root)` as the absence of a parent, not as a choice that needs to be shown on every card.

## Evidence limits

This audit used the current built side-panel UI with a local storage fixture at a 380 px side-panel viewport. Pointer connection behavior, keyboard edge creation, and screen-reader output still require interaction testing in an installed extension.
