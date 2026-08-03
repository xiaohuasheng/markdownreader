type ParsedTableRow = {
  cells: string[]
  indentation: string
}

type Fence = {
  marker: '`' | '~'
  length: number
}

function parseTableRow(line: string): ParsedTableRow | null {
  const match = line.match(/^( {0,3})(\|.*\|)[\t ]*$/)

  if (!match) {
    return null
  }

  const body = match[2].slice(1, -1)
  const cells: string[] = []
  let cell = ''
  let codeMarkerLength = 0

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]

    if (character === '\\' && index + 1 < body.length) {
      cell += character + body[index + 1]
      index += 1
      continue
    }

    if (character === '`') {
      let markerLength = 1

      while (body[index + markerLength] === '`') {
        markerLength += 1
      }

      if (codeMarkerLength === 0) {
        codeMarkerLength = markerLength
      } else if (codeMarkerLength === markerLength) {
        codeMarkerLength = 0
      }

      cell += '`'.repeat(markerLength)
      index += markerLength - 1
      continue
    }

    if (character === '|' && codeMarkerLength === 0) {
      cells.push(cell)
      cell = ''
      continue
    }

    cell += character
  }

  cells.push(cell)

  if (cells.length < 2) {
    return null
  }

  return {
    cells,
    indentation: match[1]
  }
}

function isDelimiterRow(row: ParsedTableRow): boolean {
  return row.cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
}

function readFence(line: string): Fence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)

  if (!match) {
    return null
  }

  return {
    marker: match[1][0] as Fence['marker'],
    length: match[1].length
  }
}

function closesFence(line: string, fence: Fence): boolean {
  const marker = line.trim()

  return marker.length >= fence.length && [...marker].every((character) => character === fence.marker)
}

/**
 * 兼容缺少表头分隔行的管道表格，但不修改原始文档内容。
 * 仅当连续行首尾都有竖线、列数一致且不在代码块内时才补充分隔行。
 */
export function normalizeMarkdownTables(content: string): string {
  const newline = content.match(/\r\n|\n|\r/)?.[0] ?? '\n'
  const lines = content.split(/\r\n|\n|\r/)
  const output: string[] = []
  let fence: Fence | null = null

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]

    if (fence) {
      output.push(line)

      if (closesFence(line, fence)) {
        fence = null
      }

      index += 1
      continue
    }

    const openingFence = readFence(line)

    if (openingFence) {
      fence = openingFence
      output.push(line)
      index += 1
      continue
    }

    const firstRow = parseTableRow(line)

    if (!firstRow) {
      output.push(line)
      index += 1
      continue
    }

    const rows: ParsedTableRow[] = []
    let end = index

    while (end < lines.length) {
      const row = parseTableRow(lines[end])

      if (!row) {
        break
      }

      rows.push(row)
      end += 1
    }

    const columnCount = firstRow.cells.length
    const isCompatibleTable =
      rows.length >= 2 &&
      rows.every((row) => row.cells.length === columnCount) &&
      !rows.some(isDelimiterRow)

    output.push(line)

    if (isCompatibleTable) {
      output.push(`${firstRow.indentation}|${Array(columnCount).fill('---').join('|')}|`)
    }

    output.push(...lines.slice(index + 1, end))
    index = end
  }

  return output.join(newline)
}
