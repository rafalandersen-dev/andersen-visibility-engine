<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Milo Growth — Design Engineering Gate

For any user-facing UI implementation or substantial UI refactor:

1. Read `.agents/skills/emil-design-eng/SKILL.md` before implementation.
2. Read `docs/design-engineering-workflow.md` for Milo-specific routing and constraints.
3. Treat Milo's existing product language, visual system and component primitives as authoritative. The external skill is a craft lens, not a redesign mandate.
4. Prefer the existing Radix/Tailwind/Sonner/component stack before adding another UI dependency.
5. Do not add motion merely for polish. High-frequency and keyboard-driven actions should stay instant or nearly instant.
6. When motion is in scope, verify reduced-motion, keyboard, touch and performance behavior before closure.
7. Include a design review in the PR evidence for material UI work. Concrete corrections should state `Before | After | Why`.

Do not turn a scoped feature into a broad visual redesign without explicit approval.
