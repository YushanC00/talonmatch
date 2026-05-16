'use strict';

const { auditSection } = require('../src/services/auditorAgent');

function makeSection(items) {
  return { title: 'Work Experience', rationale: '', content: items };
}

function makeItem(tailored, original) {
  return { id: 'we-test-0', label: '', original: original ?? tailored, tailored };
}

describe('auditorAgent', () => {
  test('replaces "leveraging" (any case) with "using"', () => {
    const section = makeSection([makeItem('Leveraging React to build UIs.')]);
    const { section: out, patched, patchCount } = auditSection(section);
    expect(out.content[0].tailored).toBe('Using React to build UIs.');
    expect(patched).toBe(true);
    expect(patchCount).toBe(1);
  });

  test('replaces "spearheaded" with "led"', () => {
    const section = makeSection([makeItem('Spearheaded the migration to AWS.')]);
    const { section: out, patched } = auditSection(section);
    expect(out.content[0].tailored).toBe('Led the migration to AWS.');
    expect(patched).toBe(true);
  });

  test('no-op on clean text — patched: false, patchCount: 0', () => {
    const section = makeSection([makeItem('Built REST API with Node.js.')]);
    const { section: out, patched, patchCount } = auditSection(section);
    expect(out.content[0].tailored).toBe('Built REST API with Node.js.');
    expect(patched).toBe(false);
    expect(patchCount).toBe(0);
  });

  test('patchCount counts items, not occurrences (multi-fluff one bullet)', () => {
    // "leveraging" + "synergy" + "results-driven" in ONE item → patchCount = 1
    const section = makeSection([
      makeItem('Leveraging synergy to deliver results-driven outcomes.'),
    ]);
    const { patchCount } = auditSection(section);
    expect(patchCount).toBe(1);
  });

  test('never modifies the original field', () => {
    // tailored has fluff; original also has fluff — only tailored gets patched
    const section = makeSection([
      makeItem('Leveraging React to build UIs.', 'Leveraging React to build UIs.'),
    ]);
    const { section: out } = auditSection(section);
    expect(out.content[0].tailored).toBe('Using React to build UIs.');
    expect(out.content[0].original).toBe('Leveraging React to build UIs.');
  });
});
