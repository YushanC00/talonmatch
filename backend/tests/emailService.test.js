const { buildNotificationEmail } = require('../emailService');

describe('buildNotificationEmail', () => {
  const apps = [
    { jobTitle: 'Senior Engineer', company: 'Acme', matchScore: 92, applyUrl: 'https://acme.com/apply' },
    { jobTitle: 'Staff Engineer',  company: 'Beta', matchScore: 87, applyUrl: 'https://beta.com/jobs/1' },
  ];

  it('returns subject and html fields', () => {
    const result = buildNotificationEmail(apps);
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('html');
  });

  it('subject mentions number of applications', () => {
    const { subject } = buildNotificationEmail(apps);
    expect(subject).toMatch(/2/);
  });

  it('html contains each job title', () => {
    const { html } = buildNotificationEmail(apps);
    expect(html).toContain('Senior Engineer');
    expect(html).toContain('Staff Engineer');
  });

  it('html contains each company name', () => {
    const { html } = buildNotificationEmail(apps);
    expect(html).toContain('Acme');
    expect(html).toContain('Beta');
  });

  it('html contains each match score', () => {
    const { html } = buildNotificationEmail(apps);
    expect(html).toContain('92');
    expect(html).toContain('87');
  });

  it('html contains apply links', () => {
    const { html } = buildNotificationEmail(apps);
    expect(html).toContain('https://acme.com/apply');
    expect(html).toContain('https://beta.com/jobs/1');
  });

  it('handles a single application', () => {
    const { subject } = buildNotificationEmail([apps[0]]);
    expect(subject).toMatch(/1/);
  });

  it('html is valid enough to contain opening and closing tags', () => {
    const { html } = buildNotificationEmail(apps);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });
});
