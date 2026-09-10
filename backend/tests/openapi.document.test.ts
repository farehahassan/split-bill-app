import { describe, it, expect } from "vitest";
import { getOpenApiDocument } from "../src/docs/index.js";
import type {
  OpenApiDocument,
  OperationObject,
  PathItemObject,
  Schema,
} from "../src/docs/index.js";

const document = getOpenApiDocument();

const EXPECTED_PATHS = [
  "/health",
  "/health/ready",
  "/metrics",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/groups",
  "/api/v1/groups/{id}",
  "/api/v1/groups/{id}/members",
  "/api/v1/groups/{id}/members/{memberId}",
  "/api/v1/groups/{id}/expenses",
  "/api/v1/expenses/{id}",
  "/api/v1/groups/{id}/balances",
  "/api/v1/groups/{id}/settlements",
  "/api/v1/settlements/{id}",
  "/api/v1/groups/{id}/activity",
  "/api/v1/groups/{id}/summary",
  "/api/v1/groups/{id}/summary/recompute",
];

const PUBLIC_OPERATION_IDS = [
  "getLiveness",
  "getReadiness",
  "getMetrics",
  "registerUser",
  "loginUser",
  "refreshSession",
  "logoutUser",
];

const IMPORTANT_SCHEMAS = [
  "Uuid",
  "DateTime",
  "MinorUnits",
  "User",
  "AuthSession",
  "Group",
  "GroupWithMemberCount",
  "GroupWithMembers",
  "GroupMember",
  "ExpenseSplit",
  "Expense",
  "ExpenseSummary",
  "CreateExpenseRequest",
  "Settlement",
  "CreateSettlementRequest",
  "Balance",
  "ActivityEvent",
  "Pagination",
  "GroupSummary",
  "QueuedJob",
  "ErrorBody",
];

function operations(
  document: OpenApiDocument,
): Array<{ operationId: string; operation: OperationObject }> {
  const result: Array<{ operationId: string; operation: OperationObject }> = [];
  for (const pathItem of Object.values(document.paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const operation = pathItem[method];
      if (operation?.operationId) {
        result.push({ operationId: operation.operationId, operation });
      }
    }
  }
  return result;
}

function collectReferences(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, refs);
    return refs;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.$ref === "string") {
      refs.push(record.$ref);
    }
    for (const key of Object.keys(record)) {
      if (key === "$ref") continue;
      collectReferences(record[key], refs);
    }
  }
  return refs;
}

function resolveDocumentReference(ref: string): boolean {
  if (!ref.startsWith("#/components/")) return false;

  let segment: unknown = document.components;
  for (const part of ref.slice("#/components/".length).split("/")) {
    if (segment === null || typeof segment !== "object") return false;
    segment = (segment as Record<string, unknown>)[part];
    if (segment === undefined) return false;
  }
  return segment !== null && typeof segment === "object";
}

describe("OpenAPI document", () => {
  it("uses OpenAPI 3.0.x with metadata", () => {
    expect(document.openapi).toMatch(/^3\.0\./);
    expect(document.info.title).toBe("Hisab Split Bill API");
    expect(typeof document.info.description).toBe("string");
    expect(document.info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("defines a server and tags", () => {
    expect(document.servers?.length).toBeGreaterThan(0);
    expect(typeof document.servers?.[0]?.url).toBe("string");
    expect(document.tags?.length).toBeGreaterThan(0);
  });

  it("documents every implemented path", () => {
    const actual = Object.keys(document.paths).sort();
    expect(actual).toEqual([...EXPECTED_PATHS].sort());
  });

  it("defines the bearer JWT security scheme and applies it globally", () => {
    const scheme = document.components?.securitySchemes?.bearerAuth;
    expect(scheme).toBeDefined();
    expect(scheme?.type).toBe("http");
    expect(scheme?.scheme).toBe("bearer");
    expect(scheme?.bearerFormat).toBe("JWT");
    expect(document.security).toEqual([{ bearerAuth: [] }]);
  });

  it("exempts public operations from authentication and protects the rest", () => {
    const publicIds = new Set(PUBLIC_OPERATION_IDS);

    for (const { operationId, operation } of operations(document)) {
      if (publicIds.has(operationId)) {
        expect(operation.security, `${operationId} must be public`).toEqual([]);
      } else {
        expect(
          operation.security === undefined ||
            operation.security.every((req) => "bearerAuth" in req),
          `${operationId} must require bearerAuth`,
        ).toBe(true);
      }
    }
  });

  it("declares the important reusable schemas", () => {
    const schemas = document.components?.schemas ?? {};
    for (const name of IMPORTANT_SCHEMAS) {
      expect(schemas[name], `missing component schema ${name}`).toBeDefined();
    }
  });

  it("documents money as integer minor units that are never floats", () => {
    const minorUnits = document.components?.schemas?.MinorUnits as Schema | undefined;
    expect(minorUnits?.type).toBe("integer");
  });

  it("gives every operation a unique id, tags, and at least one response", () => {
    const allOperations = operations(document);
    const ids = allOperations.map(({ operationId }) => operationId);
    expect(new Set(ids).size).toBe(ids.length);

    for (const { operationId, operation } of allOperations) {
      expect(operation.tags?.length, `${operationId} must declare a tag`).toBeGreaterThan(0);
      expect(
        Object.keys(operation.responses).length,
        `${operationId} must declare responses`,
      ).toBeGreaterThan(0);
      for (const status of Object.keys(operation.responses)) {
        expect(status, `${operationId} response ${status} must be a numeric status`).toMatch(
          /^\d{3}$/,
        );
      }
    }
  });

  it("declares `in: path` parameters for every path template variable", () => {
    for (const [path, item] of Object.entries(document.paths)) {
      const variables = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (variables.length === 0) continue;

      const parameterNames = new Set<string>();
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const operation = item[method];
        for (const parameter of operation?.parameters ?? []) {
          if ("$ref" in parameter) continue;
          if (parameter.in === "path") parameterNames.add(parameter.name);
        }
      }

      for (const variable of variables) {
        expect(
          parameterNames.has(variable),
          `path ${path} must declare a path parameter for {${variable}}`,
        ).toBe(true);
      }
    }
  });

  it("requires an Idempotency-Key header on settlement creation", () => {
    const settlementCreate = document.paths["/api/v1/groups/{id}/settlements"]?.post;
    expect(settlementCreate).toBeDefined();

    const parameters = settlementCreate?.parameters ?? [];
    const idempotencyKey = parameters.find(
      (parameter) => "name" in parameter && parameter.name === "Idempotency-Key",
    );

    expect(idempotencyKey).toBeDefined();
    expect("in" in (idempotencyKey ?? {}) && (idempotencyKey as { in?: string }).in).toBe("header");
    expect(
      "required" in (idempotencyKey ?? {}) && (idempotencyKey as { required?: boolean }).required,
    ).toBe(true);
  });

  it("documents pagination parameters for the activity feed", () => {
    const activityFeed = document.paths["/api/v1/groups/{id}/activity"]?.get;
    const parameters = activityFeed?.parameters ?? [];

    const page = parameters.find((parameter) => "name" in parameter && parameter.name === "page");
    const limit = parameters.find((parameter) => "name" in parameter && parameter.name === "limit");

    expect(page && "name" in page).toBe(true);
    expect(limit && "name" in limit).toBe(true);
  });

  it("resolves every $ref in the document", () => {
    const unresolved = collectReferences(document).filter((ref) => !resolveDocumentReference(ref));
    expect(unresolved).toEqual([]);
  });

  it("uses no floating-point types for money", () => {
    const documentJson = JSON.stringify(document);
    expect(documentJson).not.toContain('"type":"number"');
  });
});

describe("Path item structure", () => {
  it("declares only the HTTP methods the backend implements", () => {
    const allowedMethods = new Set(["get", "post", "put", "delete"]);
    for (const item of Object.values(document.paths)) {
      const methods = (Object.keys(item) as Array<keyof PathItemObject>).filter(
        (key) => key !== "summary" && key !== "description" && key !== "parameters",
      );
      for (const method of methods) {
        expect(allowedMethods.has(method), `unexpected path item key ${method}`).toBe(true);
      }
    }
  });
});
