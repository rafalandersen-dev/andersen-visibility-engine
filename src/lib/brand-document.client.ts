import {
  inspectBrandDocument,
  MAX_BRAND_DOCUMENT_BYTES,
  type BrandDocumentText,
} from "./brand-document";

/** Parsing runs in a disposable worker. It does not upload a document, fetch
 * external references, run model calls, or interpret document instructions.
 */
export async function extractBrandDocument(
  file: File,
): Promise<BrandDocumentText & { fingerprint: string }> {
  if (!file.size || file.size > MAX_BRAND_DOCUMENT_BYTES) throw new Error("brand_document_size");
  const bytes = await file.arrayBuffer();
  inspectBrandDocument(new Uint8Array(bytes));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const worker = new Worker(new URL("./brand-document.worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    const result = await new Promise<BrandDocumentText>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("brand_document_timeout"));
      }, 20000);
      worker.onmessage = ({
        data,
      }: {
        data: { ok: boolean; result?: BrandDocumentText; error?: string };
      }) => {
        clearTimeout(timer);
        if (data.ok && data.result) resolve(data.result);
        else reject(new Error(data.error ?? "brand_document_parse_failed"));
      };
      worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error("brand_document_parse_failed"));
      };
      worker.postMessage({ bytes }, [bytes]);
    });
    return { ...result, fingerprint };
  } finally {
    worker.terminate();
  }
}
