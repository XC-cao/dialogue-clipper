# v0.1.0 production smoke test

测试日期：2026-09-01

测试构建：Chrome MV3 production build

测试环境：macOS，Chrome 稳定版，本地加载 `.output/chrome-mv3`

## Automated gate

- [x] TypeScript (`tsc --noEmit`)
- [x] Vitest：13 files / 62 tests passed
- [x] WXT Chrome MV3 production build
- [x] Manifest / permission inspection
- [x] Final ZIP static scan
- [x] Final ZIP accepted by Chrome Web Store draft package parser

Package: `.output/dialogue-clipper-0.1.0-chrome.zip`

SHA-256: `33529e5014fca0f798b376348b3f87e932c855c7418fb12b683c926f5bf98a5d`

The archive contains 14 entries and 540,056 uncompressed bytes. The manifest is version `0.1.0`, Manifest V3, Chrome 116+, with only `storage`, `sidePanel`, `downloads`, `scripting`, and the three declared host permissions. Static inspection found no `eval`, `new Function`, `XMLHttpRequest`, or `WebSocket`. The bundled `fetch` occurrence is React DOM's module-preload helper and only loads a linked packaged module; URL strings outside the three supported hosts are library documentation, SVG namespaces, and React Flow attribution, not remote executable code.

## Real-site matrix

| Site | Content script / side panel | Clip | Highlight restore | Conversation map | Result |
| --- | --- | --- | --- | --- | --- |
| ChatGPT | Pass; side panel opened on the live site | Existing clips confirmed | Existing clips show `SOURCE FOUND` | Pending a clean test conversation | Partial pass |
| Claude | Live conversation loads and extension has host access | Pending after the final Claude DOM adapter rebuild | Pending | Pending | Partial: login/content gate cleared; final package retest remains |
| Gemini | Live signed-in page loads and extension has host access | Pending | Pending | Pending | Partial: login/content gate cleared; capture test remains |

## Remaining manual gate before review submission

1. Reload `.output/chrome-mv3` so the final Claude DOM adapter is active.
2. On Claude and Gemini: open a non-sensitive conversation, select one assistant sentence, click `Clip` (or press `Ctrl+Shift+S` on macOS), add an annotation, refresh, confirm `SOURCE FOUND`, open Navigate, and return to the source message.
3. On ChatGPT, confirm the conversation map once in a clean test conversation.
4. Confirm Markdown copy and download once with the final notebook.
5. Stale extension-context errors were cleared after reloading the final build; confirm no new errors appear after the remaining Claude/Gemini interactions.

Do not mark the three-site gate complete or submit for review until the remaining checks pass.
