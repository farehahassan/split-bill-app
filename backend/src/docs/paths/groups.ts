import type { PathItemObject, Schema } from "../openapi.types.js";
import { groupIdPathParameter, memberIdPathParameter } from "../components/parameters.js";
import { jsonResponse, componentResponse, successEnvelope } from "../helpers.js";

export const GROUPS_TAG = "Groups";

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const groupData = (schemaName: string) =>
  successEnvelope({
    type: "object",
    properties: { group: ref(schemaName) },
    required: ["group"],
  });

const groupsPaths: Record<string, PathItemObject> = {
  "/api/v1/groups": {
    post: {
      tags: [GROUPS_TAG],
      summary: "Create a group",
      description:
        "Creates a group. The authenticated user becomes the owner and is automatically added as the first member in a single transaction. " +
        "Protected endpoint.",
      operationId: "createGroup",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("CreateGroupRequest"),
            example: { name: "Trip to Naran" },
          },
        },
      },
      responses: {
        201: jsonResponse("The group was created.", groupData("Group"), {
          success: true,
          data: {
            group: {
              id: "550e8400-e29b-41d4-a716-446655440000",
              name: "Trip to Naran",
              createdById: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
              createdAt: "2026-01-15T10:30:00.000Z",
              updatedAt: "2026-01-15T10:30:00.000Z",
            },
          },
        }),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
      },
    },
    get: {
      tags: [GROUPS_TAG],
      summary: "List the user's groups",
      description:
        "Lists every group the authenticated user is a member of, newest first, including each group's member count. " +
        "Returns an empty array when the user belongs to no groups. Protected endpoint.",
      operationId: "listGroups",
      responses: {
        200: jsonResponse(
          "The user's groups.",
          successEnvelope({
            type: "object",
            properties: {
              groups: { type: "array", items: ref("GroupWithMemberCount") },
            },
            required: ["groups"],
          }),
          {
            success: true,
            data: {
              groups: [
                {
                  id: "550e8400-e29b-41d4-a716-446655440000",
                  name: "Trip to Naran",
                  createdById: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                  createdAt: "2026-01-15T10:30:00.000Z",
                  updatedAt: "2026-01-15T10:30:00.000Z",
                  memberCount: 4,
                },
              ],
            },
          },
        ),
        401: componentResponse("Unauthorized"),
      },
    },
  },
  "/api/v1/groups/{id}": {
    get: {
      tags: [GROUPS_TAG],
      summary: "Get a group",
      description:
        "Returns the group's details and full member list. The authenticated user must be a member. " +
        "Group details are served from a cache-aside Redis layer once warm; the response contract is identical on hit and miss. Protected endpoint.",
      operationId: "getGroup",
      parameters: [groupIdPathParameter],
      responses: {
        200: jsonResponse("The group with its members.", groupData("GroupWithMembers"), {
          success: true,
          data: {
            group: {
              id: "550e8400-e29b-41d4-a716-446655440000",
              name: "Trip to Naran",
              createdById: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
              createdAt: "2026-01-15T10:30:00.000Z",
              updatedAt: "2026-01-15T10:30:00.000Z",
              members: [
                {
                  id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                  name: "Ahmed Raza",
                  email: "ahmed@example.com",
                },
                {
                  id: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
                  name: "Sana Malik",
                  email: "sana@example.com",
                },
              ],
            },
          },
        }),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
    put: {
      tags: [GROUPS_TAG],
      summary: "Update a group",
      description:
        "Renames the group. The authenticated user must be the group owner. Renaming invalidates the group's cache entry. Protected endpoint.",
      operationId: "updateGroup",
      parameters: [groupIdPathParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("UpdateGroupRequest"),
            example: { name: "Trip to Hunza" },
          },
        },
      },
      responses: {
        200: jsonResponse("The group was updated.", groupData("Group"), {
          success: true,
          data: {
            group: {
              id: "550e8400-e29b-41d4-a716-446655440000",
              name: "Trip to Hunza",
              createdById: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
              createdAt: "2026-01-15T10:30:00.000Z",
              updatedAt: "2026-01-16T09:00:00.000Z",
            },
          },
        }),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
    delete: {
      tags: [GROUPS_TAG],
      summary: "Delete a group",
      description:
        "Deletes the group and, via the existing database cascade relationships, its memberships, expenses, settlements, activity, and summary. " +
        "The authenticated user must be the group owner. Returns 204 with no body. Protected endpoint.",
      operationId: "deleteGroup",
      parameters: [groupIdPathParameter],
      responses: {
        204: componentResponse("NoContent"),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
  },
  "/api/v1/groups/{id}/members": {
    post: {
      tags: [GROUPS_TAG],
      summary: "Add a group member",
      description:
        "Adds an existing user to the group. The authenticated user must be the group owner. " +
        "Adding a member invalidates the group's cache entry. Protected endpoint.",
      operationId: "addGroupMember",
      parameters: [groupIdPathParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("AddMemberRequest"),
            example: { userId: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f" },
          },
        },
      },
      responses: {
        201: jsonResponse(
          "The member was added.",
          successEnvelope({
            type: "object",
            properties: { member: ref("GroupMember") },
            required: ["member"],
          }),
          {
            success: true,
            data: {
              member: {
                id: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
                groupId: "550e8400-e29b-41d4-a716-446655440000",
                userId: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
                createdAt: "2026-01-16T11:00:00.000Z",
              },
            },
          },
        ),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
        409: componentResponse("Conflict"),
      },
    },
  },
  "/api/v1/groups/{id}/members/{memberId}": {
    delete: {
      tags: [GROUPS_TAG],
      summary: "Remove a group member",
      description:
        "Removes a member from the group. The authenticated user must be the group owner; the owner themselves cannot be removed. " +
        "Returns 204 with no body. Removing a member invalidates the group's cache entry. Protected endpoint.",
      operationId: "removeGroupMember",
      parameters: [groupIdPathParameter, memberIdPathParameter],
      responses: {
        204: componentResponse("NoContent"),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
        409: componentResponse("Conflict"),
      },
    },
  },
};

export default groupsPaths;
