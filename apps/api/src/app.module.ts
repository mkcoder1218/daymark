import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DayModule } from "./day/day.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { TelegramModule } from "./telegram/telegram.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TelegramModule, DayModule, SettingsModule],
})
export class AppModule {}
