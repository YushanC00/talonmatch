import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TailoredResumeDrawer from './TailoredResumeDrawer';

vi.mock('html2pdf.js', () => ({
  default: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    save: vi.fn().mockResolvedValue(undefined),
  })),
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

const BASE_JOB = { requirements_array: ['React', 'TypeScript'] };
const BASE_RESUME = { skills: ['React', 'CSS'] };

function renderDrawer(overrides = {}) {
  return render(
    <TailoredResumeDrawer
      data={BASE_DATA}
      job={BASE_JOB}
      parsedResume={BASE_RESUME}
      jobTitle="Senior Developer"
      company="Acme Corp"
      onClose={vi.fn()}
      {...overrides}
    />
  );
}

describe('TailoredResumeDrawer — rendering', () => {
  it('renders job title and company', () => {
    renderDrawer();
    expect(screen.getByText(/Acme Corp/i)).toBeInTheDocument();
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
    expect(textarea.value).toContain('Experienced React');
  });

  it('updates displayed text after manual edit', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /edit summary/i }));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'My custom summary text.' } });
    expect(textarea.value).toBe('My custom summary text.');
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
  it('renders Cancel button alongside every Accept button', () => {
    renderDrawer();
    const acceptBtns = screen.getAllByRole('button', { name: /^accept$/i });
    const cancelBtns = screen.getAllByRole('button', { name: /^cancel$/i });
    expect(cancelBtns.length).toBe(acceptBtns.length);
    expect(cancelBtns.length).toBeGreaterThan(0);
  });

  it('Cancel changes button label to "Using Original"', () => {
    renderDrawer();
    const [firstCancel] = screen.getAllByRole('button', { name: /^cancel$/i });
    fireEvent.click(firstCancel);
    expect(screen.getByRole('button', { name: /using original/i })).toBeInTheDocument();
  });

  it('clicking "Using Original" again toggles back to Cancel', () => {
    renderDrawer();
    const [firstCancel] = screen.getAllByRole('button', { name: /^cancel$/i });
    fireEvent.click(firstCancel);
    fireEvent.click(screen.getByRole('button', { name: /using original/i }));
    expect(screen.getAllByRole('button', { name: /^cancel$/i }).length).toBeGreaterThan(0);
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

  it('project Cancel button changes to "Using Original"', () => {
    renderDrawer({ data: DATA_WITH_PROJECTS });
    const cancelBtns = screen.getAllByRole('button', { name: /^cancel$/i });
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(screen.getByRole('button', { name: /using original/i })).toBeInTheDocument();
  });

  it('does not render Projects section when tailored_projects absent', () => {
    renderDrawer();
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
  });
});

describe('TailoredResumeDrawer — autoAccept mode', () => {
  it('header says "Resume Ready to Download" when autoAccept=true', () => {
    renderDrawer({ autoAccept: true });
    expect(screen.getByText(/resume ready to download/i)).toBeInTheDocument();
  });

  it('header says "Review Tailored Resume" by default', () => {
    renderDrawer();
    expect(screen.getByText(/review tailored resume/i)).toBeInTheDocument();
  });
});
