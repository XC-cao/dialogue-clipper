# Annotation field audit

## Verdict

Annotation is a core product capability, but an always-visible empty textarea is not necessary on every clip card. Keep annotations in the data model and Markdown export, while changing card editing to progressive disclosure.

## Evidence

1. `01-card-annotation-fields.png` — Both annotated and unannotated clips reserve the same large editing area. The empty field competes with the excerpt and increases list height without providing content.
2. `02-map-detail-annotation.png` — The clip-map detail panel already provides a focused, labeled annotation editor beside the complete excerpt.

## Recommended behavior

- No annotation: show a compact `+ Add annotation` action instead of an empty textarea.
- Existing annotation: show a one- or two-line read-only preview labelled `My annotation`; clicking it changes the preview into an editor.
- Editing: expand an inline textarea, autofocus it, preserve the 2,000-character limit, save on blur, and support Escape to leave editing without trapping keyboard focus.
- Clip-map detail: keep the full annotation editor as the canonical long-form editing surface.
- Markdown: continue exporting non-empty annotations separately from source text.

## Why not remove annotation entirely

The product promise explicitly separates captured evidence from the user's own interpretation. Removing annotation would erase that distinction and reduce the product to a generic highlighter/exporter.

## Evidence limits

This audit used the current built side-panel UI with a local storage fixture at a 380 px side-panel viewport. Actual annotation frequency and abandonment cannot be established without usage research or opt-in telemetry. Keyboard focus behavior still needs testing in an installed extension after any interaction change.
