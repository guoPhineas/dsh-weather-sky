# dsh-weather-sky

[English](./README.en.md)

一个 DeepSeek Harness（DSH）Web GUI 的**实时天气与天空动画插件**：在界面叠加一层指针穿透的动画层——白天显示太阳、夜晚显示带真实月相的月亮，并按天气呈现云、雨（随强度自适应）、雪、雾，以及周期性的闪电。

天气数据在**浏览器端**直接从 Open-Meteo 获取（无需 API key），通过浏览器定位（`navigator.geolocation`，回退到 `ipwho.is`）确定位置。

---

## 特性

| 能力 | 说明 |
| --- | --- |
| 定位 | 浏览器定位优先，回退 IP 定位（`ipwho.is`） |
| 实时天气 | Open-Meteo（免 key）：温度、天气码、昼夜、云量、降水 |
| 昼夜切换 | 白天太阳，夜晚月亮 + 星星 |
| 月相 | 计算并可视化月相（新月 → 娥眉月 → 上弦月 → 盈凸月 → 满月 → 亏凸月 → 下弦月 → 残月） |
| 日月运动 | 太阳按太阳时东升—中天—西落划弧；月亮按时间 + 月相划弧 |
| 天气可视化 | 云、雨（随强度缩放）、雪、雾、雷暴闪电（约每 6 秒一次） |
| 不遮挡文字 | 整层 `pointer-events:none`、低透明度、右下角半透明状态胶囊 |

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

## 安装

### 建议安装操作

给 dsh 发送信息：

```
安装这个天气插件：https://github.com/guoPhineas/dsh-weather-sky
```

### 使用命令行

```sh
git clone https://github.com/guoPhineas/dsh-weather-sky
cd <harness>
dsh plugin --profile web add ../dsh-weather-sky
```

---

## 目录结构

```
src/
├── index.ts            # Host 半侧（空 apply，本插件为浏览器端插件）
└── client/index.ts     # Client 半侧：抓取天气 + DOM/CSS 动画层
cordis.patch.yml        # bundle patch（insert 本插件的 dsh.client 入口）
tsdown.config.ts        # 构建（tsdown）
package.json            # 清单：dsh.bundle.patch、dsh.client、peerDeps
```

---

## 构建

```sh
pnpm install
pnpm build   # tsdown
```

构建产物输出到 `lib/`（`index.js` 为宿主入口，`client.js` 为浏览器半侧）。

---

## 说明

- 本插件是**客户端为主**的插件：天气在浏览器端抓取并渲染，宿主半侧不注册任何模型工具。
- DSH 的外部插件依赖发布版 `@deepseek-ai/cordis`（`^4.0.1`），通过 `dsh plugin --profile <name> add <path>` 安装，无需改动 DSH 源码。
- 若天气接口或定位服务偶发失败，插件会保留上一帧画面，并在下一轮（15 秒）自动重试。

---

## 许可证

[MIT](./LICENSE)
