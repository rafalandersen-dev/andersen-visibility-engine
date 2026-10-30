/** Reviewed English source fingerprints. Source changes require translation review before updating. */
export const DE_AUTHORING_SOURCE_REVISION = "5a9416d74f532b65f78c0f19b89d221c6b2af6c2";
export const DE_AUTHORING_SOURCE_HASHES: Readonly<Record<string, string>> = {
  // Conversation source is the specialist-evidence chat candidate after ff9b085, recorded on its batch.
  conversation: "74f337bf67e5535d01204d3cc74776cadfc013420012271c70a4e07adc44d630",
  core: "8476f0a4138861b0b333d132799933037eda17dbd2d1ba4207b7cc4e0c9337d1",
  authentication: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  "shared controls": "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  "setup screen": "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  "services screen": "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  "audit screen": "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  "analytics screen": "04eaafb940167093319015d367692b7ba088651ec8e791146edb646e5b74b724",
  // R21 billing source head 5804ec62b92d2a2d957a7b3fb536b7c5225ff128. The 54 reviewed German
  // messages are unchanged; the 126 messages R21 added are reviewed English fallback pending
  // translation and interface acceptance, so this fingerprint is not a German review record.
  "billing screen": "392ef009ccb9de83e3b6d64691a9a1aaee3ea0f59008db22c806638b5873477f",
  "evidence screen": "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  "plan screen": "2bbe51606245c7a6fa86d34f4c932c7ecb9ac0332b116270fff96c3c8e5175c4",
  "editor screen": "541d9eb0143c53f9f6995353a0f17830e8603f3a91e43a94fca6187c398d6b92",
  workflow: "1e9eeb70de2eb0a03fdfd3224f3643010b33cd658e7a4274934edb7ffd3cc6ec",
  collaboration: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  knowledge: "1e4b4ca8d390967bb9420df4148f75cd81ba4516ed137e06496ba213a3652c59",
  technical: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  measurements: "2080a1c30718c7f9c9a2c3f414305a52232950b304c200e271c0b6945f125cb8",
  configuration: "c7a21405a0e079bfafbf14747dfad84b284e717e035127aaf77bae98d6583413",
  evidence: "1f9a2a7eea39cee7f70dfc8fa256ee24b64223a0743142ff8894fbde7cdbb2f5",
  links: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  outreach: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  growth: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  commerce: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  "public home": "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  "public beta": "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  "beta guide": "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  "beta controls": "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  "public pricing": "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  "public studies": "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  // P4 citation review candidate after bab861c8 (2026-09-26); English source in src/i18n/citation-review.ts.
  "citation review": "6320ed498d4ce0af5c43d77d46109f8e85cffeebb25d64f16d815eb2332beae4",
  // Owner authoring candidate after a392775c (2026-09-26); English source in src/i18n/citation-authoring.ts.
  "citation authoring": "ffb6a332b8756b5467c8e06e740b9829d118f7c6112240a88046298922055c2a",
  // Forward workflow candidate after 64db7a4b with the Codex N1 corrections (2026-09-27/28); English source in
  // src/i18n/citation-forward.ts.
  "citation forward": "692652100abfecf97689fd04a6f508d7d66db62417cfd2cfc3dc6f2adf8fcb70",
  // Change evidence candidate 20260928120000 (R/R1/R2, 2026-09-28); English source in src/i18n/citation-change.ts.
  "citation change": "576b6f207594745c1c3e082e0bba5d773318eb96241d4d5cf18187b680cdc2d5",
  // CG-01A first-use source after eb95d191; English source in src/i18n/first-use.ts. The batch is
  // reviewed English fallback pending translation (./first-use-fallback.ts), not a German review record.
  "first use": "5368dd8f7a5fa58cb47c1b78857ed1c14a051b32832cb86feccfe0a00c4829b2",
  // CG-02A task-continuity source after 881a422d; English source in src/i18n/task-continuity.ts. The batch is
  // reviewed English fallback pending translation (./task-continuity-fallback.ts), not a German review record.
  "task continuity": "fd3a25a34d308303f2ab3bbce390008a3b7440fa83e29a05507fe265b7fd66da",
};
