export type GoalStatus = "PLANNED" | "ACTIVE" | "COMPLETED";
export type ActivityType = "FOCUS" | "BREAK" | "DISTRACTION" | "SWITCH";

export interface ActivityView {
  id: string;
  type: ActivityType;
  reason: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
}

export interface GoalView {
  id: string;
  goalDate: string;
  title: string;
  note: string | null;
  status: GoalStatus;
  startedAt: string | null;
  completedAt: string | null;
  currentStatus: ActivityType | null;
  focusedMs: number;
  breakMs: number;
  distractionMs: number;
  switchMs: number;
  elapsedMs: number;
  interruptions: number;
  longestFocusMs: number;
  activities: ActivityView[];
}

export interface TelegramSettings {
  enabled: boolean;
  chatId: string;
  tokenConfigured: boolean;
  tokenHint: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const daymarkApi = {
  today: (date: string) => request<{ goal: GoalView | null }>(`/day/today?date=${encodeURIComponent(date)}`),
  createGoal: (date: string, title: string, note: string) =>
    request<{ goal: GoalView }>("/day/today", {
      method: "POST",
      body: JSON.stringify({ date, title, note: note || undefined }),
    }),
  startGoal: (date: string) =>
    request<{ goal: GoalView }>("/day/today/start", {
      method: "POST",
      body: JSON.stringify({ date }),
    }),
  setStatus: (date: string, status: ActivityType, reason?: string) =>
    request<{ goal: GoalView }>("/day/today/status", {
      method: "POST",
      body: JSON.stringify({ date, status, reason }),
    }),
  completeGoal: (date: string) =>
    request<{ goal: GoalView }>("/day/today/complete", {
      method: "POST",
      body: JSON.stringify({ date }),
    }),
  history: () => request<{ goals: GoalView[] }>("/day/history"),
  telegramSettings: () => request<TelegramSettings>("/settings/telegram"),
  saveTelegramSettings: (payload: { enabled: boolean; chatId: string; botToken?: string }) =>
    request<TelegramSettings>("/settings/telegram", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testTelegram: () => request<{ ok: boolean }>("/settings/telegram/test", { method: "POST" }),
};
