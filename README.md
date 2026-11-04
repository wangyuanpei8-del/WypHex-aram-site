# 海斗助手 · 海克斯大乱斗胜率与出装

一屏看榜单、搜英雄、查出装和海克斯。没有后端，也不依赖任何外部 CSS/字体 CDN，国内网络和离线都能正常显示。

## 目录

```
index.html                 页面骨架
assets/app.css             样式（系统中文字体，无 Tailwind）
assets/app.js              交互逻辑
data/sheets/*.csv          数据源（改这里，见下文）
data/data.json             由表格生成
data/data.js               网页实际加载的数据（由脚本生成）
data/raw/state.json        采样进度与累计统计（脚本自动维护）
scripts/update-data.mjs    从 Riot API 采样对局并重算数据
scripts/build-standalone.mjs  打包成单文件 dist/hexaram.html
.github/workflows/import-sheet.yml  改表格后自动更新网页
netlify.toml / vercel.json / _headers  各平台缓存规则
```

## 本地预览

直接双击 `index.html` 即可。英雄头像从 Data Dragon 加载，连不上时显示文字头像。

## 部署（推荐 Cloudflare Pages，国内访问较稳）

1. 把整个目录推到一个 GitHub 仓库。
2. Cloudflare Pages → 连接这个仓库，构建命令留空，输出目录填 `/`。
3. 之后每次数据提交都会自动重新部署。

想发到微信/QQ 群：运行 `node scripts/build-standalone.mjs`，把生成的 `dist/hexaram.html` 发出去即可，约 310 KB。

## 更新数据（改表格）

拳头**不在 Riot API 里公开海克斯大乱斗的对局**：按玩家查对局列表时，海斗对局不会出现；直接按编号查会返回 403。官方答复是有意为之，见 [developer-relations #1109](https://github.com/RiotGames/developer-relations/issues/1109) 和 [#1204](https://github.com/RiotGames/developer-relations/issues/1204)。所以网站数据靠手工整理，存放在 `data/sheets/` 的 5 张表里：

| 文件 | 内容 |
|---|---|
| `0-版本信息.csv` | 版本号、更新日期、数据来源 |
| `1-英雄.csv` | 每行一个英雄：梯队、胜率、出装、海克斯、要点…… |
| `2-海克斯.csv` | 海克斯榜 |
| `3-装备.csv` | 装备榜 |
| `4-王牌组合.csv` | 王牌组合 |

怎么改：

1. **在 GitHub 网页上改**：打开表格文件，点右上角铅笔图标，改完点 Commit changes。
2. **用 Excel 改**：下载表格，改完另存为 “CSV UTF-8”，再到 GitHub 上传覆盖（Add file → Upload files）。

提交后，“导入表格”任务会自动检查格式并更新网页，大约 1 分钟。格式有错时这次不会更新网页，Actions 日志会写明是第几行、哪一列出了问题。

填写规则：

- 多件装备用顿号分隔：`毁坏仪式、金铲铲、死亡之舞`
- 英雄的海克斯格式为“名称 稀有度 胜率”，多个之间用分号分隔：`鼓声暴起低音轰鸣 黄金 68.3；秘术冲拳 棱彩 65.8`
- 梯队填 T1 到 T5，胜率填数字，不要带 %
- 英雄的排名按胜率自动计算，不用填
- 内容还是同定位通用推荐的英雄，“通用模板”一列填“是”，页面上会显示提示

本地运行：`node scripts/import-sheet.mjs` 导入表格；`node scripts/export-sheet.mjs` 把 data.json 导出回表格。

## Riot API 采样（已停用定时）


1. 在 https://developer.riotgames.com 申请 **Personal API Key**（开发 key 24 小时过期，不适合定时任务）。
2. GitHub 仓库 → Settings → Secrets and variables → Actions：
   - Secret `RIOT_API_KEY` = 你的 key
   - （可选）Variable `RIOT_PLATFORMS` = 采样服务器，逗号分隔，默认 `kr,na1,euw1,sg2`。限速按地区分别计算（韩服、日服共用亚洲额度），同时采样
   - Variable `QUEUE_ID` = 海克斯大乱斗的 queueId（默认 2400，请对照 [queues.json](https://static.developer.riotgames.com/docs/lol/queues.json) 确认）
3. Actions → “更新海斗数据” → Run workflow 先手动跑一次。之后每天北京时间 03:00 自动运行。

如果以后拳头开放了这个模式的数据，可以手动运行这个任务（每天定时已停用）。每次运行约 3 小时，每个服务器最多 9,000 次请求，四个服务器同时采样。可在 Run workflow 时勾选“只重算”，几分钟内用已累计的数据重新计算。版本号变化时自动清空旧版本统计重新累计。脚本按英雄聚合胜率，用 Wilson 下界给装备和海克斯排序，避免小样本冲榜。

不联网测试整条流程：`node scripts/update-data.mjs --mock --out /tmp/test`

### 限制

- Riot API 不包含国服（腾讯运营），数据来自所选外服。
- 称号、外号、流派、上手要点、组合说明是手写文字，脚本只会保留，不会生成。
- 目前 134 位英雄的出装和海克斯是按定位套的通用推荐，页面上有提示。在 1-英雄.csv 里补好内容后，把“通用模板”改成“否”即可。
