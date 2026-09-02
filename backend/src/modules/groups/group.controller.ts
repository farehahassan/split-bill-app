import type { Request, Response } from "express";

import { HTTP_STATUSES } from "../../constants/http-statuses.js";
import { GroupService } from "./group.service.js";
import { GroupRepository } from "./group.repository.js";

const groupService = new GroupService(new GroupRepository());

export async function createGroup(req: Request, res: Response): Promise<void> {
  const name = (req.body as { name: string }).name;
  const group = await groupService.createGroup(req.userId!, { name });
  res.status(HTTP_STATUSES.CREATED).json({ success: true, data: { group } });
}

export async function getUserGroups(req: Request, res: Response): Promise<void> {
  const groups = await groupService.getUserGroups(req.userId!);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { groups } });
}

export async function getGroupById(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const group = await groupService.getGroupById(req.userId!, groupId);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { group } });
}

export async function updateGroup(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const name = (req.body as { name: string }).name;
  const group = await groupService.updateGroup(req.userId!, groupId, { name });
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { group } });
}

export async function deleteGroup(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  await groupService.deleteGroup(req.userId!, groupId);
  res.status(HTTP_STATUSES.NO_CONTENT).send();
}

export async function addGroupMember(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const userId = (req.body as { userId: string }).userId;
  const member = await groupService.addGroupMember(req.userId!, groupId, userId);
  res.status(HTTP_STATUSES.CREATED).json({ success: true, data: { member } });
}

export async function removeGroupMember(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const memberId = (req.params as { memberId: string }).memberId;
  await groupService.removeGroupMember(req.userId!, groupId, memberId);
  res.status(HTTP_STATUSES.NO_CONTENT).send();
}
