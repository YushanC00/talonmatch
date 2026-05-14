# TalonMatch: Design System Rules (v2.0 - Tactical Dossier)

**Goal:** Maintain a high-stakes, "Intelligence Briefing" aesthetic. Zero-tolerance for soft edges, SaaS-speak, or visual noise.

---

## 1. Core Geometry & Typography

- **The Zero Rule:** All containers, buttons, cards, and avatars must have a **0px border-radius** (sharp corners). Rounded corners are a bug.
- **The "Mincho" Rule:** Use `tm-mincho` (Bold Serif) for all primary document headings (e.g., "Today's hunting ground", "Review tailored résumé").
- **The "Mono" Rule:** Use `tm-mono` (Monospace) for all technical data, status counts, and button text (e.g., "STRIKE READY", "+12 MATCH").

## 2. Branding & Tone (Strike Language)

- **Status Intel:** Do not use "Ready, Tailor, Drafts". Use **[N] STRIKE READY · [N] IN PREP · [N] SCOUTING**.
- **Branding:** Logo must include **鷹合** and the tagline **FIND · TAILOR · STRIKE**.
- **Mission Count:** Remove generic counts like "9 roles in your hunt". Only show the bracketed tactical status counts.

## 3. Component Standards (JobCard)

- **Numbering:** Remove all `№ 001` indexing. Cards are individual files, not list items.
- **Shooting Arrow Animation:** On hover, the status tag must animate **UP and OUT** (`y: -40`, `opacity: 0`).
- **One-Action Logic:** Reveal only a single action button: `Ready to Apply →` or `Tailor & Apply`. Remove 'Edit' from the card face.
- **Skill Intel:** Surface explicit delta data: `+N MATCH / -N GAP` in high-contrast `tm-mono`.

## 4. Editor (Tailor Panel) Standards

- **Mirror Design:** Pixel-perfect alignment with the 'Review tailored resume' panel in `Talon Match.html`.
- **The Diff View:** Use `var(--moss-mute)` for additions and `var(--shu-mute)` for deletions.

## 5. Performance & Backend Logic

- **Single-Pass Extraction:** All tailoring (Summary, Experience, Projects) must happen in a **single GROQ round-trip** using structured JSON.
- **Latency Target:** 'Tailor & Apply' action must be optimized for speed. Multiple sequential LLM calls are prohibited.
- **Data Integrity:** Refactors must focus on data delivery speed and must NOT modify existing CSS or JSX layout structures.
