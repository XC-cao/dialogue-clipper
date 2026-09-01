# Chrome Web Store v0.1.0 提交清单

更新日期：2026-09-01

## 分工

### Codex 可完成

- [x] 重写隐私政策并加入 Limited Use 声明。
- [x] 准备 single purpose、权限理由、数据类别和 Limited Use 勾选说明。
- [ ] 运行自动化检查和三站真实页面 smoke test，并保存结果（自动化与 ChatGPT 已通过；Claude/Gemini 最终捕获待测）。
- [x] 生成经过验证的正式 ZIP、SHA-256 和 release notes。
- [x] 准备 4 张 1280 × 800 商店截图。
- [x] 准备详细说明、URL、分类和其他 Store 字段。
- [ ] 在代码与资料冻结后创建 `v0.1.0` GitHub Release。

### 需要开发者本人完成

- [x] 使用计划长期持有的 Google 账号登录 Chrome Web Store Developer Dashboard。
- [x] 支付一次性开发者注册费（当前官方说明为 US$5；以付款页显示的币种和金额为准）。
- [x] 完成开发者联系邮箱验证（`sdxt.cxc@gmail.com`）。
- [x] 为 Google 账号开启两步验证（2-Step Verification / 2FA）。
- [x] 确认开发者显示名称、账号信息和已验证的发布联系邮箱。
- [x] 根据实际发布身份声明 `Non-Trader`。
- [x] 阅读并接受 Chrome Web Store Developer Agreement。
- [x] 在 Dashboard 创建新 item 并上传 ZIP；草稿 ID：`pjgblipkgambaifebpcbchjiljaaocee`。
- [x] 在 Privacy practices、Store listing、Distribution 页面填写资料并保存 draft。
- [ ] 处理 Google 账号或 Dashboard 出现的验证码、付款确认和身份验证。
- [ ] 在确认 draft 安装检查通过且页面预览无误后，点击 Submit for review。

## 建议的今日顺序

1. Codex 完成代码、文案、构建、测试、截图和 ZIP 冻结。
2. 开发者同时完成注册费、邮箱验证和 2FA。
3. Codex 创建并验证 GitHub Release，使支持与隐私 URL 公开可访问。
4. 开发者创建 Dashboard item，上传 ZIP；先保存 draft，不立即提交审核。
5. 双方核对 Dashboard 自动检查、权限警告、商店预览和隐私字段。
6. 开发者点击 Submit for review。

## 当前 Dashboard 状态

- ZIP 已通过首次解析并创建草稿。
- 商品详情：详细说明、分类、语言、首页与支持 URL、128 px 图标、4 张截图和 440 × 280 小型宣传图已保存。
- Privacy Practices：单一用途、权限理由、无远程代码、`个人通讯` / `网络记录` / `网站内容`、3 项 Limited Use 与隐私政策 URL 已保存。
- Distribution：免费、公开、所有地区。
- 当前账号阻塞：无；最终审核提交仍须等待三站 smoke gate 完成。
- Claude DOM 兼容性修复后的正式 ZIP 已替换到草稿并通过解析；Dashboard 已启用“提请审核”，但尚未点击。

## 上传文件

- Extension package：`dialogue-clipper-0.1.0-chrome.zip`
- Icon：`public/icon/128.png`
- Screenshots：`store-assets/screenshots/01-*.png` 至 `04-*.png`
- Small promo tile：优先使用 `store-assets/promo-440x280-v2.png`

所有可粘贴字段见 [`STORE_LISTING.md`](STORE_LISTING.md)，测试记录见 `SMOKE_TEST_v0.1.0.md`（完成真实页面验证后生成）。
