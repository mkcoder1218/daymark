import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DayController } from "./day.controller.js";
import { DayService } from "./day.service.js";

@Module({ imports: [AuthModule], controllers: [DayController], providers: [DayService] })
export class DayModule {}
