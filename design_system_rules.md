# TalonMatch: Design System Rules (v1.1)

**Goal:** Maintain a high-performance, minimalist "Career Agent" aesthetic that prioritizes action and reduces visual noise.

---

## 1. Information Hierarchy

- **The Hero Metric:** The **Match %** is the primary anchor. It must have the highest visual weight (e.g., the red/green ring gauge).
- **Meta-Data:** Use `№ 001 · POSITION` formatting for the card header in a muted monospace font to create a "Hunting Dossier" feel.
- **Secondary Info:** Company names and locations must be de-emphasized using muted tones (e.g., `text-slate-500`) to prevent competition with the job title.

## 2. Interaction & Hover States (The "Dossier" Rule)

- **Lift & Accent:** On `hover`, the card must translate `translate-y-[-4px]` and gain a subtle drop shadow.
- **The Ink Mark:** The left accent border must grow from a 14px inset to full-bleed and thicken from `3px` to `5px` on hover.
- **Contextual Disclosure:** \* Status tags (e.g., `READY`, `TAILOR`, `DRAFT`) must **fade out** on hover.
  - Reveal secondary actions (**Bookmark/Save** and **Dismiss/X**) in the space vacated by the status tag.
  - Actions are strictly hidden during passive scanning.

## 3. Visual Identity & Branding

- **Palette:** Strictly follow the **Sage, Clay, and Sumi-ink** palette from the [Claude Design prototype](https://api.anthropic.com/v1/design/h/hac-jfXH3xPwA_2uHI3rHw?open_file=Talon+Match.html).
- **Japanese Watermarks:**
  - The global header must feature **鷹合** next to the logo.
  - Vertical phrases (_好機を逃すな_ and _鷹の目で狙え_) are fixed, low-opacity decorative elements on the far left and right margins of the screen.
  - **Rule:** No Japanese characters inside the job cards themselves to keep data density high.
- **The Mission Control Bar:** A horizontal status summary (e.g., _9 roles: 2 Ready, 3 Tailor, 4 Drafts_) must sit below the main header.

## 4. Component Standards

- **Match Gauge:** Use the dual-ring gauge from the design. Include the fit label (e.g., _PRIME FIT_, _STRONG FIT_) directly below the score.
- **Skill Alignment:** Display a count of matching skills (e.g., _"5 matching skills"_) in a small, muted font on the card to provide context for the match score.

## 5. Functional Guardrails

- **No Retrospectives:** Do not display "Strike Logs" or "Match History" in the primary Hunting Ground view.
- **Live Updates:** Any changes accepted in the [Tailor Studio](http://localhost:5173/) must reflect in the Match % gauge immediately without a page reload.
- **Responsive Integrity:** Maintain 3-column layout for desktop, 2-column for iPad/Tablet, and 1-column for mobile, as defined in the [design file](
