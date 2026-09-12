import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { createAccessToken, hashPassword, verifyPassword } from "./auth.security.js";

const LEGACY_USER_ID = "legacy";
const LEGACY_EMAIL = "__legacy__@daymark.local";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private view(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private result(user: User) {
    return { accessToken: createAccessToken(user.id), user: this.view(user) };
  }

  async signup(input: { fullName: string; email: string; password: string }) {
    const email = this.normalizeEmail(input.email);
    if (email === LEGACY_EMAIL) throw new BadRequestException("Choose a different email address");

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("An account with this email already exists");

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: input.fullName.trim(),
          email,
          passwordHash: hashPassword(input.password),
        },
      });

      const legacy = await tx.user.findUnique({ where: { id: LEGACY_USER_ID } });
      if (legacy) {
        await tx.goal.updateMany({ where: { userId: LEGACY_USER_ID }, data: { userId: created.id } });
        await tx.appSettings.updateMany({ where: { userId: LEGACY_USER_ID }, data: { userId: created.id } });
        await tx.user.delete({ where: { id: LEGACY_USER_ID } });
      }

      return created;
    });

    return this.result(user);
  }

  async login(input: { email: string; password: string }) {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.result(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.id === LEGACY_USER_ID) throw new NotFoundException("Account not found");
    return this.view(user);
  }

  async updateProfile(userId: string, input: { fullName?: string; email?: string }) {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw new NotFoundException("Account not found");

    const email = input.email === undefined ? undefined : this.normalizeEmail(input.email);
    if (email === LEGACY_EMAIL) throw new BadRequestException("Choose a different email address");
    if (email && email !== current.email) {
      const duplicate = await this.prisma.user.findUnique({ where: { email } });
      if (duplicate && duplicate.id !== userId) throw new BadRequestException("That email is already in use");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName === undefined ? undefined : input.fullName.trim(),
        email,
      },
    });
    return this.view(user);
  }

  async updatePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Account not found");
    if (!verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException("New password must be different from the current password");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(input.newPassword) },
    });
    return { ok: true };
  }
}
