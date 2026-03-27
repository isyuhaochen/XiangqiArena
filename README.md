<p align="center">
  <img src="logo.png" alt="BattleChess logo" width="220">
</p>

# BattleChess - Xiangqi Arena

BattleChess 是一个本地运行的中国象棋对战 Arena，支持人类、随机策略和 LLM 之间的任意两两对局。

前端使用原生 HTML / CSS / JavaScript 与 Canvas，后端使用 FastAPI。LLM 调用统一走 OpenAI Python SDK，并通过 `base_url` 兼容不同服务商。

## 功能概览

- 支持 `Human / Random / LLM` 三种玩家类型
- 支持预设模型和自定义 LLM 配置
- 支持从 `prompts/*.yaml` 加载 Prompt，并在 UI 中选择
- 支持自定义开局 FEN
- 支持实时显示 `thinking / reasoning / tool call / tool result`
- 支持暂停、恢复、历史回看，以及从回看位置继续对局
- 支持对局结束后自动保存详细日志

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

默认访问地址：

```text
http://127.0.0.1:8000
```

## 模型配置

先复制配置模板：

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
    max_completion_tokens: 8192

  - name: gpt-4o
    api_base: https://api.openai.com/v1
    api_key: sk-xxxxxxxxxxxxxxxx
    model: gpt-4o
    prompt_name: en
    enable_thinking: true
    max_completion_tokens: 8192
```

配置项说明：

- `api_base`：直接传给 OpenAI SDK 的 `base_url`
- `api_key`：模型服务商提供的密钥
- `model`：具体模型名
- `prompt_name`：要使用的 Prompt 名称，对应 `prompts/` 目录中的文件
- `enable_thinking`：是否启用思考模式
- `max_completion_tokens`：单次生成的最大 token 数

说明：

- `config.yaml` 默认被 `.gitignore` 忽略，不会提交到仓库
- 旧字段 `prompt_lang` 仍可兼容读取，但当前推荐统一使用 `prompt_name`

## Prompt 文件

Prompt 不再写死在代码里，而是放在 `prompts/*.yaml` 中。

当前内置：

- `prompts/zh.yaml`
- `prompts/en.yaml`

每个 Prompt 文件包含这些字段：

- `system_prompt`
- `turn_prompt`
- `tool_retry_prompt`
- `empty_legal_moves_text`

你可以通过两种方式选择 Prompt：

- 在 `config.yaml` 里为某个预设模型设置 `prompt_name`
- 在页面设置里为某个 LLM 玩家选择 Prompt

## 页面使用

1. 在右侧“设置”页选择红黑双方的玩家类型
2. 如果选择 LLM：
   - 可以选择预设模型
   - 也可以使用自定义 `API Base URL / API Key / Model`
   - 可以设置 `Thinking Mode`
   - 可以设置 `Prompt`
3. 输入 FEN，或者直接点击 `Init`
4. 点击 `Start`
5. 对局开始后会自动切换到“记录”页
6. 可以在暂停状态下回看历史局面，并从当前回看到的位置继续对局

## Prompt 与模型调用

当前 Prompt 会向模型提供这些信息：

- 当前局面 FEN
- 对手上一手
- 准确棋子位置
- 当前合法走法列表
- 棋子记号与 ICCS 坐标说明

另外：

- 思考模式不再通过 Prompt 暗示，而是作为模型调用参数传入
- `make_move` 是当前唯一的走子提交工具
- 如果是 OpenAI 兼容接口，只要 `base_url` 行为兼容，通常都可以直接接入

## 日志保存

每局结束后，系统会在 `logs/` 下保存一个独立日志文件，文件名类似：

```text
red-Human_vs_black-LLM-spark-x_20260326-191530_ab12cd34.log
```

日志内容包括：

- 对局基本信息
- 双方玩家配置
- 初始 FEN 与终局 FEN
- 完整走法序列
- 详细事件日志
  - `turn`
  - `waiting_human`
  - `thinking`
  - `reasoning`
  - `tool_call`
  - `tool_result`
  - `move`
  - `game_over`

说明：

- 连续的 `thinking / reasoning` 流式片段会在保存时自动合并，避免日志中出现碎片化换行

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
├── static/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── board.js
│   └── logo.png
└── logo.png
```

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
