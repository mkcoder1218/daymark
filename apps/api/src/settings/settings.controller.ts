import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { TelegramService } from "../telegram/telegram.service.js";
import { SettingsService } from "./settings.service.js";

class UpdateTelegramDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MaxLength(128)
  chatId!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  botToken?: string;
}

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly telegram: TelegramService) {}

  @Get("telegram")
  getTelegram() {
    return this.settings.getTelegram();
  }

  @Put("telegram")
  updateTelegram(@Body() dto: UpdateTelegramDto) {
    return this.settings.updateTelegram(dto);
  }

  @Post("telegram/test")
  async testTelegram() {
    await this.telegram.send("✅ Daymark test\n\nYour Telegram accountability channel is connected.", true);
    return { ok: true };
  }
}
