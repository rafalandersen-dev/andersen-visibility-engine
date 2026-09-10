import mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { verifyBrandDocumentExpansion } from "./brand-document-zip";
import {
  boundedBrandSegments,
  inspectBrandDocument,
  MAX_BRAND_DOCUMENT_PAGES,
  type BrandDocumentSegment,
} from "./brand-document";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<{ bytes: ArrayBuffer }>) => void) | null;
  postMessage(value: unknown): void;
};
worker.onmessage = async ({ data }) => {
  try {
    const bytes = new Uint8Array(data.bytes);
    const kind = inspectBrandDocument(bytes);
    if (kind === "docx") {
      await verifyBrandDocumentExpansion(bytes);
      // Browser-only ArrayBuffer input: no filesystem paths or external file
      // access. Extract plain text; never render document-provided HTML.
      const result = await mammoth.extractRawText({ arrayBuffer: data.bytes });
      const segments = result.value
        .split(/\n\s*\n/)
        .map((text, i) => ({ locator: `Paragraph ${i + 1}`, text }));
      worker.postMessage({
        ok: true,
        result: boundedBrandSegments(kind, segments, [
          "text_only",
          ...(result.messages.length ? ["parser_warnings"] : []),
        ]),
      });
      return;
    }
    const task = getDocument({
      data: bytes,
      useSystemFonts: false,
      disableFontFace: true,
      useWasm: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      stopAtErrors: true,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > MAX_BRAND_DOCUMENT_PAGES) throw new Error("brand_document_page_limit");
      const segments: BrandDocumentSegment[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n),
          text = await page.getTextContent();
        segments.push({
          locator: `Page ${n}`,
          text: text.items
            .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
            .join(""),
        });
        page.cleanup();
        // Reject text expansion as it occurs, rather than assembling every page.
        if (segments.some((s) => s.text.trim())) boundedBrandSegments("pdf", segments);
      }
      worker.postMessage({
        ok: true,
        result: boundedBrandSegments("pdf", segments, ["text_only"]),
      });
    } finally {
      await task.destroy();
    }
  } catch (error) {
    const code =
      error instanceof Error && /^brand_document_[a-z_]+$/.test(error.message)
        ? error.message
        : "brand_document_parse_failed";
    worker.postMessage({ ok: false, error: code });
  }
};
