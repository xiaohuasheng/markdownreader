const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'diagramViewport.ts')
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
  calculateFitTransform,
  calculateZoomTransform,
  constrainDiagramTransform
} = loadedModule.exports

test('大图按可用区域完整显示', () => {
  const transform = calculateFitTransform({ width: 4000, height: 2000 }, 1000, 700)

  assert.equal(transform.scale, 0.226)
  assert.equal(transform.x, 48)
  assert.equal(transform.y, 124)
})

test('小图适应窗口时不被额外放大', () => {
  const transform = calculateFitTransform({ width: 400, height: 200 }, 1000, 700)

  assert.deepEqual(transform, { scale: 1, x: 300, y: 250 })
})

test('缩放后指针仍对应同一个图表位置', () => {
  const current = { scale: 0.2, x: 100, y: 50 }
  const next = calculateZoomTransform(current, 500, 350, 2, 0.2, 4)

  assert.deepEqual(next, { scale: 0.4, x: -300, y: -250 })
  assert.equal((500 - current.x) / current.scale, (500 - next.x) / next.scale)
  assert.equal((350 - current.y) / current.scale, (350 - next.y) / next.scale)
})

test('缩放比例受最小值和最大值限制', () => {
  const current = { scale: 1, x: 0, y: 0 }

  assert.equal(calculateZoomTransform(current, 0, 0, 0.01, 0.25, 4).scale, 0.25)
  assert.equal(calculateZoomTransform(current, 0, 0, 20, 0.25, 4).scale, 4)
})

test('拖动后仍保留部分图表在可视区域', () => {
  const transform = constrainDiagramTransform(
    { scale: 1, x: -5000, y: -5000 },
    { width: 1000, height: 800 },
    500,
    400
  )

  assert.deepEqual(transform, { scale: 1, x: -912, y: -712 })
})
