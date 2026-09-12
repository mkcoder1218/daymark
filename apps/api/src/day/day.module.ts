import { Module } from "@nestjs/common";
import { DayController } from "./day.controller.js";
import { DayService } from "./day.service.js";

@Module({ controllers: [DayController], providers: [DayService] })
export class DayModule {}
