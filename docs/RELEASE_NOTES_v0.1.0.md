# Dialogue Clipper v0.1.0

首个公开版本：在 ChatGPT、Claude 和 Gemini 中摘录关键原文，添加本地批注，用对话图与摘录图回看上下文，并导出 Markdown。

## 安装

v0.1.0 已在 [Chrome Web Store](https://chromewebstore.google.com/detail/dialogue-clipper/pjgblipkgambaifebpcbchjiljaaocee) 上架，商店页面标注的更新时间为 2026-09-17。

截至 2026-10-02，GitHub Releases 尚未提供安装包。需要本地构建时请参阅 [README 安装说明](../README.md#安装)；源码构建可能与商店版本不同。

## Highlights

- 在单条消息或受支持的报告正文中选中文字并摘录。
- 保存来源、角色、时间与文本锚点，刷新后尽力恢复高亮。
- 使用对话图搜索当前已加载的对话路径、跟随阅读位置并返回原消息。
- 使用摘录图连接重点，拖动节点、自动布局并修改父子关系。
- 添加批注、调整颜色、排序或移动摘录，并支持删除/移动撤销。
- 复制或下载带原文、批注与来源链接的 Markdown。
- 所有数据只在当前设备的浏览器本地空间处理和保存；没有账号、服务器、遥测、广告或第三方分析。

## Supported sites

- ChatGPT (`chatgpt.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)

Chrome 116+。安装与构建说明见 [README](../README.md#安装)，完整数据处理说明见 [PRIVACY.md](../PRIVACY.md)。
