# Design decisions

- **Look:** off-white surfaces, soft borders, one restrained pink accent (`--pink`), generous spacing. Dense data sits behind drill-downs (evidence, audit, run history); lists show summaries first.
- **Status never by color alone.** Every chip has a glyph and text: Official, AI Detected, Employee Confirmed, Independently Verified, Needs Review, Blocked, Unknown, Missing Data. Tooltips explain each.
- **Three statuses side by side.** Steps show *Official* status, *AI noticed* activity and *Employee-reported* state as separate chips so disagreement is visible, not hidden.
- **Progress as counts.** “2/4 steps confirmed · 0 independently verified”, never a made-up percentage.
- **Demo labeling.** A permanent banner and “Demo” tags; integrations are listed as not connected.
- **Accessibility.** Labeled inputs, visible focus ring, 40px minimum targets, skip link, `aria-live` toasts, dialogs close on Esc, keyboard-operable controls, responsive layout down to phone width (sidebar becomes a drawer).
- **Time.** Every timestamp shows `CT`; “checked at” and “data through” are separate.
- **Copy.** Plain language; no blame wording (“Pending review” means not yet reviewed, not “not working”).
- **Scale.** Journals and evidence are shown in short bounded lists with filters. Raw event tables are never a default page.
