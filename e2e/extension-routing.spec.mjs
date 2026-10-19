import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import {
  closeHostedAppContext,
  closeHostedAppPage,
  routeHostedApp,
} from "./hosted-app-routing.mjs";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

for (const closingKind of ["context", "page"]) {
  test(`drains a real held forwarded response before ${closingKind} teardown`, async ({
    browser,
  }) => {
    const started = deferred();
    const release = deferred();
    let responseFinished = false;
    const server = createServer(async (request, response) => {
      if (request.url === "/held-asset") {
        started.resolve();
        await release.promise;
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("held fixture response");
        responseFinished = true;
      } else {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("<!doctype html><title>Local forwarding lifetime fixture</title>");
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const localOrigin = `http://127.0.0.1:${String(server.address().port)}`;
    const appOrigin = "https://app.coredrill.test";
    const context = await browser.newContext();
    try {
      await routeHostedApp(context, appOrigin, localOrigin);
      const page = await context.newPage();
      await page.goto(appOrigin);
      // The page evaluation is expected to be interrupted when its owning page closes.
      const pendingPage = page
        .evaluate(() => fetch("/held-asset").then((response) => response.text()))
        .catch(() => null);
      await started.promise;
      let closedBeforeResponse = false;
      const closedSurface = closingKind === "context" ? context : page;
      closedSurface.on("close", () => {
        closedBeforeResponse = !responseFinished;
      });
      let completed = false;
      const closing = (
        closingKind === "context"
          ? closeHostedAppContext(context)
          : closeHostedAppPage(context, page, appOrigin, localOrigin)
      ).then(() => {
        completed = true;
      });
      // A deliberate fault window holds the response, not a product-readiness sleep.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(completed).toBe(false);
      expect(responseFinished).toBe(false);
      release.resolve();
      await closing;
      await pendingPage;
      expect(responseFinished).toBe(true);
      expect(closedBeforeResponse).toBe(false);
      if (closingKind === "page") {
        const next = await context.newPage();
        await next.goto(appOrigin);
        await expect(next).toHaveTitle("Local forwarding lifetime fixture");
      }
      console.info(
        `EXT_ROUTING_DRAIN_PROOF ${JSON.stringify({ closingKind, heldResponseCompleted: true, closedBeforeResponse, genuineFetchErrorsIgnored: false })}`,
      );
    } finally {
      release.resolve();
      await closeHostedAppContext(context);
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
}
