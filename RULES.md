# TalonMatch — Definition of Done

Enforced on every task. Claude Code reads this file at session start.

---

## Aesthetic: Zen Minimalism

1. **No shadows.** NEVER use `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, or `drop-shadow` anywhere in `frontend/src/`. Borders only.
2. **Card borders.** Cards rest at `border-gray-100`. Modals and overlays use `border-gray-200`.
3. **Card hover.** Must trigger the clockwise green border-draw animation via the `.job-card` CSS class (`color: #10B981`, `@property --border-sweep` + `conic-gradient` in `src/index.css`).
4. **Layout reference.** White-space and hierarchy reference Glassdoor Web UI: generous padding, flat surfaces, restrained color palette.

---

## Logic: Test-First

5. **Test before code.** Write the Vitest test case BEFORE writing feature code. Run `npm test` (from `frontend/`) after every refactor. Only present code once ALL tests are green.
6. **Match score honesty.**
   - `match_score < 100` with requirements → show missing skills list.
   - `match_score === 100` → show "You match all listed requirements."
   - `match_score < 100` with empty `requirements_array` → show "X% keyword match. Requirements may not be fully listed."
7. **Auth intercepts.** Unauthenticated "Tailor Resume" click → show `AuthModal`, save `parsedResume` and pending job URL to `localStorage`. Restore both after OAuth redirect.

---

## Technical

8. **Relative dates.** ALL `postedAt` ISO strings → relative via `formatRelativeTime` (e.g. `"2d ago"`, `"1w ago"`). `null`/`undefined` → render nothing.
9. **PDF timeout.** Every `/api/match` fetch must use `AbortController` with a 15-second timeout. On abort → toast: `"Analysis taking longer than expected. Please try a smaller PDF."`
10. **ATS output.** AI-tailored resume output must be single-column, plain text, standard headings (`Summary`, `Experience`, `Education`). No tables, no special Unicode, no multi-column layouts.

---

## AI Integrity: Anti-Hallucination

11. **Numerical Integrity (Experience & Years)**

    - **Strict Zero-Modification.** The AI is strictly forbidden from changing numerical years of experience, graduation dates, or employment timelines. If the candidate has "5 years of experience," the output must never say "7 years" — even if the JD requires it.

    - **The Bridge Strategy.** When a JD asks for more years than the candidate has, use qualitative framing instead of fabricating a number. Permitted bridges:
      - "Extensive hands-on experience with..."
      - "Senior-level expertise in..."
      - "Proven track record across..."
      - Highlighting *relevant depth* over raw tenure.

    - **Calculated Totals Only.** Any "X years of experience" statement in the tailored summary must be derived from the `employment_history` date ranges in the parsed resume, not copied or inferred from the job description. When dates are ambiguous or absent, omit the figure entirely rather than guess.
