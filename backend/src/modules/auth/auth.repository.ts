import type { User } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, name: user.name, email: user.email };
}

export class AuthRepository {
  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async create(data: CreateUserData): Promise<AuthUser> {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
      },
    });
    return toAuthUser(user);
  }
}
