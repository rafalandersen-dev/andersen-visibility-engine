/** Match the database's newer-wins rule when a revision retry sees a later edit.
 * Keep the stored stamp on equality as it may carry sub-millisecond precision.
 */
export function workspaceWriteTimestamp(current: string | undefined, proposed: string): string {
  return current && Date.parse(current) >= Date.parse(proposed) ? current : proposed;
}
