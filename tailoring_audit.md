# 🔍 Tailoring Render Audit: Mission Alignment

Use this checklist to verify that the **Dynamic Section Refactor** is rendering correctly in the `TailoredResumeDrawer`.

---

## 1. Visual Geometry & Branding
- [ ] **Zero-Radius:** Are all cards and buttons in the drawer strictly 0px (sharp corners)?
- [ ] **Typography:** - Are headers (SUMMARY, EXPERIENCE, etc.) in `tm-mono`?
  - Is the resume content in `tm-mincho` (serif)?
  - Is the `rationale` text in `tm-mono`?
- [ ] **The Ink Rule:** Is the vertical sidebar navigation using the ink-rule (1px line) for the active section?

---

## 2. Dynamic Data Integrity (The "Amazon" Fix)
- [ ] **Section Parity:** Does the number of sections in the "NAVIGATE" sidebar match the number of sections visible in the main scroll area?
- [ ] **No Dropped Sections:** Verify that sections like "Experience" or "Projects" are no longer showing the "No sections returned" fallback.
- [ ] **Original Titles:** Are the section titles identical to your uploaded PDF (e.g., if your PDF says "Work History," does the UI say "Work History" instead of "Experience")?

---

## 3. The Diff & Interaction Logic
- [ ] **High-Contrast Highlights:** - Are additions highlighted in `var(--moss-mute)` (subtle green)?
  - Are deletions struck through in `var(--shu-mute)` (subtle red/clay)?
- [ ] **Accept/Revert Loop:** - Does clicking "Accept" resolve the diff into a clean state?
  - Does the "Commit" button at the bottom update the "X/Y Reviewed" count?
- [ ] **The rationale:** Is there a visible `rationale` for every tailored bullet point?

---

## 4. Performance & UX
- [ ] **Loading State:** Does the transition from "Tailor & Apply" to the "Review" panel feel seamless?
- [ ] **Status Flip:** After clicking **[Commit tailoring]**, does the JobCard on the main hunt page flip from `TAILOR` to `READY`?

---

## 5. Audit Tools (External)
If the render looks correct, paste the final "Committed" text into one of these for quality verification:
1. **[Jobscan](https://www.jobscan.co/)**: Check keyword match rate.
2. **[ResyMatch](https://resymatch.io/)**: Check bullet point impact.