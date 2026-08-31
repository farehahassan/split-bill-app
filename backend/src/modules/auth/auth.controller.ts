import type { Request, Response } from "express";

import { HTTP_STATUSES } from "../../constants/http-statuses.js";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./auth.repository.js";

const authService = new AuthService(new AuthRepository());

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body as {
    name: string;
    email: string;
    password: string;
  };
  const result = await authService.register({ name, email, password });
  res.status(HTTP_STATUSES.CREATED).json({ success: true, data: result });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authService.login({ email, password });
  res.status(HTTP_STATUSES.OK).json({ success: true, data: result });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe(req.userId!);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { user } });
}
