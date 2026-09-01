# Chrome Web Store 上架文案

## 名称

对话摘录 Dialogue Clipper

## 简短说明

从 ChatGPT、Claude 和 Gemini 摘录关键原文，连成自己的笔记；支持对话导航、本地批注与 Markdown 导出。

## 详细说明

Dialogue Clipper 帮助你在 ChatGPT、Claude 和 Gemini 的长对话中导航，主动摘录关键原文、添加本地批注，并导出 Markdown 笔记。

隐私提示：扩展会读取受支持页面中当前已加载的对话内容来显示临时对话图，并保存你主动摘录的文字、批注、来源标题和 URL 以提供高亮恢复与导出功能。所有数据只在你的设备上处理和保存，不会发送给开发者或第三方；扩展没有广告、遥测或分析 SDK。

AI 对话很长，但真正值得留下的，往往只是几句话。

Dialogue Clipper 帮你：

- 选中文字，保存原文并写下自己的批注。
- 用“对话图”回看长对话，用“摘录图”整理真正重要的内容。
- 点击摘录回到原文位置，保持上下文与来源可追溯。
- 将整理好的笔记复制或下载为 Markdown，带到你的工作流里。

我们的理念很简单：保留原文，写下自己的判断。

它不替你总结，不改写原文，也不把对话上传云端。扩展只持久保存你主动摘录的内容；对话图读取的当前页面消息只在运行内存中临时处理。摘录、批注和笔记只保存在当前设备的浏览器本地空间。

支持 ChatGPT、Claude 和 Gemini。适合研究、学习、写作、产品分析，以及任何需要长期复查 AI 对话的人。

## 单一用途

让用户导航支持的 AI 对话，主动摘录文字、添加本地批注并导出 Markdown 笔记。

## 权限披露

扩展使用 `storage` 保存本地笔记，使用 `sidePanel` 展示工作区，使用 `downloads` 按用户操作导出 Markdown，使用 `scripting` 在受支持页面缺少内容脚本时注入扩展内已打包的脚本；仅访问 ChatGPT、Claude 和 Gemini 页面以读取用户主动选择的文字、恢复高亮并生成临时对话导航图。

不请求浏览历史、Cookie、身份信息、后台剪贴板读取或所有网站访问权限。完整说明见 [`PRIVACY.md`](../PRIVACY.md)。

## Privacy Practices（可直接粘贴）

### Single purpose

帮助用户在受支持的 AI 对话中导航，主动摘录文字、添加本地批注，并导出可追溯来源的 Markdown 笔记。

### Permission justifications

- `storage`：在用户设备上保存笔记、摘录、批注、高亮锚点、导图布局和设置，并保存短暂的界面定位请求。
- `sidePanel`：在受支持的 AI 网站旁显示用户可操作的摘录、对话导航和 Markdown 工作区。
- `downloads`：仅在用户点击下载时，将选定笔记导出为本地 Markdown 文件。
- `scripting`：当扩展升级或受支持页面尚未注入内容脚本时，向当前页面注入扩展包内的内容脚本，以恢复摘录、高亮和对话导航功能；不执行远程代码。
- Host permission `https://chatgpt.com/*`：读取用户主动选择的 ChatGPT 文字、显示/恢复高亮、定位原消息并在侧栏生成临时对话图。
- Host permission `https://claude.ai/*`：读取用户主动选择的 Claude 文字、显示/恢复高亮、定位原消息并在侧栏生成临时对话图。
- Host permission `https://gemini.google.com/*`：读取用户主动选择的 Gemini 文字、显示/恢复高亮、定位原消息并在侧栏生成临时对话图。

### Data categories

按“扩展会处理的数据”保守申报：

- `Website content`：是。处理受支持页面中的对话文字、消息角色、页面位置和用户主动选中的文字。
- `Personal communications`：是。AI 对话可能包含用户与 AI 服务之间的通信内容。
- `Web history`：是。为保存来源和返回原对话，扩展保存用户主动摘录页面的对话 URL 与标题。
- `User-generated content`（若当前表单单列此项）：是。处理用户输入的笔记标题、说明和批注。
- 其他类别：否。扩展不专门收集身份、健康、财务、认证、位置或支付数据；用户不应在笔记中主动添加此类敏感信息。

数据只在设备本地处理和保存，不传输给开发者或第三方。即使 Dashboard 对“collect”的提示主要关注离开设备的数据，也建议按当前政策对本地处理采取上述保守披露，并确保 Privacy Practices、隐私政策和实际行为保持一致。

### Limited Use certifications

如实勾选以下声明：

- 不向第三方出售或转移用户数据（已批准用途、法律要求或安全需要等政策允许情形除外；当前版本实际不进行任何转移）。
- 不将用户数据用于或转移给与单一用途无关的目的。
- 不将用户数据用于或转移给信用评估或贷款目的。
- 不允许开发者或其他人员读取用户数据；当前版本数据不会发送给开发者。

### Remote code

选择：`No, I am not using remote code.`

说明（若表单要求）：扩展的 JavaScript 和所有运行逻辑均包含在上传的 ZIP 中。扩展不会下载、导入或执行远程托管代码；构建产物中的 React Flow/React 链接仅为库的帮助或 attribution URL，不会加载远程逻辑。

Privacy policy URL：`https://github.com/XC-cao/dialogue-clipper/blob/main/PRIVACY.md`

## Store fields

- Category：`Productivity`
- Language：`中文（简体）`
- Homepage URL：`https://github.com/XC-cao/dialogue-clipper`
- Support URL：`https://github.com/XC-cao/dialogue-clipper/issues`
- Privacy policy URL：`https://github.com/XC-cao/dialogue-clipper/blob/main/PRIVACY.md`
- Mature content：`No`
- Paid content：`No`

## 商店宣传语

> 保留原文，写下自己的判断。

备用短句：把长对话里的重点，变成自己的证据型笔记。

## 发布前素材清单

- [x] 128 × 128 扩展图标：`public/icon/128.png`
- [x] 1280 × 800 截图：`store-assets/screenshot-1280x800.png`
- [x] 440 × 280 宣传图：`store-assets/promo-440x280.png`
- [x] 440 × 280 生成版宣传图：`store-assets/promo-440x280-v2.png`
- [x] 公开托管的隐私说明 URL（合并并推送本次修改后生效）
- [x] 支持 URL 与 GitHub 仓库 URL
