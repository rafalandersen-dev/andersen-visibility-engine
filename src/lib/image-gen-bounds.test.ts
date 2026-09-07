import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateImageBytes,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_RESPONSE_MAX_BYTES,
  ImageGenError,
} from "./image-gen.server";
import { MAX_IMAGE_BYTES } from "./image-storage";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
const providers = ["lovable", "openai"] as const;
type Provider = (typeof providers)[number];
function responseBody(provider: Provider, b64: unknown = png.toString("base64")) {
  return provider === "lovable"
    ? {
        choices: [
          { message: { images: [{ image_url: { url: `data:image/png;base64,${b64}` } }] } },
        ],
      }
    : { data: [{ b64_json: b64 }] };
}
function configure(provider: Provider) {
  vi.stubEnv("IMAGE_GEN_PROVIDER", provider);
  vi.stubEnv("LOVABLE_API_KEY", "test-lovable-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(providers)("%s image request bounds", (provider) => {
  it("keeps the model payload, returns bytes, uses one request and forbids redirects", async () => {
    configure(provider);
    vi.useFakeTimers();
    const request = vi.fn(async () => new Response(JSON.stringify(responseBody(provider))));
    vi.stubGlobal("fetch", request);
    expect(await generateImageBytes("sample prompt")).toEqual(new Uint8Array(png));
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = (request.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe(
      provider === "lovable"
        ? "https://ai.gateway.lovable.dev/v1/chat/completions"
        : "https://api.openai.com/v1/images/generations",
    );
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toMatchObject(
      provider === "lovable"
        ? { messages: [{ role: "user", content: "sample prompt" }], modalities: ["image", "text"] }
        : { model: "gpt-image-1", prompt: "sample prompt", n: 1, size: "1536x1024" },
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns after the deadline even if fetch ignores abort; never retries", async () => {
    configure(provider);
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const request = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", request);
    const outcome = generateImageBytes("sample").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(IMAGE_GENERATION_TIMEOUT_MS);
    expect(await outcome).toMatchObject({
      name: "ImageGenError",
      message: expect.stringMatching(/may still have processed/),
    });
    expect(signal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the same deadline for headers and a stalled body, cancelling the reader", async () => {
    configure(provider);
    vi.useFakeTimers();
    const cancel = vi.fn();
    const request = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 90_000));
      return new Response(new ReadableStream<Uint8Array>({ cancel }));
    });
    vi.stubGlobal("fetch", request);
    const outcome = generateImageBytes("sample").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(IMAGE_GENERATION_TIMEOUT_MS);
    expect(await outcome).toMatchObject({
      name: "ImageGenError",
      message: expect.stringMatching(/timed out/),
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a response that arrives after the caller already timed out", async () => {
    configure(provider);
    vi.useFakeTimers();
    let deliver!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            deliver = resolve;
          }),
      ),
    );
    const outcome = generateImageBytes("sample").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(IMAGE_GENERATION_TIMEOUT_MS);
    expect(await outcome).toBeInstanceOf(ImageGenError);
    const cancel = vi.fn();
    deliver(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects excessive advertised size without reading the body", async () => {
    configure(provider);
    const cancel = vi.fn();
    const pull = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(stream, {
            headers: { "Content-Length": String(IMAGE_RESPONSE_MAX_BYTES + 1) },
          }),
      ),
    );
    await expect(generateImageBytes("sample")).rejects.toThrow(/oversized/);
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, "1"])(
    "bounds actual streamed bytes despite content-length %s",
    async (length) => {
      configure(provider);
      const cancel = vi.fn();
      let chunks = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            chunks++;
            controller.enqueue(new Uint8Array(1024 * 1024));
          },
          cancel,
        },
        { highWaterMark: 0 },
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(stream, {
              headers: length === undefined ? {} : { "Content-Length": length },
            }),
        ),
      );
      await expect(generateImageBytes("sample")).rejects.toThrow(/oversized/);
      expect(chunks).toBe(9);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("accepts the decoded size boundary but rejects one extra byte", async () => {
    configure(provider);
    const exact = Buffer.alloc(MAX_IMAGE_BYTES, 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(responseBody(provider, exact.toString("base64")))),
      ),
    );
    expect((await generateImageBytes("sample")).byteLength).toBe(MAX_IMAGE_BYTES);
    const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(responseBody(provider, oversized.toString("base64")))),
      ),
    );
    await expect(generateImageBytes("sample")).rejects.toThrow(/oversized/);
  });

  it.each(["@@@@", "Zg==extra", "Zh==", "Zg=", "Z g==", 23])(
    "rejects malformed base64 %s",
    async (b64) => {
      configure(provider);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(responseBody(provider, b64)))),
      );
      await expect(generateImageBytes("sample")).rejects.toThrow(ImageGenError);
    },
  );

  it.each(["null", "{private-provider-payload", '{"data":null,"choices":null}'])(
    "sanitizes malformed JSON/body %s",
    async (body) => {
      configure(provider);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body)),
      );
      const error = await generateImageBytes("private prompt").catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ImageGenError);
      expect(String(error)).not.toMatch(/private/);
    },
  );

  it.each([402, 429, 500, 302])("does not read or retry provider error %s", async (status) => {
    configure(provider);
    const cancel = vi.fn();
    const pull = vi.fn();
    const request = vi.fn(
      async () =>
        new Response(new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }), {
          status,
        }),
    );
    vi.stubGlobal("fetch", request);
    await expect(generateImageBytes("sample")).rejects.toThrow(ImageGenError);
    expect(request).toHaveBeenCalledOnce();
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("sanitizes transport errors and does not retry", async () => {
    configure(provider);
    const request = vi.fn(async () => {
      throw new Error("private-supplier-payload");
    });
    vi.stubGlobal("fetch", request);
    const error = await generateImageBytes("sample").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ImageGenError);
    expect(String(error)).not.toContain("private");
    expect(request).toHaveBeenCalledOnce();
  });
});

it.each([
  "https://example.test/private-image",
  "data:image/svg+xml;base64,PHN2Zz4=",
  "data:text/html;base64,PHN2Zz4=",
])("refuses provider URL/MIME %s without downloading it", async (url) => {
  configure("lovable");
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { images: [{ image_url: { url } }] } }] }),
      ),
  );
  vi.stubGlobal("fetch", request);
  await expect(generateImageBytes("sample")).rejects.toThrow(ImageGenError);
  expect(request).toHaveBeenCalledOnce();
});
