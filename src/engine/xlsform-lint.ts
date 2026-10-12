/**
 * Structural lint for an XLSForm workbook model before download or conversion.
 * Catches the silent failures the field reports: missing list_name, duplicate names, unbalanced groups,
 * dangling ${var} references, missing labels per language, settings gaps.
 */
export type Row = Record<string, string | undefined>
export interface Workbook {
  survey: Row[]
  choices: Row[]
  settings: Row[]
}
export interface LintIssue {
  level: 'error' | 'warning'
  sheet: 'survey' | 'choices' | 'settings'
  row?: number // 1-based data row (excluding header), for the user
  column?: string
  message: string
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const STRUCT = new Set(['begin_group', 'end_group', 'begin_repeat', 'end_repeat', 'begin group', 'end group', 'begin repeat', 'end repeat'])

export function lintWorkbook(wb: Workbook): LintIssue[] {
  const issues: LintIssue[] = []
  const labelCols = new Set<string>()
  for (const r of wb.survey) for (const k of Object.keys(r)) if (k === 'label' || k.startsWith('label::')) labelCols.add(k)
  if (labelCols.size === 0) issues.push({ level: 'error', sheet: 'survey', message: 'no label column (label or label::Language (code))' })

  // choices index
  const lists = new Map<string, Set<string>>()
  wb.choices.forEach((c, i) => {
    const ln = c.list_name?.trim()
    const nm = c.name?.trim()
    if (!ln) issues.push({ level: 'error', sheet: 'choices', row: i + 1, column: 'list_name', message: 'missing list_name' })
    if (!nm) issues.push({ level: 'error', sheet: 'choices', row: i + 1, column: 'name', message: 'missing name' })
    if (ln && nm) {
      const set = lists.get(ln) ?? new Set()
      if (set.has(nm)) issues.push({ level: 'error', sheet: 'choices', row: i + 1, message: `duplicate option "${nm}" in list "${ln}"` })
      set.add(nm)
      lists.set(ln, set)
      for (const col of labelCols) if (!c[col]?.trim()) issues.push({ level: 'warning', sheet: 'choices', row: i + 1, column: col, message: `empty ${col} for ${ln}/${nm}` })
    }
  })

  const names = new Map<string, number>()
  const stack: Array<{ kind: 'group' | 'repeat'; row: number }> = []
  wb.survey.forEach((r, i) => {
    const row = i + 1
    const type = (r.type ?? '').trim()
    const name = (r.name ?? '').trim()
    if (!type) {
      issues.push({ level: 'error', sheet: 'survey', row, column: 'type', message: 'missing type' })
      return
    }
    const t = type.replace(/\s+/g, ' ')
    if (t.startsWith('begin')) stack.push({ kind: t.includes('repeat') ? 'repeat' : 'group', row })
    else if (t.startsWith('end')) {
      const top = stack.pop()
      const kind = t.includes('repeat') ? 'repeat' : 'group'
      if (!top) issues.push({ level: 'error', sheet: 'survey', row, message: `${t} without matching begin` })
      else if (top.kind !== kind) issues.push({ level: 'error', sheet: 'survey', row, message: `${t} closes a ${top.kind} opened at row ${top.row}` })
    }
    const structural = STRUCT.has(t) || t.startsWith('begin') || t.startsWith('end')
    if (!structural || t.startsWith('begin')) {
      if (!name) issues.push({ level: 'error', sheet: 'survey', row, column: 'name', message: 'missing name' })
      else {
        if (!NAME_RE.test(name)) issues.push({ level: 'error', sheet: 'survey', row, column: 'name', message: `name "${name}" is not a valid XLSForm name` })
        if (name.length > 32) issues.push({ level: 'warning', sheet: 'survey', row, column: 'name', message: `name "${name}" is longer than 32 characters` })
        const prev = names.get(name)
        if (prev) issues.push({ level: 'error', sheet: 'survey', row, column: 'name', message: `duplicate name "${name}" (also row ${prev})` })
        else names.set(name, row)
      }
    }
    const sel = t.match(/^(select_one|select_multiple|select_one_from_file|rank)\s+(\S+)/)
    if (sel && sel[1] !== 'select_one_from_file' && !lists.has(sel[2]))
      issues.push({ level: 'error', sheet: 'survey', row, column: 'type', message: `list "${sel[2]}" not found in choices` })
    if (!structural && t !== 'calculate' && !t.startsWith('end')) {
      for (const col of labelCols) if (!r[col]?.trim()) issues.push({ level: 'warning', sheet: 'survey', row, column: col, message: `empty ${col}` })
    }
  })
  for (const open of stack) issues.push({ level: 'error', sheet: 'survey', row: open.row, message: `begin_${open.kind} never closed` })

  // ${var} references
  const refCols = ['relevant', 'constraint', 'calculation', 'required', 'choice_filter', 'repeat_count', 'default']
  wb.survey.forEach((r, i) => {
    for (const col of refCols) {
      const expr = r[col]
      if (!expr) continue
      for (const m of expr.matchAll(/\$\{([^}]+)\}/g)) {
        if (!names.has(m[1])) issues.push({ level: 'error', sheet: 'survey', row: i + 1, column: col, message: `reference \${${m[1]}} does not exist` })
      }
      if (col === 'relevant' && /\bselected\(/.test(expr) === false && /=\s*'[^']*\s[^']*'/.test(expr))
        issues.push({ level: 'warning', sheet: 'survey', row: i + 1, column: col, message: 'relevance compares against a value containing a space; option values should be codes' })
    }
    for (const col of Object.keys(r)) if (col.startsWith('label') && (r[col] ?? '').includes('${')) {
      for (const m of (r[col] ?? '').matchAll(/\$\{([^}]+)\}/g)) if (!names.has(m[1])) issues.push({ level: 'error', sheet: 'survey', row: i + 1, column: col, message: `label references \${${m[1]}} which does not exist` })
    }
  })

  // settings
  const s = wb.settings[0] ?? {}
  if (!wb.settings.length) issues.push({ level: 'error', sheet: 'settings', message: 'settings sheet is empty' })
  for (const k of ['form_title', 'form_id', 'version']) if (!s[k]?.trim()) issues.push({ level: 'error', sheet: 'settings', column: k, message: `missing ${k}` })
  if (labelCols.size > 1 && !s.default_language?.trim()) issues.push({ level: 'warning', sheet: 'settings', column: 'default_language', message: 'multilingual form without default_language' })
  if (s.default_language && !labelCols.has(`label::${s.default_language}`) && !labelCols.has('label'))
    issues.push({ level: 'error', sheet: 'settings', column: 'default_language', message: `default_language "${s.default_language}" has no label column` })

  return issues
}

export function summarize(issues: LintIssue[]): { errors: number; warnings: number } {
  return { errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length }
}
