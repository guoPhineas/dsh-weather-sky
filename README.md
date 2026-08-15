# dsh-weather-sky

[English](./README.en.md)

一个 DeepSeek Harness（DSH）插件：在浏览器界面叠加一层**实时天气与天空动画**——白天显示太阳，夜晚显示带真实月相的月亮，并按天气呈现云、雨（随强度自适应）、雪、雾，以及周期性的闪电。它通过 IP 自动定位，从 Open-Meteo 获取实时天气（无需 API key），并注册对话工具，让用户可以直接用自然语言切换地点、强制天气或查看未来预报。

---

## 特性

| 能力 | 说明 |
| --- | --- |
| IP 定位 | 依次使用 `ipwho.is` → `ipapi.co`（免费、无需 key） |
| 实时天气 | Open-Meteo `current`（温度、天气码、昼夜、风速、云量、降水） |
| 未来预报 | `weather_set_time` 可查看未来某时刻（如「明天 14:00」） |
| 昼夜切换 | 白天太阳，夜晚月亮 + 星星 |
| 月相 | 计算并可视化月相（新月 → 娥眉月 → 上弦月 → 盈凸月 → 满月 → 亏凸月 → 下弦月 → 残月） |
| 日月运动 | 太阳按太阳时东升—中天—西落划弧；月亮按时间 + 月相划弧 |
| 天气可视化 | 云、雨（随强度缩放）、雪、雾、雷暴闪电（约每 6 秒一次） |
| 不遮挡文字 | 整层 `pointer-events:none`、低透明度、半透明状态胶囊 |
| 对话工具 | `weather_set_location`、`weather_set_condition`、`weather_set_time`、`weather_reset` |

---

## 天气码映射

| WMO 码 | 条件 | 视觉 |
| --- | --- | --- |
| 0 | 晴 clear | 太阳 / 月亮 |
| 1–2 | 局部多云 partly-cloudy | 太阳 + 少量云 |
| 3 | 阴 cloudy | 云，无日月 |
| 45/48 | 雾 fog | 漂移雾层 |
| 51–57 | 毛毛雨 drizzle | 小雨滴 |
| 61/63/65 | 小雨/中雨/大雨 | 雨滴随强度自适应 |
| 71/73/75 | 小雪/中雪/大雪 | 飘雪 |
| 80–82 | 阵雨 → 暴雨 | 雨滴随强度自适应 |
| 85/86 | 阵雪 | 飘雪 |
| 95–99 | 雷暴 thunderstorm | 深云 + 大雨 + 闪电 |

---

## 目录结构

```
src/
├── index.ts          # Host 半侧：WeatherSkyService（TypertRemoteService + @Remote）
├── invariant.ts      # invariant 伴生插件
├── types.ts          # 共享类型（WeatherSnapshot、WeatherCondition 等）
└── client/index.ts   # Client 半侧：shell.overlay 动画层
tsdown.config.ts      # 构建（tsdown + typert 生成器）
package.json          # 清单：dsh.client、exports、peerDeps
```

---

## 架构

- **Host 半侧**：提供 `weatherSky` 服务，暴露一个远程方法
  `@Remote('getWeather')`，返回 `WeatherSnapshot`（无损 JSON）。
- **Client 半侧**：通过 Typert 生成的绑定 `ctx.remote.weatherSky.getWeather()`
  获取数据，每 15 秒轮询一次，并将动画层渲染进 `shell.overlay` 槽位。
- **网络**：优先走 `ctx.web.fetch`；当部署未挂载 HTTP fetch provider 时，
  回退到 `ctx.shell` 执行 `curl`。

---

## 构建

```sh
pnpm install
pnpm build   # tsdown + typert 生成
```

Typert 生成器会为 `@Remote` 方法产出 `lib/typert.host.js` 与
`lib/typert.remote-client.js`。它通过向上查找最近的 `tsconfig.host.json`
定位工作区根；独立仓库需在根目录放置 `tsconfig.host.json`（及
`tsconfig.client.json`），并沿用 DSH 的基础编译选项。

---

## 安装与接入

DSH 通过 `cordis.yml` / bundle patch 里的「插件行」来组合插件。要把本插件接入并使其他用户可用：

1. 将本包放入 DSH 仓库（或 fork）的 `packages/extension/weather-sky`；
2. 在目标 bundle 的 patch 中加一行，例如
   `packages/bundle/web-app/cordis.patch.yml`：
   ```yaml
   - id: weather-sky
     name: '@deepseek-ai/dsh-weather-sky'
   ```
3. 在该 bundle 的 `package.json` `dependencies` 中加入 `"workspace:^"` 依赖；
4. 重新构建并重启 DSH，该 profile 下的所有会话即可使用天气覆盖层与四个对话工具。

> 说明：DSH 插件当前遵循 monorepo 约定（`workspace:^` 依赖 + Typert 代码生成依赖工作区根），因此标准做法是随部署分发，而非作为独立 npm 包 `npm install`。

---

## 对话工具

| 工具 | 用途 | 示例 |
| --- | --- | --- |
| `weather_set_location` | 设置显示地点（地理编码） | 「把天气改成北京」 |
| `weather_set_condition` | 手动指定天气效果 | 「显示打雷」「下雪」 |
| `weather_set_time` | 设置目标时间（当前/未来） | 「显示明天 14:00」「回到现在」 |
| `weather_reset` | 恢复自动（IP + 当前时间） | 「恢复自动天气」 |

---

## 许可证

[MIT](./LICENSE)
