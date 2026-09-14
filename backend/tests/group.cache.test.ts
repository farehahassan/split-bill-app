import { describe, it, expect, vi, afterEach } from "vitest";

import { GroupCache, groupCacheKey } from "../src/modules/groups/group.cache.js";
import { RedisCacheStore } from "../src/redis/cacheStore.js";
import type { GroupWithMembers } from "../src/modules/groups/group.repository.js";
import { FakeRedis, FailingRedis } from "./helpers/fakeRedis.js";

function buildGroup(overrides: Partial<GroupWithMembers> = {}): GroupWithMembers {
  return {
    id: "group-1",
    name: "Trip to Naran",
    createdById: "owner-1",
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    updatedAt: new Date("2026-01-02T10:00:00.000Z"),
    members: [
      { id: "u1", name: "Ahmed", email: "ahmed@example.com" },
      { id: "u2", name: "Sana", email: "sana@example.com" },
    ],
    ...overrides,
  };
}

describe("GroupCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a group through Redis and revives Date fields", async () => {
    const cache = new GroupCache(new RedisCacheStore(new FakeRedis()), 300);
    const group = buildGroup();

    await cache.setCachedGroupById("group-1", group);
    const cached = await cache.getCachedGroupById("group-1");

    expect(cached).not.toBeNull();
    expect(cached).toEqual(group);
    expect(cached!.createdAt).toBeInstanceOf(Date);
    expect(cached!.updatedAt).toBeInstanceOf(Date);
    expect(cached!.members).toEqual(group.members);
  });

  it("returns null on a cache miss", async () => {
    const cache = new GroupCache(new RedisCacheStore(new FakeRedis()), 300);

    await expect(cache.getCachedGroupById("group-1")).resolves.toBeNull();
  });

  it("stores the entry under the group cache key with the configured TTL", async () => {
    const store = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
    const cache = new GroupCache(store, 600);

    await cache.setCachedGroupById("group-1", buildGroup());

    expect(store.set).toHaveBeenCalledTimes(1);
    const [key, raw, ttl] = store.set.mock.calls[0];
    expect(key).toBe("cache:group:group-1");
    expect(ttl).toBe(600);
    expect(typeof raw).toBe("string");
    expect(JSON.parse(raw as string)).toMatchObject({
      id: "group-1",
      name: "Trip to Naran",
      createdById: "owner-1",
    });
  });

  it("expires the entry after its configured TTL", async () => {
    const redis = new FakeRedis();
    const cache = new GroupCache(new RedisCacheStore(redis), 5);

    vi.useFakeTimers();
    vi.setSystemTime(0);

    await cache.setCachedGroupById("group-1", buildGroup());
    expect(await cache.getCachedGroupById("group-1")).not.toBeNull();

    vi.setSystemTime(6_000);
    await expect(cache.getCachedGroupById("group-1")).resolves.toBeNull();
  });

  describe("payload validation", () => {
    it.each([
      ["not JSON", "this is not json"],
      ["a JSON array", "[1, 2, 3]"],
      ["a wrong resource id", JSON.stringify({ ...buildGroup(), id: "other-group" })],
      ["missing members", JSON.stringify({ ...buildGroup(), members: undefined })],
      ["a single member", JSON.stringify({ ...buildGroup(), members: "not-an-array" })],
      [
        "invalid member shape",
        JSON.stringify({ ...buildGroup(), members: [{ id: "u1", name: "Ahmed" }] }),
      ],
      ["invalid createdAt", JSON.stringify({ ...buildGroup(), createdAt: "not-a-date" })],
      ["invalid updatedAt", JSON.stringify({ ...buildGroup(), updatedAt: "not-a-date" })],
      ["missing name", JSON.stringify({ ...buildGroup(), name: undefined })],
    ])("treats an invalid cached entry as a miss (%s)", async (_label, raw) => {
      const redis = new FakeRedis();
      redis.store.set(groupCacheKey("group-1"), { value: raw as string, expiresAt: null });
      const cache = new GroupCache(new RedisCacheStore(redis), 300);

      await expect(cache.getCachedGroupById("group-1")).resolves.toBeNull();
    });
  });

  it("invalidates only the targeted group and leaves other entries untouched", async () => {
    const redis = new FakeRedis();
    const cache = new GroupCache(new RedisCacheStore(redis), 300);

    await cache.setCachedGroupById("group-1", buildGroup());
    await cache.setCachedGroupById("group-2", buildGroup({ id: "group-2" }));

    await cache.invalidateGroupCache("group-1");

    await expect(cache.getCachedGroupById("group-1")).resolves.toBeNull();
    await expect(cache.getCachedGroupById("group-2")).resolves.not.toBeNull();
  });

  it("degrades to a miss when the cache read fails", async () => {
    const cache = new GroupCache(new RedisCacheStore(new FailingRedis()), 300);

    await expect(cache.getCachedGroupById("group-1")).resolves.toBeNull();
  });

  it("does not throw when the cache write fails", async () => {
    const cache = new GroupCache(new RedisCacheStore(new FailingRedis()), 300);

    await expect(cache.setCachedGroupById("group-1", buildGroup())).resolves.toBeUndefined();
  });

  it("does not throw when the cache invalidation fails", async () => {
    const cache = new GroupCache(new RedisCacheStore(new FailingRedis()), 300);

    await expect(cache.invalidateGroupCache("group-1")).resolves.toBeUndefined();
  });
});
