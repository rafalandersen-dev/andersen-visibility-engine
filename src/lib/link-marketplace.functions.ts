/** Auth-gated server functions for sponsored-publication quoting and ordering. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  LinkMarketplaceIntegrationStatus,
  LinkMarketplaceOffer,
  LinkMarketplaceOrderStatus,
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
      .object({ offerId: z.string().min(1).max(300), targetUrl: z.string().url().max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LinkMarketplaceQuote> => {
    const { createMarketplaceQuote } = await import("./link-marketplace.server");
    return createMarketplaceQuote({
      userId: context.userId,
      offerId: data.offerId,
      targetUrl: data.targetUrl,
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
      status: LinkMarketplaceOrderStatus;
      submitted: boolean;
      providerOrderId?: string;
      providerStatus?: string;
    }> => {
      const { confirmMarketplaceOrder } = await import("./link-marketplace.server");
      return confirmMarketplaceOrder({ userId: context.userId, ...data });
    },
  );

export const syncMarketplaceOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ providerOrderId: z.string().min(1).max(300) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ providerStatus: string }> => {
    const { syncMarketplaceProviderOrder } = await import("./link-marketplace.server");
    return syncMarketplaceProviderOrder(data.providerOrderId);
  });
