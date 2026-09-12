import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { DayService } from "./day.service.js";

class DateDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

class CreateGoalDto extends DateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class StatusDto extends DateDto {
  @IsString()
  @IsIn(["FOCUS", "BREAK", "DISTRACTION", "SWITCH"])
  status!: "FOCUS" | "BREAK" | "DISTRACTION" | "SWITCH";

  @IsOptional()
  @IsString()
  @MaxLength(180)
  reason?: string;
}

@Controller("day")
export class DayController {
  constructor(private readonly day: DayService) {}

  @Get("today")
  async today(@Query("date") date: string) {
    return { goal: await this.day.getByDate(date) };
  }

  @Post("today")
  async create(@Body() dto: CreateGoalDto) {
    return { goal: await this.day.create(dto) };
  }

  @Post("today/start")
  async start(@Body() dto: DateDto) {
    return { goal: await this.day.start(dto.date) };
  }

  @Post("today/status")
  async status(@Body() dto: StatusDto) {
    return { goal: await this.day.changeStatus(dto.date, dto.status, dto.reason) };
  }

  @Post("today/complete")
  async complete(@Body() dto: DateDto) {
    return { goal: await this.day.complete(dto.date) };
  }

  @Get("history")
  async history() {
    return { goals: await this.day.history() };
  }
}
