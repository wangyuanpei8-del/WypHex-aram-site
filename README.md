# 海斗助手 · 海克斯大乱斗出装与海克斯速查

## 👉 打开网站：https://wangyuanpei8-del.github.io/WypHex-aram-site/

英雄联盟“海克斯大乱斗”模式的查询网站，手机和电脑都能用。把上面的链接发给朋友，对方点开就能看。

- **左边是榜单**：英雄、海克斯、装备、乐队四张榜，可以搜索和筛选
- **右边是英雄详情**：推荐出装、海克斯优先级、“选海克斯速查”（选海克斯时点本轮的稀有度，刷出来的三个里谁排得最靠前就选谁）、精选组合、上手要点
- **全自动**：每天北京时间凌晨 3 点自动拉取最新数据，平时不需要任何手工操作

---

## 数据从哪来

| 网页上的内容 | 来源 | 更新方式 |
|---|---|---|
| 每个英雄的推荐出装、海克斯优先级、选海克斯速查（评级 T1~T5，T1 最强） | [Blitz](https://blitz.gg/lol) | **每天自动** |
| 海克斯榜上的 Blitz 全局评级 | Blitz | **每天自动** |
| 英雄出场率及较上个版本的变化 | [arammayhem.com 开放数据](https://arammayhem.com/data/)（CC BY 4.0） | **每天自动** |
| 海克斯选取率、稀有度、是否本版本新增 | arammayhem.com | **每天自动** |
| 精选组合（英雄 + 海克斯） | arammayhem.com | **每天自动** |
| 英雄头像、装备和海克斯图标 | Data Dragon、CommunityDragon | **每天自动**补齐 |
| 英雄胜率与梯队、流派、加点、锻体、上手要点、王牌组合、装备榜、乐队 | 最早那版网页（单文件 index.html）里自带的数据，标注来源为 Hexdata / ARAMGG / ARAM Mayhem / OP.GG 手工整理，26.21 版本；现存放在 `data/sheets/` | 不会自动更新，页面上注明“仅供参考” |

### 为什么胜率没法自动更新

- **拳头官方 API 拿不到**：拳头有意不在官方 API 里公开海克斯大乱斗的对局，不让外部网站统计这个模式的胜率（见 [#1109](https://github.com/RiotGames/developer-relations/issues/1109)、[#1204](https://github.com/RiotGames/developer-relations/issues/1204)）。
- **两个自动来源都只给相对强弱**：arammayhem.com 只提供出场率和选取率，Blitz 只提供评级，都没有胜率。
- **所以网页这样显示**：出装和海克斯用 Blitz 评级排序，显示 T1~T5，不显示胜率。英雄胜率沿用 26.21 版本的整理数据。

### Blitz 评级的可靠性

- **准不准**：用全服选取率核对过。T1 海克斯的平均选取率最高（约 31%），往下逐级降到 T5 的约 9%，说明评级方向是对的。
- **对不上的会跳过**：Blitz 给的是编号。脚本只采用能在 arammayhem 海斗海克斯清单里找到中文名的海克斯（目前约 300 个能对上），对不上的直接跳过，不会乱填。
- **同一评级里的顺序**：Blitz 没有给出先后，网页按全服选取率排。
- **有风险**：这个接口是 Blitz 网站自己用的，没有公开授权，可能随时改版或失效。失效时自动任务会跳过这一步，网页继续显示上一次拿到的评级，不会出错。届时英雄出装会回到 `data/sheets/1-英雄.csv` 里整理的内容。

---

## 自动任务（GitHub → Actions）

| 任务 | 什么时候运行 | 做什么 |
|---|---|---|
| 每日自动更新 | 每天北京时间 03:00，也可以在 Actions 里手动点 Run workflow | 依次运行 4 个脚本（见下表），然后把结果提交到仓库 |
| 导入表格 | 改了 `data/sheets/` 里的表格并提交后自动运行 | 检查表格格式，重新生成网页数据和单文件版 |

“每日自动更新”运行的 4 个脚本：

| 脚本 | 做什么 |
|---|---|
| `fetch-open-data.mjs` | 下载 arammayhem 数据 |
| `fetch-blitz.mjs` | 下载 Blitz 评级（失败就跳过这一步） |
| `import-sheet.mjs` | 合并成网页数据 |
| `fetch-icons.mjs` | 补齐新图标、删掉不再用的旧图标 |

跑完后还会用 `build-standalone.mjs` 重新打包单文件版。

- **网站多久变**：网站托管在 GitHub Pages，只发布 `main` 分支。每次有新提交，大约 1 分钟后网站自动更新。
- **测试分支没有网站**：别的分支不会有自己的网站，可以放心拿来试东西。
- **出错时**：任务失败的话，GitHub 会给仓库主人发邮件，网页继续显示上一次的数据。

## 发到微信 / QQ 群

`dist/hexaram.html` 是单文件版，图标和数据都打包在里面，大约 6 MB。下载后直接把这个文件发出去就行，不联网也能打开。每天的自动更新会一起刷新它。

---

## 手工修改整理数据（可选）

平时不需要。如果想改胜率、要点之类的文字，整理数据都在 `data/sheets/` 的 5 张表里：

| 文件 | 内容 |
|---|---|
| `0-版本信息.csv` | 版本号、模式、更新日期、数据来源 |
| `1-英雄.csv` | 每行一个英雄：梯队、胜率、场次、定位、流派、加点、锻体、出装、海克斯、组合、要点 |
| `2-海克斯.csv` | 海克斯榜的梯队、胜率、效果说明、推荐英雄 |
| `3-装备.csv` | 装备榜 |
| `4-王牌组合.csv` | 王牌组合 |

**怎么改**：

- **在 GitHub 网页上改**：打开表格，点右上角的铅笔图标，改完点 Commit changes。
- **用 Excel 改**：下载表格，改完另存为“CSV UTF-8”，再上传覆盖。

提交后，“导入表格”任务会自动检查格式。如果有错，这次不会更新网页，日志里会写明是第几行、哪一列出错。

**填写规则**：

- 多件装备之间用顿号分隔，例如 `毁坏仪式、金铲铲、死亡之舞`。
- 英雄的海克斯按“名称 稀有度 胜率”填写，多个之间用分号分隔，例如 `鼓声暴起低音轰鸣 黄金 68.3；秘术冲拳 棱彩 65.8`。
- 梯队填 T1~T5，胜率填数字，不带 %。英雄排名按胜率自动算，不用填。
- 英雄表里的“核心装备”“备选装备”“海克斯”三列，只在拿不到 Blitz 评级时才会显示，平时网页用的是 Blitz 评级。
- 内容还是同定位通用模板的英雄，“通用模板”一列填“是”。拿不到 Blitz 评级时，页面会提示“仅供参考”。

---

## 目录

```
index.html                     网页入口
assets/app.js, app.css         网页交互与样式
assets/icons/                  英雄头像、装备和海克斯图标（自动下载）
data/sheets/*.csv              整理数据（可手工改）
data/open/arammayhem.json      每日下载的 arammayhem 数据
data/open/blitz.json           每日下载的 Blitz 评级
data/data.json, data.js        网页实际使用的数据（自动生成，不要手改）
data/icons.js                  图标对照表（自动生成）
dist/hexaram.html              单文件版（自动生成）
scripts/fetch-open-data.mjs    下载 arammayhem 数据
scripts/fetch-blitz.mjs        下载 Blitz 评级
scripts/import-sheet.mjs       表格 + 两份下载数据 → 网页数据
scripts/sheet-lib.mjs          读表格用的工具
scripts/fetch-icons.mjs        下载图标
scripts/build-standalone.mjs   打包单文件版
.github/workflows/             两个自动任务
```

**本地预览**：下载仓库后直接双击 `index.html`。

**在自己电脑上手动更新**：需要安装 Node.js 20 或以上版本，然后依次运行：

```
node scripts/fetch-open-data.mjs
node scripts/fetch-blitz.mjs
node scripts/import-sheet.mjs
node scripts/fetch-icons.mjs
node scripts/build-standalone.mjs
```

---

非官方工具，与 Riot Games 无关联。

- 出场率、选取率与精选组合数据来自 [arammayhem.com](https://arammayhem.com/data/)，按 CC BY 4.0 协议使用。
- 出装与海克斯评级来自 [Blitz](https://blitz.gg/lol)。
