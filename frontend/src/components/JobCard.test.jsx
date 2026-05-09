import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import JobCard from './JobCard';

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
    render(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
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
    render(<JobCard job={contradictoryJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/100%\s*match/i)).not.toBeInTheDocument();
    expect(screen.getByText(/99%\s*match/i)).toBeInTheDocument();
  });

  it('preserves 100% badge when all requirements satisfied', () => {
    const trueHundredJob = { ...baseJob, match_score: 100, requirements_array: ['Figma'] };
    render(<JobCard job={trueHundredJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/100%\s*match/i)).toBeInTheDocument();
  });

  it('does not cap 95% score (already below 100)', () => {
    const midJob = { ...baseJob, match_score: 95, requirements_array: ['Figma', 'Kotlin'] };
    render(<JobCard job={midJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/95%\s*match/i)).toBeInTheDocument();
  });

  it('never shows "Missing …" text in card (removed from design)', () => {
    const lowMatchJob = {
      ...baseJob,
      match_score: 18,
      requirements_array: ['Figma', 'User Research', 'Design Systems', 'Accessibility', 'Framer'],
    };
    render(<JobCard job={lowMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Missing/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — date formatting', () => {
  it('formats a 2-day-old postedAt as "2d ago"', () => {
    render(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/2d ago/i)).toBeInTheDocument();
  });

  it('formats a 14-day-old postedAt as "2w ago"', () => {
    const twoWeeksOldJob = {
      ...baseJob,
      postedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
    render(<JobCard job={twoWeeksOldJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/2w ago/i)).toBeInTheDocument();
  });

  it('renders no relative date when postedAt is null', () => {
    const noDateJob = { ...baseJob, postedAt: null };
    render(<JobCard job={noDateJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText(/Toronto/)).toBeInTheDocument();
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — skill variant matching (tokenizer)', () => {
  it('does not flag React.js as missing when resume has React', () => {
    const job = { ...baseJob, requirements_array: ['React.js', 'Figma'] };
    const resume = { ...parsedResume, skills: ['React', 'Figma'] };
    render(<JobCard job={job} parsedResume={resume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Missing/i)).not.toBeInTheDocument();
  });

  it('does not flag ReactJS as missing when resume has React', () => {
    const job = { ...baseJob, requirements_array: ['ReactJS'] };
    const resume = { ...parsedResume, skills: ['React'] };
    render(<JobCard job={job} parsedResume={resume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Missing/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — match tier buttons', () => {
  it('shows "One-Click Apply" for high match (≥85, no missing skills)', () => {
    const highMatchJob = { ...baseJob, match_score: 85, requirements_array: ['Figma'] };
    render(<JobCard job={highMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByRole('button', { name: /one-click apply/i })).toBeInTheDocument();
  });

  it('shows "Tailor & Apply" for mid match (60-84)', () => {
    const midMatchJob = { ...baseJob, match_score: 72, requirements_array: ['Figma', 'Kotlin'] };
    render(<JobCard job={midMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByRole('button', { name: /tailor & apply/i })).toBeInTheDocument();
  });

  it('shows "Review Gaps" for low match (<60)', () => {
    const lowMatchJob = { ...baseJob, match_score: 45, requirements_array: ['Kotlin', 'Android SDK'] };
    render(<JobCard job={lowMatchJob} parsedResume={{ skills: [], experience: [] }} onViewDetails={vi.fn()} />);
    expect(screen.getByRole('button', { name: /review gaps/i })).toBeInTheDocument();
  });

  it('does not show "Review Gaps" for mid match', () => {
    const midMatchJob = { ...baseJob, match_score: 72, requirements_array: ['Figma', 'Kotlin'] };
    render(<JobCard job={midMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /review gaps/i })).not.toBeInTheDocument();
  });
});

describe('JobCard — Remote ribbon', () => {
  it('shows ribbon when is_remote is true', () => {
    const job = { ...baseJob, is_remote: true };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-ribbon')).toBeInTheDocument();
  });

  it('shows ribbon when location contains "Remote"', () => {
    const job = { ...baseJob, is_remote: false, location: 'Remote, Worldwide' };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-ribbon')).toBeInTheDocument();
  });

  it('shows ribbon when job_title contains "Remote"', () => {
    const job = { ...baseJob, is_remote: false, job_title: 'Remote Senior UX Designer' };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-ribbon')).toBeInTheDocument();
  });

  it('shows ribbon when description mentions remote', () => {
    const job = { ...baseJob, is_remote: false, description: 'This is a remote-first role.' };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId('remote-ribbon')).toBeInTheDocument();
  });

  it('hides ribbon for on-site job', () => {
    const job = { ...baseJob, is_remote: false, location: 'Toronto, ON', description: 'On-site only.' };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByTestId('remote-ribbon')).not.toBeInTheDocument();
  });
});

describe('JobCard — pay range', () => {
  it('shows pay range when provided', () => {
    const job = { ...baseJob, pay_range: '$120k — $160k' };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.getByText('$120k — $160k')).toBeInTheDocument();
  });

  it('hides pay range when absent', () => {
    render(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/\$\d+k/i)).not.toBeInTheDocument();
  });

  it('hides pay range when empty string', () => {
    const job = { ...baseJob, pay_range: '' };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/\$\d+k/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — Near Me badge removed', () => {
  it('never shows Near Me badge', () => {
    const job = { ...baseJob, location: 'Toronto, ON' };
    const resume = { ...parsedResume, location: 'Toronto, ON' };
    render(<JobCard job={job} parsedResume={resume} onViewDetails={vi.fn()} />);
    expect(screen.queryByText(/Near Me/i)).not.toBeInTheDocument();
  });
});

describe('JobCard — external link', () => {
  it('renders link to job url that opens in new tab', () => {
    render(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    const link = screen.getByRole('link', { name: /view posting/i });
    expect(link).toHaveAttribute('href', baseJob.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('hides external link when url is empty', () => {
    const job = { ...baseJob, url: '' };
    render(<JobCard job={job} parsedResume={parsedResume} onViewDetails={vi.fn()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
