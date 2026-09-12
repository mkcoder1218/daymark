import { Body, Controller, Get, Post, Put, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard.js";
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

@UseGuards(AuthGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly telegram: TelegramService) {}

  @Get("telegram")
  getTelegram(@Req() request: AuthenticatedRequest) {
    return this.settings.getTelegram(request.userId);
  }

  @Put("telegram")
  updateTelegram(@Req() request: AuthenticatedRequest, @Body() dto: UpdateTelegramDto) {
    return this.settings.updateTelegram(request.userId, dto);
  }

  @Post("telegram/test")
  async testTelegram(@Req() request: AuthenticatedRequest) {
    await this.telegram.send(request.userId, "✅ Daymark test\n\nYour Telegram accountability channel is connected.", true);
    return { ok: true };
  }
}
