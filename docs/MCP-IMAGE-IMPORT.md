# Add a supplied image to a Milo draft

The OAuth tool `add_content_image` stores a file supplied by the connected assistant. Milo does not generate the image or consume an AI generation allowance for this import. The connection must have `milo.content.write`, and Milo's write tools must be enabled. A legacy developer token has read access only.

Read the intended project and unpublished Draft first. Confirm the image and target with the user. Send one `tools/call` message with a normal JSON-RPC id and these arguments:

| Field | Requirement |
| --- | --- |
| projectId / contentId | Exact existing target IDs; 1–64 letters, digits, underscores or hyphens |
| requestId | Stable 1–100 character key, unique for this client's intended import in the project |
| dataBase64 | Canonical padded base64 of JPEG, PNG or WebP binary bytes, at most 5MiB; no data URL prefix, whitespace or remote URL |
| concept / alt | Non-empty text, at most 500 characters each |
| caption | Optional, at most 500 characters |

Large image calls must be sent individually. Ordinary requests and all batches retain the 200,000-byte bound. A large image envelope is capped at 7,100,000 bytes. Client-specific tool payload and file-transfer capabilities still need acceptance; an API implementation is not proof that a particular consumer app can send a 5MiB image.

The response contains contentId, imageId, recorded status, deduped and an editorPath. A new image is private, proposed and inline; review its appearance, alt and placement in Milo, then use the existing approval flow. The connector cannot approve, make public, schedule or publish it. A replay can report a later recorded owner-approved status without performing any new approval.

If the result is unconfirmed, inspect the draft and repeat only the identical file, target and metadata with the same requestId. An identical replay uses one receipt/image. Changed input under an existing key, a removed image, changed ownership or protected publication state requires inspection; do not generate a fresh key automatically to bypass it. Import history is capped at 200 requests per project; a target draft may have at most 30 existing images at admission. These safety limits are separate from commercial plan allowances.

Do not place file bytes, temporary preview URLs or credentials in audit logs. The server audit records operation/target/outcome metadata only. Implementation and release evidence: [image import evidence](../evidence/mcp-image-import-2026-09-09.md).
