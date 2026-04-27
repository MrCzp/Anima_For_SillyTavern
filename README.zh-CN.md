<p align="center">
  <img src="static/logo.png" alt="Anima Logo" width="120">
</p>

# Anima

[切换到 English](./README.en.md) | [返回入口页](./README.md)

## 简介

**Anima** 是一个 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 第三方扩展，集成了 [Anima](https://www.sumeruai.us) 3D 数字人能力。你可以把数字人头像绑定到角色，在聊天时显示 3D 形象、播放语音，并自动进行口型同步。

## 功能

- 3D 数字人实时渲染
- AI 回复自动语音播报
- 语音与口型同步
- 上传照片创建数字人
- 数字人与角色绑定
- 支持文字输入与语音输入
- 支持打断播放与生成
- 面板可拖拽、可调整大小、自动记忆位置

## 安装

### 方式一：SillyTavern 内置安装

1. 打开 SillyTavern。
2. 点击顶部扩展按钮。
3. 选择“安装扩展”。
4. 填入仓库地址：

```text
https://github.com/MrCzp/Anima_For_SillyTavern
```

5. 安装完成后刷新页面。

### 方式二：手动安装

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/MrCzp/Anima_For_SillyTavern anima
```

然后刷新 SillyTavern 页面。

## 使用

1. 打开 Anima 扩展面板。
2. 使用邮箱和密码登录 Anima 账号。
3. 选择已有数字人，或上传照片创建新的数字人。
4. 将数字人绑定到当前角色或群组。
5. 开始聊天，AI 回复时会自动播放语音并驱动口型动画。

## 建议

- 推荐使用清晰的正面人物照片来创建数字人。
- 首次生成模型需要一点时间，可在头像列表中查看进度。
- 如果要使用语音输入，请先允许浏览器麦克风权限。

## 环境要求

- SillyTavern 1.12.0 或更高版本
- 支持 WebGL 2.0 的现代浏览器
- 可访问 Anima 服务的网络环境
- 麦克风权限（仅语音输入时需要）

## 相关链接

- [Anima 平台](https://www.sumeruai.us)
- [问题反馈](https://github.com/sumeurai/Anima-For-SillyTavern/issues)
- [MIT License](./LICENSE)
