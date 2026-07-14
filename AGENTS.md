# 项目规则

## 交付与打包

- 每次完成会影响应用行为、界面或打包配置的代码改动后，必须先执行 `npm run typecheck` 和 `npm run build`。
- 上述验证通过后，直接执行 `npx electron-builder --mac --publish never` 生成 macOS 安装包；不要在本地构建阶段触发自动发布。
- 交付时说明 DMG 产物的绝对路径、文件大小和校验结果。
- 只有用户明确要求时，才提交 Git、推送远程或创建/更新 GitHub Release。
