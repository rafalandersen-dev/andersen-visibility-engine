import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { syntheticDocx, syntheticPdf } from "./test-support/brand-document-fixtures";

// Execute the actual Vite browser worker bundle in a disposable Node worker.
// This tests parser/bundle behavior, not browser UI or browser acceptance.
describe("brand document production worker bundle", () => {
  let folder: string;
  let bootstrap: string;
  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "milo-document-bundle-"));
    await build({
      configFile: false,
      logLevel: "silent",
      build: {
        outDir: folder,
        emptyOutDir: false,
        minify: true,
        rollupOptions: { input: resolve("src/lib/brand-document.client.ts") },
      },
      worker: { format: "es" },
    });
    const assets = await readdir(join(folder, "assets"));
    const worker = assets.find((name) => /^brand-document\.worker-.*\.js$/.test(name));
    expect(worker).toBeTruthy();
    expect(assets.some((name) => /^pdf\.worker.*\.mjs$/.test(name))).toBe(true);
    bootstrap = join(folder, "bootstrap.mjs");
    await writeFile(
      bootstrap,
      `
      import { parentPort } from 'node:worker_threads';
      globalThis.self = globalThis;
      globalThis.pdfjsWorker = await import(${JSON.stringify(pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href)});
      globalThis.postMessage = value => parentPort.postMessage(value);
      await import(${JSON.stringify(pathToFileURL(join(folder, "assets", worker!)).href)});
      parentPort.on('message', bytes => globalThis.onmessage({data: {bytes}}));
    `,
    );
  }, 60000);
  afterAll(async () => {
    if (folder) await rm(folder, { recursive: true, force: true });
  });

  async function extract(bytes: Uint8Array) {
    const worker = new Worker(pathToFileURL(bootstrap));
    try {
      return await new Promise<{
        ok: boolean;
        error?: string;
        result?: { segments: { locator: string; text: string }[]; warnings: string[] };
      }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("fixture_worker_timeout")), 20000);
        worker.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        worker.once("message", (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        worker.postMessage(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        );
      });
    } finally {
      await worker.terminate();
    }
  }
  it("extracts real PDF pages with truthful text-only evidence", async () => {
    const result = await extract(syntheticPdf(["Warm and clear.", "Do not promise results."]));
    expect(result).toMatchObject({
      ok: true,
      result: {
        warnings: ["text_only"],
        segments: [
          { locator: "Page 1", text: "Warm and clear." },
          { locator: "Page 2", text: "Do not promise results." },
        ],
      },
    });
  });
  it("extracts a compressed DOCX using the browser ArrayBuffer adapter", async () => {
    const result = await extract(await syntheticDocx());
    expect(result).toMatchObject({
      ok: true,
      result: {
        warnings: ["text_only"],
        segments: [
          { locator: "Paragraph 1", text: "Use a warm, clear voice." },
          { locator: "Paragraph 2", text: "Avoid unsupported claims." },
        ],
      },
    });
  });
  it("rejects PDFs without extractable text", async () => {
    expect(await extract(syntheticPdf([""]))).toEqual({
      ok: false,
      error: "brand_document_no_text",
    });
  });
  it("rejects dishonest DOCX expansion sizes before assembling oversized XML", async () => {
    const bytes = await syntheticDocx(["x".repeat(11 * 1024 * 1024)]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      const length = view.getUint16(offset + 28, true);
      const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + length));
      if (name !== "word/document.xml") continue;
      const local = view.getUint32(offset + 42, true);
      view.setUint32(offset + 24, 1000, true);
      view.setUint32(local + 22, 1000, true);
    }
    expect(await extract(bytes)).toEqual({ ok: false, error: "brand_document_zip" });
  });
  it("rejects excessive pages before extracting", async () => {
    expect(await extract(syntheticPdf(Array(41).fill("A")))).toEqual({
      ok: false,
      error: "brand_document_page_limit",
    });
  });
  it("returns a bounded public error for a malformed PDF", async () => {
    expect(await extract(new TextEncoder().encode("%PDF-invalid"))).toEqual({
      ok: false,
      error: "brand_document_parse_failed",
    });
  });
});
