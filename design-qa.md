# Source structure and shared navigation typography (2026-09-07)

Follow-up refinement requested by the user; the original design report is preserved below.

- Actual App fixture: `qa/conversation-navigation.html`. Screenshots: `qa/navigation-source-outline.png` and `qa/navigation-shared-type.png` (480 × 860 CSS-pixel frame, 1080 × 1100 browser viewport).
- Real DOM headings and bold phrases are passed as bounded text-only outline data. Hierarchy/order, nested-bold deduplication, hidden/control/code exclusion, late headings, truncation, legacy payloads and format-only revision changes are covered by tests.
- Measured both modes: app title 15px / 650, notebook title 14px / 500, view title 19px / 650 at identical x=16 and y=124.5. Source and clip-detail text use the same sans font at 14px / 21px. Detail titles use 17px.
- All six fixture rounds and six outline entries are visible at 480 × 860. The last entry ends at y=807.04; sticky actions start at y=808. No overlap.
- At 320 × 650, body clientWidth and scrollWidth both equal 320. Clip-detail text gets a minimum 120px section; its containing panel scrolls so larger text and controls are not squeezed away.
- Confirmed structure → source → structure, no loss of selected round on map switching, exact second clip content, and Locate Answer dispatching `a4`. No browser errors/warnings were reported.
- 87 tests pass; TypeScript and production build pass. Live ChatGPT/Claude/Gemini integration remains unverified in this fixture-only check. Reload the extension and source page to activate the updated content script.

---

# Conversation Navigation — selected design 3 (2026-09-07)

## Evidence and state

- Source: `qa/conversation-navigation-source.png`, the third displayed design selected by the user; 937 × 1678 pixels, normalized proportionally to 480 × 859.6 CSS pixels.
- Implementation: the actual `App` and `ConversationMap` components, rendered in the Codex in-app browser using isolated, in-memory extension API fixtures. No real conversation or extension storage is modified by the preview.
- Local preview: `http://127.0.0.1:4173/qa/conversation-navigation.html`.
- Same-input comparison: `qa/conversation-navigation-comparison.png`, 1080 × 980 pixels at browser DPR 1. Both source and implementation are shown side by side at 480px width; implementation iframe viewport is 480 × 860 CSS pixels.
- Matched state: six rounds, fourth round selected for answer preview, fifth round marked as the source position, two saved excerpts in round four, light theme, document at the top.
- Responsive evidence: `qa/conversation-navigation-narrow.png`, captured with a 320 × 650 CSS-pixel iframe. Also measured widths of 420 and 520px.
- Focused comparison: the final same-input screenshot is readable at 1:1 scale. Question titles, distinct preview/source markers, question/answer controls, both excerpt texts, and source actions were examined directly; an additional crop was not necessary.

## Findings and required fidelity surfaces

- No remaining P0/P1/P2 findings.
- Typography: question titles remain 14px at 320, 420, 480 and 520px. Answer previews use 13px; detail text uses 14px. The existing Chinese/system sans font stack is retained. Long titles and previews truncate within their cells; full source preview can be expanded and scrolled with the keyboard.
- Layout: all six standard rows fit the directory at 480 × 860. Initial versions gave too much height to tools and directory rows; compact spacing and a secondary options menu restore the selected design's directory/detail proportions. Narrow or short viewports scroll vertically without scaling text. Persistent source actions remain reachable.
- Colors: warm off-white, charcoal, pale green selection and forest-green actions match the source direction. Text labels and dashed source-position borders distinguish reading state from preview state without relying only on color.
- Assets: this feature uses editable text and native controls. No raster assets are required in the production component. The source's decorative button icons and switch graphic are intentionally replaced with existing text actions and a native checkbox, keeping labels and keyboard behavior; no custom icon drawings were introduced.
- Copy: real original excerpts replace invented semantic summaries. The label is explicitly “原文预览”, with expand/collapse for long text. Saved excerpts are loaded by exact clip IDs. The page-visible-path limitation is displayed.

## Interaction verification

- Selecting round 04 while source is at round 05 updates preview only; the fixture recorded no source request.
- Switching to Question, then choosing Locate Question, sent `q4` and displayed its source marker. Failure-path behavior is also covered in automated tests.
- Opening the second saved excerpt displayed “实体关系应建立在明确证据之上。” in the actual clip-map detail panel.
- Returning from the clip map retained round 04 and the selected Question role.
- Searching “冲突” retained round 03 with both question and answer; original numbering and omission labels remained correct.
- Filtering a 20-round conversation to clips retained rounds 02 and 04 with their corresponding questions. No-match state provides a clear-filters action.
- Round 20 was reachable; directory scrollTop reached 691px with a 368px viewport and 1059px scroll height.
- Expanded source preview toggled its `aria-expanded` state correctly and collapsed again.
- At widths 320, 420 and 520px, measured body scrollWidth equaled clientWidth. Question fonts stayed at 14px.
- Browser warning/error logs were empty after the interaction pass.
- Automated checks: TypeScript, 80 tests across 16 test files, and the Chrome production build pass.
- Live-site integration limitation: UI checks use fixture bridge responses. The previously implemented live-page locator is retained; this pass did not modify or navigate the user's actual AI conversations.

## Comparison history

1. P2: initial directory and toolbar consumed too much vertical space; details and saved excerpts fell below the useful area. Measured directory starting at 307.6px and detail starting at 689.4px in an 860px viewport.
2. Moved secondary controls to Options, reduced spacing and set compact 52px standard rows while keeping readable fonts. The source preview has a bounded reading area and explicit expansion.
3. Rechecked the same six-round state with source and rendered implementation together; adjusted detail spacing and removed repeated excerpt metadata. Final evidence is `qa/conversation-navigation-comparison.png`.
4. Verified 320px narrow layout, search/filter states, exact excerpt selection, map return, expansion and a 20-round conversation. No actionable P0/P1/P2 finding remains.

## Implementation checklist

- [x] Selected option 3 implemented in existing extension
- [x] Complete-turn grouping before search/filter
- [x] Independent preview and source position
- [x] Explicit question/answer source actions
- [x] Real excerpt list and exact clip-map targeting
- [x] View state retained on return
- [x] Responsive and keyboard-accessible controls
- [x] Existing unrelated work preserved

final result: passed

---

# Previous report: Interactive Mind Map Design QA

## Evidence

- Source visual truth: `qa/mind-map-source.png` (MarginNote reference, 731 × 503 px).
- Browser-rendered implementation: `qa/mind-map-interactive.jpeg` (Chrome side panel crop, 420 × 800 px).
- Side-by-side comparison: `qa/mind-map-interactive-comparison.jpg` (1135 × 752 px).
- Browser viewport: Chrome window 1200 × 800 CSS px at device scale factor 1; side panel crop 420 × 800 px.
- State: notebook “未命名笔记”, two root-level clips, light extension theme.
- Density normalization: source and implementation were scaled proportionally to a maximum height of 700 px in the comparison; neither was stretched.

## Full-view comparison

The implementation preserves the reference’s useful visual grammar: a pale open canvas, orange topic node, pastel evidence nodes, left-to-right branches, compact cards, and a simultaneous overview. The extension intentionally uses the whole side panel for the graph rather than reproducing MarginNote’s document reader pane.

## Focused interaction evidence

The node labels, edge handles, arrow routing, minimap, zoom controls, automatic layout controls, and help text are legible in the 420 px side panel. A separate crop was unnecessary because all core controls and both sample nodes are readable in the implementation capture.

## Findings

- No remaining P0/P1/P2 issues.
- Fonts and typography: existing Dialogue Clipper serif/sans hierarchy is retained; node labels remain readable at fit-view zoom and truncate long evidence instead of expanding unpredictably.
- Spacing and layout rhythm: the canvas occupies the main work area; toolbar, graph, instructions, and fixed export bar do not overlap.
- Colors and visual tokens: orange root and four existing highlight colors map consistently to nodes; connectors maintain sufficient contrast on the pale canvas.
- Image and asset quality: the graph is rendered with React Flow’s vector DOM/SVG primitives and remains sharp while zooming. The reference contains a document screenshot that is outside this feature’s scope and was not replaced with a placeholder.
- Copy and content: Chinese movement and connection instructions match the implemented gestures. React Flow attribution remains visible.
- Accessibility and affordance: nodes and controls are keyboard-focusable; controls have accessible names; destructive keyboard deletion is disabled.

## Interaction verification

- Node dragging: passed; a clip node was moved independently.
- Position persistence: passed by storage unit test and browser drag-stop path.
- Canvas pan/zoom: React Flow controls and pane are present; zoom buttons and fit view render correctly.
- Automatic layout: passed; “整理布局” restored the moved node to the Dagre tree layout.
- Edge editing: connection handles render on both sides; cycle rejection remains enforced by storage logic.
- Source navigation: double-click handler retained for clip nodes.
- Console errors: no extension error was shown on `chrome://extensions`; service worker reloaded successfully.

## Comparison history

1. Previous implementation used nested HTML lists and CSS lines. P1: nodes could not be freely dragged and the canvas only scrolled horizontally.
2. Replaced the static renderer with React Flow and Dagre; added draggable nodes, pan/zoom, minimap, controls, automatic layout, persisted coordinates, and drag-to-connect.
3. Browser QA exposed a Dagre position bug caused by reused mutable node-size objects. Fixed by cloning the size object per node; 37 tests then passed.
4. Final Chrome capture verified a moved node and subsequent automatic-layout reset. No actionable P0/P1/P2 issue remains.

## Implementation checklist

- [x] Free node movement
- [x] Canvas panning and zooming
- [x] Persistent node positions
- [x] Automatic left-to-right layout
- [x] Drag-to-connect hierarchy updates
- [x] Cycle prevention
- [x] Minimap and fit-view controls
- [x] Double-click source navigation
- [x] Side-panel responsive layout

final result: passed
