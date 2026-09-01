# v0.1.0 production smoke test

测试日期：2026-09-01

测试构建：Chrome MV3 production build

测试环境：macOS，Chrome 稳定版，本地加载 `.output/chrome-mv3`

## Automated gate

- [x] TypeScript (`tsc --noEmit`)
- [x] Vitest：13 files / 61 tests passed
- [x] WXT Chrome MV3 production build
- [x] Manifest / permission inspection
- [x] Final ZIP static scan

Package: `.output/dialogue-clipper-0.1.0-chrome.zip`

SHA-256: `eef4d644c438f4bd554b3fe0dd0c352092350f42f9dee1971458d015b4e6ff31`

The archive contains 14 entries and 539,654 uncompressed bytes. The manifest is version `0.1.0`, Manifest V3, Chrome 116+, with only `storage`, `sidePanel`, `downloads`, `scripting`, and the three declared host permissions. Static inspection found no `eval`, `new Function`, `XMLHttpRequest`, or `WebSocket`. The bundled `fetch` occurrence is React DOM's module-preload helper and only loads a linked packaged module; URL strings outside the three supported hosts are library documentation, SVG namespaces, and React Flow attribution, not remote executable code.

## Real-site matrix

| Site | Content script / side panel | Clip | Highlight restore | Conversation map | Result |
| --- | --- | --- | --- | --- | --- |
| ChatGPT | Pass | Existing clips confirmed | 10 existing clips show `SOURCE FOUND` after production reload | Pending a clean test conversation | Partial pass |
| Claude | Extension has host access | Blocked | Blocked | Blocked | Blocked: site forced account logout |
| Gemini | Extension has host access | Blocked | Blocked | Blocked | Blocked: page remained blank in the active Chrome session |

## Remaining manual gate before review submission

1. Developer signs back in to Claude and ensures Gemini loads normally. Codex does not enter account credentials.
2. On each site: create/open a non-sensitive test conversation, select one assistant sentence, click `摘录`, add an annotation, refresh, confirm `SOURCE FOUND`, open Navigate, and return to the source message.
3. Confirm Markdown copy and download once with the final notebook.
4. Confirm the extension service worker console has no current errors after clearing old errors.

Do not mark the three-site gate complete or submit for review until the remaining checks pass.
