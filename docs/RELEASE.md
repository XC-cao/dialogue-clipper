# 发布流程

## 当前发布状态

截至 2026-10-02：

- [Chrome Web Store](https://chromewebstore.google.com/detail/dialogue-clipper/pjgblipkgambaifebpcbchjiljaaocee) 已公开提供 Dialogue Clipper v0.1.0；商店页面标注的更新时间为 2026-09-17。
- [GitHub Releases](https://github.com/XC-cao/dialogue-clipper/releases) 尚无发布记录或安装包附件。商店上架与 GitHub Release 是独立流程。
- 用户安装与源码构建步骤见 [README](../README.md#安装)。

## 后续版本发布检查

1. 更新 `package.json`、`wxt.config.ts` 与 `CHANGELOG.md` 中版本。
2. 运行 `npm ci && npm run check && npm run zip`。
3. 在 Chrome 稳定版加载 `.output/chrome-mv3`，依次验证三站摘录、刷新恢复、删除和离线导出。
4. 检查 DevTools Network，确认扩展自身没有远程请求。
5. 如需提供 GitHub 安装包，将 `.output/*-chrome.zip` 重命名为 `dialogue-clipper-<version>-chrome.zip` 并附到对应 GitHub Release；核对版本、下载和解压后的 `manifest.json`，确认附件可用后再在安装说明中提供下载链接。
6. 按 [商店文案](STORE_LISTING.md) 更新现有 Chrome Web Store item，上传并核对发布包后提交审核。审核通过且公开可安装后，再同步 [提交记录](CHROME_WEB_STORE_SUBMISSION.md)、README 和对应版本的 release notes。

## Safari

1. 运行 `npm run build:safari`，检查 `.output/safari-mv2/manifest.json` 中的 Safari popup、权限和站点匹配规则。
2. 使用 Safari 设置 > 开发 > 添加临时扩展加载 `.output/safari-mv2`，验证摘录、刷新恢复、导出和消息定位。
3. 发布或分发时使用 `xcrun safari-web-extension-packager` 生成 Xcode 项目，再由 Xcode 构建 macOS/iOS 容器；Safari Web Extension 不能像 Chrome 扩展一样只上传一个裸目录。

Safari 构建不声明 Chrome 的 `sidePanel` 与 `downloads` 权限：工具栏按钮打开 `popup.html` 弹出页，Markdown 导出使用网页下载链接；`storage.session` 不可用时，焦点请求回退到 `storage.local`。

GitHub Actions 在推送到 `main` 和创建或更新 PR 时执行类型检查、测试、Chrome / Safari 生产构建与 ZIP 检查；通过 CI 不代表已发布商店版本或 GitHub Release。
