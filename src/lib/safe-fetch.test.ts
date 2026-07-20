/**
 * Shared safe-fetch SSRF guard (adversarial-review fix).
 *
 * Covers every bypass class the review found + the ones the directive lists:
 * IPv4 (dotted/decimal/hex/octal), IPv6 (::1, ::, fe80::/10, fc00::/7),
 * IPv4-mapped/compat (::ffff:169.254.169.254, ::127.0.0.1), localhost aliases +
 * trailing dot, cloud metadata, embedded credentials, and non-http schemes.
 */
import { describe, it, expect } from "vitest";
import { isSafePublicUrl, hostCategory } from "./safe-fetch";

describe("hostCategory — IP-literal classification", () => {
  it("classifies IPv4 ranges (incl. decimal/hex/octal via URL canonicalisation)", () => {
    expect(hostCategory("127.0.0.1")).toBe("loopback");
    expect(hostCategory("10.0.0.5")).toBe("private");
    expect(hostCategory("172.16.0.1")).toBe("private");
    expect(hostCategory("192.168.1.1")).toBe("private");
    expect(hostCategory("169.254.169.254")).toBe("linklocal");
    expect(hostCategory("8.8.8.8")).toBe("global");
  });
  it("classifies IPv6 forms", () => {
    expect(hostCategory("::1")).toBe("loopback");
    expect(hostCategory("::")).toBe("unspecified");
    expect(hostCategory("fe80::1")).toBe("linklocal");
    expect(hostCategory("febf::1")).toBe("linklocal"); // fe80::/10 upper edge
    expect(hostCategory("fc00::1")).toBe("private");
    expect(hostCategory("fd12:3456::1")).toBe("private");
    expect(hostCategory("2606:4700::1111")).toBe("global");
  });
  it("classifies IPv4-mapped / IPv4-compat IPv6 by the embedded address", () => {
    expect(hostCategory("::ffff:169.254.169.254")).toBe("linklocal");
    expect(hostCategory("::ffff:7f00:1")).toBe("loopback"); // ::ffff:127.0.0.1 (hex form)
    expect(hostCategory("::ffff:10.0.0.1")).toBe("private");
    expect(hostCategory("::127.0.0.1")).toBe("loopback"); // compat form
  });
  it("normalises trailing dot + case for localhost", () => {
    expect(hostCategory("localhost")).toBe("loopback");
    expect(hostCategory("localhost.")).toBe("loopback");
    expect(hostCategory("LOCALHOST")).toBe("loopback");
    expect(hostCategory("api.localhost")).toBe("loopback");
  });
  it("a normal DNS name is a hostname (resolvable, allowed)", () => {
    expect(hostCategory("nih.gov")).toBe("hostname");
  });
});

describe("isSafePublicUrl", () => {
  it("allows public http/https URLs", () => {
    expect(isSafePublicUrl("https://nih.gov/study")).toBe(true);
    expect(isSafePublicUrl("http://example.org/x")).toBe(true);
    expect(isSafePublicUrl("https://8.8.8.8/x")).toBe(true);
  });

  it("blocks every private/reserved IP literal, in every representation", () => {
    for (const bad of [
      "http://127.0.0.1/",
      "http://2130706433/", // decimal 127.0.0.1
      "http://0x7f000001/", // hex 127.0.0.1
      "http://0177.0.0.1/", // octal 127
      "http://10.0.0.1/",
      "http://192.168.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[::]/",
      "http://[fe80::1]/",
      "http://[fc00::1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:127.0.0.1]/",
      "http://localhost/",
      "http://localhost./",
      "http://100.64.0.1/", // CGNAT
      "http://0.0.0.0/",
    ]) {
      expect(isSafePublicUrl(bad), bad).toBe(false);
    }
  });

  it("blocks non-http schemes and embedded credentials", () => {
    expect(isSafePublicUrl("ftp://example.com")).toBe(false);
    expect(isSafePublicUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePublicUrl("http://user:pass@example.com/")).toBe(false);
    expect(isSafePublicUrl("http://user@example.com/")).toBe(false);
    expect(isSafePublicUrl("not a url")).toBe(false);
  });
});
