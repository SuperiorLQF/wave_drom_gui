# 操作手册录屏

`features.html` 是公开操作手册，GIF 与静态封面位于 `images/handbook/`。

录制脚本通过真实浏览器的鼠标、滚轮、键盘和下拉框操作编辑器。初始化使用内置练习数据；字幕、按键提示和鼠标标记仅注入录制页面，不会写入应用。每组录制都校验最终 WaveJSON，防止操作没有成功却生成演示。

依赖：Node.js、Playwright、Chromium、系统 ffmpeg，以及与 Playwright 版本匹配的录屏组件。本次使用环境自带的 Playwright 1.62.1；更换版本时，应使用对应版本的安装命令。

```bash
npx playwright@1.62.1 install ffmpeg
CHROMIUM_PATH=/usr/bin/chromium node tools/record-handbook.cjs
```

单独重录一组：

```bash
CHROMIUM_PATH=/usr/bin/chromium node tools/record-handbook.cjs --only=glitch-brush
```

可选名称：`draw`、`zoom`、`edge-drag`、`dense-bus`、`wheel`、`erase-delete`、`glitch-brush`、`edge-styles`。

WebM 中间文件保存在系统临时目录；仓库只保留 GIF、PNG 封面和录制脚本。手册默认展示静态封面，点击才加载动图，每次只播放一组，可停止回到封面。
