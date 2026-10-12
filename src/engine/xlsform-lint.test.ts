import { describe, expect, it } from 'vitest'
import { lintWorkbook, summarize, type Workbook } from './xlsform-lint'

const good: Workbook = {
  survey: [
    { type: 'note', name: 'intro', 'label::English (en)': 'Hello', 'label::Hausa (ha)': 'Sannu' },
    { type: 'select_one yes_no', name: 'consent', 'label::English (en)': 'Agree?', 'label::Hausa (ha)': 'Ka yarda?', required: 'yes' },
    { type: 'note', name: 'thanks', 'label::English (en)': 'Thank you', 'label::Hausa (ha)': 'Na gode', relevant: "${consent}='no'" },
    { type: 'begin_group', name: 'main', 'label::English (en)': 'Main', 'label::Hausa (ha)': 'Babba', relevant: "${consent}='yes'" },
    { type: 'integer', name: 'people', 'label::English (en)': 'How many?', 'label::Hausa (ha)': 'Nawa?' },
    { type: 'calculate', name: 'flag', calculation: 'if(${people} >= 3, 1, 0)' },
    { type: 'end_group' },
  ],
  choices: [
    { list_name: 'yes_no', name: 'yes', 'label::English (en)': 'Yes', 'label::Hausa (ha)': 'Eh' },
    { list_name: 'yes_no', name: 'no', 'label::English (en)': 'No', 'label::Hausa (ha)': "A'a" },
  ],
  settings: [{ form_title: 'Test', form_id: 'test_v1', version: '2026.10.0+p1', default_language: 'English (en)' }],
}

describe('lintWorkbook', () => {
  it('passes a well-formed multilingual form', () => {
    expect(summarize(lintWorkbook(good))).toEqual({ errors: 0, warnings: 0 })
  })
  it('catches the classic silent failures', () => {
    const bad: Workbook = {
      survey: [
        { type: 'select_one missing_list', name: 'q1', 'label::English (en)': 'Q1' },
        { type: 'text', name: 'q1', 'label::English (en)': 'dup' },
        { type: 'text', name: 'bad name', 'label::English (en)': 'x' },
        { type: 'begin_group', name: 'g', 'label::English (en)': 'g' },
        { type: 'end_repeat' },
        { type: 'integer', name: 'n', 'label::English (en)': 'n', relevant: "${nothere}='1'" },
        { type: 'text', name: 'nolabel' },
      ],
      choices: [{ list_name: '', name: 'x', 'label::English (en)': 'x' }, { list_name: 'l', name: 'a', 'label::English (en)': 'A' }, { list_name: 'l', name: 'a', 'label::English (en)': 'A again' }],
      settings: [],
    }
    const msgs = lintWorkbook(bad).map((i) => i.message)
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('list "missing_list" not found'),
        expect.stringContaining('duplicate name "q1"'),
        expect.stringContaining('not a valid XLSForm name'),
        expect.stringContaining('closes a group'),
        expect.stringContaining('${nothere} does not exist'),
        expect.stringContaining('missing list_name'),
        expect.stringContaining('duplicate option "a"'),
        'settings sheet is empty',
      ]),
    )
    expect(summarize(lintWorkbook(bad)).errors).toBeGreaterThanOrEqual(8)
  })
})
