# 海斗助手 · 海克斯大乱斗胜率与出装

一屏看榜单、搜英雄、查出装和海克斯。没有后端，也不依赖任何外部 CSS/字体 CDN，国内网络和离线都能正常显示。

## 目录

```
index.html                 页面骨架
assets/app.css             样式（系统中文字体，无 Tailwind）
assets/app.js              交互逻辑
data/data.json             数据源（脚本读写这个）
data/data.js               网页实际加载的数据（由脚本生成）
data/raw/state.json        采样进度与累计统计（脚本自动维护）
scripts/update-data.mjs    从 Riot API 采样对局并重算数据
scripts/build-standalone.mjs  打包成单文件 dist/hexaram.html
.github/workflows/update-data.yml  每天自动更新数据
netlify.toml / vercel.json / _headers  各平台缓存规则
```

## 本地预览

直接双击 `index.html` 即可。英雄头像从 Data Dragon 加载，连不上时显示文字头像。

## 部署（推荐 Cloudflare Pages，国内访问较稳）

1. 把整个目录推到一个 GitHub 仓库。
2. Cloudflare Pages → 连接这个仓库，构建命令留空，输出目录填 `/`。
3. 之后每次数据提交都会自动重新部署。

想发到微信/QQ 群：运行 `node scripts/build-standalone.mjs`，把生成的 `dist/hexaram.html` 发出去即可，约 310 KB。

## 自动更新数据

1. 在 https://developer.riotgames.com 申请 **Personal API Key**（开发 key 24 小时过期，不适合定时任务）。
2. GitHub 仓库 → Settings → Secrets and variables → Actions：
   - Secret `RIOT_API_KEY` = 你的 key
   - （可选）Variable `RIOT_PLATFORMS` = 采样服务器，逗号分隔，默认 `kr,na1,euw1,sg2`。限速按地区分别计算（韩服、日服共用亚洲额度），同时采样
   - Variable `QUEUE_ID` = 海克斯大乱斗的 queueId（默认 2400，请对照 [queues.json](https://static.developer.riotgames.com/docs/lol/queues.json) 确认）
3. Actions → “更新海斗数据” → Run workflow 先手动跑一次。之后每天北京时间 03:00 自动运行。

每次运行约 3 小时，每个服务器最多 9,000 次请求，四个服务器同时采样。可在 Run workflow 时勾选“只重算”，几分钟内用已累计的数据重新计算。版本号变化时自动清空旧版本统计重新累计。脚本按英雄聚合胜率，用 Wilson 下界给装备和海克斯排序，避免小样本冲榜。

不联网测试整条流程：`node scripts/update-data.mjs --mock --out /tmp/test`

### 限制

- Riot API 不包含国服（腾讯运营），数据来自所选外服。
- 称号、外号、流派、上手要点、组合说明是手写文字，脚本只会保留，不会生成。
- 目前 134 位英雄的出装和海克斯是按定位套的通用推荐，页面上有提示；接入实时数据后会自动换成专属数据。
