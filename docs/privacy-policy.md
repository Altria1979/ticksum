# TickSum 隐私政策 / Privacy Policy

更新日期 / Last updated: 2026-10-18

适用版本 / Applies to: TickSum 0.1.0

## 中文

TickSum 用于在本机统计浏览器前台网页的使用时长，并将所选记录、可选的页面正文和用户备注整理成报告。项目由 [Altria1979/ticksum](https://github.com/Altria1979/ticksum) 维护。

自动记录默认关闭。首次打开扩展时会显示数据处理说明；只有你点击“启用自动记录”后才开始记录。未保存当前版本同意记录的旧安装也需要先完成这一步。网站正文另行按网站授权。

### 处理哪些数据

- **浏览记录与活动时间：** 记录符合条件的前台 HTTP(S) 页面的标题、网址、域名、开始及结束时间，用于计算时长、访问次数和时间分布。网址保留查询参数与页面片段，移除网址中的用户名和密码；查询参数本身仍可能包含个人信息。TickSum 不读取安装前的 Chrome 历史记录。
- **网站正文：** 仅在你主动授权某个网站后，提取该网站当前前台页面中已加载、可由文本提取器识别的正文、标题、标题层级和摘录，同时保存提取时间与内容指纹。单份正文最多 60,000 个字符。授权覆盖该协议及主机下的页面，不只覆盖输入的某一个文档。
- **你输入的内容：** 在本机保存你设置的标签、备注、编辑后的报告及其标题、时间范围和来源页面。
- **设置与运行状态：** 保存计时开关、你同意数据处理说明的版本和时间、闲置阈值、排除网站和保留天数；使用浏览器提供的窗口焦点、活动标签页及闲置状态决定是否计时。运行中的计时检查点和错误状态保存在浏览器会话存储中。

网页正文、标题、网址或你填写的备注可能包含个人信息或敏感内容。TickSum 不对正文进行语义识别或完整脱敏。提取器会移除输入框、文本框、可编辑区域和部分常见编辑器节点，但这不等于能够过滤页面上已经显示的所有隐私信息。

TickSum 不读取浏览器 Cookie、保存的密码或其他网站的本地存储，不记录键盘输入、鼠标点击明细或剪贴板内容，不录制屏幕、声音或视频。它忽略隐身标签页、浏览器内部页面及扩展页面。后台标签页、浏览器失去焦点、系统进入闲置状态或用户暂停记录时，不继续累计相应网页的前台时长。

### 数据用途与存储

上述数据只用于本机浏览活动统计、筛选、页面回顾和报告生成。报告由本地规则和模板生成；当前版本不调用云端 AI，不推断你是否真正学会或理解了某项内容。时长是浏览器前台活动的估计，页面快照可能不完整。

活动、正文快照、备注和报告存放在扩展自身的 IndexedDB 中；设置使用 `chrome.storage.local`，临时运行状态使用 `chrome.storage.session`。当前版本不使用 `chrome.storage.sync`，不提供云端同步、用户账号或后端服务器。

TickSum 不将这些数据发送给开发者、广告商、分析平台或 AI 服务，不包含遥测或广告 SDK，也不出售数据、用于广告画像或用于信用判断。开发者无法通过 TickSum 远程读取你的本地数据。

存储依赖 Chrome 的扩展隔离与设备的访问控制。当前版本没有为 IndexedDB 数据增加应用层加密，也不能保证设备本身启用了磁盘加密；能够访问你的系统账号、浏览器资料目录或备份的人可能访问这些数据。

### 权限如何使用

| 权限 | 用途 |
| --- | --- |
| `tabs` | 获取活动网页的标题与网址，并在标签切换、导航时更新计时。 |
| `idle` | 在系统闲置或锁定时暂停计时。 |
| `alarms` | 定期保存计时检查点并清理过期记录。 |
| `storage` | 保存本地设置与会话状态。 |
| `scripting` | 在已授权的网站注册或执行随扩展打包的正文提取代码，并验证当前页面。 |
| 可选的 HTTP(S) 网站访问权限 | 你主动授权网站后，允许在该网站提取正文；基本时长记录不要求授权正文访问。 |

### 你的控制方式

- 在设置中暂停自动记录，或排除指定域名及其子域名，停止这些页面的后续计时和正文采集。
- 撤销网站的正文授权会停止后续提取，但不会自动删除已有快照，也不会单独关闭该网站的时长记录。
- 活动和正文快照默认保留 30 天，可设置为 1–365 天。清理在扩展运行时定期执行，也会在后台启动或相关设置更新时执行，因浏览器关闭等原因可能延后。
- 标签、备注和已保存的报告独立保留，不随活动和正文保留期自动删除。报告可能仍包含已过期正文的摘录。你可以编辑备注或删除已保存的单份报告。
- 设置中的“删除全部本地数据”会删除活动、正文快照、标签、备注和报告，保留设置与网站授权。如希望删除后不再产生新记录，请先暂停自动记录。
- 卸载扩展可移除 Chrome 管理的该扩展本地存储；你已导出的文件、复制到其他应用的内容及设备备份需要在相应位置另行删除。

### 复制、导出与外部页面

只有在你操作时，TickSum 才把报告写入系统剪贴板，或将 Markdown 报告、CSV 统计下载到你的设备。你可以在复制和导出前编辑报告。随后粘贴、上传或分享给其他服务的内容由你决定，接收服务适用自己的隐私规则。

打开报告中的来源链接、项目页面、隐私政策或反馈页面，会访问对应网站，并受该网站的隐私政策约束。TickSum 不会把你的本地活动数据库附加到这些链接。通过 GitHub 提交的问题及你主动附带的截图或日志会发送给 GitHub；公开 issue 可被其他人看到，请勿附带私人浏览记录或正文。

### 有限使用与联系

TickSum 对通过 Chrome API 获取的信息的使用遵守 Chrome Web Store 用户数据政策中的 Limited Use 限制：数据只用于上述浏览活动统计和报告用途，不出售，不用于广告或信用判断，也不向开发者或第三方自动传输。

隐私问题、删除方法或产品问题可通过 [GitHub Issues](https://github.com/Altria1979/ticksum/issues) 联系维护者。因维护者没有你的本地数据库，删除操作由你在扩展内完成。若后续版本改变数据处理方式，本政策及产品内披露会同步更新。

## English

TickSum measures foreground browser activity locally and turns selected activity, optional page text, and your notes into reports. The project is maintained at [Altria1979/ticksum](https://github.com/Altria1979/ticksum).

Tracking is off by default. First-use disclosures explain data handling; tracking starts only after you select “启用自动记录” (Enable automatic tracking). Existing installations without current consent must also complete this step. Website text requires a separate site permission.

### Data handled

- **Browsing history and activity:** eligible foreground HTTP(S) page titles, URLs, domains, and interval timestamps, used to calculate durations, visits, and time distributions. URLs retain query parameters and fragments; URL username/password components are removed. Query parameters may still contain personal information. TickSum does not read Chrome history from before installation.
- **Website content:** after you grant a site permission, TickSum extracts text available to its extractor in the active page's loaded document, including headings and excerpts, and stores capture times and content fingerprints. Each text snapshot is limited to 60,000 characters. A site grant covers pages on the specified scheme and host, rather than only one document.
- **Your content:** tags, notes, edited reports, report titles, time ranges, and source references that you choose to save.
- **Settings and runtime state:** tracking preferences, the version and time of your disclosure consent, idle threshold, excluded hosts, retention settings, and temporary checkpoints/errors. Browser focus, active-tab, and idle signals determine when time is counted.

Page text, titles, URLs, and your notes may contain personal or sensitive information. TickSum does not semantically identify or fully redact such information. The extractor removes input fields, editable regions, and several common editor containers; this does not guarantee removal of sensitive information already displayed elsewhere on a page.

TickSum does not read cookies, saved passwords, other websites' local storage, or clipboard contents. It does not log keystrokes or individual mouse clicks, and does not record the screen, audio, or video. Incognito tabs, browser-internal pages, and extension pages are ignored. Background tabs, an unfocused browser, idle state, and paused tracking do not accrue foreground time.

### Purpose, storage, and sharing

Data supports local activity analysis, filtering, page review, and reports. Reports use local rules and templates, without cloud AI. Time measurements estimate foreground activity; snapshots may be incomplete. TickSum does not infer whether you learned or understood the content.

Activities, snapshots, annotations, and reports reside in the extension's IndexedDB. Settings use `chrome.storage.local`; temporary state uses `chrome.storage.session`. This version has no backend, accounts, cloud synchronization, or use of `chrome.storage.sync`.

TickSum does not send this data to its developer, advertisers, analytics vendors, or AI providers. It contains no telemetry or advertising SDK, does not sell data, and does not use it for advertising profiles or credit decisions. Its developer has no remote access to your local database.

Storage relies on Chrome extension isolation and device access controls. This version does not add application-level encryption to IndexedDB or ensure that your device has disk encryption enabled. Someone with access to your operating-system account, browser profile, or backups may be able to access this data.

### Permissions

`tabs` supplies page titles/URLs and tab events; `idle` pauses timing during inactivity/lock; `alarms` schedules checkpoints and retention cleanup; `storage` saves preferences and session state. `scripting` runs bundled extraction code and validates the current page only on sites you have authorized. Optional HTTP(S) host permissions enable extraction for each site you grant; foreground duration tracking does not require those optional content permissions.

### Retention and control

You can pause tracking, exclude hosts and subdomains, or revoke site extraction grants. Revoking extraction stops new snapshots but leaves existing snapshots and duration tracking intact.

Activities and snapshots default to 30 days of retention, configurable from 1 to 365 days. Cleanup runs periodically while the extension is running, at background startup, and when relevant settings change; a closed browser may delay it. Tags, notes, and saved reports remain separately until edited or explicitly deleted. Saved reports may retain excerpts whose source snapshots have expired.

You can delete individual saved reports. “Delete all local data” in Settings removes activities, snapshots, tags, notes, and reports, while keeping preferences and site grants. Pause tracking first if you do not want new records after deletion. Uninstalling removes extension data managed locally by Chrome; exported files, copies in other apps, and backups must be removed separately.

### Export and external sites

TickSum writes a report to your clipboard or downloads Markdown/CSV files only when you request it. You can edit reports before sharing. Any subsequent pasting, uploading, or sharing is your choice and is subject to the recipient's policies.

Opening source, project, policy, or support links visits the relevant website under its own privacy policy. TickSum does not attach your activity database to those links. Information you submit in GitHub issues is sent to GitHub; public issues are visible to others. Do not include private browsing data or page text in a public issue.

### Limited Use and contact

TickSum's use of information received through Chrome APIs complies with the Chrome Web Store User Data Policy's Limited Use restrictions: information supports the activity analysis and reporting described above, is not sold or used for advertising or credit decisions, and is not automatically transferred to the developer or third parties.

Contact the maintainer through [GitHub Issues](https://github.com/Altria1979/ticksum/issues) for privacy questions or deletion instructions. The maintainer does not possess your local database; use the extension's controls to delete it. This policy and in-product disclosures will be updated if a future version changes data practices.
