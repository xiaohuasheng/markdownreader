const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'searchInput.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', compiled)(loadedModule, loadedModule.exports)

const { activateSearchInput } = loadedModule.exports

test('打开搜索时先聚焦输入框再全选已有关键词', () => {
  const calls = []
  const input = {
    focus: () => calls.push('focus'),
    select: () => calls.push('select')
  }

  activateSearchInput(input)

  assert.deepEqual(calls, ['focus', 'select'])
})

test('搜索输入框尚未挂载时安全忽略', () => {
  assert.doesNotThrow(() => activateSearchInput(null))
})
