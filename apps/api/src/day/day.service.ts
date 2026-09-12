import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Activity, ActivityType, Goal } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TelegramService } from "../telegram/telegram.service.js";

type GoalWithActivities = Goal & { activities: Activity[] };

@Injectable()
export class DayService {
  constructor(private readonly prisma: PrismaService, private readonly telegram: TelegramService) {}

  private assertDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException("A valid local date is required");
  }

  private duration(start: Date, end: Date | null) {
    return end ? Math.max(0, end.getTime() - start.getTime()) : 0;
  }

  private serialize(goal: GoalWithActivities) {
    const activities = goal.activities
      .slice()
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((activity) => ({
        id: activity.id,
        type: activity.type,
        reason: activity.reason,
        startedAt: activity.startedAt.toISOString(),
        endedAt: activity.endedAt?.toISOString() ?? null,
        durationMs: this.duration(activity.startedAt, activity.endedAt),
      }));

    const sum = (type: ActivityType) => activities.filter((activity) => activity.type === type).reduce((total, activity) => total + activity.durationMs, 0);
    const focusDurations = activities.filter((activity) => activity.type === "FOCUS").map((activity) => activity.durationMs);
    const current = activities.findLast((activity) => !activity.endedAt) ?? null;
    const end = goal.completedAt ?? new Date();
    const elapsedMs = goal.startedAt ? Math.max(0, end.getTime() - goal.startedAt.getTime()) : 0;

    return {
      id: goal.id,
      goalDate: goal.goalDate,
      sequence: goal.sequence,
      title: goal.title,
      note: goal.note,
      status: goal.status,
      startedAt: goal.startedAt?.toISOString() ?? null,
      completedAt: goal.completedAt?.toISOString() ?? null,
      currentStatus: current?.type ?? null,
      focusedMs: sum("FOCUS"),
      breakMs: sum("BREAK"),
      distractionMs: sum("DISTRACTION"),
      switchMs: sum("SWITCH"),
      elapsedMs,
      interruptions: activities.filter((activity) => activity.type === "DISTRACTION").length,
      longestFocusMs: focusDurations.length ? Math.max(...focusDurations) : 0,
      activities,
    };
  }

  private async fullGoal(id: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id }, include: { activities: true } });
    if (!goal) throw new NotFoundException("Goal not found");
    return goal;
  }

  private async goalsForDate(date: string) {
    return this.prisma.goal.findMany({
      where: { goalDate: date },
      include: { activities: true },
      orderBy: { sequence: "asc" },
    });
  }

  async getToday(date: string) {
    this.assertDate(date);
    const goals = await this.goalsForDate(date);
    const current = goals.find((goal) => goal.status === "ACTIVE") ?? goals.find((goal) => goal.status === "PLANNED") ?? goals.at(-1) ?? null;
    return {
      goals: goals.map((goal) => this.serialize(goal)),
      currentGoal: current ? this.serialize(current) : null,
    };
  }

  async create(input: { date: string; title: string; note?: string }) {
    this.assertDate(input.date);
    const title = input.title.trim();
    if (!title) throw new BadRequestException("Goal title is required");

    const max = await this.prisma.goal.aggregate({
      where: { goalDate: input.date },
      _max: { sequence: true },
    });

    const goal = await this.prisma.goal.create({
      data: {
        goalDate: input.date,
        sequence: (max._max.sequence ?? 0) + 1,
        title,
        note: input.note?.trim() || null,
      },
      include: { activities: true },
    });

    return this.serialize(goal);
  }

  async start(date: string, goalId: string) {
    this.assertDate(date);
    const goal = await this.fullGoal(goalId);
    if (goal.goalDate !== date) throw new BadRequestException("Goal does not belong to this day");
    if (goal.status === "COMPLETED") throw new BadRequestException("This goal is already complete");
    if (goal.status === "ACTIVE") return this.serialize(goal);

    const active = await this.prisma.goal.findFirst({ where: { goalDate: date, status: "ACTIVE" } });
    if (active && active.id !== goal.id) throw new BadRequestException("Finish the active goal before starting another one");

    const previousIncomplete = await this.prisma.goal.findFirst({
      where: {
        goalDate: date,
        sequence: { lt: goal.sequence },
        status: { not: "COMPLETED" },
      },
      orderBy: { sequence: "asc" },
    });
    if (previousIncomplete) throw new BadRequestException(`Finish goal ${previousIncomplete.sequence} before starting goal ${goal.sequence}`);

    const startedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.goal.update({ where: { id: goal.id }, data: { status: "ACTIVE", startedAt } }),
      this.prisma.activity.create({ data: { goalId: goal.id, type: "FOCUS", startedAt } }),
    ]);

    await this.telegram.safelySend(`🟢 Daymark\n\nGoal ${goal.sequence} started\n${goal.title}`);
    return this.serialize(await this.fullGoal(goal.id));
  }

  async changeStatus(date: string, goalId: string, status: ActivityType, reason?: string) {
    this.assertDate(date);
    const goal = await this.fullGoal(goalId);
    if (goal.goalDate !== date) throw new BadRequestException("Goal does not belong to this day");
    if (goal.status !== "ACTIVE") throw new BadRequestException("The goal must be active before changing status");

    const open = goal.activities.find((activity) => !activity.endedAt);
    if (open?.type === status && (!reason || open.reason === reason)) return this.serialize(goal);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (open) await tx.activity.update({ where: { id: open.id }, data: { endedAt: now } });
      await tx.activity.create({ data: { goalId: goal.id, type: status, reason: reason?.trim() || null, startedAt: now } });
    });

    const labels: Record<ActivityType, string> = {
      FOCUS: "🟢 Focus resumed",
      BREAK: "🔵 Break started",
      DISTRACTION: "🔴 Focus interrupted",
      SWITCH: "🟡 Intentional switch",
    };
    const detail = reason?.trim() ? `\nReason: ${reason.trim()}` : "";
    await this.telegram.safelySend(`${labels[status]}\nGoal ${goal.sequence}: ${goal.title}${detail}`);
    return this.serialize(await this.fullGoal(goal.id));
  }

  async complete(date: string, goalId: string) {
    this.assertDate(date);
    const goal = await this.fullGoal(goalId);
    if (goal.goalDate !== date) throw new BadRequestException("Goal does not belong to this day");
    if (goal.status === "COMPLETED") {
      const nextGoal = await this.nextGoal(date, goal.sequence);
      return { completed: this.serialize(goal), nextGoal: nextGoal ? this.serialize(nextGoal) : null };
    }
    if (goal.status !== "ACTIVE") throw new BadRequestException("Start the goal before completing it");

    const now = new Date();
    const open = goal.activities.find((activity) => !activity.endedAt);
    await this.prisma.$transaction(async (tx) => {
      if (open) await tx.activity.update({ where: { id: open.id }, data: { endedAt: now } });
      await tx.goal.update({ where: { id: goal.id }, data: { status: "COMPLETED", completedAt: now } });
    });

    const completed = this.serialize(await this.fullGoal(goal.id));
    const nextGoal = await this.nextGoal(date, goal.sequence);
    await this.telegram.safelySend(`🎯 Daymark — goal ${goal.sequence} achieved\n\n${goal.title}\n\nFocused: ${this.readable(completed.focusedMs)}\nElapsed: ${this.readable(completed.elapsedMs)}\nInterruptions: ${completed.interruptions}\nLongest run: ${this.readable(completed.longestFocusMs)}${nextGoal ? `\n\nNext: Goal ${nextGoal.sequence} — ${nextGoal.title}` : ""}`);
    return { completed, nextGoal: nextGoal ? this.serialize(nextGoal) : null };
  }

  async history() {
    const goals = await this.prisma.goal.findMany({
      include: { activities: true },
      orderBy: [{ goalDate: "desc" }, { sequence: "asc" }],
      take: 120,
    });
    return goals.map((goal) => this.serialize(goal));
  }

  private async nextGoal(date: string, sequence: number) {
    return this.prisma.goal.findFirst({
      where: { goalDate: date, sequence: { gt: sequence }, status: "PLANNED" },
      include: { activities: true },
      orderBy: { sequence: "asc" },
    });
  }

  private readable(ms: number) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours > 0 ? `${hours}h ${rest}m` : `${minutes}m`;
  }
}
