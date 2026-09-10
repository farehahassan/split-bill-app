import type { ZodType } from "zod";

import { groupSummaryRegistration } from "../modules/summary/summary.jobs.js";
import type { JobEnvelope, JobType } from "./job.types.js";

/**
 * A job type's validation + execution handlers. `schema` is a Zod schema used
 * by the worker to validate the payload of a claimed job before any processing
 * happens; `process` performs the application-level work through the service
 * layer.
 */
export interface JobRegistration {
  type: JobType;
  schema: ZodType;
  process: (job: JobEnvelope) => Promise<void>;
}

/**
 * Explicit registry of every background job type the worker can run. Keyed by
 * the `JobType` union, so:
 * - TypeScript rejects a registry that omits a declared job type;
 * - dispatch is a plain object lookup (`registry[type]`), never a dynamic
 *   import or evaluation of user-controlled input;
 * - unknown types cannot select an arbitrary code path.
 */
export type JobRegistry = Record<JobType, JobRegistration>;

export const jobRegistry: JobRegistry = {
  [groupSummaryRegistration.type]: groupSummaryRegistration,
};
