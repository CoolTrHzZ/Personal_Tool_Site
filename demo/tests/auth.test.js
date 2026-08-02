import { test } from "node:test";
import assert from "node:assert/strict";
import { createToken, verifyToken } from "../src/auth.js";

test("createToken returns three segments", () => {
  const t = createToken({ sub: "u1" });
  assert.equal(t.split(".").length, 3);
});

test("verifyToken accepts valid token", () => {
  const t = createToken({ sub: "u1" });
  const r = verifyToken(t);
  assert.equal(r.ok, true);
  assert.equal(r.payload.sub, "u1");
});

test("verifyToken rejects malformed", () => {
  const r = verifyToken("not-a-token");
  assert.equal(r.ok, false);
});
