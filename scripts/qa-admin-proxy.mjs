import http from "node:http";

const upstream = new URL(process.env.QA_UPSTREAM || "http://localhost:4173");
const listenPort = Number(process.env.QA_PROXY_PORT || 4174);
const username = process.env.QA_ADMIN_USERNAME;
const password = process.env.QA_ADMIN_PASSWORD;

if (!username || !password) {
  throw new Error(
    "QA_ADMIN_USERNAME과 QA_ADMIN_PASSWORD 환경변수가 필요합니다.",
  );
}

const loginResponse = await fetch(new URL("/api/admin/session", upstream), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: upstream.origin,
  },
  body: JSON.stringify({ username, password }),
});

if (!loginResponse.ok) {
  throw new Error(`관리자 QA 프록시 로그인 실패: HTTP ${loginResponse.status}`);
}

const setCookie = loginResponse.headers.get("set-cookie");
const sessionCookie = setCookie?.split(";", 1)[0];
if (!sessionCookie) {
  throw new Error("관리자 QA 세션 쿠키를 받지 못했습니다.");
}

const server = http.createServer((request, response) => {
  const target = new URL(request.url || "/", upstream);
  const headers = {
    ...request.headers,
    host: upstream.host,
    cookie: sessionCookie,
  };
  if (headers.origin) headers.origin = upstream.origin;
  if (headers.referer) {
    headers.referer = String(headers.referer).replace(
      `http://localhost:${listenPort}`,
      upstream.origin,
    );
  }
  delete headers["accept-encoding"];
  delete headers["content-length"];

  const proxyRequest = http.request(
    target,
    {
      method: request.method,
      headers,
    },
    (proxyResponse) => {
      const responseHeaders = { ...proxyResponse.headers };
      delete responseHeaders["set-cookie"];
      if (responseHeaders.location) {
        responseHeaders.location = String(responseHeaders.location).replace(
          upstream.origin,
          `http://localhost:${listenPort}`,
        );
      }
      response.writeHead(proxyResponse.statusCode || 502, responseHeaders);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    response.end(`QA proxy error: ${error.message}`);
  });
  request.pipe(proxyRequest);
});

server.listen(listenPort, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      ok: true,
      pid: process.pid,
      url: `http://localhost:${listenPort}/adm`,
    }),
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
