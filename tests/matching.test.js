"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_STATE,
  computeStatus,
  isLocalhost,
  destPatternToRegExp,
  activeDestinationMatch,
  isActiveDestination,
  isLocalhostPattern,
  patternToMatchPattern,
  normalizeHostEntry,
  normalizeDestinationEntry
} = require("../matching.js");

const matches = (pattern, url) => {
  const re = destPatternToRegExp(pattern);
  return !!(re && re.test(url));
};

test("destPatternToRegExp: localhost / 127.0.0.1 with any scheme, port, path", () => {
  assert.ok(matches("localhost", "http://localhost:3000/"));
  assert.ok(matches("localhost", "https://localhost/app"));
  assert.ok(matches("localhost", "http://localhost"));
  assert.ok(matches("127.0.0.1", "http://127.0.0.1:8080/"));
});

test("destPatternToRegExp: wildcard matches the intended subdomain only", () => {
  assert.ok(matches("app-*.staging.example.com", "https://app-123.staging.example.com/"));
  assert.ok(matches("app-*.staging.example.com", "https://app-123.staging.example.com/dash?x=1"));
  assert.equal(matches("app-*.staging.example.com", "https://other.staging.example.com/"), false);
  assert.equal(matches("app-*.staging.example.com", "https://app-123.prod.example.com/"), false);
});

test("destPatternToRegExp: explicit scheme is honored", () => {
  assert.ok(matches("https://spa-*.staging.example.com/", "https://spa-7.staging.example.com/"));
  assert.equal(matches("https://spa-*.staging.example.com/", "http://spa-7.staging.example.com/"), false);
});

test("destPatternToRegExp: anchored — pattern in another origin's path does NOT match", () => {
  assert.equal(matches("localhost", "https://evil.com/localhost"), false);
  assert.equal(matches("app-*.staging.example.com", "https://evil.com/app-1.staging.example.com"), false);
  assert.equal(matches("localhost", "https://notlocalhost.com/"), false);
});

test("destPatternToRegExp: trailing slashes ignored, empty/garbage returns null", () => {
  assert.ok(matches("localhost///", "http://localhost/"));
  assert.equal(destPatternToRegExp(""), null);
  assert.equal(destPatternToRegExp("   "), null);
  assert.equal(destPatternToRegExp(null), null);
});

test("isLocalhost: only true loopback origins", () => {
  assert.ok(isLocalhost("http://localhost:5173/"));
  assert.ok(isLocalhost("https://127.0.0.1/"));
  assert.equal(isLocalhost("https://localhost.evil.com/"), false);
  assert.equal(isLocalhost(""), false);
  assert.equal(isLocalhost(undefined), false);
});

test("activeDestinationMatch: returns the entry, respects pause, ignores non-matches", () => {
  const state = {
    destinations: [
      { id: "a", pattern: "localhost", paused: false },
      { id: "b", pattern: "app-*.staging.example.com", paused: false },
      { id: "c", pattern: "qa.example.com", paused: true }
    ]
  };
  assert.equal(activeDestinationMatch("http://localhost:3000/", state).id, "a");
  assert.equal(activeDestinationMatch("https://app-9.staging.example.com/", state).id, "b");
  assert.equal(activeDestinationMatch("https://qa.example.com/", state), null, "paused entry ignored");
  assert.equal(activeDestinationMatch("https://unknown.com/", state), null);
  assert.equal(activeDestinationMatch("http://localhost/", { destinations: [] }), null);
  assert.equal(activeDestinationMatch(undefined, state), null);
});

test("isActiveDestination: boolean wrapper", () => {
  const state = { destinations: [{ id: "a", pattern: "localhost", paused: false }] };
  assert.equal(isActiveDestination("http://localhost/", state), true);
  assert.equal(isActiveDestination("https://x.com/", state), false);
});

test("DEFAULT_STATE ships localhost + loopback as active destinations", () => {
  assert.ok(isActiveDestination("http://localhost:3000/", DEFAULT_STATE));
  assert.ok(isActiveDestination("http://127.0.0.1:8080/", DEFAULT_STATE));
  assert.deepEqual(DEFAULT_STATE.hosts, []);
});

test("isLocalhostPattern: detects loopback patterns (skipped in dynamic registration)", () => {
  assert.equal(isLocalhostPattern("localhost"), true);
  assert.equal(isLocalhostPattern("http://localhost:3000"), true);
  assert.equal(isLocalhostPattern("127.0.0.1"), true);
  assert.equal(isLocalhostPattern("app-*.staging.example.com"), false);
});

test("patternToMatchPattern: produces valid Chrome match patterns", () => {
  // Partial-label wildcard widens to the clean suffix.
  assert.equal(patternToMatchPattern("app-*.staging.example.com"), "*://*.staging.example.com/*");
  // Explicit scheme is preserved.
  assert.equal(patternToMatchPattern("https://spa-*.staging.example.com/"), "https://*.staging.example.com/*");
  // Exact host, no wildcard.
  assert.equal(patternToMatchPattern("qa.example.com"), "*://qa.example.com/*");
  // Leading subdomain wildcard kept as-is.
  assert.equal(patternToMatchPattern("*.staging.example.com"), "*://*.staging.example.com/*");
  // Too broad to register safely.
  assert.equal(patternToMatchPattern("*"), null);
  assert.equal(patternToMatchPattern("*.com"), null);
});

test("normalizeHostEntry: adds scheme, normalizes to origin, keeps flags", () => {
  // Scheme-less input defaults to https and collapses to the origin.
  const bare = normalizeHostEntry({ url: "app.staging.example.com" });
  assert.equal(bare.url, "https://app.staging.example.com/");
  assert.equal(bare.paused, false);

  const h = normalizeHostEntry({ url: "  http://app.example.com/some/path?q=1  ", paused: true });
  assert.equal(h.url, "http://app.example.com/");
  assert.equal(h.paused, true);
  assert.equal(typeof h.id, "string");

  assert.equal(normalizeHostEntry({ url: "id-kept", id: "fixed" }).id, "fixed");
  assert.equal(normalizeHostEntry({}), null);
  assert.equal(normalizeHostEntry({ url: "   " }), null);
  assert.equal(normalizeHostEntry(null), null);
});

test("normalizeDestinationEntry: keeps wildcard pattern, strips trailing slash, validates", () => {
  const d = normalizeDestinationEntry({ pattern: "  app-*.staging.example.com/  " });
  assert.equal(d.pattern, "app-*.staging.example.com");
  assert.equal(d.paused, false);
  assert.equal(typeof d.id, "string");

  // localhost (no dot) is a valid destination.
  assert.equal(normalizeDestinationEntry({ pattern: "localhost" }).pattern, "localhost");
  // paused flag and explicit id preserved.
  const d2 = normalizeDestinationEntry({ pattern: "qa.example.com", paused: true, id: "keep" });
  assert.equal(d2.id, "keep");
  assert.equal(d2.paused, true);

  // Rejected: empty, whitespace in host, missing.
  assert.equal(normalizeDestinationEntry({ pattern: "" }), null);
  assert.equal(normalizeDestinationEntry({ pattern: "bad host.com" }), null);
  assert.equal(normalizeDestinationEntry(null), null);
});

test("computeStatus: paused > idle > active", () => {
  assert.equal(computeStatus({ globallyPaused: true, hosts: [{ paused: false }] }), "paused");
  assert.equal(computeStatus({ globallyPaused: false, hosts: [] }), "idle");
  assert.equal(computeStatus({ globallyPaused: false, hosts: [{ paused: true }] }), "idle");
  assert.equal(computeStatus({ globallyPaused: false, hosts: [{ paused: false }] }), "active");
});
