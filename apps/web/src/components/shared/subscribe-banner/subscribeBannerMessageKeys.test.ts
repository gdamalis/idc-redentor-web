import { describe, it, expect } from "vitest";
import esAR from "@public/locales/es-AR.json";
import enUS from "@public/locales/en-US.json";

describe("subscribeBannerMessageKeys", () => {
  it("exports all expected message keys as a const map", async () => {
    const { SUBSCRIBE_BANNER_KEYS } = await import("./subscribeBannerMessageKeys");

    expect(SUBSCRIBE_BANNER_KEYS).toBeDefined();
    expect(typeof SUBSCRIBE_BANNER_KEYS).toBe("object");
    expect(SUBSCRIBE_BANNER_KEYS.ERROR_ALREADY_SUBSCRIBED).toBe(
      "SubscribeBanner.error-already-subscribed"
    );
    expect(SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED).toBe(
      "SubscribeBanner.error-unexpected"
    );
  });
});

describe("es-AR locale SubscribeBanner namespace", () => {
  const ns = (esAR as Record<string, unknown>)["SubscribeBanner"] as
    | Record<string, string>
    | undefined;

  it("has a SubscribeBanner namespace", () => {
    expect(ns).toBeDefined();
  });
  it("contains error-already-subscribed (voseo)", () => {
    expect(ns?.["error-already-subscribed"]).toBeTruthy();
  });
  it("contains error-unexpected", () => {
    expect(ns?.["error-unexpected"]).toBeTruthy();
  });
});

describe("en-US locale SubscribeBanner namespace", () => {
  const ns = (enUS as Record<string, unknown>)["SubscribeBanner"] as
    | Record<string, string>
    | undefined;

  it("has a SubscribeBanner namespace", () => {
    expect(ns).toBeDefined();
  });
  it("contains error-already-subscribed", () => {
    expect(ns?.["error-already-subscribed"]).toBeTruthy();
  });
  it("contains error-unexpected", () => {
    expect(ns?.["error-unexpected"]).toBeTruthy();
  });
});
