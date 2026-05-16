import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JobCard from './JobCard';

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

vi.mock('../lib/fetchApplication', () => ({
  fetchApplication: vi.fn().mockResolvedValue(null),
}));

const baseJob = {
  job_title: 'Senior UX Designer',
  company: 'Acme Corp',
  location: 'Toronto, ON',
  is_remote: false,
  match_score: 85,
  match_reason: 'Strong Figma and design systems background.',
  requirements_array: ['Figma', 'User Research', 'Design Systems'],
  url: 'https://example.com/job/1',
  description: 'Design user experiences.',
  postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

const parsedResume = {
  skills: ['Figma', 'Prototyping', 'CSS'],
  experience: [{ title: 'UX Designer', company: 'Old Co', period: '2020–2023', bullets: [] }],
};

describe('JobCard — rendering', () => {
  it('renders job title, company, and city', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText('Senior UX Designer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/Toronto/)).toBeInTheDocument();
  });
});

describe('JobCard — honesty patch (badge cap)', () => {
  it('caps badge at 99% when server returns 100% but missing skills exist', () => {
    const contradictoryJob = {
      ...baseJob,
      match_score: 100,
      requirements_array: ['Figma', 'Kotlin', 'Android SDK'],
    };
    renderCard(<JobCard job={contradictoryJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByLabelText(/100%\s*match/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/99%\s*match/i)).toBeInTheDocument();
  });

  it('preserves 100% badge when all requirements satisfied', () => {
    const trueHundredJob = { ...baseJob, match_score: 100, requirements_array: ['Figma'] };
    renderCard(<JobCard job={trueHundredJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByLabelText(/100%\s*match/i)).toBeInTheDocument();
  });

  it('does not cap 95% score (already below 100)', () => {
    const midJob = { ...baseJob, match_score: 95, requirements_array: ['Figma', 'Kotlin'] };
    renderCard(<JobCard job={midJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByLabelText(/95%\s*match/i)).toBeInTheDocument();
  });

  it('never shows "Missing …" text in card (removed from design)', () => {
    const lowMatchJob = {
      ...baseJob,
      match_score: 18,
      requirements_array: ['Figma', 'User Research', 'Design Systems', 'Accessibility', 'Framer'],
    };
    renderCard(<JobCard job={lowMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Missing/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — date formatting', () => {
  it('formats a 2-day-old postedAt as "2d ago"', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/2d ago/i)).toBeInTheDocument();
  });

  it('formats a 14-day-old postedAt as "2w ago"', () => {
    const twoWeeksOldJob = {
      ...baseJob,
      postedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
    renderCard(<JobCard job={twoWeeksOldJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/2w ago/i)).toBeInTheDocument();
  });

  it('renders no relative date when postedAt is null', () => {
    const noDateJob = { ...baseJob, postedAt: undefined };
    renderCard(<JobCard job={noDateJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/Toronto/)).toBeInTheDocument();
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — skill variant matching (tokenizer)', () => {
  it('does not flag React.js as missing when resume has React', () => {
    const job = { ...baseJob, requirements_array: ['React.js', 'Figma'] };
    const resume = { ...parsedResume, skills: ['React', 'Figma'] };
    renderCard(<JobCard job={job} parsedResume={resume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Missing/i)).not.toBeInTheDocument();
  });

  it('does not flag ReactJS as missing when resume has React', () => {
    const job = { ...baseJob, requirements_array: ['ReactJS'] };
    const resume = { ...parsedResume, skills: ['React'] };
    renderCard(<JobCard job={job} parsedResume={resume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Missing/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — match tier buttons', () => {
  it('shows "Tailor & Apply" for high match (≥85, no missing skills)', () => {
    const highMatchJob = { ...baseJob, match_score: 85, requirements_array: ['Figma'] };
    renderCard(<JobCard job={highMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} isLoggedIn={true} resumeFetched={true} />);
    expect(screen.getByRole('button', { name: /tailor & apply/i })).toBeInTheDocument();
  });

  it('shows "Tailor & Apply" for mid match (60-84)', () => {
    const midMatchJob = { ...baseJob, match_score: 72, requirements_array: ['Figma', 'Kotlin'] };
    renderCard(<JobCard job={midMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} isLoggedIn={true} resumeFetched={true} />);
    expect(screen.getByRole('button', { name: /tailor & apply/i })).toBeInTheDocument();
  });

  it('shows "Tailor & Apply" for low match (<60)', () => {
    const lowMatchJob = { ...baseJob, match_score: 45, requirements_array: ['Kotlin', 'Android SDK'] };
    renderCard(<JobCard job={lowMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} isLoggedIn={true} resumeFetched={true} />);
    expect(screen.getByRole('button', { name: /tailor & apply/i })).toBeInTheDocument();
  });

  it('does not show "Review Gaps" for mid match', () => {
    const midMatchJob = { ...baseJob, match_score: 72, requirements_array: ['Figma', 'Kotlin'] };
    renderCard(<JobCard job={midMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /review gaps/i })).not.toBeInTheDocument();
  });
});

describe('JobCard — Remote indicator (inline)', () => {
  it('shows indicator when is_remote is true', () => {
    const job = { ...baseJob, is_remote: true };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-indicator')).toBeInTheDocument();
  });

  it('shows indicator when location contains "Remote"', () => {
    const job = { ...baseJob, is_remote: false, location: 'Remote, Worldwide' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-indicator')).toBeInTheDocument();
  });

  it('shows indicator when job_title contains "Remote"', () => {
    const job = { ...baseJob, is_remote: false, job_title: 'Remote Senior UX Designer' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-indicator')).toBeInTheDocument();
  });

  it('shows indicator when description mentions remote', () => {
    const job = { ...baseJob, is_remote: false, description: 'This is a remote-first role.' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-indicator')).toBeInTheDocument();
  });

  it('hides indicator for on-site job', () => {
    const job = { ...baseJob, is_remote: false, location: 'Toronto, ON', description: 'On-site only.' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByTestId('remote-indicator')).not.toBeInTheDocument();
  });
});

describe('JobCard — Tailored ghost badge', () => {
  it('shows READY badge when isTailored', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} isTailored={true} />);
    const badge = screen.getByTestId('tailored-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('READY');
  });

  it('hides ghost badge when not tailored', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} isTailored={false} />);
    expect(screen.queryByTestId('tailored-badge')).not.toBeInTheDocument();
  });
});

describe('JobCard — Tailored action buttons', () => {
  it('shows "Apply" button when tailored and url present', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} isTailored={true} />);
    expect(screen.getByRole('link', { name: /apply/i })).toBeInTheDocument();
  });

  it('hides tailored buttons when not tailored', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} isTailored={false} />);
    expect(screen.queryByRole('link', { name: /apply/i })).not.toBeInTheDocument();
  });

  it('hides "Apply" link when url is empty', () => {
    const job = { ...baseJob, url: '' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} isTailored={true} />);
    expect(screen.queryByRole('link', { name: /apply/i })).not.toBeInTheDocument();
  });
});

describe('JobCard — pay range', () => {
  it('shows pay range when provided', () => {
    const job = { ...baseJob, pay_range: '$120k — $160k' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText('$120k — $160k')).toBeInTheDocument();
  });

  it('hides pay range when absent', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/\$\d+k/i)).not.toBeInTheDocument();
  });

  it('hides pay range when empty string', () => {
    const job = { ...baseJob, pay_range: '' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/\$\d+k/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — Near Me badge removed', () => {
  it('never shows Near Me badge', () => {
    const job = { ...baseJob, location: 'Toronto, ON' };
    const resume = { ...parsedResume, location: 'Toronto, ON' };
    renderCard(<JobCard job={job} parsedResume={resume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Near Me/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — external link', () => {
  it('renders link to job url that opens in new tab', () => {
    renderCard(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    const link = screen.getByRole('link', { name: /acme corp/i });
    expect(link).toHaveAttribute('href', baseJob.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('hides external link when url is empty', () => {
    const job = { ...baseJob, url: '' };
    renderCard(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
