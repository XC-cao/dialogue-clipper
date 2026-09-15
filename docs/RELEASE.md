# 发布流程

1. 更新 `package.json`、`wxt.config.ts` 与 `CHANGELOG.md` 中版本。
2. 运行 `npm ci && npm run check && npm run zip`。
3. 在 Chrome 稳定版加载 `.output/chrome-mv3`，依次验证三站摘录、刷新恢复、删除和离线导出。
4. 检查 DevTools Network，确认扩展自身没有远程请求。
5. 将 `.output/*-chrome.zip` 重命名为 `dialogue-clipper-<version>-chrome.zip` 并附到 GitHub Release。
6. 按 `docs/STORE_LISTING.md` 完成 Chrome Web Store 表单并上传发布包。

## Safari

1. 运行 `npm run build:safari`，检查 `.output/safari-mv2/manifest.json` 中的 Safari popup、权限和站点匹配规则。
2. 使用 Safari 设置 > 开发 > 添加临时扩展加载 `.output/safari-mv2`，验证摘录、刷新恢复、导出和消息定位。
3. 发布或分发时使用 `xcrun safari-web-extension-packager` 生成 Xcode 项目，再由 Xcode 构建 macOS/iOS 容器；Safari Web Extension 不能像 Chrome 扩展一样只上传一个裸目录。

Safari 构建不声明 Chrome 的 `sidePanel` 与 `downloads` 权限：工具栏按钮打开 `popup.html` 弹出页，Markdown 导出使用网页下载链接；`storage.session` 不可用时，焦点请求回退到 `storage.local`。

GitHub Actions 负责在每次提交和 PR 上执行类型检查、测试和生产构建。
