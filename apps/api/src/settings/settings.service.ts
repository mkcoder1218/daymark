import { Injectable } from "@nestjs/common";
import { encryptSecret } from "../common/crypto.util.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private view(settings: { telegramEnabled: boolean; telegramChatId: string | null; telegramBotTokenEncrypted: string | null }) {
    return {
      enabled: settings.telegramEnabled,
      chatId: settings.telegramChatId ?? "",
      tokenConfigured: Boolean(settings.telegramBotTokenEncrypted),
      tokenHint: settings.telegramBotTokenEncrypted ? "••••••••" : null,
    };
  }

  async getTelegram(userId: string) {
    const existing = await this.prisma.appSettings.findUnique({ where: { userId } });
    const settings = existing ?? (await this.prisma.appSettings.create({ data: { userId } }));
    return this.view(settings);
  }

  async updateTelegram(userId: string, input: { enabled: boolean; chatId: string; botToken?: string }) {
    const existing = await this.prisma.appSettings.findUnique({ where: { userId } });
    const encrypted = input.botToken?.trim() ? encryptSecret(input.botToken.trim()) : existing?.telegramBotTokenEncrypted ?? null;

    const settings = existing
      ? await this.prisma.appSettings.update({
          where: { id: existing.id },
          data: {
            telegramEnabled: input.enabled,
            telegramChatId: input.chatId.trim() || null,
            telegramBotTokenEncrypted: encrypted,
          },
        })
      : await this.prisma.appSettings.create({
          data: {
            userId,
            telegramEnabled: input.enabled,
            telegramChatId: input.chatId.trim() || null,
            telegramBotTokenEncrypted: encrypted,
          },
        });

    return this.view(settings);
  }
}
