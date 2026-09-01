# Chrome Web Store v0.1.0 提交清单

更新日期：2026-09-01

## 分工

### Codex 可完成

- [x] 重写隐私政策并加入 Limited Use 声明。
- [x] 准备 single purpose、权限理由、数据类别和 Limited Use 勾选说明。
- [ ] 运行自动化检查和三站真实页面 smoke test，并保存结果。
- [x] 生成经过验证的正式 ZIP、SHA-256 和 release notes。
- [x] 准备 4 张 1280 × 800 商店截图。
- [x] 准备详细说明、URL、分类和其他 Store 字段。
- [ ] 在代码与资料冻结后创建 `v0.1.0` GitHub Release。

### 需要开发者本人完成

- [ ] 使用计划长期持有的 Google 账号登录 Chrome Web Store Developer Dashboard。
- [ ] 支付一次性开发者注册费（当前官方说明为 US$5；以付款页显示的币种和金额为准）。
- [ ] 完成开发者联系邮箱验证。
- [ ] 为 Google 账号开启两步验证（2-Step Verification / 2FA）。
- [ ] 确认开发者显示名称、所在国家/地区和联系信息。
- [ ] 根据你的实际发布身份自行声明 `Trader` 或 `Non-Trader`；这是法律身份判断，Codex 不能代选。若选择 Trader，按 Dashboard 要求提交并确认会公开展示的法定名称、电话和地址。
- [ ] 阅读并接受 Chrome Web Store Developer Agreement。
- [ ] 在 Dashboard 创建新 item 并上传最终 ZIP。
- [ ] 在 Privacy practices、Store listing、Distribution 页面粘贴资料并保存 draft。
- [ ] 处理 Google 账号或 Dashboard 出现的验证码、付款确认和身份验证。
- [ ] 在确认 draft 安装检查通过且页面预览无误后，点击 Submit for review。

## 建议的今日顺序

1. Codex 完成代码、文案、构建、测试、截图和 ZIP 冻结。
2. 开发者同时完成注册费、邮箱验证和 2FA。
3. Codex 创建并验证 GitHub Release，使支持与隐私 URL 公开可访问。
4. 开发者创建 Dashboard item，上传 ZIP；先保存 draft，不立即提交审核。
5. 双方核对 Dashboard 自动检查、权限警告、商店预览和隐私字段。
6. 开发者点击 Submit for review。

## 上传文件

- Extension package：`dialogue-clipper-0.1.0-chrome.zip`
- Icon：`public/icon/128.png`
- Screenshots：`store-assets/screenshots/01-*.png` 至 `04-*.png`
- Small promo tile：优先使用 `store-assets/promo-440x280-v2.png`

所有可粘贴字段见 [`STORE_LISTING.md`](STORE_LISTING.md)，测试记录见 `SMOKE_TEST_v0.1.0.md`（完成真实页面验证后生成）。
