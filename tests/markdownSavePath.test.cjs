const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'main', 'markdownSavePath.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', 'require', compiled)(loadedModule, loadedModule.exports, require)

const { createDefaultMarkdownSavePath, normalizeMarkdownSavePath } = loadedModule.exports

test('新文件默认使用 Untitled.md', () => {
  assert.equal(createDefaultMarkdownSavePath('/Users/test/docs'), '/Users/test/docs/Untitled.md')
  assert.equal(createDefaultMarkdownSavePath(), 'Untitled.md')
})

test('没有扩展名时自动补充 .md', () => {
  assert.equal(normalizeMarkdownSavePath('/Users/test/docs/meeting-notes'), '/Users/test/docs/meeting-notes.md')
})

test('保留合法的 Markdown 扩展名', () => {
  assert.equal(normalizeMarkdownSavePath('/Users/test/docs/readme.md'), '/Users/test/docs/readme.md')
  assert.equal(normalizeMarkdownSavePath('/Users/test/docs/readme.markdown'), '/Users/test/docs/readme.markdown')
  assert.equal(normalizeMarkdownSavePath('/Users/test/docs/readme.MD'), '/Users/test/docs/readme.MD')
})

test('拒绝保存为其他扩展名', () => {
  assert.throws(
    () => normalizeMarkdownSavePath('/Users/test/docs/readme.txt'),
    /Only \.md and \.markdown files can be saved\./
  )
})
