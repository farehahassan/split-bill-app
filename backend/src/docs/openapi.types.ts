/**
 * Minimal OpenAPI 3.0.x type shapes used to write the API contract in
 * TypeScript. The full specification is much larger; only the subset the
 * documentation actually uses is declared here so the document stays
 * type-checked without pulling in a dedicated OpenAPI library.
 */

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options" | "trace";

export interface ReferenceObject {
  $ref: string;
}

export interface SchemaObject {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  format?: string;
  description?: string;
  enum?: Array<string | number | boolean>;
  items?: SchemaObject | ReferenceObject;
  properties?: Record<string, SchemaObject | ReferenceObject>;
  required?: string[];
  additionalProperties?: boolean;
  nullable?: boolean;
  example?: unknown;
  default?: unknown;
  allOf?: Array<SchemaObject | ReferenceObject>;
  oneOf?: Array<SchemaObject | ReferenceObject>;
  anyOf?: Array<SchemaObject | ReferenceObject>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
}

export type Schema = SchemaObject | ReferenceObject;

export interface MediaTypeObject {
  schema?: Schema;
  example?: unknown;
}

export interface ParameterObject {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: Schema;
  example?: unknown;
}

export interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content: Record<string, MediaTypeObject>;
}

export interface ResponseObject {
  description: string;
  content?: Record<string, MediaTypeObject>;
}

export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Array<ParameterObject | ReferenceObject>;
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject | ReferenceObject>;
  security?: Array<Record<string, string[]>>;
}

export interface PathItemObject {
  summary?: string;
  description?: string;
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
}

export interface SecuritySchemeObject {
  type: "http" | "apiKey" | "oauth2" | "openIdConnect";
  description?: string;
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: string;
}

export interface ComponentsObject {
  schemas?: Record<string, SchemaObject>;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  parameters?: Record<string, ParameterObject | ReferenceObject>;
  securitySchemes?: Record<string, SecuritySchemeObject>;
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, PathItemObject>;
  components?: ComponentsObject;
  security?: Array<Record<string, string[]>>;
}
