import { describe, expect, it } from "vitest";

import { installRoute } from "@/lib/install";

// Real user-agent strings. The point of this file is that the iOS branch is
// exercised on a machine that has no iOS device attached — so these are copied
// verbatim rather than approximated, and the iPad one is the trap.
const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ claims to be a Macintosh. Only the touch-point count gives it away.
  ipad:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

const env = (ua: string, over: { standalone?: boolean; touchPoints?: number } = {}) => ({
  ua,
  standalone: false,
  touchPoints: 0,
  ...over,
});

describe("which install route a browser has", () => {
  it("offers nothing once the app is already on the home screen", () => {
    expect(installRoute(env(UA.iphone, { standalone: true }))).toBe("installed");
    expect(installRoute(env(UA.android, { standalone: true }))).toBe("installed");
  });

  it("sends an iPhone to the Share sheet — iOS has no install API", () => {
    expect(installRoute(env(UA.iphone))).toBe("ios");
  });

  // The one that would have shipped broken. iPadOS reports a desktop Safari UA,
  // so a /iPhone|iPad/ test alone tells every iPad user to look in a menu that
  // does not exist on their device.
  it("catches an iPad even though it claims to be a Macintosh", () => {
    expect(installRoute(env(UA.ipad, { touchPoints: 5 }))).toBe("ios");
  });

  it("does not mistake a real Mac for an iPad", () => {
    expect(installRoute(env(UA.mac, { touchPoints: 0 }))).toBe("other");
  });

  it("treats Android and desktop as the promptable route", () => {
    expect(installRoute(env(UA.android))).toBe("other");
    expect(installRoute(env(UA.windows))).toBe("other");
  });

  // A touchscreen Windows laptop reports touch points too, and must not be
  // dragged into the iOS branch by them — the Macintosh check is what scopes it.
  it("ignores touch points on a platform that is not a Mac", () => {
    expect(installRoute(env(UA.windows, { touchPoints: 10 }))).toBe("other");
  });
});
