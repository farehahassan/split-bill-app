import { loadEnv } from "../../config/env.js";
import { getRedis } from "../../redis/redisClient.js";
import { RedisCacheStore, type CacheStore } from "../../redis/cacheStore.js";
import { METRIC, METRIC_LABEL, metrics } from "../../metrics/registry.js";
import { logger } from "../../utils/logger.js";
import type { GroupWithMembers, GroupMemberUser } from "./group.repository.js";

/**
 * Cache key convention for group details. Namespaced under `cache:` (the
 * prefix shared by all cache entries), carrying the resource type (`group`)
 * and the group's id so different resource types can never collide. The id is
 * the validated non-empty path parameter from the routes; keys are only ever
 * built from this template, never from user-controlled arbitrary prefixes.
 */
export function groupCacheKey(groupId: string): string {
  return `cache:group:${groupId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Cache-aside adapter for group details. `GET /groups/:id` is a frequent,
 * relatively stable read (group name, owner, and membership list), so the fully
 * authorized read result is stored under the group-scoped key
 * `cache:group:{groupId}` and served straight from Redis on subsequent reads,
 * skipping the membership-expanding PostgreSQL query.
 *
 * Safety model:
 * - Cached data is **group-scoped, never user-scoped**: the same entry is
 *   served to every member, and the service authorizes membership *before*
 *   returning it. A cache hit can never bypass authorization — it only skips
 *   the group query, never the membership check.
 * - No credentials, tokens, hashes, or Authorization headers are ever stored.
 *   Members' names and emails are the same fields the group detail endpoint
 *   already returns to authorized members.
 *
 * Failure policy — Redis is a performance layer, not a correctness barrier:
 * - Read failure → logged and treated as a miss; the caller falls back to
 *   PostgreSQL.
 * - Write (populate) failure → logged; the authoritative database result is
 *   still returned.
 * - Invalidation failure → logged; stale data may be served until the TTL
 *   expires (the invalidation can never fail an already-successful write).
 *
 * Raw Redis errors never escape this adapter, so they can never reach clients.
 */
export class GroupCache {
  private readonly ttlSeconds: number;

  constructor(
    private readonly store: CacheStore = new RedisCacheStore(getRedis()),
    ttlSeconds: number = loadEnv().CACHE_GROUP_TTL_SECONDS,
  ) {
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Returns the cached group when a valid entry exists, `null` on a miss or a
   * Redis failure (both take the safe path of reading from PostgreSQL).
   */
  async getCachedGroupById(groupId: string): Promise<GroupWithMembers | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(groupCacheKey(groupId));
    } catch (error) {
      metrics.increment(METRIC.cacheFailuresTotal, {
        [METRIC_LABEL.operation]: "get",
      });
      logger.warn("Group cache read failed; falling back to the database", {
        resourceType: "group",
        resourceId: groupId,
        error: errorMessage(error),
      });
      return null;
    }

    if (raw === null) return null;

    const cached = this.deserialize(raw, groupId);
    if (cached === null) {
      logger.warn("Discarding an invalid group cache entry", {
        resourceType: "group",
        resourceId: groupId,
      });
    }
    return cached;
  }

  /**
   * Stores a group for `CACHE_GROUP_TTL_SECONDS`. Best-effort: a failed write
   * is logged and the caller keeps serving the database result.
   */
  async setCachedGroupById(groupId: string, group: GroupWithMembers): Promise<void> {
    try {
      await this.store.set(groupCacheKey(groupId), this.serialize(group), this.ttlSeconds);
    } catch (error) {
      metrics.increment(METRIC.cacheFailuresTotal, {
        [METRIC_LABEL.operation]: "set",
      });
      logger.warn("Group cache write failed; the database result is still authoritative", {
        resourceType: "group",
        resourceId: groupId,
        error: errorMessage(error),
      });
    }
  }

  /**
   * Removes a group's cache entry. Called after every database write that can
   * change the group detail (rename, delete, member add/remove). Best-effort:
   * a failed deletion is logged and stale data is bounded by the TTL.
   */
  async invalidateGroupCache(groupId: string): Promise<void> {
    try {
      await this.store.delete(groupCacheKey(groupId));
    } catch (error) {
      metrics.increment(METRIC.cacheFailuresTotal, {
        [METRIC_LABEL.operation]: "delete",
      });
      logger.warn(
        "Group cache invalidation failed; stale data may be served until the TTL expires",
        {
          resourceType: "group",
          resourceId: groupId,
          error: errorMessage(error),
        },
      );
    }
  }

  private serialize(group: GroupWithMembers): string {
    return JSON.stringify({
      id: group.id,
      name: group.name,
      createdById: group.createdById,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      members: group.members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
      })),
    });
  }

  /**
   * Parses and validates a stored entry, reviving ISO date strings back into
   * `Date` instances. Anything that does not match the known shape (corrupt,
   * tampered, stale schema) is treated as a miss so the caller re-reads from
   * the authoritative store and repopulates the entry.
   */
  private deserialize(raw: string, groupId: string): GroupWithMembers | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return null;
      if (parsed.id !== groupId) return null;
      if (
        typeof parsed.name !== "string" ||
        typeof parsed.createdById !== "string" ||
        !Array.isArray(parsed.members)
      ) {
        return null;
      }

      const createdAt = toDate(parsed.createdAt);
      const updatedAt = toDate(parsed.updatedAt);
      if (!createdAt || !updatedAt) return null;

      const members: (GroupMemberUser | null)[] = (parsed.members as unknown[]).map((member) => {
        if (!isRecord(member)) return null;
        if (
          typeof member.id !== "string" ||
          typeof member.name !== "string" ||
          typeof member.email !== "string"
        ) {
          return null;
        }
        return { id: member.id, name: member.name, email: member.email };
      });
      if (members.some((member) => member === null)) return null;

      return {
        id: parsed.id,
        name: parsed.name,
        createdById: parsed.createdById,
        createdAt,
        updatedAt,
        members: members as GroupMemberUser[],
      };
    } catch {
      // JSON.parse failure (e.g. partial write) — treat as a miss.
      return null;
    }
  }
}
