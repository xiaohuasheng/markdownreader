const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'scrollPosition.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', compiled)(loadedModule, loadedModule.exports)

const { calculateScrollOffset, calculateScrollProgress } = loadedModule.exports

test('正文中间位置可以在不同高度的版式间双向换算', () => {
  const progress = calculateScrollProgress(1800, 4200, 600)

  assert.equal(progress, 0.5)
  assert.equal(calculateScrollOffset(progress, 2600, 600), 1000)
})

test('顶部和底部位置保持在有效范围内', () => {
  assert.equal(calculateScrollProgress(-100, 2000, 500), 0)
  assert.equal(calculateScrollProgress(5000, 2000, 500), 1)
  assert.equal(calculateScrollOffset(-1, 2000, 500), 0)
  assert.equal(calculateScrollOffset(2, 2000, 500), 1500)
})

test('文档短于可视区域时固定定位到顶部', () => {
  assert.equal(calculateScrollProgress(200, 400, 600), 0)
  assert.equal(calculateScrollOffset(0.8, 400, 600), 0)
})

test('无效进度不会产生无效滚动位置', () => {
  assert.equal(calculateScrollOffset(Number.NaN, 2000, 500), 0)
  assert.equal(calculateScrollOffset(Number.POSITIVE_INFINITY, 2000, 500), 0)
})
