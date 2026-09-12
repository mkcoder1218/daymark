import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { DayService } from "./day.service.js";

class DateDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

class GoalActionDto extends DateDto {
  @IsString()
  goalId!: string;
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

class StatusDto extends GoalActionDto {
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
    return this.day.getToday(date);
  }

  @Post("today")
  async create(@Body() dto: CreateGoalDto) {
    return { goal: await this.day.create(dto) };
  }

  @Post("today/start")
  async start(@Body() dto: GoalActionDto) {
    return { goal: await this.day.start(dto.date, dto.goalId) };
  }

  @Post("today/status")
  async status(@Body() dto: StatusDto) {
    return { goal: await this.day.changeStatus(dto.date, dto.goalId, dto.status, dto.reason) };
  }

  @Post("today/complete")
  async complete(@Body() dto: GoalActionDto) {
    const result = await this.day.complete(dto.date, dto.goalId);
    return { goal: result.completed, nextGoal: result.nextGoal };
  }

  @Get("history")
  async history() {
    return { goals: await this.day.history() };
  }
}
