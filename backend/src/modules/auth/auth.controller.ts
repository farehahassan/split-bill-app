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

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await authService.refresh(refreshToken);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: result });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await authService.logout(refreshToken);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: result });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe(req.userId!);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { user } });
}

export async function updateCurrentUser(req: Request, res: Response): Promise<void> {
  const body = req.body as { name?: string; email?: string };
  const user = await authService.updateCurrentUser(req.userId!, {
    name: body.name,
    email: body.email,
  });
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { user } });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.body as { token: string };
  const result = await authService.verifyEmailAddress(token);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: result });
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  const result = await authService.resendVerification(email);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: result });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  const result = await authService.requestPasswordReset(email);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: result });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  const result = await authService.resetUserPassword({ token, newPassword });
  res.status(HTTP_STATUSES.OK).json({ success: true, data: result });
}
