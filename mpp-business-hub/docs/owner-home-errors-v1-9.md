# Owner Home, printing numbers and customer service errors (v1.9)

Practice copy. Nothing here writes to the live clock-in app, Firebase or any Sheet.

## Dalia's Home
Sections: Errors to acknowledge, Needs your attention, AI recommended projects, Updates from your team, Opportunities (bring in money), Optimizations (save money or time), Other things the AI noticed. Empty sections are hidden. AI Recommendations and Notifications left the main menu (they are under More; the bell stays).

**Dismiss with feedback.** Every AI item has "Dismiss…". Pick a reason, then "just this one" (comes back only if new evidence appears) or "don't send me this kind again" (a rule). Rules are listed under Priorities and sources → "What you told the AI", with Undo. Nothing is deleted.

## Team and printing
- "Job today" is gone. Everyone has Home, Projects and My printing. The AI does not need an assignment to know what someone did.
- Numbers come from **claimed orders**, not MT Logs print jobs. An order counts as what was asked for (30 cards is 30). The old "hours printed" figure added up queue time and was wrong; it is removed.
- Day: orders, revenue, revenue per hour. 30/90/180 days: error rate (errors ÷ orders, like the Sheet), average revenue per day worked, revenue per hour.
- Revenue per hour = revenue ÷ (clock in to clock out − project minutes the person confirmed). No project work means all clocked time counts.
- After clock out the person sees the day's numbers and can leave a note for the day.
- Real copy: claims are **not connected yet**, so it shows "Not connected" instead of numbers. Practice copy uses made-up claims.

## Customer service errors
- Dalia gives the "Can log errors" permission on the Team page.
- Form: person, date (calendar), several order links, description with bold, bullets, numbered list and hard returns.
- Dalia gets an alert and must acknowledge (note optional). The team member sees it only after that.
- Team member: read it, write a note (sample text shown), acknowledge. At clock out they can **snooze until the next clock in**. There is no dismiss. After clock in it shows again.
- Dalia is alerted when the person acknowledges.
- Moe (owner, does not clock in): Dalia's one click acknowledges for him and for her. For anyone else it only acknowledges for herself.
- The CS person sees her own history and a reminder when MT Logs shows several reprints for someone on a day with no error logged. MT Logs cannot know a customer was affected, so it is only a reminder.
- Clock in and out are never blocked by the server. The clock-out screen asks for acknowledge or snooze first.

## Tests
`src/test/v19.test.ts`, `e2e/v19.mjs`.
