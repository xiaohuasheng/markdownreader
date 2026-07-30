const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'presentationSettings.ts')
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
  changePresentationFontSize,
  DEFAULT_PRESENTATION_FONT_SIZE,
  MAX_PRESENTATION_FONT_SIZE,
  MIN_PRESENTATION_FONT_SIZE,
  PRESENTATION_TOOLBAR_IDLE_DELAY,
  shouldSchedulePresentationToolbarCollapse
} = loadedModule.exports

test('演示模式默认字号适合大屏阅读', () => {
  assert.equal(DEFAULT_PRESENTATION_FONT_SIZE, 22)
})

test('演示模式按固定步长放大和缩小字号', () => {
  assert.equal(changePresentationFontSize(22, 1), 24)
  assert.equal(changePresentationFontSize(22, -1), 20)
})

test('演示模式字号不会超出允许范围', () => {
  assert.equal(changePresentationFontSize(MAX_PRESENTATION_FONT_SIZE, 1), MAX_PRESENTATION_FONT_SIZE)
  assert.equal(changePresentationFontSize(MIN_PRESENTATION_FONT_SIZE, -1), MIN_PRESENTATION_FONT_SIZE)
})

test('演示工具条展开三秒后允许自动收起', () => {
  assert.equal(PRESENTATION_TOOLBAR_IDLE_DELAY, 3000)
  assert.equal(shouldSchedulePresentationToolbarCollapse(true, false), true)
})

test('非演示模式或已经收起时不重复安排自动收起', () => {
  assert.equal(shouldSchedulePresentationToolbarCollapse(false, false), false)
  assert.equal(shouldSchedulePresentationToolbarCollapse(true, true), false)
})
