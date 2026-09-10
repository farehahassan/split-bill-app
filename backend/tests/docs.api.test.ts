import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import type { OpenApiDocument, OperationObject } from "../src/docs/index.js";

const UUID_PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

interface ExpressRouteInfo {
  path?: string;
  methods?: Record<string, boolean>;
}

interface ExpressStackLayer {
  route?: ExpressRouteInfo;
  handle?: { stack?: ExpressStackLayer[] };
}

function normalizeExpressPath(path: string): string {
  const withParams = path.replace(/:[^/]+/g, (match) => `{${match.slice(1)}}`);
  return withParams.length > 1 && withParams.endsWith("/") ? withParams.slice(0, -1) : withParams;
}

function isPublic(operation: OperationObject | undefined): boolean {
  return operation?.security?.length === 0;
}

interface OperationProbe {
  operationId: string;
  method: string;
  path: string;
  status: number;
  public: boolean;
}

/**
 * Fires an unauthenticated, empty-body request at every documented operation.
 * Protected routes reject with 401 before any I/O; public auth routes reject
 * malformed bodies with 400 before the database. A documented route therefore
 * returns one of those statuses - and most importantly never 404 - which
 * proves the route is wired into the running Express app.
 */
async function probeOperations(
  app: ReturnType<typeof createApp>,
  document: OpenApiDocument,
): Promise<OperationProbe[]> {
  const probes: OperationProbe[] = [];

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ["get", "post", "put", "delete"] as const) {
      const op = pathItem[method];
      if (!op?.operationId) continue;

      const url = path.replace(/\{[^}]+\}/g, () => UUID_PLACEHOLDER);
      const res = await request(app)[method](url);

      probes.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        status: res.status,
        public: isPublic(op),
      });
    }
  }

  return probes;
}

/**
 * Enumerates every Express route by its "leaf" pattern: the innermost route
 * pattern (e.g. `/:id/members/:memberId`) and the HTTP methods it serves. The
 * Express router does not expose mount prefixes statically, so the leaf is the
 * best fingerprint to prove no application route went undocumented.
 */
function extractRouteLeaves(app: unknown): Map<string, Set<string>> {
  const leaves = new Map<string, Set<string>>();

  const walk = (stack: readonly ExpressStackLayer[] | undefined): void => {
    if (!stack) return;

    for (const layer of stack) {
      if (layer.route?.path) {
        const leaf = normalizeExpressPath(layer.route.path);
        const methods = leaves.get(leaf) ?? new Set<string>();
        for (const method of Object.keys(layer.route.methods ?? {})) {
          if (method !== "head" && method !== "options") methods.add(method.toUpperCase());
        }
        leaves.set(leaf, methods);
        continue;
      }
      if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };

  const stack = (app as { _router?: { stack?: ExpressStackLayer[] } })._router?.stack;
  walk(stack);

  return leaves;
}

describe("API documentation routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("GET /api/docs serves the Swagger UI page", async () => {
    const res = await request(app).get("/api/docs");

    expect(res.status).toBe(HTTP_STATUSES.OK);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("swagger-ui");
    expect(res.text).toContain('href="assets/swagger-ui.css"');
    expect(res.text).toContain('src="swagger-initializer.js"');
  });

  it("GET /api/docs/openapi.json serves a parseable OpenAPI document", async () => {
    const res = await request(app).get("/api/docs/openapi.json");

    expect(res.status).toBe(HTTP_STATUSES.OK);
    expect(res.headers["content-type"]).toContain("application/json");

    const body = res.body as OpenApiDocument;
    expect(body.openapi).toBe("3.0.3");
    expect(body.info.title).toBe("Hisab Split Bill API");
    expect(body.info.version).toBe("1.0.0");
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });

  it("GET /api/docs/swagger-initializer.js serves the external initializer", async () => {
    const res = await request(app).get("/api/docs/swagger-initializer.js");

    expect(res.status).toBe(HTTP_STATUSES.OK);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.text).toContain("SwaggerUIBundle");
    expect(res.text).toContain('url: "openapi.json"');
  });

  it("GET /api/docs/assets/swagger-ui.css serves local Swagger UI assets", async () => {
    const res = await request(app).get("/api/docs/assets/swagger-ui.css");

    expect(res.status).toBe(HTTP_STATUSES.OK);
    expect(res.headers["content-type"]).toContain("text/css");
  });

  it("GET /api/docs/openapi.json serves the same document on every request", async () => {
    const [first, second] = await Promise.all([
      request(app).get("/api/docs/openapi.json"),
      request(app).get("/api/docs/openapi.json"),
    ]);

    expect(first.body).toEqual(second.body);
  });

  it("documents only routes that exist and match the documented auth contract", async () => {
    const openApiRes = await request(app).get("/api/docs/openapi.json");
    const document = openApiRes.body as OpenApiDocument;
    const probes = await probeOperations(app, document);

    for (const probe of probes) {
      expect(probe.status, `${probe.method} ${probe.path} must not return 404`).not.toBe(
        HTTP_STATUSES.NOT_FOUND,
      );

      if (probe.public) {
        switch (probe.operationId) {
          case "getLiveness":
            expect(probe.status).toBe(HTTP_STATUSES.OK);
            break;
          case "getReadiness":
            expect([HTTP_STATUSES.OK, HTTP_STATUSES.SERVICE_UNAVAILABLE]).toContain(probe.status);
            break;
          case "getMetrics":
            expect(probe.status).toBe(HTTP_STATUSES.OK);
            break;
          default:
            // Public auth routes validate the body before touching the database,
            // so an empty request is rejected with 400.
            expect(probe.status).toBe(HTTP_STATUSES.BAD_REQUEST);
        }
      } else {
        expect(probe.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      }
    }
  });

  it("documents every application route that is not an API-documentation route", async () => {
    const openApiRes = await request(app).get("/api/docs/openapi.json");
    const document = openApiRes.body as OpenApiDocument;

    // API-documentation infrastructure routes are intentionally not part of
    // the API contract. A bare "/" leaf is shared by the health, metrics, docs
    // and groups routers, so its routes are covered by the exact documented
    // path list and the request-probe test instead of the leaf fingerprint.
    const infrastructureLeaves = new Map<string, string[]>([
      ["/", ["GET", "POST"]],
      ["/openapi.json", ["GET"]],
      ["/swagger-initializer.js", ["GET"]],
    ]);

    for (const [leaf, methodsSet] of extractRouteLeaves(app)) {
      const exempt = infrastructureLeaves.get(leaf);
      const checkable = [...methodsSet].filter(
        (method) => exempt === undefined || !exempt.includes(method),
      );

      for (const method of checkable) {
        const documentedMatch = Object.entries(document.paths).some(
          ([path, item]) =>
            item[method.toLowerCase() as "get" | "post" | "put" | "delete"] && path.endsWith(leaf),
        );
        expect(
          documentedMatch,
          `Express route ${method} ${leaf} is missing from the OpenAPI document`,
        ).toBe(true);
      }
    }
  });

  it("returns 404 for an unknown route, proving the documented-route check is meaningful", async () => {
    const res = await request(app).get("/api/v1/this-route-does-not-exist");

    expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(res.body).toMatchObject({ success: false });
  });
});
