import { describe, it, expect } from "vitest";
import {
  checkUrlShape,
  isPrivateAddress,
  UnsafeUrlError,
} from "@/lib/net/safe-url";

/**
 * Server-side fetches of user-chosen URLs — the website importer, every
 * composition source, the fal webhook's result URLs — must never reach the
 * inside: cloud metadata, databases, other services on the private network.
 */
describe("isPrivateAddress", () => {
  it("knows the private and special ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "104.21.5.5", "2606:4700::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("checkUrlShape", () => {
  it("refuses non-http schemes, credentials, and inside names", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://example.com/x",
      "gopher://example.com",
      "http://user:pw@example.com/",
      "http://localhost:3000/api/health",
      "http://foo.localhost/",
      "http://db.internal/",
      "http://metadata.google.internal/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://10.0.0.5:5432/",
    ]) {
      expect(() => checkUrlShape(u), u).toThrow(UnsafeUrlError);
    }
  });
  it("accepts an ordinary public URL", () => {
    expect(checkUrlShape("https://example.com/page?x=1").hostname).toBe(
      "example.com",
    );
  });
});
