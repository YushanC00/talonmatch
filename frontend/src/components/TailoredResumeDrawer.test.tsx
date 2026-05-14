import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TailoredResumeDrawer from './TailoredResumeDrawer';

vi.mock('html2pdf.js', () => ({
  default: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    save: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../lib/saveApplication', () => ({
  saveApplication: vi.fn().mockResolvedValue(undefined),
}));

const SUMMARY_DATA = {
  original_text: 'Experienced developer.',
  tailored_text: 'Experienced React developer focused on scalable UIs.',
  change_reason: 'Added React keyword.',
};

const BULLET = {
  original_text: 'Built features for the platform.',
  tailored_text: 'Built scalable React features for the platform.',
  change_reason: 'Injected React keyword.',
  is_new_suggestion: false,
};

const BASE_DATA = {
  summary: SUMMARY_DATA,
  tailored_experience: [
    {
      title: 'Senior Developer',
      company: 'Acme',
      period: '2020–2023',
      bullets: [BULLET],
    },
  ],
};

const BASE_JOB = { job_title: 'Senior Developer', company: 'Acme Corp', match_score: 80, requirements_array: ['React', 'TypeScript'] };
const BASE_RESUME = { skills: ['React', 'CSS'], experience: [] };

function renderDrawer(overrides = {}) {
  return render(
    <TailoredResumeDrawer
      data={BASE_DATA as Record<string, unknown>}
      job={BASE_JOB}
      parsedResume={BASE_RESUME}
      jobTitle="Senior Developer"
      company="Acme Corp"
      onClose={vi.fn()}
      onCommit={vi.fn()}
      {...overrides}
    />
  );
}

// ── V4 test fixtures ──────────────────────────────────────────────────────────

const V4_JOB = { job_title: 'Senior Dev', company: 'Acme', match_score: 60 };
const V4_RESUME = { skills: ['React'], experience: [] };

const makeV4Data = (overrides: object = {}) => ({
  _version: 4,
  sections: [
    {
      title: 'Summary',
      rationale: 'Tailored summary',
      content: [
        { id: 'summary-0', label: '', original: 'Experienced developer.', tailored: 'Experienced React developer.', rationale: 'Added React' },
      ],
    },
    {
      title: 'Work Experience',
      rationale: 'Highlighted skills',
      content: [
        { id: 'we-acme-0', label: 'Dev @ Acme', original: 'Built features.', tailored: 'Built scalable React features.', rationale: 'Added scale' },
        { id: 'we-acme-1', label: '', original: 'Wrote tests.', tailored: 'Wrote tests.', rationale: '' }, // unchanged
      ],
    },
    ...((overrides as { extraSections?: object[] }).extraSections ?? []),
  ],
});

function renderV4Drawer(dataOverrides: object = {}, propOverrides: object = {}) {
  return render(
    <TailoredResumeDrawer
      data={makeV4Data(dataOverrides) as unknown as Record<string, unknown>}
      job={V4_JOB}
      parsedResume={V4_RESUME}
      jobTitle="Senior Dev"
      company="Acme"
      onClose={vi.fn()}
      onCommit={vi.fn()}
      {...propOverrides}
    />
  );
}

const getScore = () =>
  parseInt(screen.getByTestId('match-score-badge').getAttribute('data-score') ?? '0', 10);

describe('TailoredResumeDrawer — V4 live match score', () => {
  it('shows base job match score initially', () => {
    renderV4Drawer();
    // V4 with no requirements_array → baseScore = job.match_score = 60; no items accepted → 60
    expect(getScore()).toBe(60);
  });

  it('score increases when a changed item is accepted', () => {
    renderV4Drawer();
    // 2 changed items total (summary-0 + we-acme-0); we-acme-1 unchanged so excluded
    // Accept summary-0 → 1/2 accepted → bonus = round(0.5 * (99-60)) = round(19.5) = 20 → score = 80
    const acceptBtns = screen.getAllByTitle('Accept');
    fireEvent.click(acceptBtns[0]); // accept summary-0
    expect(getScore()).toBe(80);
  });

  it('score reaches near-max when all changed items accepted', () => {
    renderV4Drawer();
    const acceptBtns = screen.getAllByTitle('Accept');
    acceptBtns.forEach(btn => fireEvent.click(btn));
    // 2/2 accepted → bonus = 39 → score = 99 (capped)
    expect(getScore()).toBe(99);
  });

  it('score never exceeds 99 even at high base', () => {
    const highScoreJob = { ...V4_JOB, match_score: 98 };
    render(
      <TailoredResumeDrawer
        data={makeV4Data() as unknown as Record<string, unknown>}
        job={highScoreJob}
        parsedResume={V4_RESUME}
        jobTitle="Senior Dev"
        company="Acme"
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />
    );
    const acceptBtns = screen.getAllByTitle('Accept');
    acceptBtns.forEach(btn => fireEvent.click(btn));
    // baseScore=98, maxBonus=1, 2/2 accepted → 99 (not 100)
    expect(getScore()).toBe(99);
  });

  it('unchanged items (tailored equals original) do not contribute to bonus', () => {
    // Data with ONLY unchanged items
    const noChangesData = {
      _version: 4,
      sections: [{
        title: 'Summary',
        rationale: '',
        content: [{ id: 'summary-0', label: '', original: 'Same text.', tailored: 'Same text.', rationale: '' }],
      }],
    };
    render(
      <TailoredResumeDrawer
        data={noChangesData as unknown as Record<string, unknown>}
        job={V4_JOB}
        parsedResume={V4_RESUME}
        jobTitle="Senior Dev"
        company="Acme"
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />
    );
    // No changed items → v4TotalChanges = 0 → contentBonus = 0 → score stays at 60
    expect(getScore()).toBe(60);
  });
});

describe('TailoredResumeDrawer — rendering', () => {
  it('renders job title and company', () => {
    renderDrawer();
    expect(screen.getAllByText(/Acme Corp/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Senior Developer/i).length).toBeGreaterThan(0);
  });

  it('renders tailored summary text', () => {
    renderDrawer();
    // Summary tailored_text = "Experienced React developer focused on scalable UIs."
    expect(document.body).toHaveTextContent(/Experienced React developer/i);
  });

  it('renders match score', () => {
    renderDrawer();
    expect(screen.getByText(/%\s*match/i)).toBeInTheDocument();
  });
});

describe('TailoredResumeDrawer — close behaviour', () => {
  it('calls onClose after Escape key', async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 500 });
  });

  it('calls onClose when backdrop clicked', async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.click(screen.getByTestId('drawer-backdrop'));
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 500 });
  });
});

describe('TailoredResumeDrawer — edit mode', () => {
  it('shows textarea when summary edit button clicked', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /edit summary/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('pre-fills textarea with current tailored text', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /edit summary/i }));
    const textarea = screen.getByRole('textbox');
    expect((textarea as HTMLInputElement).value).toContain('Experienced React');
  });

  it('updates displayed text after manual edit', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /edit summary/i }));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'My custom summary text.' } });
    expect((textarea as HTMLInputElement).value).toBe('My custom summary text.');
  });

  it('save button dismisses textarea', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /edit summary/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save summary/i }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('TailoredResumeDrawer — Accept/Cancel', () => {
  it('renders "Keep Original" button alongside every Accept button', () => {
    renderDrawer();
    const acceptBtns = screen.getAllByRole('button', { name: /^accept$/i });
    const cancelBtns = screen.getAllByRole('button', { name: /^keep original$/i });
    expect(cancelBtns.length).toBe(acceptBtns.length);
    expect(cancelBtns.length).toBeGreaterThan(0);
  });

  it('"Keep Original" changes button label to "Using Original"', () => {
    renderDrawer();
    const [firstCancel] = screen.getAllByRole('button', { name: /^keep original$/i });
    fireEvent.click(firstCancel);
    expect(screen.getByRole('button', { name: /using original/i })).toBeInTheDocument();
  });

  it('clicking "Using Original" again toggles back to "Keep Original"', () => {
    renderDrawer();
    const [firstCancel] = screen.getAllByRole('button', { name: /^keep original$/i });
    fireEvent.click(firstCancel);
    fireEvent.click(screen.getByRole('button', { name: /using original/i }));
    expect(screen.getAllByRole('button', { name: /^keep original$/i }).length).toBeGreaterThan(0);
  });
});

describe('TailoredResumeDrawer — Projects section', () => {
  const DATA_WITH_PROJECTS = {
    ...BASE_DATA,
    tailored_projects: [{
      name: 'Portfolio Site',
      bullets: [{
        original_text: 'Built with HTML.',
        tailored_text: 'Built with React and TypeScript.',
        change_reason: 'Added React keyword.',
        is_new_suggestion: false,
      }],
    }],
  };

  it('renders Projects section label when tailored_projects provided', () => {
    renderDrawer({ data: DATA_WITH_PROJECTS });
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
  });

  it('renders project name', () => {
    renderDrawer({ data: DATA_WITH_PROJECTS });
    expect(screen.getAllByText(/portfolio site/i).length).toBeGreaterThan(0);
  });

  it('renders diff text for project bullet', () => {
    renderDrawer({ data: DATA_WITH_PROJECTS });
    expect(screen.queryAllByText(/react and typescript/i).length).toBeGreaterThan(0);
  });

  it('project "Keep Original" button changes to "Using Original"', () => {
    renderDrawer({ data: DATA_WITH_PROJECTS });
    const cancelBtns = screen.getAllByRole('button', { name: /^keep original$/i });
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(screen.getByRole('button', { name: /using original/i })).toBeInTheDocument();
  });

  it('does not render Projects content section when tailored_projects absent', () => {
    renderDrawer();
    // Nav always has "Projects" item; verify no project bullets rendered
    expect(screen.queryByText(/portfolio site/i)).not.toBeInTheDocument();
    expect(screen.queryAllByText(/built with html/i).length).toBe(0);
  });
});

describe('TailoredResumeDrawer — autoAccept mode', () => {
  it('header says "Résumé ready to download" when autoAccept=true', () => {
    renderDrawer({ autoAccept: true });
    expect(screen.getByText(/ready to download/i)).toBeInTheDocument();
  });

  it('header says "Review tailored résumé" by default', () => {
    renderDrawer();
    expect(screen.getByText(/review tailored/i)).toBeInTheDocument();
  });
});
