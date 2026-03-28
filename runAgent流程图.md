# runAgent 流程图

本文档用于帮助理解研究助手 Agent 在运行时是如何组织 `LLM -> Tool -> Observation -> 下一轮决策` 这个闭环的。

需要先区分两个概念：

- 单轮流程：一次模型调用之后，如何处理当前返回的 `tool_calls`
- 完整流程：`runAgent` 如何在多轮中不断调用模型、执行工具、回写结果，直到结束

## 1. 单轮流程图

这里的“单轮”，指的是一次 `callModel(...)` 返回结果之后，到这批工具调用执行完成为止。

```txt
已有 messages
-> callModel({ messages, tools })
-> LLM 返回 assistant message
-> 判断是否包含 tool_calls
-> 如果没有 tool_calls
-> 当前轮结束，进入“是否生成最终答案/是否继续下一轮”的判断

-> 如果有 tool_calls
-> dispatchToolCalls(registry, toolCalls)
-> 按数组顺序逐个执行工具
-> 得到每个工具的 ToolExecutionResult
-> appendToolMessage(...)
-> 当前轮结束
-> 带着新的 messages 进入下一轮
```

## 2. 单轮内部结构图

这张图只看“一次模型返回后，本地代码如何处理工具调用”。

```txt
LLM 返回 tool_calls[]
-> dispatcher 读取 tool_calls
-> 根据 toolCall.function.name 从 registry 查找工具
-> 解析 toolCall.function.arguments
-> 调用对应工具的 execute(...)
-> 得到 ToolExecutionResult
-> 转成 tool message
-> 追加回 messages
```

## 3. 完整 runAgent 多轮流程图

这张图对应的是未来 `runAgent.ts` 要实现的完整闭环。

```txt
用户输入 topic
-> createInitialMessages(topic, systemPrompt)
-> 进入 while / iteration loop

第 N 轮：
-> callModel({ messages, tools })
-> 得到 assistant 输出
-> 记录 assistant message
-> 检查是否存在 tool_calls

如果存在 tool_calls：
-> dispatchToolCalls(registry, toolCalls)
-> 将每个工具结果 appendToolMessage(...)
-> 进入下一轮

如果不存在 tool_calls：
-> 判断是否已经可以输出研究报告
-> 如果可以，结束循环
-> 如果不可以，进入下一轮或触发补充逻辑

循环结束
-> 生成最终报告
-> 保存输出
```

## 4. 多轮依赖示例

研究助手最常见的不是“一轮把所有工具都调完”，而是多轮逐步推进。

例如：

```txt
第 1 轮
-> LLM 调用 search_web("低空经济 商业化")
-> 返回搜索结果列表

第 2 轮
-> LLM 读取搜索结果
-> 选择一个最有价值的 URL
-> 调用 fetch_page_content(url)
-> 返回正文内容

第 3 轮
-> LLM 基于正文继续判断
-> 决定补充搜索 / 换一个页面 / 开始总结
```

这说明：

- 工具调用顺序通常不是靠预先固定脚本决定
- 而是由模型在每一轮读到 observation 后，再决定下一步

## 5. 当前代码中的角色分工

下面这张图对应当前项目里已经写好的模块。

```txt
systemPrompt.ts
-> 定义模型行为规则

messageManager.ts
-> 维护 messages

toolSchema.ts
-> 把本地工具定义转换成 LLM tools schema

client.ts
-> 调用 OpenAI Compatible 模型

registry.ts
-> 保存本地可执行工具

dispatchToolCall.ts
-> 执行模型请求的工具调用

searchWeb.ts / fetchPageContent.ts
-> 具体工具实现
```

## 6. 一个关键理解

`runAgent` 不是“先生成完整计划，再由程序机械执行到底”。

更准确的理解是：

```txt
模型决定当前这一步做什么
-> 工具执行
-> 结果回传
-> 模型根据最新 observation 再决定下一步
```

这就是 Agent 的基本闭环：

`Thought -> Action -> Observation -> Reflection`

## 7. 结论

如果只看你刚才问的“流程图是否显示在单轮 runAgent 的流程”，答案是：

- 文档里有单轮流程图
- 也有完整 runAgent 的多轮流程图

原因是只看单轮会看不到 Agent 为什么能连续研究；只看完整流程又容易忽略 tool call 在一轮内部是怎么被调度的。
