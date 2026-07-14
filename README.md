# Markdown Reader

Markdown Reader 是一个类似 Typora 阅读体验的 Electron Markdown 阅读器，当前仅维护 Electron 版本。它聚焦 macOS：打开本地 `.md` / `.markdown` 文件，并以干净、舒适的阅读版式渲染。

本项目从零创建，没有基于现成 Markdown 编辑器二次改造。

## 功能

- 通过 `File > Open File`、`Cmd + O` 或欢迎页按钮打开本地 Markdown 文件。
- 支持只读预览本地 `.html` / `.htm` 文档；仅保留文字结构，不执行脚本或加载外部资源。
- 主进程读取文件，渲染进程不直接访问 Node.js `fs` API。
- 支持标题、段落、粗体、斜体、删除线、列表、引用、行内代码、代码块、链接、图片、表格、分割线。
- 支持相对路径本地图片，使用只读 `mdr-file://` 协议由主进程加载。
- 代码块使用 `highlight.js` 做基础语法高亮。
- 默认浅色、居中、宽度受控的专注阅读界面。
- 打开文件后窗口标题显示当前文件名。
- macOS 菜单包含 Open File、Open Recent、Close Window、Quit。
- 最近打开文件记录保存在 Electron `userData` 目录。
- 已打开文件夹会自动监听其子目录的新增、删除和重命名，并刷新文件树。
- 支持通过 `File > Open Folder in New Window` 在多个独立窗口中同时打开不同文件夹。
- 使用 `electron-builder` 配置 macOS DMG/ZIP 打包。

## 技术栈

- Electron
- Electron Vite
- React + TypeScript
- markdown-it
- DOMPurify
- highlight.js
- electron-builder

## 本地开发

```bash
npm install
npm run dev
```

如果 Electron 二进制下载很慢，可以临时使用镜像安装：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

## 构建与 macOS 打包

```bash
npm run build
npm run package:mac
```

打包产物会输出到 `release/`。当前配置会生成 macOS `.dmg` 和 `.zip`。

## 项目结构

```text
markdownreader/
  package.json
  electron.vite.config.ts
  README.md
  src/
    main/
      main.ts          # Electron 入口、窗口、IPC、本地图片协议
      menu.ts          # macOS 应用菜单和快捷键
      file.ts          # 文件选择和 Markdown 文件读取
      recentFiles.ts   # 最近打开文件存储
    preload/
      preload.ts       # 安全暴露给渲染进程的 API
    renderer/
      App.tsx          # 欢迎页和阅读页
      markdown.ts      # Markdown 渲染、图片路径处理、HTML sanitize
      styles.css       # 阅读体验样式
```

## 安全边界

- `nodeIntegration` 关闭。
- `contextIsolation` 开启。
- 渲染进程只通过 preload 暴露的 `openFile` / `onFileOpened` API 与主进程通信。
- 本地文件读取由主进程完成。
- Markdown 原始 HTML 已禁用，渲染后的 HTML 使用 DOMPurify 清理。
- HTTP/HTTPS 外部链接会交给系统浏览器打开，不在 Electron 内创建新窗口。
- 本地图片协议当前用于读取 Markdown 文档引用的本地图片；MVP 未实现更细粒度的沙箱目录授权。

## 已知限制

- 暂不支持 Markdown 编辑、所见即所得、导出、搜索、多标签页、文件夹管理、插件系统。
- 最近文件记录只在菜单中展示，不提供单独管理界面。
- HTML 预览不支持 JavaScript、CSS、图片、表单和网页交互，仅用于阅读文字内容。
- 本地图片支持主要面向 macOS 路径和相对路径场景。
- DMG 未做签名和 notarization，正式分发前需要接入 Apple Developer 签名流程。

## 后续路线图

- 增加目录导航和标题锚点。
- 增加暗色主题与跟随系统主题。
- 支持拖拽打开文件。
- 支持导出 PDF / HTML。
- 增加基本编辑模式。
- 为正式分发补齐签名、公证和自动更新。

## 开源依赖和许可证

本项目自身以 MIT License 发布。主要开源依赖包括：

- Electron: MIT
- Electron Vite: MIT
- React / React DOM: MIT
- markdown-it: MIT
- DOMPurify: MPL-2.0 or Apache-2.0
- highlight.js: BSD-3-Clause
- electron-builder: MIT

请在正式发布前根据最终依赖锁定版本复核每个包的许可证文本，并在发行包中保留必要的 license 和 attribution。
