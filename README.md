# Research Assistant

一个基于 `TypeScript` 从零实现的研究助手 Agent。项目不依赖 LangChain 一类 Agent 框架，而是直接使用 `OpenAI Compatible API + 本地工具调度` 来完成规划、搜索、正文提取、总结和反思。

## 项目目标

这个项目的重点不是“快速拼一个能跑的问答程序”，而是把 Agent 的关键环节拆开并亲手实现出来，包括：

- `Planning`：先拆研究维度和关键词
- `Tool Use`：让模型决定何时调用工具
- `Observation`：把工具结果写回上下文
- `Reflection`：在准备结束时进行一次自检
- `Report Output`：输出 Markdown 报告

## 技术栈

- `TypeScript`
- `Node.js`
- `pnpm`
- `openai`
- `@tavily/core`
- `dotenv`

## 安装与运行

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并填写实际配置：

```env
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://your-compatible-endpoint/v1
LLM_MODEL=your-model-name

SEARCH_PROVIDER=mock
SEARCH_API_KEY=your_search_api_key
SEARCH_BASE_URL=https://api.tavily.com
```

说明：

- `LLM_*` 用于配置 OpenAI Compatible 模型服务
- `SEARCH_PROVIDER` 支持 `mock` 和 `tavily`
- `mock` 用于打通流程
- `tavily` 用于真实搜索和正文提取

### 3. 开发运行

```bash
pnpm dev "分析 2025 年低空经济的商业落地现状"
```

### 4. 构建与运行

```bash
pnpm build
pnpm start "分析 2025 年低空经济的商业落地现状"
```

### 5. 类型检查

```bash
pnpm check
```

## 输出结果

运行后会产生两类输出：

- 控制台日志：展示 planning、工具调用、反思等过程
- `output/` 下的 Markdown 报告：保存最终研究结果

默认还会在项目根目录生成：

- `agent.log`：保存 Agent 过程日志，不包含最后单独输出到控制台的完整最终答案

## 目录结构

```txt
src/
  engine/
    planner.ts
    reflection.ts
    runAgent.ts
    toolUsageSummary.ts
  llm/
    client.ts
    modelConfig.ts
    toolSchema.ts
  memory/
    messageManager.ts
  prompts/
    planningPrompt.ts
    reflectionPrompt.ts
    systemPrompt.ts
  report/
    buildReport.ts
    saveReport.ts
  tools/
    dispatchToolCall.ts
    fetchPageContent.ts
    registry.ts
    searchWeb.ts
    types.ts
  utils/
    logger.ts
  index.ts
```

### 关键目录说明

- `src/index.ts`
  项目入口。负责读取配置、接收用户主题、启动 Agent、生成并保存报告。

- `src/engine/runAgent.ts`
  Agent 主流程控制器。串联 planning、模型调用、工具调度、reflection 和最终收敛。

- `src/engine/planner.ts`
  负责在正式研究前生成结构化研究计划，提取 `2-3` 个研究维度和关键词。

- `src/llm/`
  封装模型配置、OpenAI Compatible 客户端和工具 schema 转换逻辑。

- `src/tools/`
  定义和实现本地工具，目前包含：
  - `search_web`
  - `fetch_page_content`

- `src/prompts/`
  维护系统 prompt、planning prompt 和 reflection prompt。

- `src/report/`
  负责把运行结果整理成 Markdown 并写入 `output/`。

- `src/utils/logger.ts`
  负责控制台日志和 `agent.log` 文件日志。

## Agent 执行过程

当前 Agent 的执行过程可以概括为下面几个阶段。

### 1. 配置检查

启动时先读取 `.env`，检查：

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`

如果模型配置缺失，程序会直接退出，不进入主流程。

### 2. Planning 阶段

在正式研究前，Agent 会先调用一次模型进行规划，目标是：

- 将用户主题拆成 `2-3` 个研究维度
- 为每个维度提取 `2-3` 个可检索关键词

这一步的结果会被：

- 输出到日志
- 追加到消息上下文

后续模型会优先参考这些维度和关键词来进行搜索。

### 3. 主研究循环

进入正式循环后，每一轮会执行：

1. 向模型发送当前 `messages + tools`
2. 判断模型是否返回工具调用
3. 如果有工具调用，则执行本地工具
4. 将工具结果作为 `observation` 写回消息历史
5. 进入下一轮

当前工具包括：

- `search_web`
  用于搜索标题、链接和摘要

- `fetch_page_content`
  用于读取网页正文内容

### 4. Observation 回写

每次工具执行完成后，程序都会把结果写回消息上下文。这样模型在下一轮不是“凭空继续”，而是基于已经看到的搜索结果和正文内容继续判断。

这是当前项目里很关键的一层：

- 工具不是直接帮程序生成结论
- 工具只是提供 observation
- 最终判断仍由模型基于上下文完成

### 5. Reflection 阶段

当某一轮模型没有继续调用工具时，程序不会立刻结束，而是进入 reflection。

reflection 的目标是让模型在结束前做一次自检：

- 当前证据是否足够
- 是否仍缺少关键信息
- 是否需要继续调用工具
- 是否可以输出最终回答

当前 reflection 还会把工具使用统计提供给模型，例如：

- 总调用次数
- 成功次数
- 失败次数
- 各工具分别调用了多少次

此外，当前实现里还加入了一条重要门槛：

- 如果 `fetch_page_content` 成功次数为 `0`
- 模型不应直接通过 reflection
- 应优先从已有搜索结果中选择高价值来源继续抓取正文

### 6. 最终报告输出

当模型通过 reflection 后，程序会：

1. 生成最终 Markdown 报告
2. 保存到 `output/`

报告内容通常包括：

- 标题
- 引言
- 多维分析
- 结论
- 参考资料

## 日志中值得关注的关键节点

查看 `agent.log` 时，建议重点关注这些日志：

- `进入 planning 阶段`
- `规划维度 x -> ...`
- `第 x 轮开始，准备请求模型`
- `工具调用 -> search_web / fetch_page_content`
- `工具结果 <- ... 成功 / 失败`
- `进入反思阶段`
- `反思通过 / 反思未通过`

通过这些日志，基本可以还原一次完整的 Agent 执行轨迹。

## 当前实现的几个注意点

- planning 当前是“前置规划 + 写入上下文”，不是程序强制按每个关键词逐条搜索。
- `search_web` 结果只是候选来源，不能天然等价于高质量正文证据。
- 真实研究质量很大程度取决于模型是否会主动选择高价值来源调用 `fetch_page_content`。
- reflection 是当前质量控制的关键阶段，它负责阻止过早结束。
- 如果 Tavily 返回结果偏弱、关键词过宽，模型仍可能在搜索阶段来回补搜。

## 开发建议

- 先用 `SEARCH_PROVIDER=mock` 打通链路，再切换到 `tavily`
- 先看 `agent.log` 再看最终报告，定位问题会更快
- 优先优化 prompt、reflection 和日志，不要一上来把所有策略硬编码进主流程

## 当前版本边界

当前项目已经具备：

- 基础 planning
- 工具调用闭环
- 正文提取
- 反思阶段
- Markdown 报告输出

当前还不是一个“全自动、强约束、多阶段编排”的研究系统，更多是一个适合学习 Agent 核心机制的最小到中等复杂度实现。
