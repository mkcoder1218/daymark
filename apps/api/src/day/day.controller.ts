import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { DayService } from "./day.service.js";

class CreateGoalDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  setDate!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class StatusDto {
  @IsString()
  @IsIn(["FOCUS", "BREAK", "DISTRACTION", "SWITCH"])
  status!: "FOCUS" | "BREAK" | "DISTRACTION" | "SWITCH";

  @IsOptional()
  @IsString()
  @MaxLength(180)
  reason?: string;
}

@UseGuards(AuthGuard)
@Controller("goals")
export class DayController {
  constructor(private readonly day: DayService) {}

  @Get()
  queue(@Req() request: AuthenticatedRequest) {
    return this.day.getQueue(request.userId);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateGoalDto) {
    return { goal: await this.day.create(request.userId, dto) };
  }

  @Get("history")
  async history(@Req() request: AuthenticatedRequest) {
    return { goals: await this.day.history(request.userId) };
  }

  @Get("reports/:period")
  report(@Req() request: AuthenticatedRequest, @Param("period") period: string, @Query("anchor") anchor: string) {
    if (period !== "week" && period !== "month" && period !== "year") {
      throw new BadRequestException("Report period must be week, month, or year");
    }
    return this.day.periodReport(request.userId, period, anchor);
  }

  @Post(":goalId/start")
  async start(@Req() request: AuthenticatedRequest, @Param("goalId") goalId: string) {
    return { goal: await this.day.start(request.userId, goalId) };
  }

  @Post(":goalId/status")
  async status(@Req() request: AuthenticatedRequest, @Param("goalId") goalId: string, @Body() dto: StatusDto) {
    return { goal: await this.day.changeStatus(request.userId, goalId, dto.status, dto.reason) };
  }

  @Post(":goalId/complete")
  async complete(@Req() request: AuthenticatedRequest, @Param("goalId") goalId: string) {
    const result = await this.day.complete(request.userId, goalId);
    return { goal: result.completed, nextGoal: result.nextGoal };
  }
}
