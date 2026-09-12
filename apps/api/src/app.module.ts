import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { DayModule } from "./day/day.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { TelegramModule } from "./telegram/telegram.module.js";

const globalEnvPath = resolve(process.cwd(), "../../.env");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: globalEnvPath,
    }),
    PrismaModule,
    TelegramModule,
    DayModule,
    SettingsModule,
  ],
})
export class AppModule {}
