const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8')

test('宽表按内容展开并在表格内部横向滚动', () => {
  const tableRule = styles.match(/\.markdown-body table \{([\s\S]*?)\}/)?.[1]

  assert.ok(tableRule, '应存在 Markdown 表格样式')
  assert.match(tableRule, /width:\s*max-content;/)
  assert.match(tableRule, /max-width:\s*100%;/)
  assert.match(tableRule, /overflow-x:\s*auto;/)
})
