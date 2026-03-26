<p align="center">
  <img src="logo.png" alt="BattleChess logo" width="220">
</p>

# BattleChess - Xiangqi Arena

一个用于中国象棋对战的本地 Arena，支持人类、随机策略和 LLM 之间的任意两两对战。

前端使用原生 HTML/CSS/JS + Canvas，后端使用 FastAPI。LLM 调用统一走 OpenAI Python SDK，并通过 `base_url` 兼容不同服务商。

## 功能

- 棋盘支持点击走子
- 支持自定义 FEN 开局
- 支持 OpenAI 兼容接口
- 支持预设模型和自定义模型
- 支持每个 LLM 单独设置 Prompt 语言
- 支持每个 LLM 单独开关思考模式
- 支持实时显示 thinking / reasoning / tool call / tool result
- 支持对局结束后按“双方 + 时间戳”保存独立日志文件
- 日志文件不仅保存走法序列，也保存 thinking / reasoning / tool call / tool result

## 运行环境

- Python 3.10+

安装依赖：

```bash
pip install -r requirements.txt
```

启动服务：

```bash
python server.py
```

默认地址：

```text
http://127.0.0.1:8000
```

## 配置模型

复制配置模板：

```bash
copy config.example.yaml config.yaml
```

`config.yaml` 示例：

```yaml
models:
  - name: spark-x
    api_base: https://spark-api-open.xf-yun.com/x2/
    api_key: your_api_key
    model: spark-x
    prompt_name: zh
    enable_thinking: true

  - name: gpt-4o
    api_base: https://api.openai.com/v1
    api_key: sk-xxxxxxxxxxxxxxxx
    model: gpt-4o
    prompt_name: zh
    enable_thinking: true
```

说明：

- `api_base` 直接传给 OpenAI SDK 的 `base_url`
- `prompt_name` 可选，对应 `prompts/` 目录下的 prompt 文件名
- `enable_thinking` 可选，默认 `true`

## Prompt Files

- Prompt 现在从 `prompts/*.yaml` 文件加载，不再内置 `zh` / `en` 开关。
- 当前内置了 `prompts/zh.yaml` 和 `prompts/en.yaml`，分别对应之前的中文和英文 prompt。
- 每个 prompt 文件包含：
  - `system_prompt`
  - `turn_prompt`
  - `tool_retry_prompt`
- UI 和 `config.yaml` 里的 `prompt_name` 都是按文件名选择 prompt。

## 页面使用

1. 在右侧“设置”页选择红黑双方类型
2. 如果选择 LLM：
   - 可选预设模型
   - 或使用自定义 `API Base URL / API Key / Model`
   - 可设置 `Thinking Mode`
   - 可设置 `Prompt`
3. 输入 FEN，或直接点击 `Init`
4. 点击 `Start`
5. 开局后如果当前在“设置”页，会自动切换到“记录”页
6. 右侧记录区固定高度，内容过多时内部滚动

## Prompt 与模型调用

当前 LLM 提示词包含：

- 当前 FEN
- 对手上一手
- 当前合法走法列表
- 棋子坐标和棋子说明

注意：

- Prompt 由 UI 或 `config.yaml` 中的 `prompt_name` 选择
- 思考模式不再通过 prompt 暗示
- 思考模式只作为模型调用参数传递

## 日志保存

每局结束后会在 `logs/` 下生成单独日志文件，文件名格式类似：

```text
red-Human_vs_black-LLM-spark-x_20260326-191530_ab12cd34.log
```

日志内容包括：

- 对局基本信息
- 双方配置
- 初始 FEN / 终局 FEN
- 完整走法序列
- Detailed Event Log
  - thinking
  - reasoning
  - tool_call
  - tool_result
  - move
  - turn / waiting_human / game_over
- 连续的 thinking / reasoning 流式片段会在保存时合并，避免日志中出现碎片化换行

## 项目结构

```text
XiangqiArena/
├── server.py
├── xiangqi.py
├── llm_client.py
├── prompt_registry.py
├── prompts/
│   ├── zh.yaml
│   └── en.yaml
├── config.example.yaml
├── config.yaml
├── requirements.txt
├── logs/
└── static/
    ├── index.html
    ├── style.css
    ├── app.js
    └── board.js
```

## 说明

- 需要模型支持 Function Calling / Tool Use
- 当前走子提交工具为 `make_move`
- 如果是 OpenAI 兼容接口，只要 `base_url` 行为兼容，一般都可以接入

## Citation

If you use this project in research or publications, please cite:

```bibtex
@misc{chen2025xiangqir1enhancingspatialstrategic,
      title={Xiangqi-R1: Enhancing Spatial Strategic Reasoning in LLMs for Chinese Chess via Reinforcement Learning}, 
      author={Yuhao Chen and Shuochen Liu and Yuanjie Lyu and Chao Zhang and Jiayao Shi and Tong Xu},
      year={2025},
      eprint={2507.12215},
      archivePrefix={arXiv},
      primaryClass={cs.AI},
      url={https://arxiv.org/abs/2507.12215}, 
}
```

## License

MIT
