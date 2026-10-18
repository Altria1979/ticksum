# Chrome Web Store 发布资料

适用：TickSum 0.1.0。核对日期：2026-10-18。本文是提审资料和操作指南，不代表扩展已经通过商店审核。发布包与素材按当前实现整理；上传须由具备发布资格的开发者账号完成。

## 发布包与账号前提

使用 Node.js 24，在项目根目录运行：

```sh
npm ci
npm run check
npm run test:e2e
npm run zip
```

上传 `.output/ticksum-0.1.0-chrome.zip`，不要上传仓库源码 ZIP。发布包根目录需要有 `manifest.json`，且引用的脚本和图标必须都在包内。每次更新已上传版本时，先增加 `package.json` 版本，再重新构建和测试。

账号持有人需要登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)，完成开发者注册、一次性注册费、开发者联系邮箱验证及控制台要求的账号验证。费用金额以控制台为准。开发者注册和条款接受必须使用持有人真实资料，不能通过 GitHub 登录代替。[官方注册说明](https://developer.chrome.com/docs/webstore/register)

## 可直接填写的商店内容

**名称：** TickSum

**简短描述：** 自动记录浏览活动，整理页面内容，生成属于你的时间报告。数据保存在本机。

**语言：** 简体中文（当前界面为中文）。

**分类：** 选择控制台中最接近“生产力 / 工作流与规划”的分类。

**详细描述：**

```text
TickSum 帮你回顾时间花在哪里：自动记录浏览器前台网页的访问时长，按时间、网站和标签筛选，再整理成可以编辑、复制或导出的报告。

【记录什么】
自动记录默认关闭。阅读首次使用说明并点击“启用自动记录”后，TickSum 才在本机保存当前前台网页的标题、网址与活动时间。你主动授权某个网站后，还会提取该网站已加载的页面正文和摘录，供回顾与报告使用。浏览器后台标签页、失去焦点或系统闲置时会停止累计相应的前台时长；隐身标签页和浏览器内部页面不记录。

【你可以做什么】
• 查看最近 X 小时、今天或自定义时间范围的浏览活动。
• 按网站、关键词和标签筛选，查看网站用时与访问页面。
• 给页面添加标签和备注，保留自己的理解与收获。
• 生成活动回顾、学习、工作或调研报告。
• 编辑报告后复制到日记，或导出 Markdown、CSV。
• 暂停记录、排除网站、撤销正文授权，设置保留时间或删除本地数据。

【数据留在本机】
活动、正文快照、备注和报告保存在当前浏览器的扩展存储中，不发送给开发者、广告商、分析平台或 AI 服务。无需 TickSum 账号。报告仅在你操作时写入剪贴板或导出文件，由你决定是否分享。

【使用边界】
统计反映浏览器前台活动，不证明专注程度或学习掌握程度。动态文档可能只能提取部分正文；图片、音视频和画布内容不进行 OCR 或转写。报告使用本地模板，不包含云端 AI 总结。网站正文授权只影响正文提取，基础时长记录仍可单独使用。

源码与使用说明：https://github.com/Altria1979/ticksum
隐私政策：https://github.com/Altria1979/ticksum/blob/main/docs/privacy-policy.md
问题反馈：https://github.com/Altria1979/ticksum/issues
```

商店描述、实际界面、权限与隐私政策需要一致，不能填写“完全不处理用户数据”。Chrome 明确要求披露仅在本地处理或保存的数据。[官方 User Data FAQ，第 3、14 项](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

**网站 URL：** `https://github.com/Altria1979/ticksum`

**支持 URL：** `https://github.com/Altria1979/ticksum/issues`

**隐私政策 URL：** `https://github.com/Altria1979/ticksum/blob/main/docs/privacy-policy.md`

## Privacy practices 填写内容

**Single purpose：**

```text
让用户在本机回顾浏览器前台活动：自动统计网页使用时长，将用户选定的浏览记录、按网站授权的正文摘录及个人备注整理成可编辑、可导出的时间报告。
```

统计、正文回顾与报告围绕同一用途。不要扩写成尚未实现的 AI 助手、团队监控、云同步或全网爬虫。[官方隐私字段说明](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

| 权限字段 | 可粘贴的理由 |
| --- | --- |
| `tabs` | 读取当前前台标签页的标题、网址和标签事件，识别计时对象，在页面导航或切换时结束上一段活动。用于用户可见的本机页面时长统计，不读取安装前的浏览历史。 |
| `storage` | 通过 chrome.storage.local 保存记录开关、闲置阈值、排除网站和保留期；通过 chrome.storage.session 保存计时检查点和临时状态，使 Manifest V3 后台恢复后继续准确计时。不使用 chrome.storage.sync。 |
| `idle` | 查询系统活动、闲置和锁定状态，在用户离开设备时暂停计时，避免将无人使用的时间计入报告。 |
| `alarms` | 定期保存计时检查点，并执行过期活动和正文快照清理，使计时与保留期在 Manifest V3 后台环境下运行。 |
| `scripting` | 仅在用户已授权的网站注册和执行扩展包内的正文提取脚本，并核实当前文档和可见状态。不会下载或执行远程代码。 |
| Host permissions | HTTP(S) 主机权限在 manifest 中仅为 optional_host_permissions。用户在设置中输入具体网站并点击授权后，才请求该协议和主机的访问权限，用于从其正在浏览的页面提取正文。未授权网站仍可使用标题、网址和时长统计；可随时撤销正文授权。不要求安装时获得所有网站正文访问权。 |

**Remote code：** 选择 “No, I am not using remote code”。当前运行代码及 Readability、React 等依赖全部随扩展打包；不使用远程脚本、远程模块、远程 WebAssembly 或 AI API 来执行扩展逻辑。Manifest V3 不允许远程托管可执行代码。[官方远程代码字段说明](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

**Data usage：** 依据当前实现，至少需要披露下面三项。具体分类映射是根据实现作出的提审建议，不是 Google 对本扩展的审核结论。

| 控制台数据类别 | 当前处理的数据 |
| --- | --- |
| Web history / 网络记录 | 前台页面 URL、标题、域名及访问时间。即使没有 `history` 权限，仍处理这些浏览数据。 |
| User activity / 用户活动 | 前台活动时间、访问次数和时长，以及用于暂停计时的焦点、闲置状态；不记录击键或点击明细。 |
| Website content / 网站内容 | 按网站授权的正文、标题层级、摘录，以及用户自己填写的页面备注和报告。 |

正文提取不会语义识别个人信息。若允许在邮箱、医疗、财务等页面授权，相关内容可能同时涉及控制台的 Personal communications、Health information、Financial and payment information、Personally identifiable information 等类别；不能仅因为“不上传”或“不专门识别这些字段”就一概声明不会处理。提交人应根据本次发布的实际采集范围和控制台解释进一步核对，必要时收窄功能或补充声明。

有限使用声明可按当前实现确认：不出售或向无关第三方转移数据；仅用于披露的浏览活动回顾用途；不用于信用判断或放贷。隐私政策已包含对应 Limited Use 声明。[官方 Limited Use 政策](https://developer.chrome.com/docs/webstore/program-policies/limited-use)

## 图片素材

| 素材 | 官方要求 | 仓库路径 |
| --- | --- | --- |
| 扩展图标 | 包内提供 128×128 PNG，并在 manifest 引用；方形主体建议 96×96，四周透明留白。 | `public/icon/128.png`；另有 16、32、48 尺寸。 |
| 小型推广图 | 440×280，必需。 | `docs/store-assets/promo-440x280.png` |
| 界面截图 | 至少 1 张、最多 5 张，1280×800 或 640×400，无外围留白，展现真实界面。 | `docs/store-assets/overview-1280x800.png`、`docs/store-assets/report-1280x800.png` |
| Marquee 推广图 | 1400×560，可选。 | 首版不提供。 |

截图可使用明确标注的模拟数据，不得使用用户真实的浏览记录或私人文档。不要将设计概念图当成已经实现的界面，不要添加“已通过审核”或未经批准的商店徽章。[官方图片要求](https://developer.chrome.com/docs/webstore/images)

## Reviewer test instructions

以下英文说明可粘贴到审核说明栏；产品不需要测试账号或私有飞书文档。

```text
TickSum is a local-only browser activity review extension. Its UI is currently Simplified Chinese. No account, backend, subscription, or paid service is required.

1. Install the submitted ZIP and click the TickSum toolbar icon. Read the first-use data disclosure and click 启用自动记录 (Enable automatic tracking). No browsing records are saved before this consent. Later, the switch in Settings (设置 > 自动记录浏览时长) can pause or resume recording.
2. Open https://developer.chrome.com/docs/extensions/ and keep that tab in a focused normal Chrome window for at least 35 seconds. Return to TickSum, select Today (今天), and refresh. The page title, URL, visits and foreground duration should appear. Extension dashboard time itself is not counted.
3. The page should have no captured body before site permission is granted. In Settings (设置), under 正文采集授权, enter https://developer.chrome.com and click 授权网站. Accept Chrome's site access prompt. Return to the documentation page and wait a few seconds, then return to TickSum and refresh. Open the page details to inspect the snapshot. No private site login is needed.
4. Add a tag and note to the page. Select a report template and click 生成报告. Edit the Markdown in the report preview, save it, copy it, or export Markdown. CSV exports the selected statistics. Saved reports are available in the Reports area.
5. Switch to another application: the unfocused browser interval should not accumulate. To test idle, set the threshold to 60 seconds, save Settings, keep a normal webpage active, and stop interacting with the device. Timing pauses after Chrome reports idle. Resume interaction to continue.
6. Pause tracking, add an excluded domain, or revoke its body permission in Settings. Pausing/exclusion stops new activity and extraction; revocation stops body extraction but not duration tracking. Previously saved records remain until deleted or expired.
7. In Settings, use 删除全部本地数据 and confirm deletion. This deletes activity, snapshots, annotations and reports; settings and site grants remain. Pause tracking first if no new records should be created.

All processing occurs locally. Page content may be partial, especially on dynamic applications. The extension does not claim to measure comprehension or provide AI-generated summaries. It does not record incognito tabs or Chrome-internal pages.
```

审核说明用于帮助复现功能；它不会代替权限或隐私声明。[官方测试说明指南](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)

## 提交前仍需确认

- **披露与同意：** 首次使用界面已提供“启用自动记录”选项，后台要求当前版本同意记录。上传前测试全新安装及旧版升级，确认同意前不保存浏览记录，并核对商店安装前披露一致。[官方披露政策](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)
- **本地存储保护：** 当前 IndexedDB 没有应用层加密，不能填写“已加密存储”。官方 FAQ 第 9 项提到静态数据加密；正式数据处理政策要求安全处理。发布前应完成相应安全改进，或向官方澄清此本地存储模型的审核要求，不应把“本地”当作自动豁免。[官方 User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)、[数据处理政策](https://developer.chrome.com/docs/webstore/program-policies/data-handling)
- **账户资料：** 开发者邮箱、身份、商家/非商家状态、分发地区及注册费用只能依据持有人的实际情况填写，不能从 GitHub 用户名推断。
- **最终提交：** 图片、文案、数据分类、权限理由、公开隐私政策和测试说明齐备后，在控制台提交审核。上传成功不等于审核通过，审核通过也不一定代表已公开发布；以控制台状态和最终商店详情页为准。[官方发布流程](https://developer.chrome.com/docs/webstore/publish)
