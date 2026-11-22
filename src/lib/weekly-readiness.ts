import { z } from "zod";
import { planWeeklyPreparation } from "./weekly-preparation";
import type { ContentAsset } from "./types";
export const weeklyQueueSchema = z
  .array(
    z
      .object({
        assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        publishAt: z.string().datetime({ offset: true }),
        status: z.enum([
          "pending",
          "publishing",
          "published",
          "failed",
          "cancelled",
          "review_required",
        ]),
      })
      .strict(),
  )
  .max(1000);
/** A schedule mirror or approved draft is not proof of a queue row. Resolve
 * status using the real queue while retaining every owner-reserved instant. */
export function weeklyReadiness(
  input: Omit<Parameters<typeof planWeeklyPreparation>[0], "assets"> & {
    assets: ContentAsset[];
    queue: z.infer<typeof weeklyQueueSchema>;
  },
) {
  const queue = weeklyQueueSchema.parse(input.queue);
  const plan = planWeeklyPreparation({
    ...input,
    booked: [...input.booked, ...queue.map((q) => q.publishAt)],
  });
  const matching = (a: string | undefined, b: string) => !!a && Date.parse(a) === Date.parse(b);
  const owned = (id: string) =>
    input.assets.find((a) => a.projectId === input.projectId && a.id === id);
  return {
    ...plan,
    readiness: plan.slots.map((slot) => {
      // Precedence among queue rows at one instant (every row stays booked above):
      // 1. occupying rows (pending, publishing, published, review_required) are
      //    the current queue; more than one is a genuine conflict;
      // 2. otherwise failed rows hold the slot;
      // 3. otherwise cancelled rows keep it cancelled (never missing/refilled);
      // 4. only with no queue row may a schedule mirror report a draft.
      // Historical rows and stale mirrors never compete with a current row.
      const rows = queue.filter((q) => matching(q.publishAt, slot.publishAt));
      const occupying = rows.filter((q) =>
        ["pending", "publishing", "published", "review_required"].includes(q.status),
      );
      const failed = rows.filter((q) => q.status === "failed");
      const cancelled = rows.filter((q) => q.status === "cancelled");
      const mirrored = input.assets.filter(
        (a) =>
          a.projectId === input.projectId &&
          (matching(a.autoSchedulerPlannedAt, slot.publishAt) ||
            matching(a.scheduledPublishAt, slot.publishAt)),
      );
      const pick = (list: typeof rows) =>
        list.find((q) => mirrored.some((a) => a.id === q.assetId)) ?? list[0];
      const row =
        occupying.length > 0 ? occupying[0] : failed.length > 0 ? pick(failed) : pick(cancelled);
      const conflict = rows.length > 0 ? occupying.length > 1 : mirrored.length > 1;
      const asset = row ? owned(row.assetId) : mirrored[0];
      const state = conflict
        ? "conflict"
        : row?.status === "published"
          ? "published"
          : row?.status === "publishing"
            ? "publishing"
            : row?.status === "pending"
              ? "queued"
              : row?.status === "cancelled"
                ? "cancelled"
                : row?.status === "failed" || row?.status === "review_required"
                  ? "held"
                  : asset
                    ? "drafted"
                    : plan.reserved.some((s) => s.slotId === slot.slotId)
                      ? "reserved"
                      : "missing";
      return {
        ...slot,
        state,
        assetId: asset?.id ?? row?.assetId ?? null,
        title: asset?.title ?? null,
      };
    }),
  };
}
