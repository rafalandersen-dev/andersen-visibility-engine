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
  return {
    ...plan,
    readiness: plan.slots.map((slot) => {
      const rows = queue.filter((q) => matching(q.publishAt, slot.publishAt));
      const assets = input.assets.filter(
        (a) =>
          a.projectId === input.projectId &&
          (matching(a.autoSchedulerPlannedAt, slot.publishAt) ||
            matching(a.scheduledPublishAt, slot.publishAt) ||
            rows.some((q) => q.assetId === a.id)),
      );
      const conflict = rows.length > 1 || assets.length > 1;
      const row = rows[0];
      const asset = assets[0];
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
