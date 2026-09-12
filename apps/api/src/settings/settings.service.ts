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

  async getTelegram() {
    const settings = await this.prisma.appSettings.upsert({
      where: { id: "primary" },
      create: { id: "primary" },
      update: {},
    });
    return this.view(settings);
  }

  async updateTelegram(input: { enabled: boolean; chatId: string; botToken?: string }) {
    const existing = await this.prisma.appSettings.findUnique({ where: { id: "primary" } });
    const encrypted = input.botToken?.trim() ? encryptSecret(input.botToken.trim()) : existing?.telegramBotTokenEncrypted ?? null;
    const settings = await this.prisma.appSettings.upsert({
      where: { id: "primary" },
      create: { id: "primary", telegramEnabled: input.enabled, telegramChatId: input.chatId.trim() || null, telegramBotTokenEncrypted: encrypted },
      update: { telegramEnabled: input.enabled, telegramChatId: input.chatId.trim() || null, telegramBotTokenEncrypted: encrypted },
    });
    return this.view(settings);
  }
}
