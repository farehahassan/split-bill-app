import { describe, it, expect, vi, beforeEach } from "vitest";

import { ActivityService } from "../src/modules/activity/activity.service.js";
import { ActivityRepository } from "../src/modules/activity/activity.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

vi.mock("../src/modules/activity/activity.repository.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/modules/activity/activity.repository.js")
  >("../src/modules/activity/activity.repository.js");
  return {
    ...actual,
    ActivityRepository: vi.fn(() => ({
      findGroupById: vi.fn(),
      isGroupMember: vi.fn(),
      findActivityByGroupId: vi.fn(),
    })),
  };
});

const repository = vi.mocked(new ActivityRepository());

function makeService(): ActivityService {
  return new ActivityService(repository);
}

const group = { id: "group-1", name: "Trip to Naran", createdById: "owner-1" };

function storedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    groupId: "group-1",
    userId: "alice",
    type: "EXPENSE_ADDED" as const,
    message: 'added the expense "Dinner"',
    amountMinorUnits: 1000n,
    currencyCode: "PKR",
    occurredAt: new Date("2026-01-02T00:00:00Z"),
    createdAt: new Date("2026-01-02T00:00:00Z"),
    user: { id: "alice", name: "Alice", email: "alice@example.com" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ActivityService.getGroupActivity", () => {
  it("returns one page of events with safe user info for a member", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.isGroupMember.mockResolvedValue(true);
    repository.findActivityByGroupId.mockResolvedValue({
      events: [storedEvent()],
      total: 1,
    });

    const service = makeService();
    const result = await service.getGroupActivity("alice", "group-1", {
      page: 1,
      limit: 20,
    });

    expect(repository.findActivityByGroupId).toHaveBeenCalledWith("group-1", {
      page: 1,
      limit: 20,
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1 });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      id: "event-1",
      groupId: "group-1",
      userId: "alice",
      type: "EXPENSE_ADDED",
      message: 'added the expense "Dinner"',
      amountMinorUnits: 1000,
      currencyCode: "PKR",
      occurredAt: new Date("2026-01-02T00:00:00Z"),
      createdAt: new Date("2026-01-02T00:00:00Z"),
      user: { id: "alice", name: "Alice", email: "alice@example.com" },
    });
  });

  it("converts nullable bigint amounts to null", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.isGroupMember.mockResolvedValue(true);
    repository.findActivityByGroupId.mockResolvedValue({
      events: [
        storedEvent({
          type: "GROUP_CREATED",
          message: "created the group",
          amountMinorUnits: null,
          currencyCode: null,
        }),
      ],
      total: 1,
    });

    const service = makeService();
    const result = await service.getGroupActivity("alice", "group-1", {
      page: 1,
      limit: 20,
    });

    expect(result.events[0].amountMinorUnits).toBeNull();
    expect(result.events[0].currencyCode).toBeNull();
  });

  it("passes the requested page and limit through to the repository", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.isGroupMember.mockResolvedValue(true);
    repository.findActivityByGroupId.mockResolvedValue({ events: [], total: 0 });

    const service = makeService();
    await service.getGroupActivity("alice", "group-1", { page: 3, limit: 10 });

    expect(repository.findActivityByGroupId).toHaveBeenCalledWith("group-1", {
      page: 3,
      limit: 10,
    });
  });

  it("throws NOT_FOUND when the group does not exist", async () => {
    repository.findGroupById.mockResolvedValue(null);

    const service = makeService();
    await expect(
      service.getGroupActivity("alice", "missing", { page: 1, limit: 20 }),
    ).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
    expect(repository.isGroupMember).not.toHaveBeenCalled();
    expect(repository.findActivityByGroupId).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the user is not a member (IDOR guard)", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.isGroupMember.mockResolvedValue(false);

    const service = makeService();
    await expect(
      service.getGroupActivity("outsider", "group-1", { page: 1, limit: 20 }),
    ).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.findActivityByGroupId).not.toHaveBeenCalled();
  });
});
