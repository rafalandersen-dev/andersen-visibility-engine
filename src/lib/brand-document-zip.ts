import JSZip from "jszip";

/** ZIP directory sizes are untrusted. Count actual decompressed chunks before
 * Mammoth assembles XML strings. Pause immediately on excess; the caller's
 * disposable worker is then terminated. Never collect expanded data here. */
export async function verifyBrandDocumentExpansion(bytes: Uint8Array) {
  const archive = await JSZip.loadAsync(bytes, { createFolders: false });
  let total = 0;
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue;
    await new Promise<void>((resolve, reject) => {
      let size = 0,
        done = false;
      // JSZip 3.10.2 implements ZipObject.internalStream but omits it from
      // JSZipObject's declarations. The actual bundled API is fixture-tested.
      const stream = (
        entry as JSZip.JSZipObject & {
          internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
        }
      ).internalStream("uint8array");
      const fail = () => {
        if (done) return;
        done = true;
        stream.pause();
        reject(new Error("brand_document_zip"));
      };
      stream.on("data", (chunk) => {
        size += chunk.byteLength;
        total += chunk.byteLength;
        if (size > 10 * 1024 * 1024 || total > 20 * 1024 * 1024) fail();
      });
      stream.on("error", fail);
      stream.on("end", () => {
        if (!done) {
          done = true;
          resolve();
        }
      });
      stream.resume();
    });
  }
}
