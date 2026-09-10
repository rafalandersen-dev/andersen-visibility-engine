// Connector I/O remains concurrent. Revision-guarded outcome mutations in this
// server instance are queued by owner so a batch cannot exhaust its own retries.
// Database revision checks still protect against other instances and owner edits.
const pending = new Map<string, Promise<unknown>>();
export async function serializePublicationWrite<T>(
  ownerId: string,
  write: () => Promise<T>,
): Promise<T> {
  const previous = pending.get(ownerId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(write);
  pending.set(ownerId, current);
  try {
    return await current;
  } finally {
    if (pending.get(ownerId) === current) pending.delete(ownerId);
  }
}
