import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import type { ContentImage } from "@/lib/types";
import { getArticleImagePreviewFn } from "@/lib/image-preview.functions";
import { createImagePreviewSession, PRIVATE_IMAGE_REFRESH_MS } from "@/lib/image-preview";

/** View-only signed URLs never change the editor form, image status or stored content. */
export function ArticleImageThumbnail({
  image,
  ...props
}: {
  image: Pick<ContentImage, "storagePath" | "previewUrl" | "url">;
} & Pick<ImgHTMLAttributes<HTMLImageElement>, "alt" | "className" | "draggable">) {
  const path = image.storagePath;
  const publicUrl = image.url;
  const [fresh, setFresh] = useState<{ path: string; url: string } | null>(null);
  const retry = useRef<(() => void) | null>(null);
  useEffect(() => {
    // An approved stable public URL takes priority over an old private preview.
    if (publicUrl || !path) return;
    const session = createImagePreviewSession({
      load: async () => (await getArticleImagePreviewFn({ data: { path } })).previewUrl,
      apply: (url) => setFresh({ path, url }),
    });
    const refresh = () => {
      void session.refresh(true);
    };
    const onFocus = () => {
      void session.refresh();
    };
    retry.current = refresh;
    refresh();
    const timer = window.setInterval(onFocus, PRIVATE_IMAGE_REFRESH_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      session.dispose();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      if (retry.current === refresh) retry.current = null;
    };
  }, [path, publicUrl]);
  const src = publicUrl || (fresh?.path === path ? fresh?.url : undefined) || image.previewUrl;
  if (!src) return <span className={props.className} aria-hidden="true" />;
  return <img {...props} src={src} onError={() => retry.current?.()} />;
}
