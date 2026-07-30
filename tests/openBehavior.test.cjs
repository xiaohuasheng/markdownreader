const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'main', 'openBehavior.ts')
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
  DEFAULT_OPEN_BEHAVIOR,
  parseOpenBehavior,
  shouldCreateWindowForOpen
} = loadedModule.exports

test('打开方式默认使用新窗口且无效配置会回退', () => {
  assert.equal(DEFAULT_OPEN_BEHAVIOR, 'new-window')
  assert.equal(parseOpenBehavior(undefined), 'new-window')
  assert.equal(parseOpenBehavior('unknown'), 'new-window')
  assert.equal(parseOpenBehavior('replace-current'), 'replace-current')
})

test('默认只在当前窗口已有内容时新建窗口', () => {
  assert.equal(shouldCreateWindowForOpen('new-window', true), true)
  assert.equal(shouldCreateWindowForOpen('new-window', false), false)
})

test('覆盖模式复用已有窗口，显式新窗口仍优先', () => {
  assert.equal(shouldCreateWindowForOpen('replace-current', true), false)
  assert.equal(shouldCreateWindowForOpen('replace-current', true, true), true)
})
