// Synthetic only: no template sample facts or private candidate data.
export function resumeColumnsFixture() {
  const block = (type, text, right = '', emphasis = 'REGULAR') => ({ type, text, right, emphasis });
  return { kind: 'RESUME', title: 'Synthetic two-column resume', body: '', nodes: [], edges: [], resume: {
    template_name: '', review_notes: ['Internal review note; never in PDF'],
    layout: { margin_mm: 16, body_pt: 10.5, line_height: 1.3, name_pt: 24, section_pt: 13, section_gap_pt: 12 },
    columns: { left_fraction: .34, gap_mm: 8, divider: true, assignments: ['FULL', 'FULL', 'LEFT', 'LEFT', 'LEFT', 'RIGHT', 'RIGHT', 'RIGHT', 'FULL', 'LEFT', 'LEFT', 'RIGHT', 'RIGHT', 'RIGHT'] },
    blocks: [block('NAME', '林晨 Lin Chen'), block('CONTACT', 'lin@example.test | https://example.test/portfolio'),
      block('SECTION', 'EDUCATION 教育'), block('ENTRY', 'Synthetic University / Design', '2024 - 2025', 'BOLD'), block('PARAGRAPH', 'Design research and prototyping.'),
      block('SECTION', 'EXPERIENCE 经历'), block('ENTRY', 'Example Studio / Designer', '2025 - Present', 'BOLD'), block('BULLET', 'Packaging modifications and poster design. 保留职责与数字。'),
      block('PAGE_BREAK', ''), block('SECTION', 'SKILLS 技能'), block('PARAGRAPH', 'Interviews and prototyping. 访谈与原型。'),
      block('SECTION', 'RESEARCH 研究'), block('ENTRY', 'Tail Study', '2025', 'BOLD'), block('BULLET', 'Research with 12 participants; colleagues handled deployment. 只负责研究。café e\u0301 👩🏽‍💻 𠮷。')] } };
}
