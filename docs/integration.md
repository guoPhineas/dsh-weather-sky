# 开发与接入指南

本文是 `dsh-weather-sky` 的补充技术文档，面向需要把本包接入 DSH 部署、或在 DSH 仓库内编译它的开发者。基础的功能说明、目录结构、构建与安装步骤见根目录的 [README.md](../README.md)（中文）与 [README.en.md](../README.en.md)（English）。

---

## 1. 双半侧结构

本插件由两部分组成，分别编译进宿主机与浏览器：

| 半侧 | 源文件 | 导出形态 |
| --- | --- | --- |
| Host（Node） | `src/index.ts` | 默认导出的 `WeatherSkyService`（`TypertRemoteService`，`@Remote` 方法） |
| Client（浏览器） | `src/client/index.ts` | `export const inject` + `export function apply`，由 `dsh.client` 清单发现 |

- Host 半侧通过 `@Remote('getWeather')` 暴露远程方法，由 Typert 生成器在构建期产出客户端绑定。
- Client 半侧通过 `ctx.remote.weatherSky.getWeather()` 消费该绑定，并将动画层注册进 `shell.overlay`。

---

## 2. 构建依赖与 Typert 生成

`tsdown.config.ts` 挂载了 `@deepseek-ai/dsh-typert-generator` 的 `typertPlugin`。
构建时它会：

1. 降级处理标准装饰器语法（`@Remote`）；
2. 在 `lib/` 下生成 `typert.host.js` 与 `typert.remote-client.js`（以及对应的 `.d.ts`）。

该生成器通过向上查找最近的 `tsconfig.host.json` 定位工作区根。因此：

- 在 DSH monorepo 内，直接沿用仓库根目录的 `tsconfig.host.json` / `tsconfig.client.json` 即可；
- 在独立仓库内，需要在根目录放置一份 `tsconfig.host.json`（及 `tsconfig.client.json`），并沿用 DSH 的基础编译选项。

---

## 3. 服务依赖

`WeatherSkyService` 声明了 `static inject = ['tools']`，即：

- `tools`：硬依赖（用于注册四个对话工具），宿主始终提供；
- `web` / `shell`：可选能力，在运行时按需取用（`ctx.get('web')` / `ctx.get('shell')`）。网络优先走 `web.fetch`，失败时回退到 `shell` 执行 `curl`，因此即使部署未挂载 HTTP fetch provider 也能工作。

---

## 4. 客户端接入的要点

- `dsh.client.inject` 声明了客户端所需的三方包：
  `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-api-remotes`。
- 客户端通过 `ctx.get('slots')` 拿到槽位服务，注册进 `shell.overlay`（`order: -100`，位于最底层，避免遮挡其它浮层）。
- 样式通过 `apply` 内创建 `<style>` 标签注入，并在 `ctx.effect` 中挂载卸载清理，避免残留。
- 定时刷新使用 `timer` 服务（`ctx.get('timer')`）的 `interval`，返回的 disposer 交给 React effect 清理。

---

## 5. 接入一个 bundle

1. 把本包放入 `packages/extension/weather-sky`；
2. 在目标 bundle 的 patch（例如 `packages/bundle/web-app/cordis.patch.yml`）中加入：
   ```yaml
   - id: weather-sky
     name: '@deepseek-ai/dsh-weather-sky'
   ```
3. 在该 bundle 的 `package.json` `dependencies` 加入 `"@deepseek-ai/dsh-weather-sky": "workspace:^"`；
4. 重新构建并重启 DSH。

挂入 bundle 属于宿主组合改动：发布 `weatherSky` 服务时，需按部署的 realm 规则判断是否需要 `isolate` realm（参见 DSH 的 composition 规范）。

---

## 6. 与仓库既有插件的对照

本包遵循 DSH 仓库内既有插件（如 `message-feedback`、`client-ui-theme`）的同类约定：

- Host 服务类：`extends TypertRemoteService` + `@Remote` 方法；
- Client 半侧：`export const inject` + `export function apply` + `dsh.client` 清单；
- `invariant.ts` 伴生插件与 `dsh-invariants` peer 依赖；
- `exports` 中的 `./client`、`./types`、`./typert`、`./remote` 子路径。

可参考这些既有包来核对类型与构建细节。
