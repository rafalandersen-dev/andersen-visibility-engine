/**
 * Server-only sponsored-publication provider boundary.
 *
 * Linkhouse publishes its API capabilities but distributes the endpoint
 * documentation individually. Until that mapping is verified, Milo stays in
 * demo mode. Live ordering additionally requires a signing secret and an
 * explicit LINKHOUSE_ORDERING_ENABLED=true kill switch.
 */
import {
  DEFAULT_MARKETPLACE_MARGIN_PERCENT,
  DEMO_MARKETPLACE_OFFERS,
  MARKETPLACE_QUOTE_TTL_MS,
  calculateMarketplacePricing,
  isExactMarketplaceTotal,
  isMarketplaceQuoteExpired,
  type LinkMarketplaceProvider,
} from "./link-marketplace";
import type {
  LinkMarketplaceIntegrationStatus,
  LinkMarketplaceOffer,
  LinkMarketplaceOrderStatus,
  LinkMarketplaceQuote,
} from "./types";

const DEMO_SIGNING_SECRET = "milo-marketplace-demo-quotes-are-never-provider-orders";

export interface LinkhouseMarketplaceConfig {
  apiBaseUrl: string;
  apiKey: string;
  accountId: string;
  signingSecret: string;
  marginPercent: number;
  marginConfigured: boolean;
  credentialsPresent: boolean;
  apiMappingVerified: boolean;
  orderingKillSwitch: boolean;
}

export function linkhouseMarketplaceConfig(): LinkhouseMarketplaceConfig {
  const apiBaseUrl = (process.env.LINKHOUSE_API_BASE_URL ?? "").trim();
  const apiKey = (process.env.LINKHOUSE_API_KEY ?? "").trim();
  const accountId = (process.env.LINKHOUSE_ACCOUNT_ID ?? "").trim();
  const signingSecret = (process.env.LINK_MARKETPLACE_SIGNING_SECRET ?? "").trim();
  const rawMargin = (process.env.LINK_MARKETPLACE_MARGIN_PERCENT ?? "").trim();
  const parsedMargin = Number(rawMargin);
  const marginConfigured =
    rawMargin !== "" && Number.isFinite(parsedMargin) && parsedMargin >= 0 && parsedMargin <= 100;
  return {
    apiBaseUrl,
    apiKey,
    accountId,
    signingSecret,
    marginPercent: marginConfigured
      ? Math.min(100, Math.max(0, parsedMargin))
      : DEFAULT_MARKETPLACE_MARGIN_PERCENT,
    marginConfigured,
    credentialsPresent: Boolean(apiBaseUrl && apiKey && accountId),
    apiMappingVerified: process.env.LINKHOUSE_API_MAPPING_VERIFIED === "true",
    orderingKillSwitch: process.env.LINKHOUSE_ORDERING_ENABLED === "true",
  };
}

export function getMarketplaceIntegrationStatus(): LinkMarketplaceIntegrationStatus {
  const config = linkhouseMarketplaceConfig();
  const catalogConnected = config.credentialsPresent && config.apiMappingVerified;
  const orderingEnabled =
    catalogConnected &&
    Boolean(config.signingSecret) &&
    config.marginConfigured &&
    config.orderingKillSwitch;
  return {
    mode: catalogConnected ? "live" : "demo",
    provider: "linkhouse",
    credentialsPresent: config.credentialsPresent,
    signingReady: Boolean(config.signingSecret),
    marginConfigured: config.marginConfigured,
    catalogConnected,
    orderingEnabled,
    documentationPending: !config.apiMappingVerified,
  };
}

class LinkhouseApiMappingPendingError extends Error {
  constructor() {
    super("linkhouse_api_mapping_pending");
    this.name = "LinkhouseApiMappingPendingError";
  }
}

/**
 * The production adapter boundary. Method signatures are final; response
 * mapping is intentionally blocked until Linkhouse supplies its private docs.
 */
export const linkhouseMarketplaceProvider: LinkMarketplaceProvider = {
  id: "linkhouse",
  async listOffers() {
    throw new LinkhouseApiMappingPendingError();
  },
  async createQuote() {
    throw new LinkhouseApiMappingPendingError();
  },
  async createOrder() {
    throw new LinkhouseApiMappingPendingError();
  },
  async getOrder() {
    throw new LinkhouseApiMappingPendingError();
  },
};

export async function listMarketplaceOffers(): Promise<{
  offers: LinkMarketplaceOffer[];
  status: LinkMarketplaceIntegrationStatus;
}> {
  const status = getMarketplaceIntegrationStatus();
  if (status.catalogConnected) {
    const offers = await linkhouseMarketplaceProvider.listOffers();
    return { offers, status };
  }
  return { offers: DEMO_MARKETPLACE_OFFERS, status };
}

interface QuoteTokenPayload {
  quoteId: string;
  providerQuoteId: string;
  userId: string;
  offerId: string;
  provider: LinkMarketplaceOffer["provider"];
  domain: string;
  publicationTitle: string;
  targetUrl: string;
  basePrice: number;
  serviceFee: number;
  marginPercent: number;
  totalPrice: number;
  currency: "EUR";
  createdAt: string;
  expiresAt: string;
  live: boolean;
}

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function signQuote(payload: QuoteTokenPayload): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(payload));
  const secret = payload.live ? linkhouseMarketplaceConfig().signingSecret : DEMO_SIGNING_SECRET;
  if (!secret) throw new Error("marketplace_signing_not_configured");
  return `${body}.${await hmac(secret, body)}`;
}

async function verifyQuote(token: string): Promise<QuoteTokenPayload> {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("marketplace_quote_invalid");
  let payload: QuoteTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as QuoteTokenPayload;
  } catch {
    throw new Error("marketplace_quote_invalid");
  }
  const secret = payload.live ? linkhouseMarketplaceConfig().signingSecret : DEMO_SIGNING_SECRET;
  if (!secret || !safeEqual(await hmac(secret, body), signature)) {
    throw new Error("marketplace_quote_invalid");
  }
  return payload;
}

function normalizeTargetUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("marketplace_target_url_invalid");
  return url.toString();
}

async function buildSignedMarketplaceQuote(input: {
  userId: string;
  targetUrl: string;
  providerQuoteId: string;
  offerId: string;
  provider: LinkMarketplaceOffer["provider"];
  domain: string;
  publicationTitle: string;
  basePrice: number;
  currency: "EUR";
  providerExpiresAt?: string;
  live: boolean;
  now: Date;
}): Promise<LinkMarketplaceQuote> {
  if (!input.providerQuoteId || !input.offerId || !input.domain || !input.publicationTitle) {
    throw new Error("marketplace_provider_quote_invalid");
  }
  if (!Number.isFinite(input.basePrice) || input.basePrice <= 0) {
    throw new Error("marketplace_provider_quote_invalid");
  }
  const pricing = calculateMarketplacePricing(
    input.basePrice,
    linkhouseMarketplaceConfig().marginPercent,
  );
  const maximumExpiry = input.now.getTime() + MARKETPLACE_QUOTE_TTL_MS;
  const providerExpiry = input.providerExpiresAt
    ? Date.parse(input.providerExpiresAt)
    : maximumExpiry;
  const expiresAt = Math.min(maximumExpiry, providerExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) {
    throw new Error("marketplace_provider_quote_expired");
  }
  const payload: QuoteTokenPayload = {
    quoteId: crypto.randomUUID(),
    providerQuoteId: input.providerQuoteId,
    userId: input.userId,
    offerId: input.offerId,
    provider: input.provider,
    domain: input.domain,
    publicationTitle: input.publicationTitle,
    targetUrl: input.targetUrl,
    ...pricing,
    currency: input.currency,
    createdAt: input.now.toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    live: input.live,
  };
  return {
    id: payload.quoteId,
    offerId: payload.offerId,
    provider: payload.provider,
    domain: payload.domain,
    publicationTitle: payload.publicationTitle,
    basePrice: payload.basePrice,
    serviceFee: payload.serviceFee,
    marginPercent: payload.marginPercent,
    totalPrice: payload.totalPrice,
    currency: payload.currency,
    linkAttributes: "sponsored",
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
    confirmationToken: await signQuote(payload),
    live: payload.live,
  };
}

export async function createMarketplaceQuote(input: {
  userId: string;
  offerId: string;
  targetUrl: string;
  now?: Date;
}): Promise<LinkMarketplaceQuote> {
  const targetUrl = normalizeTargetUrl(input.targetUrl);
  const status = getMarketplaceIntegrationStatus();
  const now = input.now ?? new Date();
  if (status.catalogConnected) {
    const providerQuote = await linkhouseMarketplaceProvider.createQuote({
      offerId: input.offerId,
      targetUrl,
    });
    if (providerQuote.offerId !== input.offerId || providerQuote.currency !== "EUR") {
      throw new Error("marketplace_provider_quote_invalid");
    }
    return buildSignedMarketplaceQuote({
      userId: input.userId,
      targetUrl,
      providerQuoteId: providerQuote.providerQuoteId,
      offerId: providerQuote.offerId,
      provider: "linkhouse",
      domain: providerQuote.domain,
      publicationTitle: providerQuote.publicationTitle,
      basePrice: providerQuote.basePrice,
      currency: providerQuote.currency,
      providerExpiresAt: providerQuote.expiresAt,
      live: true,
      now,
    });
  }

  const offer = DEMO_MARKETPLACE_OFFERS.find((item) => item.id === input.offerId);
  if (!offer) throw new Error("marketplace_offer_not_found");
  return buildSignedMarketplaceQuote({
    userId: input.userId,
    offerId: offer.id,
    provider: offer.provider,
    providerQuoteId: `demo:${offer.id}:${crypto.randomUUID()}`,
    domain: offer.domain,
    publicationTitle: offer.title,
    targetUrl,
    basePrice: offer.price,
    currency: offer.currency,
    live: false,
    now,
  });
}

export async function confirmMarketplaceOrder(input: {
  userId: string;
  confirmationToken: string;
  confirmedTotalPrice: number;
  acknowledgedSponsored: boolean;
  acknowledgedPayment: boolean;
  now?: number;
}): Promise<{
  status: LinkMarketplaceOrderStatus;
  submitted: boolean;
  providerOrderId?: string;
  providerStatus?: string;
}> {
  if (!input.acknowledgedSponsored || !input.acknowledgedPayment) {
    throw new Error("marketplace_confirmation_required");
  }
  const payload = await verifyQuote(input.confirmationToken);
  if (payload.userId !== input.userId) throw new Error("marketplace_quote_invalid");
  if (isMarketplaceQuoteExpired(payload.expiresAt, input.now ?? Date.now())) {
    throw new Error("marketplace_quote_expired");
  }
  if (!isExactMarketplaceTotal(payload.totalPrice, input.confirmedTotalPrice)) {
    throw new Error("marketplace_total_mismatch");
  }

  if (!payload.live) return { status: "Requested", submitted: false };
  const status = getMarketplaceIntegrationStatus();
  if (!status.orderingEnabled) throw new Error("marketplace_ordering_disabled");
  const providerOrder = await linkhouseMarketplaceProvider.createOrder({
    providerQuoteId: payload.providerQuoteId,
    offerId: payload.offerId,
    targetUrl: payload.targetUrl,
    confirmedProviderPrice: payload.basePrice,
    idempotencyKey: payload.quoteId,
  });
  return {
    status: "Submitted",
    submitted: true,
    providerOrderId: providerOrder.providerOrderId,
    providerStatus: providerOrder.providerStatus,
  };
}

export async function syncMarketplaceProviderOrder(providerOrderId: string) {
  const status = getMarketplaceIntegrationStatus();
  if (!status.catalogConnected) throw new Error("marketplace_provider_not_connected");
  return linkhouseMarketplaceProvider.getOrder({ providerOrderId });
}
