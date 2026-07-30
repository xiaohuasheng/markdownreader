const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'editorSearch.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', compiled)(loadedModule, loadedModule.exports)

const {
  calculateEditorMatchScrollTop,
  findEditorSearchMatches,
  getEditorSearchMatchLineNumber
} = loadedModule.exports

test('编辑模式搜索返回所有不重叠匹配位置且忽略大小写', () => {
  assert.deepEqual(findEditorSearchMatches('Alpha beta ALPHA alphabet', 'alpha'), [
    { start: 0, end: 5 },
    { start: 11, end: 16 },
    { start: 17, end: 22 }
  ])
})

test('中文和 Markdown 标记按源码位置匹配', () => {
  assert.deepEqual(findEditorSearchMatches('# 目标\n正文目标\n`目标`', '目标'), [
    { start: 2, end: 4 },
    { start: 7, end: 9 },
    { start: 11, end: 13 }
  ])
})

test('空查询不产生匹配', () => {
  assert.deepEqual(findEditorSearchMatches('content', ''), [])
})

test('匹配位置尽量滚动到编辑框中间并限制在有效范围', () => {
  assert.equal(calculateEditorMatchScrollTop(0, 26, 4000, 600), 0)
  assert.equal(calculateEditorMatchScrollTop(2000, 26, 4000, 600), 1713)
  assert.equal(calculateEditorMatchScrollTop(3990, 20, 4000, 600), 3400)
})

test('编辑模式提示当前匹配所在行号', () => {
  const source = '# 标题\n第一行\n第二行目标\n第四行'
  const match = findEditorSearchMatches(source, '目标')[0]

  assert.equal(getEditorSearchMatchLineNumber(source, match.start), 3)
  assert.equal(getEditorSearchMatchLineNumber(source, -20), 1)
})
