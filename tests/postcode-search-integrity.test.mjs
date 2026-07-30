import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("postcode search permits only the official Kakao script and frame origins", async () => {
  const [postcode, worker] = await Promise.all([
    source("app/components/daum-postcode.ts"),
    source("worker/index.ts"),
  ]);

  assert.match(
    postcode,
    /https:\/\/t1\.kakaocdn\.net\/mapjsapi\/bundle\/postcode\/prod\/postcode\.v2\.js/u,
  );
  assert.match(
    worker,
    /frame-src 'self' about: https:\/\/postcode\.map\.kakao\.com/u,
  );
  assert.match(worker, /http:\/\/postcode\.map\.kakao\.com/u);
  assert.match(worker, /frame-ancestors 'none'/u);
  assert.match(worker, /X-Frame-Options", "DENY"/u);
  assert.match(worker, /script-src[^`]+https:\/\/t1\.kakaocdn\.net/u);
  assert.doesNotMatch(worker, /frame-src 'none'/u);
});

test("postcode search embeds synchronously after preload and keeps the selected address type", async () => {
  const postcode = await source("app/components/daum-postcode.ts");

  assert.match(
    postcode,
    /if \(Postcode\) \{\s+try \{\s+openPostcodeDialog\(Postcode/u,
  );
  assert.match(postcode, /void preparePostcodeSearch\(\)\.catch/u);
  assert.match(postcode, /result\.userSelectedType === "R"/u);
  assert.match(postcode, /result\.userSelectedType === "J"/u);
  assert.match(postcode, /postcode: result\.zonecode\?\.trim\(\)/u);
  assert.match(postcode, /\.embed\(embedContainer/u);
  assert.match(postcode, /width: "100%"/u);
  assert.match(postcode, /height: "100%"/u);
  assert.match(postcode, /aria-modal/u);
  assert.match(postcode, /element\.inert = true/u);
  assert.match(postcode, /element\.inert = inert/u);
  assert.match(postcode, /event\.key !== "Escape"/u);
  assert.match(postcode, /window\.visualViewport/u);
  assert.match(postcode, /height:min\(520px,calc\(100dvh - 84px\)\)/u);
  assert.match(postcode, /position:relative/u);
  assert.match(postcode, /catch \(error\) \{\s+close\(\)/u);
  assert.match(postcode, /previouslyFocused\?\.focus\(\)/u);
});

test("registration fills the matching form and moves focus to detailed address", async () => {
  const register = await source(
    "app/components/storefront/AuthPanels.tsx",
  );

  assert.match(register, /const formRef = useRef<HTMLFormElement>\(null\)/u);
  assert.match(register, /ref=\{formRef\}/u);
  assert.match(register, /namedItem\("postcode"\)/u);
  assert.match(register, /namedItem\("address1"\)/u);
  assert.match(register, /namedItem\("address2"\)/u);
  assert.match(register, /detailAddressInput\.focus\(\)/u);
  assert.doesNotMatch(register, /document\.querySelector<HTMLFormElement>/u);
});
