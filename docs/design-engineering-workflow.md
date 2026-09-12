# Milo Growth — Design Engineering Workflow

**Adopted:** 2026-08-24  
**Upstream craft reference:** `emilkowalski/skills`  
**Pinned reference commit:** `d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7`

## Product posture

Milo is a growth/SEO SaaS. The UI should feel fast, credible and precise. Design polish should increase comprehension and perceived quality without making analytics, navigation or repetitive workflows feel theatrical.

Product-specific decisions override generic examples from external skills.

## Default routing

| Situation | Action |
| --- | --- |
| Any substantial user-facing UI change | Load vendored `emil-design-eng` before implementation and use it again as the post-build craft review |
| Creating or changing animation | Use upstream `animate` guidance; review with `review-animations` before closure |
| Existing surface has many inconsistent animations | Use `improve-animations` to produce a prioritized plan before broad changes |
| Looking for places where motion could help | Use `find-animation-opportunities` only when motion/polish is explicitly in scope |
| New UI/component dependency | Use `pick-ui-library` thinking first; document why existing Radix/Tailwind primitives are insufficient |
| Multiple genuinely different UI directions are needed | Use `prototype`; do not ship the picker harness |
| Toast/notification work | Apply `ask-sonner`; Milo already depends on Sonner |
| Apple-like interaction | `apple-design` only when explicitly requested; never as a generic visual direction |
| Animation wording/brief is ambiguous | `animation-vocabulary` may be used as a prompt/reference aid |
| Expo or Swift | Not applicable to the current web product |

Only the baseline `emil-design-eng` skill is vendored into this repository by default. This keeps the persistent agent context small. Conditional skills should be loaded from the pinned upstream source when their trigger applies.

## Milo constraints

- Keep high-frequency actions and keyboard paths immediate.
- Prefer crisp state feedback over decorative motion.
- Preserve information density in dashboards; do not trade scanability for oversized visual treatment.
- Existing components, typography, spacing and brand rules are the starting point, not something to replace wholesale.
- Use existing Radix primitives, Sonner, Tailwind utilities and current component abstractions before bringing in new UI packages.
- Avoid `transition: all` and avoid expensive layout-driven animations when transform/opacity can express the same interaction.
- Respect `prefers-reduced-motion`.
- Gate hover-only effects to devices that actually support hover.
- Motion must never delay data entry, search, navigation, keyboard actions or repeated workflow steps.

## PR evidence for material UI work

Before requesting review, record:

1. What user-facing behavior changed.
2. What existing design-system/brand pattern was reused.
3. Whether motion was added and why it is necessary.
4. Reduced-motion, keyboard, touch/mobile and responsive checks where applicable.
5. Any new UI dependency and the reason it was unavoidable.
6. A concise `Before | After | Why` review for concrete craft corrections.
7. Normal test/lint/build evidence required by the repository.

A successful build is not proof that the interface is good. A visually pleasing screenshot is not proof that the workflow is usable. Both implementation and interaction quality need evidence.

## Updating the upstream reference

Do not silently follow upstream `main`. When updating the pinned commit:

- inspect the upstream diff;
- check for changed commands, permissions, dependencies or widened behavior;
- re-evaluate which skills are default versus conditional;
- update the vendored baseline intentionally;
- preserve the MIT license notice.
