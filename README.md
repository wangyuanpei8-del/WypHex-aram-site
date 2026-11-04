# 海斗助手 · 海克斯大乱斗出装与海克斯速查

## 👉 打开网站：https://wangyuanpei8-del.github.io/WypHex-aram-site/

一屏看榜单、搜英雄、查出装和海克斯，手机电脑都能用。把上面的链接发给朋友就能直接打开。

---

## 数据从哪来，多久更新

| 内容 | 来源 | 更新方式 |
|---|---|---|
| 英雄出场率（及较上版本变化） | [arammayhem.com 开放数据](https://arammayhem.com/data/)（CC BY 4.0） | **每天自动** |
| 海克斯选取率、稀有度、本版本新增 | 同上 | **每天自动** |
| 精选组合（英雄 + 海克斯） | 同上 | **每天自动** |
| 胜率、梯队、推荐出装、海克斯优先级、玩法要点 | 原站整理数据（26.21 版本） | 不自动更新；版本过时后页面会提示“仅供参考” |
| 英雄头像、装备和海克斯图标 | Data Dragon、CommunityDragon | 每天自动补齐 |

**为什么胜率不能自动更新？** 拳头不在官方 API 里公开海克斯大乱斗的对局，有意不让外部网站统计这个模式的胜率（见 [#1109](https://github.com/RiotGames/developer-relations/issues/1109)、[#1204](https://github.com/RiotGames/developer-relations/issues/1204)）。arammayhem.com 的开放数据也只有出场率和选取率，没有胜率。

## 自动任务（GitHub → Actions）

| 任务 | 什么时候运行 | 做什么 |
|---|---|---|
| 每日自动更新 | 每天北京时间 03:00，也可以手动点 Run workflow | 拉取开放数据 → 合并 → 补图标 → 更新网页 |
| 导入表格 | 修改 `data/sheets/` 里的表格后自动运行 | 检查表格格式 → 更新网页 |
| 下载图标 | 只能手动运行 | 重新下载全部图标 |
| 更新海斗数据（Riot API） | 只能手动运行，目前用不上 | 见文末 |

网站托管在 GitHub Pages 上，每次有提交，大约 1 分钟后网站会自动更新。

## 发到微信 / QQ 群

`dist/hexaram.html` 是单文件版，图标和数据都已打包在里面（约 6 MB），下载后直接发文件就行，不联网也能打开。每天的自动更新会一起刷新这个文件。

## 手工修改数据（可选）

整理数据存放在 `data/sheets/` 的 5 张表里：

| 文件 | 内容 |
|---|---|
| `0-版本信息.csv` | 版本号、更新日期、数据来源 |
| `1-英雄.csv` | 每行一个英雄：梯队、胜率、出装、海克斯、要点…… |
| `2-海克斯.csv` | 海克斯榜（胜率、效果说明） |
| `3-装备.csv` | 装备榜 |
| `4-王牌组合.csv` | 王牌组合 |

修改方法：在 GitHub 上打开表格，点右上角的铅笔图标，改完点 Commit changes；也可以下载后用 Excel 改，另存为 “CSV UTF-8”，再上传覆盖。提交后，“导入表格”任务会自动检查格式。如果有错，这次不会更新网页，日志里会写明是第几行哪一列出错。

填写规则：

- 多件装备之间用顿号分隔：`毁坏仪式、金铲铲、死亡之舞`
- 英雄的海克斯按“名称 稀有度 胜率”填写，多个之间用分号分隔：`鼓声暴起低音轰鸣 黄金 68.3；秘术冲拳 棱彩 65.8`
- 梯队填 T1~T5；胜率填数字，不带 %
- 英雄的排名按胜率自动算出，不需要填
- 如果某个英雄的内容仍是同定位通用推荐（目前有 134 位），“通用模板”一列填“是”，页面上会显示提示

## 目录

```
index.html                    网页入口
assets/app.css, app.js        样式与交互
assets/icons/                 头像、装备、海克斯图标
data/sheets/*.csv             整理数据（可手工改）
data/open/arammayhem.json     每日下载的开放数据
data/data.json, data.js       网页实际使用的数据（自动生成，不要手改）
dist/hexaram.html             单文件版（自动生成）
scripts/fetch-open-data.mjs   下载开放数据
scripts/import-sheet.mjs      表格 + 开放数据 → data.js
scripts/export-sheet.mjs      data.json → 表格
scripts/fetch-icons.mjs       下载图标
scripts/build-standalone.mjs  打包单文件版
scripts/update-data.mjs       Riot API 采样（目前用不上）
```

本地预览：直接双击 `index.html` 即可。

## Riot API 采样（备用）

`scripts/update-data.mjs` 可以从 Riot API 采样对局并统计胜率和出装，需要在仓库 Secret 里设置 `RIOT_API_KEY`。但这个模式的对局被拉取屏蔽了，所以每日定时已经关掉。哪天拳头开放了数据，可以到 Actions 里手动运行“更新海斗数据”：先勾选“只识别”确认能找到对局，再正式运行。

---

非官方工具，与 Riot Games 无关联。出场率、选取率与精选组合数据来自 arammayhem.com，按 CC BY 4.0 协议使用。
