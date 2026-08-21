# 发布流程

1. 更新 `package.json`、`wxt.config.ts` 与 `CHANGELOG.md` 中版本。
2. 运行 `npm ci && npm run check && npm run zip`。
3. 在 Chrome 稳定版加载 `.output/chrome-mv3`，依次验证三站摘录、刷新恢复、删除和离线导出。
4. 检查 DevTools Network，确认扩展自身没有远程请求。
5. 将 `.output/*-chrome.zip` 重命名为 `dialogue-clipper-<version>-chrome.zip` 并附到 GitHub Release。
6. 按 `docs/STORE_LISTING.md` 完成 Chrome Web Store 表单并上传发布包。

GitHub Actions 负责在每次提交和 PR 上执行类型检查、测试和生产构建。
