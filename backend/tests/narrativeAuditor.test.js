'use strict';

const { evaluateNarrative } = require('../src/services/narrativeAuditor');

function makeResume(overrides = {}) {
  return {
    most_recent_job_title: '',
    all_job_titles: [],
    skills: [],
    summary: '',
    experience: [],
    ...overrides,
  };
}

describe('evaluateNarrative', () => {
  test('aligned: frontend candidate, frontend JD', () => {
    const resume = makeResume({
      most_recent_job_title: 'Frontend Developer',
      skills: ['React', 'TypeScript', 'CSS'],
    });
    const jd = 'Looking for a frontend engineer with React and Vite experience.';
    const result = evaluateNarrative(resume, jd);
    expect(result.status).toBe('aligned');
    expect(result.strategyTitle).toBeUndefined();
  });

  test('aligned: backend candidate, backend JD', () => {
    const resume = makeResume({
      most_recent_job_title: 'Backend Developer',
      skills: ['Node.js', 'Express', 'PostgreSQL'],
    });
    const jd = 'We need a backend developer to build microservices with Node.js.';
    const result = evaluateNarrative(resume, jd);
    expect(result.status).toBe('aligned');
  });

  test('pivot_required: frontend candidate, backend JD', () => {
    const resume = makeResume({
      most_recent_job_title: 'Frontend Developer',
      skills: ['React', 'CSS', 'HTML'],
    });
    const jd = 'Backend engineer needed. Experience with Node.js, microservices, and REST APIs required.';
    const result = evaluateNarrative(resume, jd);
    expect(result.status).toBe('pivot_required');
    expect(result.strategyTitle).toBeTruthy();
    expect(result.strategyMessage).toBeTruthy();
  });

  test('pivot_required: backend candidate, data JD', () => {
    const resume = makeResume({
      most_recent_job_title: 'Backend Developer',
      skills: ['Node.js', 'Express', 'REST API'],
    });
    const jd = 'Data engineer role. Must have machine learning, pandas, and data science experience.';
    const result = evaluateNarrative(resume, jd);
    expect(result.status).toBe('pivot_required');
    expect(result.strategyTitle).toBeTruthy();
    expect(result.strategyMessage).toBeTruthy();
  });

  test('aligned: fullstack candidate, backend JD — fullstack always aligned', () => {
    const resume = makeResume({
      most_recent_job_title: 'Full Stack Engineer',
      skills: ['React', 'Node.js', 'PostgreSQL'],
    });
    const jd = 'Backend developer needed with Node.js and microservices experience.';
    const result = evaluateNarrative(resume, jd);
    expect(result.status).toBe('aligned');
  });

  test('aligned: unknown candidate domain — no false alarms', () => {
    const resume = makeResume({
      most_recent_job_title: 'Software Engineer',
      skills: ['Git', 'Agile', 'Jira'],
    });
    const jd = 'Looking for a backend engineer with Node.js experience.';
    const result = evaluateNarrative(resume, jd);
    expect(result.status).toBe('aligned');
  });

  test('pivot_required: engineer to product manager JD', () => {
    const resume = makeResume({
      most_recent_job_title: 'Frontend Developer',
      skills: ['React', 'TypeScript', 'CSS', 'HTML'],
    });
    const jd = 'Product manager role. Responsible for roadmap, stakeholder management, and user research.';
    const result = evaluateNarrative(resume, jd);
    expect(result.status).toBe('pivot_required');
    expect(result.strategyTitle).toBeTruthy();
  });
});
