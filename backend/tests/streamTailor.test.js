'use strict';

const { validateAndPatchSection } = require('../src/workers/streamTailor');

const BASE_RESUME = {
  summary: 'Experienced developer.',
  summary_section_title: 'Professional Profile',
  skills: ['React', 'TypeScript', 'C++'],
  experience: [
    { company: 'Acme', title: 'Engineer', period: '2020–2023', bullets: ['Built APIs.', 'Wrote tests.'] },
    { company: 'Beta Corp', title: 'Dev', period: '2018–2020', bullets: ['Led migration.'] },
  ],
  projects: [{ name: 'MyApp', description: 'A React application.' }],
  education: [{ degree: 'BSc CS', school: 'UBC', year: '2018' }],
  style_config: null,
};

function makeExp(overrides = {}) {
  return {
    title: 'Work Experience',
    rationale: 'JD fit',
    content: [
      { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
      { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote unit tests.' },
      { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led cloud migration.' },
    ],
    ...overrides,
  };
}

describe('validateAndPatchSection', () => {
  describe('Guard 1 — title integrity', () => {
    it('passes when title is in source set', () => {
      const sec = { title: 'Work Experience', rationale: '', content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote unit tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led migration.' },
      ]};
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(false);
    });

    it('fails and falls back when title not in source set', () => {
      const sec = { title: 'Employment History', rationale: '', content: [] };
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('title-integrity');
      expect(r.section.title).toBe('Work Experience'); // classified fallback
    });

    it('uses style_config sections when present', () => {
      const resume = { ...BASE_RESUME, style_config: { sections: ['Custom Summary', 'Work Experience'] } };
      const sec = { title: 'Custom Summary', rationale: '', content: [
        { id: 'summary-0', label: '', original: 'Experienced developer.', tailored: 'React developer.' },
      ]};
      const r = validateAndPatchSection(sec, resume);
      expect(r.patched).toBe(false);
    });

    it('falls back when title not in style_config sections', () => {
      const resume = { ...BASE_RESUME, style_config: { sections: ['Summary'] } };
      const sec = { title: 'Work Experience', rationale: '', content: [] };
      const r = validateAndPatchSection(sec, resume);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('title-integrity');
    });
  });

  describe('Guard 2 — dimension parity', () => {
    it('passes when content.length >= source length', () => {
      const r = validateAndPatchSection(makeExp(), BASE_RESUME);
      expect(r.patched).toBe(false);
    });

    it('fails when AI drops bullets', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('dimension-parity');
    });

    it('passes when AI returns more items than source', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote unit tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led cloud migration.' },
        { id: 'we-acme-2', label: '', original: 'Extra bullet.', tailored: 'Extra bullet.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(false);
    });

    it('falls back for unknown section type', () => {
      const sec = { title: 'Totally Unknown', rationale: '', content: [] };
      const resume = { ...BASE_RESUME, style_config: { sections: ['Totally Unknown'] } };
      const r = validateAndPatchSection(sec, resume);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('dimension-parity');
    });
  });

  describe('Guard 3 — label lock', () => {
    it('passes when experience labels match source exactly', () => {
      const r = validateAndPatchSection(makeExp(), BASE_RESUME);
      expect(r.patched).toBe(false);
    });

    it('passes with separator swap (| → ,)', () => {
      const resume = {
        ...BASE_RESUME,
        experience: [
          { company: 'MacProvideo', title: 'UX Designer | Front-end Developer', period: 'Oct 2013 - Jun 2020', bullets: ['Built UI.'] },
          { company: 'Acme', title: 'Engineer', period: '2020–2023', bullets: ['Built APIs.', 'Wrote tests.'] },
        ],
      };
      const sec = { title: 'Work Experience', rationale: '', content: [
        { id: 'we-macprovide-0', label: 'UX Designer, Front-end Developer @ MacProvideo (Oct 2013 - Jun 2020)', original: 'Built UI.', tailored: 'Redesigned UI.' },
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote tests.' },
      ]};
      const r = validateAndPatchSection(sec, resume);
      expect(r.patched).toBe(false);
    });

    it('fails when company name is mutated', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ AcmeCorp (2020–2023)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote unit tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led migration.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('label-lock');
    });

    it('fails when date is mutated', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2024)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote unit tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led migration.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('label-lock');
    });

    it('ignores non-@ labels (project names, skill categories)', () => {
      const sec = { title: 'Projects', rationale: '', content: [
        { id: 'proj-myapp-0', label: 'MyApp', original: 'A React application.', tailored: 'A React app with TypeScript.' },
      ]};
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(false);
    });

    it('ignores empty labels', () => {
      const r = validateAndPatchSection(makeExp(), BASE_RESUME);
      expect(r.patched).toBe(false);
    });
  });

  describe('Guard 4 — syntax integrity', () => {
    it('passes clean tailored text', () => {
      const r = validateAndPatchSection(makeExp(), BASE_RESUME);
      expect(r.patched).toBe(false);
    });

    it('passes balanced ~~ pairs', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: '~~old~~ new approach.' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote unit tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led migration.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(false);
    });

    it('fails on dangling ~~ (odd count)', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: '~~unclosed text' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led migration.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('syntax-integrity');
    });

    it('fails on dangling ++ (odd count, not identifier)', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: '++unclosed addition' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led migration.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(true);
      expect(r.reason).toBe('syntax-integrity');
    });

    it('passes C++ and C/C++ in tailored text', () => {
      const sec = makeExp({ content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: 'Built C++ and C/C++ systems.' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote tests.' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'Led migration.' },
      ]});
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(false);
    });
  });

  describe('fallback content', () => {
    it('returns original content items on fallback', () => {
      const sec = { title: 'Work Experience', rationale: '', content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2024)', original: 'Built APIs.', tailored: 'x' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'x' },
        { id: 'we-beta-co-0', label: 'Dev @ Beta Corp (2018–2020)', original: 'Led migration.', tailored: 'x' },
      ]};
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(true);
      expect(r.section.rationale).toBe('');
      expect(r.section.content[0].tailored).toBe('Built APIs.');
    });

    it('uses source title in fallback for unknown AI title', () => {
      const sec = { title: 'Employment History', rationale: 'x', content: [] };
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.section.title).toBe('Work Experience');
    });

    it('builds fallback from description when no bullets', () => {
      const resume = {
        ...BASE_RESUME,
        experience: [{ company: 'Acme', title: 'Engineer', period: '2020–2023', description: 'Built APIs. Wrote tests. Led team.' }],
      };
      const sec = { title: 'Work Experience', rationale: '', content: [
        { id: 'we-acme-0', label: 'Engineer @ BadCompany (2020–2023)', original: 'Built APIs.', tailored: 'x' },
      ]};
      const r = validateAndPatchSection(sec, resume);
      expect(r.patched).toBe(true);
      expect(r.section.content.length).toBeGreaterThan(0);
    });

    it('returns empty content for unclassifiable title fallback', () => {
      const resume = { ...BASE_RESUME, style_config: { sections: ['Totally Unknown'] } };
      const sec = { title: 'Totally Unknown', rationale: '', content: [] };
      const r = validateAndPatchSection(sec, resume);
      expect(r.section.content).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles resume with no projects or education', () => {
      const resume = { summary: 'Dev.', skills: ['React'], experience: [
        { company: 'Acme', title: 'Engineer', period: '2020–2023', bullets: ['Built APIs.'] },
      ]};
      const sec = { title: 'Work Experience', rationale: '', content: [
        { id: 'we-acme-0', label: 'Engineer @ Acme (2020–2023)', original: 'Built APIs.', tailored: 'Built scalable APIs.' },
      ]};
      const r = validateAndPatchSection(sec, resume);
      expect(r.patched).toBe(false);
    });

    it('summary section passes all guards', () => {
      const sec = { title: 'Professional Profile', rationale: 'matched', content: [
        { id: 'summary-0', label: '', original: 'Experienced developer.', tailored: 'React developer with C++ experience.' },
      ]};
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(false);
      expect(r.section.content[0].tailored).toBe('React developer with C++ experience.');
    });

    it('education section passes all guards', () => {
      const sec = { title: 'Education', rationale: '', content: [
        { id: 'edu-0', label: 'BSc CS', original: 'BSc CS — UBC (2018)', tailored: 'BSc CS — UBC (2018)' },
      ]};
      const r = validateAndPatchSection(sec, BASE_RESUME);
      expect(r.patched).toBe(false);
    });
  });
});
