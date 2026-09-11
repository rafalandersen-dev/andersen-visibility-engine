/** Retain membership for both a requested alias and the observed destination. */
export function sitemapFilesForPage(
  entries: readonly { url: string; files: string[] }[],
  requestedUrl: string,
  observedUrl?: string,
) {
  return [
    ...new Set(
      entries
        .filter((entry) => entry.url === requestedUrl || entry.url === observedUrl)
        .flatMap((entry) => entry.files),
    ),
  ];
}
