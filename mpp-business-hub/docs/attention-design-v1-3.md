# Attention design system (v1.3)

Goal: open any screen and know within a few seconds what it is about, what matters most, and what to do next. No features were removed. Detail moved behind quiet "open and close" sections.

## The five rules
1. **One focal point per screen.** One card is allowed to stand out (`.card.focal`: soft shadow and a pink edge). Everything else is flat.
2. **One loud button per screen.** Only one `primary` (pink) button is visible at a time. Others are plain or quiet text buttons. A browser test counts them.
3. **A badge means "this is unusual".** Normal facts ("In progress", "Normal", "Not started") are plain text or a small dot. Chips are kept for urgent, paused, private, needs-attention, and the three truth labels.
4. **Group by closeness.** Related things sit in one block with small gaps. Different jobs get a big gap.
5. **Details on request.** Evidence, history, numbers working, advanced options and long notes sit in `details` sections whose title says what is inside.

## Type scale (one place: `src/ui/styles.css`, "v1.3 DESIGN SYSTEM")
| Role | Size | Weight | Used for |
|---|---|---|---|
| Page title | 1.75rem (1.45 on phone) | 750 | One per screen |
| Focus text | 1.35rem | 700 | The one thing to look at first ("Start here") |
| Section heading | 1.2rem | 680 | "Steps", "Why we think so" |
| Sub-heading | 1rem | 650 | Inside a section |
| Lead sentence | 1.05rem | 400 | The one sentence that explains the card |
| Body | .95rem | 400 | Normal text |
| Supporting | .85rem | 400, muted | Dates, hints, notes |
| Label | .72rem, capital letters | 650, muted | "NEXT STEP", "START HERE", kind of item |

Text colours: main `#231d20`, second `#4a4045`, quiet `#6a5f65`. All pass 4.5 to 1 against the page.

## Spacing scale
.25 · .5 · .75 · 1 · 1.5 · 2.25 rem. Between sections: 1.5rem. Inside a group: .75rem. Page padding 1.5rem (1rem on a phone).

## What each screen leads with
| Screen | Focal point | One primary action |
|---|---|---|
| Owner Home | "Start here": the most important thing waiting | Open it |
| My Work | "Do this next" card | Open this step |
| Project page | The open step (marked "Next") | I finished this step / Ask for an update |
| Review | The first card's question | Yes, accurate (first card only) |
| AI Recommendation | Title and one-sentence summary | Approve as project (other choices in "Other choices") |
| Projects / AI list | Rows; the one that needs attention has a badge | New project |
| Notifications | Unread items have a dot and bold title | none (rows open on click) |
| Settings | "Things you can change" | none; technical notes folded |
| Weekly printing | Printers table and activity bars; reading notes folded to one line | none |

## What changed in this pass
- A real type scale, spacing scale and colour contrast rules (above).
- Owner Home rebuilt around "Start here". The three tiles are now one sentence.
- AI finding: summary no longer bold-grey; seven buttons became one primary, one secondary and "Other choices"; three yellow warnings became one "Read this before you decide" note; closed sections are quiet lines.
- Project page: header is eyebrow + title + purpose; the step panel is the focal card; the step list is rows, not boxes.
- Review: the first card is the focal card; answer buttons sit in the open, with no nested boxes.
- Settings: "Things you can change" first, then "What is connected", then folded details.
- Notifications, History, Team table, Weekly printing: quieter chips and buttons, title first, details second.
- Pill filters are smaller and calmer.

## How to check
`node e2e/v11.mjs` now fails if: a screen has more than one primary button, the page title is not larger than section headings, a list row has a repeated Open button, the project page scrolls sideways on a phone, or answer buttons are below the first screen of a review card.
