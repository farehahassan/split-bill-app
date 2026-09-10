import type {
  MediaTypeObject,
  ReferenceObject,
  ResponseObject,
  Schema,
  SchemaObject,
} from "./openapi.types.js";

/**
 * Builders that keep the per-path operations concise and consistent: every
 * endpoint returns the same `{ success: true, data }` envelope and error
 * references reuse one shared component.
 */

export function reference(target: string): ReferenceObject {
  return { $ref: `#/components/${target}` };
}

/** The `{ success: true, data }` envelope wrapping a data schema. */
export function successEnvelope(data: Schema): SchemaObject {
  return {
    type: "object",
    properties: {
      success: { type: "boolean", enum: [true], description: "Always true for success responses." },
      data,
    },
    required: ["success", "data"],
  };
}

export function jsonContent(schema: Schema, example?: unknown): MediaTypeObject {
  return {
    schema,
    ...(example === undefined ? {} : { example }),
  };
}

/** A success response as a media-type object containing the envelope schema. */
export function jsonResponse(
  description: string,
  schema: Schema,
  example?: unknown,
): ResponseObject {
  return {
    description,
    content: {
      "application/json": jsonContent(schema, example),
    },
  };
}

/** A reference to a shared component response (the error responses). */
export function componentResponse(componentName: string): ReferenceObject {
  return reference(`responses/${componentName}`);
}
