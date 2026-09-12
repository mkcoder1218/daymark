export type GoalStatus = "PLANNED" | "ACTIVE" | "COMPLETED";
export type ActivityType = "FOCUS" | "BREAK" | "DISTRACTION" | "SWITCH";
export type ReportPeriod = "week" | "month" | "year";

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
  setDate: string;
  setAt: string;
  sequence: number;
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

export interface PeriodGoalSummary {
  id: string;
  sequence: number;
  title: string;
  setDate: string;
  startedAt: string | null;
  completedAt: string | null;
  carriedFromEarlier: boolean;
  completedLater: boolean;
}

export interface PeriodReport {
  period: ReportPeriod;
  anchor: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  achieved: PeriodGoalSummary[];
  notAchieved: PeriodGoalSummary[];
  totals: {
    goalsSet: number;
    achievedCount: number;
    notAchievedCount: number;
    completionRate: number;
    focusedMs: number;
    distractionMs: number;
    breakMs: number;
    switchMs: number;
    interruptions: number;
    longestFocusMs: number;
  };
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramSettings {
  enabled: boolean;
  chatId: string;
  tokenConfigured: boolean;
  tokenHint: string | null;
}

interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}

const TOKEN_KEY = "daymark_access_token";
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const API_URL = (
  configuredApiUrl
    ? process.env.NODE_ENV === "development" && /localhost:3001\/v1\/?$/.test(configuredApiUrl)
      ? "http://localhost:4000/v1"
      : configuredApiUrl.startsWith("/") && process.env.NODE_ENV === "development"
        ? `http://localhost:4000${configuredApiUrl}`
        : configuredApiUrl
    : "http://localhost:4000/v1"
).replace(/\/$/, "");

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit, authenticated = true): Promise<T> {
  const token = authenticated ? getAccessToken() : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    const error = new Error(message || `Request failed (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

async function authenticate(path: string, payload: Record<string, string>) {
  const response = await request<AuthResponse>(path, { method: "POST", body: JSON.stringify(payload) }, false);
  setAccessToken(response.accessToken);
  return response;
}

export const daymarkApi = {
  hasSession: () => Boolean(getAccessToken()),
  signup: (fullName: string, email: string, password: string) => authenticate("/auth/signup", { fullName, email, password }),
  login: (email: string, password: string) => authenticate("/auth/login", { email, password }),
  logout: () => clearAccessToken(),
  me: () => request<{ user: UserProfile }>("/auth/me"),
  updateProfile: (payload: { fullName: string; email: string }) =>
    request<{ user: UserProfile }>("/auth/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  updatePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),

  queue: () => request<{ goals: GoalView[]; currentGoal: GoalView | null }>("/goals"),
  createGoal: (setDate: string, title: string, note: string) =>
    request<{ goal: GoalView }>("/goals", {
      method: "POST",
      body: JSON.stringify({ setDate, title, note: note || undefined }),
    }),
  startGoal: (goalId: string) => request<{ goal: GoalView }>(`/goals/${encodeURIComponent(goalId)}/start`, { method: "POST" }),
  setStatus: (goalId: string, status: ActivityType, reason?: string) =>
    request<{ goal: GoalView }>(`/goals/${encodeURIComponent(goalId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status, reason }),
    }),
  completeGoal: (goalId: string) =>
    request<{ goal: GoalView; nextGoal: GoalView | null }>(`/goals/${encodeURIComponent(goalId)}/complete`, { method: "POST" }),
  history: () => request<{ goals: GoalView[] }>("/goals/history"),
  periodReport: (period: ReportPeriod, anchor: string) =>
    request<PeriodReport>(`/goals/reports/${period}?anchor=${encodeURIComponent(anchor)}`),

  telegramSettings: () => request<TelegramSettings>("/settings/telegram"),
  saveTelegramSettings: (payload: { enabled: boolean; chatId: string; botToken?: string }) =>
    request<TelegramSettings>("/settings/telegram", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testTelegram: () => request<{ ok: boolean }>("/settings/telegram/test", { method: "POST" }),
};
