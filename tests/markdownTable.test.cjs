const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const MarkdownIt = require('markdown-it')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'markdownTable.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', compiled)(loadedModule, loadedModule.exports)

const { normalizeMarkdownTables } = loadedModule.exports

test('缺少分隔行的管道表格会补充分隔行并被 Markdown 识别', () => {
  const source = [
    '|类型|定位|默认测试类型声明|',
    '|测试用例|描述一次性能验证的设计内容|测试用例|',
    '|测试计划|组织一轮测试执行的范围与进度，聚合执行结果|测试计划|'
  ].join('\n')

  const normalized = normalizeMarkdownTables(source)

  assert.equal(
    normalized,
    [
      '|类型|定位|默认测试类型声明|',
      '|---|---|---|',
      '|测试用例|描述一次性能验证的设计内容|测试用例|',
      '|测试计划|组织一轮测试执行的范围与进度，聚合执行结果|测试计划|'
    ].join('\n')
  )
  assert.match(new MarkdownIt().render(normalized), /<table>/)
})

test('已有分隔行的标准表格保持原样', () => {
  const source = ['|类型|定位|', '|:---|---:|', '|测试用例|设计内容|'].join('\n')

  assert.equal(normalizeMarkdownTables(source), source)
})

test('代码块内的管道行不被识别为表格', () => {
  const source = ['```text', '|名称|说明|', '|示例|代码内容|', '```'].join('\n')

  assert.equal(normalizeMarkdownTables(source), source)
})

test('缩进代码块内的管道行不被识别为表格', () => {
  const spaces = ['    |名称|说明|', '    |示例|代码内容|'].join('\n')
  const tabs = ['\t|名称|说明|', '\t|示例|代码内容|'].join('\n')

  assert.equal(normalizeMarkdownTables(spaces), spaces)
  assert.equal(normalizeMarkdownTables(tabs), tabs)
})

test('列数不一致的连续管道行不被改写', () => {
  const source = ['|名称|说明|', '|只有一列|'].join('\n')

  assert.equal(normalizeMarkdownTables(source), source)
})

test('转义竖线和行尾格式不会破坏列数判断', () => {
  const source = '|名称|说明|\r\n|A|支持 \\| 字符|\r\n'

  assert.equal(normalizeMarkdownTables(source), '|名称|说明|\r\n|---|---|\r\n|A|支持 \\| 字符|\r\n')
})
