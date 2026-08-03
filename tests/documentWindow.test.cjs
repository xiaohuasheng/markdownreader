const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'main', 'documentWindow.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  }
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', 'require', compiled)(loadedModule, loadedModule.exports, require)

const { documentPathKey, DocumentWindowRegistry } = loadedModule.exports

test('相对路径与符号链接指向同一文件时使用相同路径键', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-reader-window-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const documentPath = path.join(directory, 'document.md')
  const linkPath = path.join(directory, 'document-link.md')
  fs.writeFileSync(documentPath, '# document', 'utf8')
  fs.symlinkSync(documentPath, linkPath)

  assert.equal(documentPathKey(path.join(directory, '.', 'document.md')), documentPathKey(documentPath))
  assert.equal(documentPathKey(linkPath), documentPathKey(documentPath))
})

test('同一个文件只登记一个窗口，窗口切换文件时释放旧路径', () => {
  const registry = new DocumentWindowRegistry()
  const firstWindow = { id: 1 }
  const secondWindow = { id: 2 }
  const firstPath = path.resolve('/tmp/first.md')
  const secondPath = path.resolve('/tmp/second.md')

  registry.set(firstWindow, firstPath)
  assert.equal(registry.get(firstPath), firstWindow)

  registry.set(firstWindow, secondPath)
  assert.equal(registry.get(firstPath), undefined)
  assert.equal(registry.get(secondPath), firstWindow)

  registry.set(secondWindow, secondPath)
  assert.equal(registry.get(secondPath), secondWindow)

  registry.delete(firstWindow)
  assert.equal(registry.get(secondPath), secondWindow)

  registry.delete(secondWindow)
  assert.equal(registry.get(secondPath), undefined)
})
