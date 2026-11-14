# 海斗助手

<!-- update-status:start -->
## 更新记录

- 项目最近更新：2026-11-14 19:30:22（UTC+9）
- 数据最近写入：2026-11-14 15:49:57（UTC+9）
- 来源数据日期：2026-11-11（Hexdata）
- 当前版本可见表同步：100/173 位英雄

以上时间由自动流程维护。数据无变化时不刷新“数据最近写入”；项目更新时间表示提交记录，不代表已经部署成功。
<!-- update-status:end -->

查询英雄联盟“海克斯大乱斗”中每个英雄的海克斯胜率排名与推荐出装。

网站：https://wangyuanpei8-del.github.io/WypHex-aram-site/

## 使用

- 搜索英雄中文名、称号、外号或英文名，选择英雄查看详情。
- 海克斯按该英雄搭配胜率降序，每个稀有度筛选最多显示前 50 个。可筛选棱彩、黄金和白银。
- **鼠标停在海克斯图标或名称文字上**时立即显示效果浮层，移出该图标或名称立即隐藏，无等待或淡入动画；排名、胜率、场次和名称旁空白不触发。浮层显示名称、稀有度、效果说明和版本核对信息，自动避让窗口边缘，并跟随浅色或深色主题。
- 键盘 Tab 聚焦名称可查看说明，Esc 关闭。手机点击名称展开，再次点击或点外部关闭；滚动、筛选或切换英雄时也会关闭。
- 推荐出装展示胜率与场次。少于 1000 场的样本标橙色，仅供参考。
- 手机上选择英雄后进入全屏详情，点击“返回”回到列表。

## 数据与正确性

**胜率和出装来自 [海克斯大乱斗统计数据（AramHex，github.com/czgreat/aramhex-data）](https://github.com/czgreat/aramhex-data)**，按 CC BY-NC 4.0 使用（注明出处、非商业）。数据是国服各大区海斗对局统计（不是全服全部对局），每期几千万局，作者每隔几天更新一次。

- 海克斯排名：该英雄带该海克斯（对局结束时持有）的胜率，按胜率降序；来源标记为小样本的搭配不显示。每个稀有度最多显示前 50 个。
- 推荐出装：至少 3% 该英雄对局会出的成装中，按胜率排前 6。
- 网页将来源客户端版本号（例如 16.22）换算为游戏显示版本号（26.22）。

海克斯效果说明由 `fetch-descriptions.mjs` 从游戏文件（CommunityDragon 解包的中文资料）自动更新；数值变量换不出来的保留之前从 [Hexdata](https://hexdata.com.cn/) 收录的说明，都没有时显示“效果描述暂未收录”。

名称、图标使用游戏资源，图标通过 CommunityDragon 等资源接口下载。本站为非官方工具，与 Riot Games 无关联。

## 更新与发布

`.github/workflows/update.yml` 每 6 小时运行一次，也可在 GitHub Actions 中手动执行“自动更新”：

1. `fetch-aramhex.mjs` 下载 AramHex 最新一期的几个公开 JSON 文件，整理成 `data/open/aramhex.json`；同一期已下载过就跳过。
2. `build-data.mjs` 生成 `data/data.js`；有数据的英雄少于 150 位时报错，不提交可能有问题的数据。`fetch-descriptions.mjs` 更新海克斯效果说明。
3. 数据有变化时补齐图标并提交，随后生成单文件版，上传到该次运行的 Artifacts（保留 90 天）。

GitHub Pages 发布 `main` 分支。更改交互或样式时，同时更新 `index.html` 的静态资源版本参数，避免浏览器使用旧缓存。

2026-11-14 起数据来源由 Hexdata 换成 AramHex：Hexdata 把完整的英雄海克斯表改为登录后才能查看，本项目不处理登录。

## 本地开发

使用 Node.js 20+，不需要安装依赖：

```sh
node scripts/fetch-aramhex.mjs
node scripts/build-data.mjs
node scripts/build-standalone.mjs
```

双击 `index.html` 或启动静态服务器预览。单文件版位于 `dist/hexaram.html`，可离线打开；`dist/` 不提交到仓库。

## 文件

| 文件 | 用途 |
| --- | --- |
| `index.html` | 页面入口与资源版本 |
| `assets/app.js` / `assets/app.css` | 交互、主题与效果浮层 |
| `data/heroes.json` | 英雄中文名、称号、英文标识和别名 |
| `data/open/aramhex.json` | 整理后的 AramHex 统计 |
| `data/data.js` | 生成的英雄海克斯排名与出装数据 |
| `data/augment-descriptions.js` | 海克斯效果说明（游戏文件，缺的用 Hexdata 旧文字） |
| `scripts/fetch-descriptions.mjs` | 更新海克斯效果说明 |
| `data/icons.js` / `assets/icons/` | 图标映射与本地图标 |
| `scripts/fetch-aramhex.mjs` | 下载 AramHex 数据 |
| `scripts/build-data.mjs` | 生成网页数据 |
| `scripts/fetch-icons.mjs` | 补齐图标 |
| `scripts/build-standalone.mjs` | 生成离线单文件版 |

新英雄需要在 `data/heroes.json` 中补上对应的英文标识与中文资料。

README 的功能说明由人工维护；“更新记录”标记块自动维护，统一使用 UTC+9。

## 英雄分类页

`heroes.html` 提供全部、战士、法师、刺客、射手、坦克和辅助分类，点击头像即可进入原有详情页，无需输入名字。定位来自 CommunityDragon 游戏资料，多定位英雄可出现在多个分类中；定位数据保存在 `data/hero-roles.js`，与胜率数据分别维护。

分类页点击英雄会直接进入该英雄的海克斯详情，手机自动打开详情面板；“返回英雄分类”保留之前的定位分类与滚动位置。直接打开带英雄链接的页面，在手机上也会进入详情。
