import assert from "node:assert/strict";
import test from "node:test";
import { isRequestSameOrigin } from "../lib/request-origin.ts";

test("same-origin checks honor trusted HTTPS reverse proxy headers", () => {
  const request = new Request("http://goldrian.co.kr/api/admin/session", {
    headers: {
      host: "goldrian.co.kr",
      origin: "https://goldrian.co.kr",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(isRequestSameOrigin(request), true);
});

test("same-origin checks reject foreign and malformed origins", () => {
  const foreignRequest = new Request(
    "http://goldrian.co.kr/api/admin/session",
    {
      headers: {
        host: "goldrian.co.kr",
        origin: "https://attacker.invalid",
        "x-forwarded-proto": "https",
      },
    },
  );
  const malformedRequest = new Request(
    "http://goldrian.co.kr/api/admin/session",
    {
      headers: {
        host: "goldrian.co.kr",
        origin: "not a url",
        "x-forwarded-proto": "https",
      },
    },
  );

  assert.equal(isRequestSameOrigin(foreignRequest), false);
  assert.equal(isRequestSameOrigin(malformedRequest), false);
});

test("same-origin checks preserve direct and non-browser requests", () => {
  assert.equal(
    isRequestSameOrigin(
      new Request("https://goldrian.co.kr/api/admin/session", {
        headers: { origin: "https://goldrian.co.kr" },
      }),
    ),
    true,
  );
  assert.equal(
    isRequestSameOrigin(
      new Request("https://goldrian.co.kr/api/admin/session"),
    ),
    true,
  );
});
