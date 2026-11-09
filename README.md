# 海斗助手

英雄联盟“海克斯大乱斗”查询网站：选一个英雄，看它的**海克斯胜率排名**和**推荐出装**。

网站：https://wangyuanpei8-del.github.io/WypHex-aram-site/ （GitHub Pages 发布 main 分支，提交后约 1 分钟生效）

## 页面内容

- 左边：英雄列表，按英雄胜率排序，可以搜名字、称号、外号、英文名。
- 右边：
  - **海克斯胜率排名**：这位英雄带每个海克斯时的胜率和场次，从高到低排，可按棱彩 / 黄金 / 白银筛选。
  - **推荐出装**：Hexdata 给这位英雄的 8 件推荐装备，带胜率和场次。
- 鼠标放在海克斯名称上可查看效果描述；键盘 Tab 聚焦也可查看，手机点击名称展开，再点一次收起。描述来自 CommunityDragon，本地缓存并随单文件版打包；缺项显示“暂无效果描述”。
- 场次少于 1000 的标橙色，样本少，仅供参考。
- 手机上点英雄后详情全屏显示，左上角返回。

## 数据来源

全部来自 [Hexdata](https://hexdata.com.cn)（数据来源：Hexdata（hexdata.com.cn）），它的 robots.txt 允许抓取公开页面，要求注明出处。Hexdata 统计的是公开可查的对局样本，不是全服所有对局。

拳头官方 API 故意不公开海克斯大乱斗的对局（见 [#1109](https://github.com/RiotGames/developer-relations/issues/1109)、[#1204](https://github.com/RiotGames/developer-relations/issues/1204)），所以没有官方数据可用。

每个英雄的海克斯排名由两部分合起来：

1. 英雄页（`/hero/...`）列出的 8 个海克斯；
2. 海克斯详情页（`/augment/...`）里“适配英雄”表的搭配胜率（每个海克斯 12 位英雄）。

Hexdata 写的是客户端版本号（16.21），网页换算成游戏里的版本号（26.21）显示。

## 自动更新

只有一个自动任务 `.github/workflows/update.yml`（GitHub → Actions → 自动更新），**每小时**运行一次，也可以手动点 Run workflow：

1. `scripts/fetch-hexdata.mjs`：读英雄排行页和海克斯排行页，再读最多 30 个需要更新的详情页，结果存到 `data/open/hexdata.json`。
2. `scripts/build-data.mjs`：把 `data/heroes.json`（英雄中文名、称号、头像编号、外号）和上面的数据合成网页用的 `data/data.js`。
3. 有变化时：`scripts/fetch-icons.mjs` 补齐图标（`assets/icons/`、`data/icons.js`），提交到仓库；`scripts/build-standalone.mjs` 打包单文件版并上传。

**Hexdata 有访问频率限制**：连续读 40 个左右页面就会返回 429。所以每次最多读 30 个，每页间隔 2 秒，一被限流就停，下次接着读。Hexdata 出新数据后，大约 13 小时内全部更新完；数据没变时每次只读 2 个排行页，不会产生提交。

自动任务在 GitHub 上运行，公开仓库免费，不需要任何手工操作。任务失败时 GitHub 会给仓库主人发邮件，网页继续显示上一次的数据。

## 单文件版

单文件版把网页、数据、图标打包成一个 `hexaram.html`（约 7 MB），不联网也能打开，适合发到微信 / QQ 群。它不存进仓库，免得仓库越来越大。下载方法：Actions → 自动更新 → 点最近一次**有数据更新**的运行 → 页面底部 Artifacts 里的“hexaram-单文件版”，解压即可。每份保留 90 天。

## 文件

```
index.html                     网页入口
assets/app.js, app.css         交互与样式
assets/icons/                  英雄头像、装备和海克斯图标（自动下载）
data/heroes.json               英雄中文名、称号、头像编号、外号（新英雄出来时手动加一行）
data/open/hexdata.json         从 Hexdata 读到的数据（自动生成）
data/data.js                   网页数据（自动生成）
data/icons.js                  图标对照表（自动生成）
scripts/fetch-hexdata.mjs      读取 Hexdata
scripts/build-data.mjs         生成网页数据
scripts/fetch-icons.mjs        下载图标
scripts/build-standalone.mjs   打包单文件版
.github/workflows/update.yml   自动任务
```

## 注意

- 新英雄上线时要在 `data/heroes.json` 加一行（`key` 是 Data Dragon 的英雄英文 id，用来找头像），否则列表里没有它。
- 改了网页代码后可以本地双击 `index.html` 预览。

---

非官方工具，与 Riot Games 无关联。数据来源：Hexdata（hexdata.com.cn）。

海克斯效果描述更新：`node scripts/fetch-augment-descriptions.mjs`（需访问 `raw.communitydragon.org`），生成 `data/augment-descriptions.js`。自动更新任务会尝试刷新，失败时保留已有文件。描述中的未解析数值会明确标注以游戏内为准。
