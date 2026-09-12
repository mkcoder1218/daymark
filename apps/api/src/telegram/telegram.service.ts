import { Injectable, Logger } from "@nestjs/common";
import { decryptSecret } from "../common/crypto.util.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(message: string, force = false) {
    const settings = await this.prisma.appSettings.findUnique({ where: { id: "primary" } });
    if (!settings?.telegramBotTokenEncrypted || !settings.telegramChatId) {
      if (force) throw new Error("Telegram bot token and chat ID must be configured first");
      return { ok: false, skipped: true };
    }
    if (!force && !settings.telegramEnabled) return { ok: false, skipped: true };

    const token = decryptSecret(settings.telegramBotTokenEncrypted);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: settings.telegramChatId, text: message, disable_web_page_preview: true }),
    });

    if (!response.ok) {
      const payload = await response.text();
      this.logger.error(`Telegram send failed (${response.status}): ${payload.slice(0, 300)}`);
      if (force) throw new Error("Telegram rejected the test message. Check your bot token and chat ID.");
      return { ok: false, skipped: false };
    }
    return { ok: true, skipped: false };
  }

  async safelySend(message: string) {
    try {
      await this.send(message);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "Telegram notification failed");
    }
  }
}
