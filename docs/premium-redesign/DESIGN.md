# Approved workspace direction

Rafi selected Today cockpit + list/inspector + light calendar on 6 September 2026. All three use one navigation shell. Keep the existing application/runtime, routes, server operations and workspace data. Reference: unified ImageGen mock `exec-983b907b-9c0a-4c9b-a358-260bfdaea2c0.png` in the conversation; list and calendar from the preceding selected set.

- Sidebar 238px, ink #17212b; background #fafbfc, white surfaces, borders #e2e6eb; actions #076ee5.
- Inter 400/500/600/700. Page heading 32–48px, article heading 25–36px, body 14px, secondary 12px. No decorative serif inside workspace, no tiny uppercase workflow labels.
- One next-publication hero; article image from actual content only. Missing image shows the real excerpt. Generated photos are DEV fixtures only.
- List rows preserve full titles, source/impact, derived status and date. Inspector puts the article preview and actions first, with full metadata, pipeline and score inside an expandable section. Calendar has compact events and a next-publication preview strip. Board remains an alternate view with 272px tracks instead of compressed eleven-column cards.
- Calendar distinguishes targets and genuinely armed queue entries. Semantic amber for automatic execution is intentionally retained from the existing pipeline contract, even though the ideation image used blue.
- Mobile stacks the hero/list, uses existing mobile navigation and horizontal scroll inside the seven-day calendar. Page chrome must not overflow.
- The preview is clearly labelled demo, holds no user identity or credentials and writes no cloud workspace. Production compiles DEV=false.

Provider integrations, real citations, Stripe and all EU locales are tracked in FEATURE_INVENTORY.md. UI appearance must not imply these are already complete.
