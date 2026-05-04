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
  postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
};

const parsedResume = {
  skills: ['Figma', 'Prototyping', 'CSS'],
  experience: [{ title: 'UX Designer', company: 'Old Co', period: '2020–2023', bullets: [] }],
};

describe('JobCard — rendering', () => {
  it('renders job title, company, and location', () => {
    render(<JobCard job={baseJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);

    expect(screen.getByText('Senior UX Designer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/Toronto/)).toBeInTheDocument();
  });
});

describe('JobCard — match logic', () => {
  it('shows missing skills at 18% match — never says "all skills found"', () => {
    const lowMatchJob = {
      ...baseJob,
      match_score: 18,
      requirements_array: ['Figma', 'User Research', 'Design Systems', 'Accessibility', 'Framer'],
    };
    render(<JobCard job={lowMatchJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);

    expect(screen.queryByText(/all listed requirements/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Missing/i)).toBeInTheDocument();
    expect(screen.getByText(/User Research/i)).toBeInTheDocument();
  });

  it('9% match with minimal data does not crash', () => {
    const bareJob = {
      ...baseJob,
      match_score: 9,
      requirements_array: [],
      description: '',
      match_reason: '',
    };
    expect(() =>
      render(<JobCard job={bareJob} parsedResume={{ skills: [], experience: [] }} onViewDetails={vi.fn()} />)
    ).not.toThrow();

    // At 9% with empty requirements, shows percentage branch (not missing skills, not 100%)
    expect(screen.getByText(/9% keyword match/i)).toBeInTheDocument();
    expect(screen.queryByText(/all listed requirements/i)).not.toBeInTheDocument();
  });

  it('shows "all requirements matched" only at exactly 100%', () => {
    const perfectJob = { ...baseJob, match_score: 100, requirements_array: ['Figma'] };
    render(<JobCard job={perfectJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);

    expect(screen.getByText(/all listed requirements/i)).toBeInTheDocument();
  });
});

describe('JobCard — honesty patch (100% contradiction fix)', () => {
  it('caps badge at 99% when server returns 100% but missing skills exist', () => {
    const contradictoryJob = {
      ...baseJob,
      match_score: 100,
      requirements_array: ['Figma', 'Kotlin', 'Android SDK'], // Kotlin + Android SDK missing
    };
    render(<JobCard job={contradictoryJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);

    expect(screen.queryByText(/100%\s*match/i)).not.toBeInTheDocument();
    expect(screen.getByText(/99%\s*match/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing/i)).toBeInTheDocument();
    expect(screen.queryByText(/all listed requirements/i)).not.toBeInTheDocument();
  });

  it('preserves 100% badge when requirements are all satisfied', () => {
    const trueHundredJob = {
      ...baseJob,
      match_score: 100,
      requirements_array: ['Figma'], // Figma is in parsedResume.skills
    };
    render(<JobCard job={trueHundredJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);

    expect(screen.getByText(/100%\s*match/i)).toBeInTheDocument();
    expect(screen.getByText(/all listed requirements/i)).toBeInTheDocument();
  });

  it('caps a 95% score at 95% (no cap when already below 100)', () => {
    const midJob = {
      ...baseJob,
      match_score: 95,
      requirements_array: ['Figma', 'Kotlin'], // Kotlin missing
    };
    render(<JobCard job={midJob} parsedResume={parsedResume} onViewDetails={vi.fn()} />);

    // 95 < 100, no cap triggered — stays 95%, shows missing skills
    expect(screen.getByText(/95%\s*match/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing/i)).toBeInTheDocument();
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
    // Location still shows, but no time string
    expect(screen.getByText(/Toronto/)).toBeInTheDocument();
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
  });
});
