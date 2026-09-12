# Launch connection test wording correction

Prepared after dc9b44c on codex/milo-report-branding-authority-20260912. Unreleased; overall 60% / implementation 75%, paid NO-GO and all authorization/release holds remain unchanged.

The launch checklist formerly instructed users to test a connection so publishing would not fail later. Current implementation does not support that guarantee: testWordPressConnectionFn reads /users/me?context=edit, and testShopifyConnectionFn queries shop identity/domain details. Neither attempts a content write or publication. computeLaunchChecklist considers the saved lastTestStatus success sufficient for the connection-tested item, without establishing future access or publication permission.

Changed launch.item.connectorTested.desc in EN/PL/SV/DA and staged FR/DE/ES/IT. It now explains that the test checks access and does not verify publishing permissions or guarantee a later publication. Exactly one existing key per catalog changed; no keys, destinations, connector calls, saved checklist logic or enablement changed. Reviewed commerce source fingerprints updated for DE/ES/IT; original baseline source-revision identifiers remain historical, with this document recording the follow-up.

Validation: combined runtime and four staged catalog suites, full TypeScript and production build. See /tmp/milo-launch-claim-{tests,types,build}.log for terminal results. This is source inspection and copy validation only; no real WordPress/Shopify call, publication or independent live acceptance was performed. Other recorded source-claim issues remain open.
