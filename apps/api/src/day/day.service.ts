import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Activity, ActivityType, Goal } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TelegramService } from "../telegram/telegram.service.js";

type GoalWithActivities = Goal & { activities: Activity[] };
type ReportPeriod = "week" | "month" | "year";

@Injectable()
export class DayService {
  constructor(private readonly prisma: PrismaService, private readonly telegram: TelegramService) {}

  private assertDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException("A valid set date is required");
  }

  private duration(start: Date, end: Date | null) {
    return end ? Math.max(0, end.getTime() - start.getTime()) : 0;
  }

  private dateKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  private parseDateKey(date: string) {
    this.assertDate(date);
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (this.dateKey(parsed) !== date) throw new BadRequestException("A valid date is required");
    return parsed;
  }

  private periodBounds(period: ReportPeriod, anchor: string) {
    const date = this.parseDateKey(anchor);
    let start: Date;
    let endExclusive: Date;

    if (period === "week") {
      const mondayOffset = (date.getUTCDay() + 6) % 7;
      start = new Date(date);
      start.setUTCDate(start.getUTCDate() - mondayOffset);
      endExclusive = new Date(start);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 7);
    } else if (period === "month") {
      start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      endExclusive = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    } else {
      start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      endExclusive = new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
    }

    const end = new Date(endExclusive);
    end.setUTCDate(end.getUTCDate() - 1);
    return { start, end, endExclusive, startDate: this.dateKey(start), endDate: this.dateKey(end) };
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
      setDate: goal.setDate,
      setAt: goal.createdAt.toISOString(),
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

  private async fullGoal(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId }, include: { activities: true } });
    if (!goal) throw new NotFoundException("Goal not found");
    return goal;
  }

  async getQueue(userId: string) {
    const goals = await this.prisma.goal.findMany({
      where: { userId, status: { not: "COMPLETED" } },
      include: { activities: true },
      orderBy: { sequence: "asc" },
    });
    const current = goals.find((goal) => goal.status === "ACTIVE") ?? goals.find((goal) => goal.status === "PLANNED") ?? null;
    return {
      goals: goals.map((goal) => this.serialize(goal)),
      currentGoal: current ? this.serialize(current) : null,
    };
  }

  async create(userId: string, input: { setDate: string; title: string; note?: string }) {
    this.assertDate(input.setDate);
    const title = input.title.trim();
    if (!title) throw new BadRequestException("Goal title is required");

    const max = await this.prisma.goal.aggregate({ where: { userId }, _max: { sequence: true } });
    const goal = await this.prisma.goal.create({
      data: {
        userId,
        setDate: input.setDate,
        sequence: (max._max.sequence ?? 0) + 1,
        title,
        note: input.note?.trim() || null,
      },
      include: { activities: true },
    });
    return this.serialize(goal);
  }

  async start(userId: string, goalId: string) {
    const goal = await this.fullGoal(userId, goalId);
    if (goal.status === "COMPLETED") throw new BadRequestException("This goal is already complete");
    if (goal.status === "ACTIVE") return this.serialize(goal);

    const active = await this.prisma.goal.findFirst({ where: { userId, status: "ACTIVE" } });
    if (active && active.id !== goal.id) throw new BadRequestException("Finish the active goal before starting another one");

    const previousIncomplete = await this.prisma.goal.findFirst({
      where: { userId, sequence: { lt: goal.sequence }, status: { not: "COMPLETED" } },
      orderBy: { sequence: "asc" },
    });
    if (previousIncomplete) throw new BadRequestException(`Finish goal ${previousIncomplete.sequence} before starting goal ${goal.sequence}`);

    const startedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.goal.update({ where: { id: goal.id }, data: { status: "ACTIVE", startedAt } }),
      this.prisma.activity.create({ data: { goalId: goal.id, type: "FOCUS", startedAt } }),
    ]);

    await this.telegram.safelySend(userId, `🟢 Daymark\n\nGoal ${goal.sequence} started\n${goal.title}`);
    return this.serialize(await this.fullGoal(userId, goal.id));
  }

  async changeStatus(userId: string, goalId: string, status: ActivityType, reason?: string) {
    const goal = await this.fullGoal(userId, goalId);
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
    await this.telegram.safelySend(userId, `${labels[status]}\nGoal ${goal.sequence}: ${goal.title}${detail}`);
    return this.serialize(await this.fullGoal(userId, goal.id));
  }

  async complete(userId: string, goalId: string) {
    const goal = await this.fullGoal(userId, goalId);
    if (goal.status === "COMPLETED") {
      const nextGoal = await this.nextGoal(userId, goal.sequence);
      return { completed: this.serialize(goal), nextGoal: nextGoal ? this.serialize(nextGoal) : null };
    }
    if (goal.status !== "ACTIVE") throw new BadRequestException("Start the goal before completing it");

    const now = new Date();
    const open = goal.activities.find((activity) => !activity.endedAt);
    await this.prisma.$transaction(async (tx) => {
      if (open) await tx.activity.update({ where: { id: open.id }, data: { endedAt: now } });
      await tx.goal.update({ where: { id: goal.id }, data: { status: "COMPLETED", completedAt: now } });
    });

    const completed = this.serialize(await this.fullGoal(userId, goal.id));
    const nextGoal = await this.nextGoal(userId, goal.sequence);
    await this.telegram.safelySend(
      userId,
      `🎯 Daymark — goal ${goal.sequence} achieved\n\n${goal.title}\n\nSet: ${goal.setDate}\nFocused: ${this.readable(completed.focusedMs)}\nElapsed: ${this.readable(completed.elapsedMs)}\nDistracted: ${this.readable(completed.distractionMs)}\nBreaks: ${this.readable(completed.breakMs)}\nIntentional switches: ${this.readable(completed.switchMs)}\nInterruptions: ${completed.interruptions}\nLongest run: ${this.readable(completed.longestFocusMs)}${nextGoal ? `\n\nNext: Goal ${nextGoal.sequence} — ${nextGoal.title}` : ""}`,
    );
    return { completed, nextGoal: nextGoal ? this.serialize(nextGoal) : null };
  }

  async history(userId: string) {
    const goals = await this.prisma.goal.findMany({
      where: { userId, status: "COMPLETED" },
      include: { activities: true },
      orderBy: [{ completedAt: "desc" }, { sequence: "desc" }],
      take: 200,
    });
    return goals.map((goal) => this.serialize(goal));
  }

  async periodReport(userId: string, period: ReportPeriod, anchor: string) {
    const { start, end, endExclusive, startDate, endDate } = this.periodBounds(period, anchor);
    const now = new Date();
    const effectiveEnd = new Date(Math.min(endExclusive.getTime(), now.getTime()));
    const effectiveEndMs = effectiveEnd.getTime();
    const startMs = start.getTime();
    const endExclusiveMs = endExclusive.getTime();

    const goals = await this.prisma.goal.findMany({
      where: { userId, setDate: { lte: endDate } },
      include: { activities: true },
      orderBy: { sequence: "asc" },
    });

    const achieved = goals.filter((goal) => {
      if (!goal.completedAt) return false;
      const completedAt = goal.completedAt.getTime();
      return completedAt >= startMs && completedAt < endExclusiveMs;
    });

    const notAchieved = goals.filter((goal) => {
      const completedAt = goal.completedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return completedAt >= effectiveEndMs && goal.createdAt.getTime() <= effectiveEndMs;
    });

    const totals: Record<ActivityType, number> = { FOCUS: 0, BREAK: 0, DISTRACTION: 0, SWITCH: 0 };
    let interruptions = 0;
    let longestFocusMs = 0;

    for (const goal of goals) {
      for (const activity of goal.activities) {
        const activityStart = activity.startedAt.getTime();
        const activityEnd = Math.min((activity.endedAt ?? now).getTime(), effectiveEndMs);
        const overlapStart = Math.max(activityStart, startMs);
        const overlapEnd = Math.min(activityEnd, effectiveEndMs);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        if (overlap <= 0) continue;

        totals[activity.type] += overlap;
        if (activity.type === "FOCUS") longestFocusMs = Math.max(longestFocusMs, overlap);
        if (activity.type === "DISTRACTION" && activityStart >= startMs && activityStart < effectiveEndMs) interruptions += 1;
      }
    }

    const summary = (goal: GoalWithActivities) => ({
      id: goal.id,
      sequence: goal.sequence,
      title: goal.title,
      setDate: goal.setDate,
      startedAt: goal.startedAt?.toISOString() ?? null,
      completedAt: goal.completedAt?.toISOString() ?? null,
      carriedFromEarlier: goal.setDate < startDate,
      completedLater: Boolean(goal.completedAt && goal.completedAt.getTime() >= endExclusiveMs),
    });

    const goalsSet = goals.filter((goal) => goal.setDate >= startDate && goal.setDate <= endDate).length;
    const denominator = achieved.length + notAchieved.length;

    return {
      period,
      anchor,
      startDate,
      endDate,
      isClosed: endExclusive.getTime() <= now.getTime(),
      achieved: achieved.map(summary),
      notAchieved: notAchieved.map(summary),
      totals: {
        goalsSet,
        achievedCount: achieved.length,
        notAchievedCount: notAchieved.length,
        completionRate: denominator > 0 ? Math.round((achieved.length / denominator) * 100) : 0,
        focusedMs: totals.FOCUS,
        distractionMs: totals.DISTRACTION,
        breakMs: totals.BREAK,
        switchMs: totals.SWITCH,
        interruptions,
        longestFocusMs,
      },
    };
  }

  private async nextGoal(userId: string, sequence: number) {
    return this.prisma.goal.findFirst({
      where: { userId, sequence: { gt: sequence }, status: "PLANNED" },
      include: { activities: true },
      orderBy: { sequence: "asc" },
    });
  }

  private readable(ms: number) {
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}
