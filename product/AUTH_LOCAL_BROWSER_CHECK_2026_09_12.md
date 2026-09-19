# Local authentication browser check

Source c9f8fa9; Chrome against a local Vite development server on 127.0.0.1:4197. This is development-render evidence, not production-build, deployed, signed-in, fluent-user or provider acceptance. No form submission, OAuth action, account creation, password entry/change or email request was performed. Only synthetic ui-check@example.invalid was entered, then cleared.

Observed passes:
- Reset page without a session reached its invalid/expired-link state and offered /auth?mode=reset. The protected new-password form was absent.
- Activating the Polish request-new link with Enter opened the reset-request form and retained Polish interface selection.
- At 390px width, Polish reset, Swedish reset-request and Danish sign-in checks reported document width 390px with no horizontal overflow. Polish reset and Danish sign-in each had zero nested link/button controls. These are selected screens, not every state in every locale.
- The independent email-language selector exposed all 24 choices. Italian selection persisted when the interface changed to Swedish, when returning to sign-in, and when switching to English signup mode.
- Screenshots verified a clean synthetic email value survived Danish-to-English interface switching and the sign-in-to-signup mode change. Initial DOM/AX input-value reads were blank despite the screenshot showing input; those reads cannot establish text absence. Earlier repeated typing produced combined synthetic text, so the final check first replaced it with the exact clean test address.
- The inspected Danish and English mobile screenshots showed readable controls and labels. Initial browser error-log inspection was empty.

Unresolved: selecting Danish and reloading initially showed the expected English server render, but subsequent inspection did not confirm restored Danish and later timed out. Browser viewport/layout observations also became inconsistent during that reload. Do not claim persistence passed, or infer a product defect solely from this incomplete observation. Retest using a stable browser session before acceptance. Input retention evidence above comes from screenshots, not the blank value-read API.

The agent-created tab was closed and temporary viewport override reset. The identified local Vite process was stopped after checking its exact command. No repository implementation change was made. R20/R23 real and complete accessibility/recovery acceptance remain open; overall 60% / implementation 75% and paid NO-GO unchanged.


## Follow-up: reload persistence verified

On source b7df7e3, repeated the unresolved Danish reload check in a fresh agent-created Chrome tab against the same local development URL. Confirmed the Danish option and translated heading in a full snapshot before reloading. The immediate post-reload snapshot was English; a bounded wait for the previously observed Danish heading then succeeded, and the full snapshot showed Dansk selected and Danish page text while the email language remained independently English. This agrees with useAuthLanguage: the initial render is English for hydration consistency, then the saved device override is read in its mount effect. The specific reload-persistence uncertainty above is resolved; the earlier observation remains as an audit trail.

Restored English through the visible picker, confirmed the resulting page, closed the test tab and stopped the identified local server. No implementation change or account/email request was needed. This proves one local-development language reload path, not production/fluent/all-locale acceptance or absence of an initial language flash.
