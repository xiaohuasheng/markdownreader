const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'documentPreview.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', compiled)(loadedModule, loadedModule.exports)

const { getDocumentPreviewContent } = loadedModule.exports

test('Markdown 预览使用当前草稿，包括尚未保存的新文件', () => {
  assert.equal(getDocumentPreviewContent('markdown', '', '# 新文件草稿'), '# 新文件草稿')
  assert.equal(getDocumentPreviewContent('markdown', '# 已保存', '# 正在修改'), '# 正在修改')
})

test('只读 HTML 预览始终使用磁盘内容', () => {
  assert.equal(getDocumentPreviewContent('html', '<h1>磁盘内容</h1>', '不应使用的草稿'), '<h1>磁盘内容</h1>')
})
