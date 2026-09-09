import { APP_ERRORS } from "../../constants/app-errors.js";
import { ForbiddenError, NotFoundError } from "../../errors/app.error.js";
import { ActivityRepository, type ActivityEventRecord } from "./activity.repository.js";

export interface ActivityEventDto {
  id: string;
  groupId: string;
  userId: string;
  type:
    | "EXPENSE_ADDED"
    | "EXPENSE_UPDATED"
    | "EXPENSE_DELETED"
    | "SETTLEMENT_ADDED"
    | "GROUP_CREATED"
    | "GROUP_UPDATED"
    | "MEMBER_ADDED"
    | "MEMBER_REMOVED";
  message: string;
  amountMinorUnits: number | null;
  currencyCode: string | null;
  occurredAt: Date;
  createdAt: Date;
  user: { id: string; name: string; email: string };
}

export interface ActivityFeedPage {
  events: ActivityEventDto[];
  pagination: { page: number; limit: number; total: number };
}

export class ActivityService {
  constructor(private repository: ActivityRepository) {}

  async getGroupActivity(
    requesterId: string,
    groupId: string,
    query: { page: number; limit: number },
  ): Promise<ActivityFeedPage> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const isMember = await this.repository.isGroupMember(groupId, requesterId);
    if (!isMember) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    const { events, total } = await this.repository.findActivityByGroupId(groupId, query);

    return {
      events: events.map((event) => this.toDto(event)),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  private toDto(event: ActivityEventRecord): ActivityEventDto {
    return {
      id: event.id,
      groupId: event.groupId,
      userId: event.userId,
      type: event.type,
      message: event.message,
      amountMinorUnits: event.amountMinorUnits === null ? null : Number(event.amountMinorUnits),
      currencyCode: event.currencyCode,
      occurredAt: event.occurredAt,
      createdAt: event.createdAt,
      user: event.user,
    };
  }
}
