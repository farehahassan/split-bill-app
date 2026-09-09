import { describe, expect, it } from "vitest";

import { loadEnv } from "../../src/config/env.js";
import { groupCacheKey, GroupCache } from "../../src/modules/groups/group.cache.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { GroupService } from "../../src/modules/groups/group.service.js";
import { testRedisClient } from "./helpers/redis.js";
import { addTestMember, createTestGroup, createTestUser } from "./helpers/fixtures.js";

const service = new GroupService(new GroupRepository());

// The TTL (ms) the GroupCache applies, mirroring its env-driven default.
const groupTtlMs = loadEnv().CACHE_GROUP_TTL_SECONDS * 1000;

describe("group cache (Redis)", () => {
  it("caches group details on the first read and serves subsequent reads from Redis", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(owner.id, { name: "Cache Me" });
    await addTestMember(group.id, member.id);

    const key = groupCacheKey(group.id);
    expect(await testRedisClient().get(key)).toBeNull(); // cold cache

    const first = await service.getGroupById(owner.id, group.id);
    expect(first.name).toBe("Cache Me");

    const cachedRaw = await testRedisClient().get(key);
    expect(cachedRaw).not.toBeNull();
    const parsed = JSON.parse(cachedRaw!);
    expect(parsed.id).toBe(group.id);
    expect(parsed.name).toBe("Cache Me");
    expect(parsed.members.map((m: { id: string }) => m.id).sort()).toEqual(
      [owner.id, member.id].sort(),
    );

    // The entry carries the configured TTL (ms) from the cache store.
    const ttl = await testRedisClient().pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(groupTtlMs);

    // A second read is served by the populated entry.
    const second = await service.getGroupById(owner.id, group.id);
    expect(second.id).toBe(group.id);
  });

  it("invalidates the Redis entry after a rename", async () => {
    const owner = await createTestUser();
    const group = await createTestGroup(owner.id, { name: "Old Name" });
    const key = groupCacheKey(group.id);

    await service.getGroupById(owner.id, group.id);
    expect(await testRedisClient().get(key)).not.toBeNull();

    await service.updateGroup(owner.id, group.id, { name: "New Name" });
    expect(await testRedisClient().get(key)).toBeNull();

    const recreated = await service.getGroupById(owner.id, group.id);
    expect(recreated.name).toBe("New Name");
    expect(await testRedisClient().get(key)).not.toBeNull();
  });

  it("treats a corrupted cache entry as a miss and repopulates it", async () => {
    const owner = await createTestUser();
    const group = await createTestGroup(owner.id, { name: "Corruptible" });
    const key = groupCacheKey(group.id);

    await testRedisClient().set(key, "{ this is not valid json");
    await service.getGroupById(owner.id, group.id);

    const refreshed = await testRedisClient().get(key);
    expect(refreshed).not.toBeNull();
    expect(JSON.parse(refreshed!).name).toBe("Corruptible");
  });

  it("discards an entry that belongs to a different group id (key/group mismatch)", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const group = await createTestGroup(owner.id, { name: "Real Data" });

    // A "borrowed" entry that claims to be the OTHER group.
    await testRedisClient().set(
      groupCacheKey(group.id),
      JSON.stringify({
        id: other.id,
        name: "Impostor",
        createdById: other.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        members: [],
      }),
    );

    const read = await service.getGroupById(owner.id, group.id);
    expect(read.name).toBe("Real Data");
    expect(read.id).toBe(group.id);

    // The valid read repopulated the entry with the correct group.
    expect(JSON.parse((await testRedisClient().get(groupCacheKey(group.id)))!).id).toBe(group.id);
  });

  it("stored cache entries expose only the safe public member fields", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(owner.id);
    await addTestMember(group.id, member.id);

    await service.getGroupById(owner.id, group.id);
    const parsed = JSON.parse((await testRedisClient().get(groupCacheKey(group.id)))!);

    for (const cachedMember of parsed.members) {
      expect(Object.keys(cachedMember).sort()).toEqual(["email", "id", "name"]);
    }
    const cache = new GroupCache(); // exercises the adapter's delete path against real Redis
    await cache.invalidateGroupCache(group.id);
    expect(await testRedisClient().get(groupCacheKey(group.id))).toBeNull();
  });
});