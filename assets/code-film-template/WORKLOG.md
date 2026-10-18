# 工作日志 · __TITLE__

每个阶段完成后追加一节，写清：做了什么、为什么这样做、自检发现了什么、怎么修的、用的数据（帧号、时间、dB）。

## 1 · 概念与设计系统
- 概念：
- 色板角色 / 对比度检查：
- 字体与缺字检查（`python -m motionkit.fonts check ...`）：

## 2 · 分镜与事件表
- 节拍：`python film.py info` 输出摘要

## 3 · 主场景（hero chapter）
- 接触表：renders/sheets/...
- 自检问题 → 修复：

## 4 · 其余章节与交接
- `python film.py diff` 可疑帧 → 原因 → 修复：

## 5 · 配乐与音效
- `python film.py audio-qa` 警告 → 修复：

## 6 · 成片与交付验证
- ffprobe 摘要、首中尾帧、循环检查（如适用）：
