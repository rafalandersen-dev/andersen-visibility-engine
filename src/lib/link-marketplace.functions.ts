/** Auth-gated server functions for sponsored-publication quoting and ordering. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  LinkMarketplaceIntegrationStatus,
  LinkMarketplaceOffer,
  LinkMarketplaceOrder,
  LinkMarketplaceQuote,
} from "./types";

export const getMarketplaceStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<LinkMarketplaceIntegrationStatus> => {
    const { getMarketplaceIntegrationStatus } = await import("./link-marketplace.server");
    return getMarketplaceIntegrationStatus();
  });

export const listMarketplaceOffersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<{
      offers: LinkMarketplaceOffer[];
      status: LinkMarketplaceIntegrationStatus;
    }> => {
      const { listMarketplaceOffers } = await import("./link-marketplace.server");
      return listMarketplaceOffers();
    },
  );

export const createMarketplaceQuoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ offerId: z.string().min(1).max(300), projectId: z.string().min(1).max(300) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LinkMarketplaceQuote> => {
    const { createMarketplaceQuote } = await import("./link-marketplace.server");
    return createMarketplaceQuote({
      userId: context.userId,
      projectId: data.projectId,
      offerId: data.offerId,
    });
  });

export const confirmMarketplaceOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        confirmationToken: z.string().min(20).max(8000),
        confirmedTotalPrice: z.number().nonnegative().max(1_000_000),
        acknowledgedSponsored: z.literal(true),
        acknowledgedPayment: z.literal(true),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      order: LinkMarketplaceOrder;
      submitted: boolean;
      rev: number;
    }> => {
      const { confirmMarketplaceOrder } = await import("./link-marketplace.server");
      return confirmMarketplaceOrder({ userId: context.userId, ...data });
    },
  );

export const syncMarketplaceOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().min(1).max(300) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ order: LinkMarketplaceOrder; rev: number }> => {
    const { syncMarketplaceProviderOrder } = await import("./link-marketplace.server");
    return syncMarketplaceProviderOrder(context.userId, data.orderId);
  });
