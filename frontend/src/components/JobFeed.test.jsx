import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import JobFeed from './JobFeed';

vi.mock('./JobCard', () => ({
  default: ({ job }) => <div data-testid="job-card">{job.job_title}</div>,
}));
vi.mock('./JobDetailModal', () => ({
  default: () => null,
}));

const makeJob = (title, score, daysAgo = 5) => ({
  job_title: title,
  company: 'Test Co',
  location: 'Toronto, ON',
  is_remote: false,
  match_score: score,
  requirements_array: [],
  url: `https://example.com/${title}`,
  description: '',
  postedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
});

const jobs = [
  makeJob('High Match Role', 92),
  makeJob('Mid Match Role', 72),
  makeJob('Low Match Role', 45),
];

const parsedResume = { skills: ['React'], experience: [] };

describe('JobFeed — rendering', () => {
  it('renders all provided jobs', () => {
    render(<JobFeed jobs={jobs} parsedResume={parsedResume} />);
    expect(screen.getAllByTestId('job-card')).toHaveLength(3);
  });

  it('shows empty state when no jobs and no totalJobs', () => {
    render(<JobFeed jobs={[]} totalJobs={0} parsedResume={parsedResume} />);
    expect(screen.getByText(/no jobs found/i)).toBeInTheDocument();
  });

  it('shows filter-specific empty state when totalJobs > 0 but jobs is empty', () => {
    render(<JobFeed jobs={[]} totalJobs={3} parsedResume={parsedResume} />);
    expect(screen.getByText(/no jobs match these filters/i)).toBeInTheDocument();
  });
});

describe('JobFeed — no New Search button', () => {
  it('"New Search" moved to UserMenu — never renders in JobFeed', () => {
    render(<JobFeed jobs={jobs} parsedResume={parsedResume} />);
    expect(screen.queryByRole('button', { name: /new search/i })).not.toBeInTheDocument();
  });
});
