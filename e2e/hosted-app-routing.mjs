export const routeHostedApp = (
  context,
  appOrigin = "https://app.coredrill.test",
  localAppOrigin = "http://127.0.0.1:4173",
) =>
  context.route(`${appOrigin}/**`, async (route) => {
    const requested = new URL(route.request().url());
    const response = await route.fetch({
      url: `${localAppOrigin}${requested.pathname}${requested.search}`,
    });
    await route.fulfill({ response });
  });

const closingContexts = new WeakMap();

export const closeHostedAppContext = (context) => {
  const existing = closingContexts.get(context);
  if (existing !== undefined) return existing;
  const closing = (async () => {
    await context.unrouteAll({ behavior: "wait" });
    await context.close();
  })();
  closingContexts.set(context, closing);
  return closing;
};

export const closeHostedAppPage = async (context, page, appOrigin, localAppOrigin) => {
  await context.unrouteAll({ behavior: "wait" });
  await page.close();
  await routeHostedApp(context, appOrigin, localAppOrigin);
};
