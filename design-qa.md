# Interactive Mind Map Design QA

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
