<p align="center">
  <img src="static/logo.png" alt="Anima Logo" width="120">
</p>

# Anima

[Switch to 中文](./README.zh-CN.md) | [Back to Landing Page](./README.md)

## Introduction

**Anima** is a third-party extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern) that adds [Anima](https://www.sumeruai.us) 3D digital avatar capabilities. You can bind an avatar to a character, show a live 3D presence during chat, play voice output, and automatically synchronize lip movement with generated speech.

## Features

- Real-time 3D avatar rendering
- Automatic voice playback for AI replies
- Lip-sync animation with generated speech
- Create avatars from a single photo
- Bind avatars to characters or groups
- Text input and voice input support
- Interrupt playback and generation
- Draggable, resizable panel with saved position

## Installation

### Method 1: SillyTavern built-in installer

1. Open SillyTavern.
2. Click the extensions button in the top bar.
3. Choose Install Extension.
4. Paste the repository URL:

```text
https://github.com/MrCzp/Anima_For_SillyTavern
```

5. Refresh the page after installation finishes.

### Method 2: Manual install

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/MrCzp/Anima_For_SillyTavern anima
```

Then refresh the SillyTavern page.

## Usage

1. Open the Anima extension panel.
2. Log in with your Anima email and password.
3. Select an existing avatar or upload a portrait photo to create one.
4. Bind the avatar to the current character or group.
5. Start chatting. AI replies will automatically play voice and lip-sync animation.

## Notes

- A clear front-facing portrait works best for avatar creation.
- First-time model generation may take a while.
- Microphone permission is required only for voice input.

## Requirements

- SillyTavern 1.12.0 or later
- A modern browser with WebGL 2.0 support
- Network access to the Anima service
- Microphone permission for voice input

## Links

- [Anima Platform](https://www.sumeruai.us)
- [Report Issues](https://github.com/sumeurai/Anima-For-SillyTavern/issues)
- [MIT License](./LICENSE)
