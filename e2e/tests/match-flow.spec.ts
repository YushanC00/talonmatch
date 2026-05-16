import { test, expect } from '@playwright/test';

const MOCK_RESPONSE = {
  resume_skills: ['React', 'TypeScript', 'Node.js'],
  resume_experience: [
    { title: 'Frontend Engineer', company: 'Acme Corp', period: '2021–Present', bullets: [] },
  ],
  jobs: [
    {
      job_id: 'test-job-1',
      job_title: 'Frontend Engineer',
      company: 'Acme Corp',
      location: 'Vancouver, BC',
      match_score: 87,
      requirements_array: ['React', 'TypeScript', 'GraphQL'],
      description: 'Build great UIs with React and TypeScript.',
      postedAt: '2026-05-01',
    },
  ],
};

const PDF_BUFFER = Buffer.from('%PDF-1.4\n%%EOF');

test('upload resume → job cards render', async ({ page }) => {
  await page.route('**/api/match**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RESPONSE),
    });
  });

  await page.goto('/');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'test-resume.pdf',
    mimeType: 'application/pdf',
    buffer: PDF_BUFFER,
  });

  await expect(page.locator('text=Ready to scan')).toBeVisible();
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('text=Acme Corp').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[aria-label="87% match"]')).toBeVisible();
});

test('score capped at 99% when required skills missing', async ({ page }) => {
  // match_score: 100 but GraphQL is missing from resume_skills → must display 99%
  const cappedResponse = {
    ...MOCK_RESPONSE,
    jobs: [{ ...MOCK_RESPONSE.jobs[0], match_score: 100 }],
  };

  await page.route('**/api/match**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(cappedResponse),
    });
  });

  await page.goto('/');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'test-resume.pdf',
    mimeType: 'application/pdf',
    buffer: PDF_BUFFER,
  });

  await page.locator('button[type="submit"]').click();

  await expect(page.locator('[aria-label="99% match"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[aria-label="100% match"]')).not.toBeVisible();
});
