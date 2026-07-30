import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const workspace = process.cwd();
const databaseDirectory = resolve(
  workspace,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const databaseFile = readdirSync(databaseDirectory)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => join(databaseDirectory, name))
  .find(Boolean);
assert.ok(databaseFile, "로컬 D1 파일을 찾을 수 없습니다.");
assert.ok(
  resolve(databaseFile).startsWith(databaseDirectory),
  "로컬 D1 경로가 작업공간을 벗어났습니다.",
);

const publicBase = "http://localhost:4173";
const adminBase = "http://localhost:4174";
const qaSessionSecret =
  readEnvValue(".env.local", "SESSION_SECRET") ||
  "local-development-session-secret-change-before-deploy";
const runId = `QAPCC-${Date.now().toString(36).toUpperCase()}`;
const tracked = {
  groups: [],
  boards: [],
  posts: [],
  comments: [],
  inquiries: [],
  users: [],
};
const database = new DatabaseSync(databaseFile);

try {
  const schemaResponse = await fetch(`${publicBase}/api/inquiries`);
  assert.equal(schemaResponse.status, 200);

  const group = await adminMutation("POST", {
    resource: "groups",
    input: { name: `${runId} 공개그룹`, sortOrder: 99999, active: true },
  });
  assert.equal(group.response.status, 201, JSON.stringify(group.payload));
  tracked.groups.push(group.payload.data.id);

  const board = await adminMutation("POST", {
    resource: "boards",
    input: {
      groupId: group.payload.data.id,
      slug: `${runId.toLowerCase()}-board`,
      name: `${runId} 공개게시판`,
      description: `${runId} 공개 게시판 설명`,
      readLevel: 0,
      writeLevel: 1,
      commentEnabled: true,
      active: true,
      sortOrder: 99999,
    },
  });
  assert.equal(board.response.status, 201, JSON.stringify(board.payload));
  tracked.boards.push(board.payload.data.id);

  const visiblePost = await adminMutation("POST", {
    resource: "posts",
    input: {
      boardId: board.payload.data.id,
      authorName: `${runId} 작성자`,
      title: `${runId} 공개 게시물`,
      content: `${runId} 공개 본문`,
      status: "published",
      pinned: true,
    },
  });
  assert.equal(
    visiblePost.response.status,
    201,
    JSON.stringify(visiblePost.payload),
  );
  tracked.posts.push(visiblePost.payload.data.id);

  const hiddenPost = await adminMutation("POST", {
    resource: "posts",
    input: {
      boardId: board.payload.data.id,
      authorName: `${runId} 숨김작성자`,
      title: `${runId} 숨김 게시물`,
      content: `${runId} 숨김 본문`,
      status: "hidden",
      pinned: false,
    },
  });
  assert.equal(hiddenPost.response.status, 201);
  tracked.posts.push(hiddenPost.payload.data.id);

  const visibleComment = await adminMutation("POST", {
    resource: "comments",
    input: {
      postId: visiblePost.payload.data.id,
      authorName: `${runId} 댓글작성자`,
      content: `${runId} 공개 댓글`,
      visible: true,
    },
  });
  assert.equal(visibleComment.response.status, 201);
  tracked.comments.push(visibleComment.payload.data.id);

  const hiddenComment = await adminMutation("POST", {
    resource: "comments",
    input: {
      postId: visiblePost.payload.data.id,
      authorName: `${runId} 숨김댓글`,
      content: `${runId} 비공개 댓글`,
      visible: false,
    },
  });
  assert.equal(hiddenComment.response.status, 201);
  tracked.comments.push(hiddenComment.payload.data.id);

  const boardIndex = await fetch(`${publicBase}/bbs/board.php`);
  const boardIndexHtml = await boardIndex.text();
  assert.equal(boardIndex.status, 200);
  assert.match(boardIndexHtml, new RegExp(`${runId} 공개게시판`));

  const boardUrl = `${publicBase}/bbs/board.php?bo_table=${encodeURIComponent(
    board.payload.data.slug,
  )}`;
  const publicList = await fetch(boardUrl);
  const publicListHtml = await publicList.text();
  assert.equal(publicList.status, 200);
  assert.match(publicListHtml, new RegExp(`${runId} 공개 게시물`));
  assert.doesNotMatch(publicListHtml, new RegExp(`${runId} 숨김 게시물`));

  const detailUrl = `${boardUrl}&wr_id=${encodeURIComponent(
    visiblePost.payload.data.id,
  )}`;
  const publicDetail = await fetch(detailUrl);
  const publicDetailHtml = await publicDetail.text();
  assert.equal(publicDetail.status, 200);
  assert.match(publicDetailHtml, new RegExp(`${runId} 공개 본문`));
  assert.match(publicDetailHtml, new RegExp(`${runId} 공개 댓글`));
  assert.doesNotMatch(publicDetailHtml, new RegExp(`${runId} 비공개 댓글`));

  await verifyHierarchyRace();

  const guestInput = {
    authorName: `${runId} 비회원`,
    email: `${runId.toLowerCase()}@example.test`,
    phone: "010-0000-0000",
    category: "기타",
    title: `${runId} 비회원 문의`,
    content: `${runId} 비회원 문의 본문`,
  };
  const guestIp = "203.0.113.171";
  const guestCreate = await publicInquiryPost(
    "/api/inquiries",
    guestInput,
    guestIp,
  );
  assert.equal(
    guestCreate.response.status,
    201,
    JSON.stringify(guestCreate.payload),
  );
  assert.match(guestCreate.payload.lookupToken, /^[A-Za-z0-9_-]{43}$/u);
  tracked.inquiries.push(guestCreate.payload.inquiry.id);
  const storedGuest = database
    .prepare(
      "SELECT lookup_token_hash FROM one_to_one_inquiries WHERE id = ?",
    )
    .get(guestCreate.payload.inquiry.id);
  assert.match(storedGuest.lookup_token_hash, /^[a-f0-9]{64}$/u);
  assert.notEqual(
    storedGuest.lookup_token_hash,
    guestCreate.payload.lookupToken,
  );
  assert.equal(
    storedGuest.lookup_token_hash,
    createHash("sha256")
      .update(guestCreate.payload.lookupToken)
      .digest("hex"),
  );

  const answer = `${runId} 관리자 답변`;
  const answerUpdate = await adminMutation("PATCH", {
    resource: "inquiries",
    id: guestCreate.payload.inquiry.id,
    input: {
      ...guestInput,
      status: "answered",
      answer,
    },
  });
  assert.equal(answerUpdate.response.status, 200);

  const lookup = await publicInquiryPost(
    "/api/inquiries/lookup",
    { token: guestCreate.payload.lookupToken },
    guestIp,
  );
  assert.equal(lookup.response.status, 200, JSON.stringify(lookup.payload));
  assert.equal(lookup.payload.inquiry.content, guestInput.content);
  assert.equal(lookup.payload.inquiry.answer, answer);
  assert.equal("email" in lookup.payload.inquiry, false);
  assert.equal("phone" in lookup.payload.inquiry, false);
  assert.equal("authorName" in lookup.payload.inquiry, false);

  const wrongLookup = await publicInquiryPost(
    "/api/inquiries/lookup",
    {
      token: `${guestCreate.payload.lookupToken.slice(0, -1)}${
        guestCreate.payload.lookupToken.endsWith("A") ? "B" : "A"
      }`,
    },
    guestIp,
  );
  assert.equal(wrongLookup.response.status, 404);

  const memberA = seedMember("A");
  const memberB = seedMember("B");
  const sessionCheck = await fetch(`${publicBase}/api/customer/session`, {
    headers: { Accept: "application/json", Cookie: memberA.cookie },
  });
  const sessionPayload = await sessionCheck.json();
  assert.equal(sessionCheck.status, 200);
  assert.equal(sessionPayload.user?.id, memberA.id);
  const memberInputA = {
    ...guestInput,
    authorName: `${runId} 회원A`,
    email: `${runId.toLowerCase()}-a@example.test`,
    title: `${runId} 회원A 문의`,
  };
  const memberInputB = {
    ...guestInput,
    authorName: `${runId} 회원B`,
    email: `${runId.toLowerCase()}-b@example.test`,
    title: `${runId} 회원B 문의`,
  };
  const memberCreateA = await publicInquiryPost(
    "/api/inquiries",
    memberInputA,
    "203.0.113.172",
    memberA.cookie,
  );
  const memberCreateB = await publicInquiryPost(
    "/api/inquiries",
    memberInputB,
    "203.0.113.173",
    memberB.cookie,
  );
  if (typeof memberCreateA.payload.inquiry?.id === "string") {
    tracked.inquiries.push(memberCreateA.payload.inquiry.id);
  }
  if (typeof memberCreateB.payload.inquiry?.id === "string") {
    tracked.inquiries.push(memberCreateB.payload.inquiry.id);
  }
  assert.equal(memberCreateA.response.status, 201);
  assert.equal(memberCreateB.response.status, 201);
  assert.equal("lookupToken" in memberCreateA.payload, false);
  assert.equal("lookupToken" in memberCreateB.payload, false);

  const memberList = await fetch(
    `${publicBase}/api/inquiries?q=${encodeURIComponent(`${runId} 회원A`)}`,
    { headers: { Accept: "application/json", Cookie: memberA.cookie } },
  );
  const memberListPayload = await memberList.json();
  assert.equal(memberList.status, 200);
  assert.equal(memberListPayload.viewer, "member");
  assert.deepEqual(
    memberListPayload.inquiries.items.map((item) => item.id),
    [memberCreateA.payload.inquiry.id],
  );

  const ownDetail = await fetch(
    `${publicBase}/api/inquiries?id=${encodeURIComponent(
      memberCreateA.payload.inquiry.id,
    )}`,
    { headers: { Accept: "application/json", Cookie: memberA.cookie } },
  );
  assert.equal(ownDetail.status, 200);
  const crossUserDetail = await fetch(
    `${publicBase}/api/inquiries?id=${encodeURIComponent(
      memberCreateB.payload.inquiry.id,
    )}`,
    { headers: { Accept: "application/json", Cookie: memberA.cookie } },
  );
  assert.equal(crossUserDetail.status, 404);
  const guestDetail = await fetch(
    `${publicBase}/api/inquiries?id=${encodeURIComponent(
      memberCreateA.payload.inquiry.id,
    )}`,
  );
  assert.equal(guestDetail.status, 401);

  console.log(
    JSON.stringify({
      ok: true,
      checks: {
        publicBoardFiltering: true,
        visibleCommentFiltering: true,
        hierarchyRaceIntegrity: true,
        guestTokenStrengthAndHashOnlyStorage: true,
        guestAnswerLookup: true,
        memberOwnershipIsolation: true,
      },
    }),
  );
} finally {
  cleanup();
  database.close();
}

async function verifyHierarchyRace() {
  for (let index = 0; index < 6; index += 1) {
    const group = await adminMutation("POST", {
      resource: "groups",
      input: {
        name: `${runId} 경쟁그룹 ${index}`,
        sortOrder: 99000 + index,
        active: true,
      },
    });
    assert.equal(group.response.status, 201);
    const groupId = group.payload.data.id;
    tracked.groups.push(groupId);
    const [create, remove] = await Promise.all([
      adminMutation("POST", {
        resource: "boards",
        input: {
          groupId,
          slug: `${runId.toLowerCase()}-race-${index}`,
          name: `${runId} 경쟁게시판 ${index}`,
          description: "",
          readLevel: 0,
          writeLevel: 1,
          commentEnabled: true,
          active: true,
          sortOrder: 99000 + index,
        },
      }),
      adminDelete("groups", groupId),
    ]);
    assert.ok(
      (create.response.status === 201 && remove.response.status === 409) ||
        (create.response.status === 400 && remove.response.status === 200),
      `예상하지 못한 경쟁 결과: ${create.response.status}/${remove.response.status}`,
    );
    if (create.response.status === 201) {
      tracked.boards.push(create.payload.data.id);
      const orphan = database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM community_boards b
           LEFT JOIN community_groups g ON g.id = b.group_id
           WHERE b.id = ? AND g.id IS NULL`,
        )
        .get(create.payload.data.id);
      assert.equal(Number(orphan.count), 0);
    }
  }
}

function seedMember(suffix) {
  const id = `${runId.replace(/-/gu, "")}_USER_${suffix}`;
  const loginId = `${runId.replace(/-/gu, "").toLowerCase()}_${suffix.toLowerCase()}`;
  const name = `${runId} 회원${suffix}`;
  database
    .prepare(
      `INSERT INTO users (
        id, login_id, email, password_hash, name, nickname, active
      ) VALUES (?, ?, ?, ?, ?, '', 1)`,
    )
    .run(
      id,
      loginId,
      `${loginId}@example.test`,
      "qa-not-a-login-password",
      name,
    );
  database
    .prepare(
      `INSERT INTO user_session_state (user_id, session_version)
       VALUES (?, 1)`,
    )
    .run(id);
  tracked.users.push(id);
  const body = Buffer.from(
    JSON.stringify({
      userId: id,
      loginId,
      name,
      sessionVersion: 1,
      remember: false,
      expiresAt: Date.now() + 60 * 60 * 1_000,
    }),
  ).toString("base64url");
  const signature = createHmac(
    "sha256",
    qaSessionSecret,
  )
    .update(body)
    .digest("base64url");
  return { id, cookie: `kg_customer=${body}.${signature}` };
}

async function adminMutation(method, body) {
  const response = await fetch(`${adminBase}/api/admin/community`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: adminBase,
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    payload: await response.json().catch(() => ({})),
  };
}

async function adminDelete(resource, id) {
  const response = await fetch(
    `${adminBase}/api/admin/community?resource=${encodeURIComponent(
      resource,
    )}&id=${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { Accept: "application/json", Origin: adminBase },
    },
  );
  return {
    response,
    payload: await response.json().catch(() => ({})),
  };
}

async function publicInquiryPost(pathname, body, ip, cookie = "") {
  const response = await fetch(`${publicBase}${pathname}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: publicBase,
      "CF-Connecting-IP": ip,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    payload: await response.json().catch(() => ({})),
  };
}

function cleanup() {
  const prefixedIds = [];
  for (const [table, column] of [
    ["community_groups", "name"],
    ["community_boards", "name"],
    ["community_posts", "title"],
    ["community_comments", "content"],
    ["one_to_one_inquiries", "title"],
  ]) {
    prefixedIds.push(
      ...database
        .prepare(`SELECT id FROM ${table} WHERE ${column} LIKE ?`)
        .all(`${runId}%`)
        .map((row) => row.id),
    );
  }
  for (const id of tracked.comments) {
    database.prepare("DELETE FROM community_comments WHERE id = ?").run(id);
  }
  for (const id of tracked.posts) {
    database.prepare("DELETE FROM community_posts WHERE id = ?").run(id);
  }
  for (const id of tracked.boards) {
    database.prepare("DELETE FROM community_boards WHERE id = ?").run(id);
  }
  for (const id of tracked.groups) {
    database.prepare("DELETE FROM community_groups WHERE id = ?").run(id);
  }
  for (const id of tracked.inquiries) {
    database.prepare("DELETE FROM one_to_one_inquiries WHERE id = ?").run(id);
  }
  for (const id of tracked.users) {
    database.prepare("DELETE FROM user_session_state WHERE user_id = ?").run(id);
    database.prepare("DELETE FROM users WHERE id = ?").run(id);
  }
  database
    .prepare("DELETE FROM community_comments WHERE content LIKE ?")
    .run(`${runId}%`);
  database
    .prepare("DELETE FROM community_posts WHERE title LIKE ?")
    .run(`${runId}%`);
  database
    .prepare("DELETE FROM community_boards WHERE name LIKE ?")
    .run(`${runId}%`);
  database
    .prepare("DELETE FROM community_groups WHERE name LIKE ?")
    .run(`${runId}%`);
  database
    .prepare("DELETE FROM one_to_one_inquiries WHERE title LIKE ?")
    .run(`${runId}%`);
  database.prepare("DELETE FROM users WHERE name LIKE ?").run(`${runId}%`);
  for (const id of [
    ...tracked.groups,
    ...tracked.boards,
    ...tracked.posts,
    ...tracked.comments,
    ...tracked.inquiries,
  ]) {
    database.prepare("DELETE FROM admin_audit_logs WHERE entity_id = ?").run(id);
  }
  for (const id of prefixedIds) {
    database.prepare("DELETE FROM admin_audit_logs WHERE entity_id = ?").run(id);
  }
  database
    .prepare(
      `DELETE FROM inquiry_rate_limits
       WHERE client_key IN (?, ?, ?)`,
    )
    .run(
      clientKey("203.0.113.171"),
      clientKey("203.0.113.172"),
      clientKey("203.0.113.173"),
    );
  database
    .prepare(
      `DELETE FROM inquiry_lookup_rate_limits
       WHERE client_key = ?`,
    )
    .run(clientKey("203.0.113.171"));

  const residue = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM community_groups WHERE name LIKE ?) +
        (SELECT COUNT(*) FROM community_boards WHERE name LIKE ?) +
        (SELECT COUNT(*) FROM community_posts WHERE title LIKE ?) +
        (SELECT COUNT(*) FROM community_comments WHERE content LIKE ?) +
        (SELECT COUNT(*) FROM one_to_one_inquiries WHERE title LIKE ?) +
        (SELECT COUNT(*) FROM users WHERE name LIKE ?) AS count`,
    )
    .get(
      `${runId}%`,
      `${runId}%`,
      `${runId}%`,
      `${runId}%`,
      `${runId}%`,
      `${runId}%`,
    );
  assert.equal(Number(residue.count), 0, "QA 운영 데이터가 남았습니다.");
}

function clientKey(ip) {
  return createHash("sha256").update(ip).digest("hex");
}

function readEnvValue(fileName, key) {
  try {
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/u)) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/u);
      if (!match || match[1] !== key) continue;
      return match[2].replace(/^['"]|['"]$/gu, "");
    }
  } catch {
    return "";
  }
  return "";
}
