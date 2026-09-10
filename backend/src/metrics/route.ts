import type { Request } from "express";

/**
 * Label used for requests that never matched an Express route (404s, CORS
 * preflights, malformed bodies rejected before routing). Raw URLs are never
 * used as labels, so unknown paths collapse onto this single bounded series
 * instead of allowing unauthenticated clients to grow the metrics cardinality.
 */
export const UNMATCHED_ROUTE = "unmatched";

interface ExpressRoute {
  path?: string;
}

interface ExpressLayer {
  name?: string;
  path?: string;
  route?: ExpressRoute;
  handle?: { stack?: ExpressLayer[] };
}

interface ExpressApp {
  _router?: { stack?: ExpressLayer[] };
}

/**
 * Resolves the normalized, low-cardinality route template for a request, e.g.
 * `/api/v1/groups/:id` for `GET /api/v1/groups/123`.
 *
 * The template must be built during handling because Express restores
 * `req.baseUrl` to its outermost value once a router unwinds: inside a
 * `finish` listener a nested route only exposes its innermost segment
 * (`/:id`), which is ambiguous across modules. The matched `req.route` object,
 * however, stays attached, so we walk the application router stack to recover
 * the full mount prefix (`/api/v1/groups`) and combine it with the route
 * pattern. Individual IDs and query strings never appear.
 *
 * When no route matched (e.g. a 404) or the structure cannot be resolved, the
 * bounded {@link UNMATCHED_ROUTE} label is used instead of the raw path.
 */
export function resolveRouteTemplate(req: Request): string {
  const route = (req as { route?: ExpressRoute }).route;
  if (!route || typeof route.path !== "string" || route.path === "") {
    return UNMATCHED_ROUTE;
  }

  const app = req.app as ExpressApp | undefined;
  const matchedPrefix = findMountPrefix(app?._router?.stack, route, "");

  let template = `${matchedPrefix ?? req.baseUrl ?? ""}${route.path}`;
  if (template.length > 1 && template.endsWith("/")) {
    template = template.slice(0, -1);
  }
  return template;
}

/**
 * Finds the concatenated mount path that leads to the given route by walking
 * the Express router stack. Router layers carry a static `path` mount prefix
 * and a nested `handle.stack`; the route layer whose `route` matches the
 * request's route terminates the search. Returns `null` when the structure is
 * not understandable (e.g. regexp mounts), so the caller can fall back.
 */
function findMountPrefix(
  stack: readonly ExpressLayer[] | undefined,
  target: ExpressRoute,
  prefix: string,
): string | null {
  if (!stack) return null;

  for (const layer of stack) {
    if (layer.route === target) return prefix;

    if (!layer.route && layer.name === "router" && layer.handle?.stack) {
      if (typeof layer.path === "string") {
        const inner = findMountPrefix(layer.handle.stack, target, `${prefix}${layer.path}`);
        if (inner !== null) return inner;
      }
    }
  }

  return null;
}
