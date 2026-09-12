import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { imageReferenceCheck, imageReferenceSelection } from "./image-references";

const target = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();

export const listImageReferenceCandidatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => target.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { readImageReferenceCandidates } = await import("./image-references.server");
      return await readImageReferenceCandidates(context.userId as string, data);
    } catch {
      throw Error("The saved product photos could not be loaded. Save the article and try again.");
    }
  });

export const checkImageReferencesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => imageReferenceSelection.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { loadSelectedImageReferences } = await import("./image-references.server");
      const loaded = await loadSelectedImageReferences(context.userId as string, data);
      return imageReferenceCheck.parse({
        version: 1,
        selectionHash: loaded.selectionHash,
        images: loaded.references.map(({ manifest: m }) => ({
          imageId: m.imageId,
          metadataHash: m.metadataHash,
          sha256: m.sha256,
          contentType: m.contentType,
          size: m.size,
          width: m.width,
          height: m.height,
        })),
      });
    } catch {
      throw Error(
        "The selected product photos could not be checked. Reload the saved photos and try again.",
      );
    }
  });
