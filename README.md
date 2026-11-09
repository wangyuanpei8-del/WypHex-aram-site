# 海斗助手

查询英雄联盟“海克斯大乱斗”中每个英雄的海克斯胜率排名与推荐出装。

网站：https://wangyuanpei8-del.github.io/WypHex-aram-site/

## 使用

- 搜索英雄中文名、称号、外号或英文名，选择英雄查看详情。
- 海克斯按该英雄的搭配胜率排序，可筛选棱彩、黄金和白银。
- **鼠标停在海克斯图标或名称文字上**时显示效果浮层；排名、胜率、场次和名称旁空白不触发。浮层显示名称、稀有度、效果说明和 Hexdata 原页面链接，自动避让窗口边缘，并跟随浅色或深色主题。
- 键盘 Tab 聚焦名称可查看说明，Esc 关闭。手机点击名称展开，再次点击或点外部关闭；滚动、筛选或切换英雄时也会关闭。
- 推荐出装展示胜率与场次。少于 1000 场的样本标橙色，仅供参考。
- 手机上选择英雄后进入全屏详情，点击“返回”回到列表。

## 数据与正确性

**胜率、出装和海克斯效果描述均来自 [Hexdata（hexdata.com.cn）](https://hexdata.com.cn/)**。效果说明提取自海克斯详情页“适合英雄和出装思路”中的效果段落，保留来源文字和数值，不混入其他网站的描述，也不把推荐英雄、阵容建议或统计数字当作效果。每个浮层附对应详情页链接。

暂未读取到的效果明确显示“Hexdata 的效果描述暂未收录”，可点击来源链接核对；自动更新会优先补齐缺项。页面结构不匹配或获取失败时保留已有 Hexdata 描述，不猜测内容。

英雄的海克斯排名合并英雄详情页列出的搭配与海克斯详情页的适配英雄表，按搭配胜率排序。统计是公开对局样本，并非全服所有对局；跨版本和低样本结果应谨慎比较。网页将来源客户端版本号（例如 16.22）换算为游戏显示版本号（26.22）。

名称、图标使用游戏资源，图标通过 CommunityDragon 等资源接口下载；图标资源来源与效果描述来源分别处理。本站为非官方工具，与 Riot Games 无关联。

## 更新与发布

`.github/workflows/update.yml` 每小时运行，也支持在 GitHub Actions 中手动执行“自动更新”：

1. `fetch-hexdata.mjs` 抓取英雄榜、海克斯榜和最多 30 个详情页，保存到 `data/open/hexdata.json`。优先补齐缺少稀有度或效果描述的海克斯，再更新过时的英雄及海克斯搭配。
2. `build-data.mjs` 生成胜率与出装数据；`build-augment-descriptions.mjs` 从缓存生成描述及对应来源链接，无需再访问其他描述数据源。
3. 数据有变化时补齐图标并提交，随后生成单文件版，上传到该次运行的 Artifacts（保留 90 天）。

为尊重 Hexdata 的访问限制，详情页之间间隔 2 秒，遇到限流停止，留待下次继续。缺项和过期数据会分批补齐；页面标明的数据日期不代表所有详情页都已刷新。

GitHub Pages 发布 `main` 分支。修改推送后，在 Actions 中确认 `pages build and deployment` 成功。更改交互或样式时，同时更新 `index.html` 的静态资源版本参数，避免浏览器使用旧缓存。

## 本地开发

使用 Node.js 20+，不需要安装前端依赖：

```sh
node --test
node scripts/build-data.mjs
node scripts/build-augment-descriptions.mjs
node scripts/build-standalone.mjs
```

双击 `index.html` 或启动静态服务器预览。单文件版位于 `dist/hexaram.html`，内嵌网页、数据、描述和图标，可离线打开；`dist/` 不提交到仓库。线上更新不会修改已经下载的旧 HTML 文件。

## 文件

| 文件 | 用途 |
| --- | --- |
| `index.html` | 页面入口与资源版本 |
| `assets/app.js` / `assets/app.css` | 交互、主题与效果浮层 |
| `data/heroes.json` | 英雄中文名、称号、英文标识和别名 |
| `data/open/hexdata.json` | Hexdata 原始统计与效果缓存 |
| `data/data.js` | 生成的英雄搭配与出装数据 |
| `data/augment-descriptions.js` | 生成的 Hexdata 效果及来源链接 |
| `data/icons.js` / `assets/icons/` | 图标映射与本地图标 |
| `scripts/fetch-hexdata.mjs` | 分批获取 Hexdata 页面 |
| `scripts/hexdata-descriptions.mjs` | 提取并校验 Hexdata 效果段落 |
| `scripts/build-data.mjs` | 生成英雄页面数据 |
| `scripts/build-augment-descriptions.mjs` | 生成效果描述与来源链接 |
| `scripts/fetch-icons.mjs` | 补齐图标 |
| `scripts/build-standalone.mjs` | 生成离线单文件版 |
| `tests/augment-descriptions.test.mjs` | 效果提取与缺项检查 |

新英雄需要在 `data/heroes.json` 中补上对应的英文标识与中文资料。
