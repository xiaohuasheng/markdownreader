import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import katex from 'katex'
import MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type Token from 'markdown-it/lib/token.mjs'

type MarkdownEnv = {
  baseDirectory?: string
  mathHtml?: string[]
  mathTokenPrefix?: string
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, language): string {
    const canHighlight = language && hljs.getLanguage(language)

    try {
      const highlighted = canHighlight
        ? hljs.highlight(code, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value

      return `<pre class="hljs"><code>${highlighted}</code></pre>`
    } catch {
      return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`
    }
  }
})

function renderMath(source: string, displayMode: boolean): string {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: false
    })
  } catch {
    return md.utils.escapeHtml(source)
  }
}

function renderMathPlaceholder(source: string, displayMode: boolean, env: MarkdownEnv): string {
  env.mathHtml ??= []
  env.mathTokenPrefix ??= `MDR_MATH_${Math.random().toString(36).slice(2)}`

  const index = env.mathHtml.push(renderMath(source, displayMode)) - 1
  return `@@${env.mathTokenPrefix}_${index}@@`
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]

  if (state.src.slice(start, max).trim() !== '$$') {
    return false
  }

  if (silent) {
    return true
  }

  let nextLine = startLine
  const content: string[] = []

  // Block math mirrors common Markdown editors: a line containing only "$$"
  // opens the formula, and the next matching marker closes it.
  while (++nextLine < endLine) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineEnd = state.eMarks[nextLine]
    const line = state.src.slice(lineStart, lineEnd)

    if (line.trim() === '$$') {
      const token = state.push('math_block', 'math', 0)
      token.block = true
      token.content = content.join('\n')
      token.map = [startLine, nextLine]
      state.line = nextLine + 1

      return true
    }

    content.push(line)
  }

  return false
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos

  if (state.src.charCodeAt(start) !== 0x24 || state.src.charCodeAt(start + 1) === 0x24) {
    return false
  }

  const previous = state.src[start - 1]
  if (previous === '\\') {
    return false
  }

  let end = start
  while ((end = state.src.indexOf('$', end + 1)) !== -1) {
    if (state.src[end - 1] !== '\\') {
      break
    }
  }

  if (end === -1) {
    return false
  }

  const content = state.src.slice(start + 1, end)

  if (!content.trim() || /^\s|\s$/.test(content)) {
    return false
  }

  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.content = content
  }

  state.pos = end + 1
  return true
}

md.block.ruler.before('fence', 'math_block', mathBlockRule, {
  alt: ['paragraph', 'reference', 'blockquote', 'list']
})
md.inline.ruler.before('escape', 'math_inline', mathInlineRule)

md.renderer.rules.math_block = (tokens, index, _options, env) =>
  renderMathPlaceholder(tokens[index].content, true, env as MarkdownEnv)

md.renderer.rules.math_inline = (tokens, index, _options, env) =>
  renderMathPlaceholder(tokens[index].content, false, env as MarkdownEnv)

function taskListRule(state: StateCore): void {
  for (let index = 2; index < state.tokens.length; index += 1) {
    const listItemToken = state.tokens[index - 2]
    const paragraphToken = state.tokens[index - 1]
    const inlineToken = state.tokens[index]

    if (listItemToken.type !== 'list_item_open' || paragraphToken.type !== 'paragraph_open' || inlineToken.type !== 'inline') {
      continue
    }

    const match = inlineToken.content.match(/^\[([ xX])\]\s+/)

    if (!match || !inlineToken.children?.length) {
      continue
    }

    const firstChild = inlineToken.children[0]

    if (firstChild.type !== 'text') {
      continue
    }

    // GFM task lists are parsed from the first text child so normal Markdown
    // list behavior stays intact while the checkbox itself is non-editable.
    const checked = match[1].toLowerCase() === 'x'
    const markerLength = match[0].length
    firstChild.content = firstChild.content.slice(markerLength)
    inlineToken.content = inlineToken.content.slice(markerLength)
    listItemToken.attrJoin('class', 'task-list-item')

    const checkboxToken = new state.Token('task_list_checkbox', 'input', 0)
    checkboxToken.meta = { checked }
    inlineToken.children.unshift(checkboxToken)
  }
}

md.core.ruler.after('inline', 'task_list', taskListRule)

md.renderer.rules.task_list_checkbox = (tokens, index) => {
  const checked = Boolean(tokens[index].meta?.checked)

  return `<input class="task-list-item-checkbox" type="checkbox" ${checked ? 'checked ' : ''}disabled> `
}

const defaultFenceRenderer =
  md.renderer.rules.fence ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase()

  // Mermaid is rendered after React commits the preview DOM, so the Markdown
  // pipeline only needs to preserve the diagram source in a safe placeholder.
  if (language === 'mermaid') {
    return `<div class="mermaid">${md.utils.escapeHtml(token.content)}</div>`
  }

  return defaultFenceRenderer(tokens, index, options, env, self)
}

function isExternalUrl(value: string): boolean {
  return /^(https?:|data:image\/|mailto:|tel:|#)/i.test(value)
}

function localImageUrl(src: string, baseDirectory: string): string {
  if (isExternalUrl(src)) {
    return src
  }

  const fileUrl = new URL(src, `file://${baseDirectory.endsWith('/') ? baseDirectory : `${baseDirectory}/`}`)
  return `mdr-file://local/${encodeURIComponent(decodeURIComponent(fileUrl.pathname))}`
}

const defaultImageRenderer =
  md.renderer.rules.image ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token: Token = tokens[index]
  const sourceIndex = token.attrIndex('src')
  const baseDirectory = typeof env.baseDirectory === 'string' ? env.baseDirectory : ''

  if (sourceIndex >= 0 && baseDirectory) {
    const source = token.attrs?.[sourceIndex]?.[1]

    if (source) {
      token.attrs![sourceIndex][1] = localImageUrl(source, baseDirectory)
      token.attrSet('loading', 'lazy')
    }
  }

  return defaultImageRenderer(tokens, index, options, env, self)
}

md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index]
  const href = token.attrGet('href') ?? ''

  if (/^https?:\/\//i.test(href)) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noreferrer')
  }

  return self.renderToken(tokens, index, options)
}

export function renderMarkdown(content: string, baseDirectory: string): string {
  const env: MarkdownEnv = { baseDirectory }
  const html = md.render(content, env)

  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ['input'],
    ADD_ATTR: [
      'target',
      'rel',
      'loading',
      'aria-hidden',
      'type',
      'checked',
      'disabled'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/|mdr-file:)|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  })

  // KaTeX output is generated from plain formula text by KaTeX itself. Inject it
  // after sanitizing user Markdown so DOMPurify cannot strip matrix layout spans.
  return (env.mathHtml ?? []).reduce(
    (output, mathHtml, index) => output.replaceAll(`@@${env.mathTokenPrefix}_${index}@@`, mathHtml),
    sanitized
  )
}

export function renderHtml(content: string): string {
  // HTML 仅用于阅读文本结构，不允许执行脚本、加载资源或提交表单。
  return DOMPurify.sanitize(content, {
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'frame',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
      'link',
      'meta',
      'base',
      'svg',
      'math',
      'audio',
      'video',
      'canvas'
    ],
    FORBID_ATTR: ['style', 'src', 'srcset', 'href', 'target', 'action', 'method']
  })
}
