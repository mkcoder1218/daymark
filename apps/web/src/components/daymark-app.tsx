"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import gsap from "gsap";
import { ActivityType, daymarkApi, GoalView, PeriodReport, ReportPeriod, TelegramSettings, UserProfile } from "@/lib/api";

type ViewName = "timer" | "history" | "profile";
type ReasonMode = "DISTRACTION" | "SWITCH" | null;
type AuthMode = "login" | "signup" | null;

const distractionReasons = ["Betting dashboard", "Phone", "Social media", "Random browsing", "Someone interrupted me", "Other"];
const switchReasons = ["Coding agent running", "Urgent project", "Waiting on dependency", "Planned task switch", "Meeting / call", "Other"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDateKey() {
  return dateKey(new Date());
}

function shiftReportAnchor(anchor: string, period: ReportPeriod, direction: -1 | 1) {
  const date = new Date(`${anchor}T12:00:00`);
  if (period === "week") date.setDate(date.getDate() + direction * 7);
  if (period === "month") date.setMonth(date.getMonth() + direction);
  if (period === "year") date.setFullYear(date.getFullYear() + direction);
  return dateKey(date);
}

function formatDuration(ms: number, includeSeconds = false) {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const totalHours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (includeSeconds) {
    return `${String(totalHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (totalHours > 0) return `${totalHours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function formatPeriodLabel(report: PeriodReport) {
  if (report.period === "year") return report.startDate.slice(0, 4);
  if (report.period === "month") {
    return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(`${report.startDate}T12:00:00`));
  }
  return `${formatShortDate(report.startDate)} – ${formatShortDate(report.endDate)}`;
}

function statusLabel(status: ActivityType | null) {
  if (!status) return "Ready";
  if (status === "FOCUS") return "Focused";
  if (status === "BREAK") return "On break";
  if (status === "DISTRACTION") return "Distracted";
  return "Intentional switch";
}

function goalStateLabel(goal: GoalView) {
  if (goal.status === "COMPLETED") return "Done";
  if (goal.status === "ACTIVE") return statusLabel(goal.currentStatus);
  return "Queued";
}

function Icon({ name }: { name: "timer" | "history" | "profile" | "focus" | "break" | "distract" | "switch" | "check" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "timer") return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="13" r="7" /><path d="M9 2h6M12 6V3M17 7l2-2M12 10v4l3 2" /></svg>;
  if (name === "history") return <svg viewBox="0 0 24 24" {...common}><path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.7" /><path d="M4 4v4.7h4.7M12 8v4l2.6 1.5" /></svg>;
  if (name === "profile") return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-4.2 3.1-6.2 7-6.2s6.2 2 7 6.2" /></svg>;
  if (name === "focus") return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" /></svg>;
  if (name === "break") return <svg viewBox="0 0 24 24" {...common}><path d="M8 5v14M16 5v14" /></svg>;
  if (name === "distract") return <svg viewBox="0 0 24 24" {...common}><path d="M12 3 3 20h18L12 3Z" /><path d="M12 9v5M12 17h.01" /></svg>;
  if (name === "switch") return <svg viewBox="0 0 24 24" {...common}><path d="M4 8h12M13 5l3 3-3 3M20 16H8M11 13l-3 3 3 3" /></svg>;
  return <svg viewBox="0 0 24 24" {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

export function DaymarkApp() {
  const [view, setView] = useState<ViewName>("timer");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authFullName, setAuthFullName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");

  const [goal, setGoal] = useState<GoalView | null>(null);
  const [goals, setGoals] = useState<GoalView[]>([]);
  const [history, setHistory] = useState<GoalView[]>([]);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("week");
  const [reportAnchor, setReportAnchor] = useState(localDateKey);
  const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
  const [telegram, setTelegram] = useState<TelegramSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [goalModal, setGoalModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalNote, setGoalNote] = useState("");
  const [reasonMode, setReasonMode] = useState<ReasonMode>(null);
  const [customReason, setCustomReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [completion, setCompletion] = useState<GoalView | null>(null);

  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const authModalRef = useRef<HTMLFormElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const authRef = useRef<HTMLDivElement>(null);
  const setDate = useMemo(localDateKey, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshQueue = useCallback(async () => {
    const response = await daymarkApi.queue();
    setGoals(response.goals);
    setGoal(response.currentGoal);
  }, []);

  const loadPeriodReport = useCallback(async (period: ReportPeriod, anchor: string) => {
    const response = await daymarkApi.periodReport(period, anchor);
    setPeriodReport(response);
  }, []);

  const loadProfile = useCallback(async (profile?: UserProfile) => {
    const nextProfile = profile ?? (await daymarkApi.me()).user;
    setUser(nextProfile);
    setProfileName(nextProfile.fullName);
    setProfileEmail(nextProfile.email);

    const settings = await daymarkApi.telegramSettings();
    setTelegram(settings);
    setChatId(settings.chatId);
    setTelegramEnabled(settings.enabled);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      if (!daymarkApi.hasSession()) {
        setSessionLoading(false);
        return;
      }

      try {
        const response = await daymarkApi.me();
        setUser(response.user);
        setProfileName(response.user.fullName);
        setProfileEmail(response.user.email);
        await refreshQueue();
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status === 401) daymarkApi.logout();
      } finally {
        setSessionLoading(false);
      }
    };

    void bootstrap();
  }, [refreshQueue]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useLayoutEffect(() => {
    if (!authRef.current || sessionLoading || user) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "power4.out" } })
        .from(".auth-brand", { y: 20, opacity: 0, duration: 0.55 })
        .from(".auth-title", { y: 48, opacity: 0, duration: 0.8 }, "-=0.25")
        .from(".auth-copy", { y: 24, opacity: 0, duration: 0.55 }, "-=0.45")
        .from(".auth-actions", { y: 18, opacity: 0, duration: 0.45 }, "-=0.3")
        .from(".auth-proof", { opacity: 0, y: 12, duration: 0.45, stagger: 0.06 }, "-=0.2");
    }, authRef);
    return () => ctx.revert();
  }, [sessionLoading, user]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !user) return;
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      const rail = root.querySelector<HTMLElement>(".rail");
      const topbar = root.querySelector<HTMLElement>(".topbar");
      const intro = root.querySelectorAll<HTMLElement>(".intro-reveal");
      if (rail) timeline.from(rail, { x: -34, opacity: 0, duration: 0.65 });
      if (topbar) timeline.from(topbar, { y: -20, opacity: 0, duration: 0.55 }, "<0.12");
      if (intro.length) timeline.from(intro, { y: 30, opacity: 0, duration: 0.65, stagger: 0.06 }, "<0.08");
    }, root);
    return () => ctx.revert();
  }, [user]);

  useLayoutEffect(() => {
    if (!viewRef.current || !user) return;
    gsap.fromTo(viewRef.current, { opacity: 0, y: 16, filter: "blur(5px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.48, ease: "power3.out" });
  }, [view, user]);

  useLayoutEffect(() => {
    const currentView = viewRef.current;
    if (!currentView) return;
    const selector = view === "history" ? ".period-report, .report-card" : view === "profile" ? ".profile-panel" : ".metric, .activity-row, .sequence-item";
    const targets = currentView.querySelectorAll<HTMLElement>(selector);
    if (!targets.length) return;
    gsap.fromTo(targets, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.035, ease: "power3.out", clearProps: "transform" });
  }, [view, history.length, goals.length, telegram?.tokenConfigured, periodReport?.anchor, periodReport?.period]);

  useLayoutEffect(() => {
    const modal = authMode ? authModalRef.current : modalRef.current;
    if (!modal || (!goalModal && !reasonMode && !authMode)) return;
    const backdrop = modal.parentElement?.querySelector<HTMLElement>(".modal-backdrop");
    if (backdrop) gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.24 });
    gsap.fromTo(modal, { y: 34, scale: 0.965, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.46, ease: "power4.out" });
  }, [goalModal, reasonMode, authMode]);

  useLayoutEffect(() => {
    if (!completion || !completionRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo(".completion-layer", { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.7, ease: "power4.inOut" })
        .from(".completion-kicker", { y: 18, opacity: 0, duration: 0.4 }, "-=0.15")
        .from(".completion-title", { y: 70, opacity: 0, rotateX: -18, duration: 0.8, ease: "power4.out" }, "-=0.15")
        .from(".completion-summary", { y: 18, opacity: 0, duration: 0.45 }, "-=0.35")
        .fromTo(".spark", { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.55, stagger: 0.018, ease: "power2.out" }, "-=0.7");
      gsap.to(".spark", { rotation: "+=28", duration: 4.5, ease: "none", repeat: -1 });
    }, completionRef);
    return () => ctx.revert();
  }, [completion]);

  const liveFocusedMs = useMemo(() => {
    if (!goal) return 0;
    if (goal.status !== "ACTIVE" || goal.currentStatus !== "FOCUS") return goal.focusedMs;
    const open = [...goal.activities].reverse().find((activity) => activity.type === "FOCUS" && !activity.endedAt);
    return open ? goal.focusedMs + Math.max(0, now - new Date(open.startedAt).getTime()) : goal.focusedMs;
  }, [goal, now]);

  const currentOpen = goal?.activities.find((activity) => !activity.endedAt) ?? null;
  const liveElapsed = goal?.startedAt && goal.status === "ACTIVE" ? Math.max(goal.elapsedMs, now - new Date(goal.startedAt).getTime()) : goal?.elapsedMs ?? 0;
  const liveDistractionMs = goal && currentOpen?.type === "DISTRACTION" ? goal.distractionMs + Math.max(0, now - new Date(currentOpen.startedAt).getTime()) : goal?.distractionMs ?? 0;
  const liveBreakMs = goal && currentOpen?.type === "BREAK" ? goal.breakMs + Math.max(0, now - new Date(currentOpen.startedAt).getTime()) : goal?.breakMs ?? 0;

  const animateAction = (target: HTMLElement) => {
    gsap.fromTo(target, { scale: 0.96 }, { scale: 1, duration: 0.42, ease: "elastic.out(1, 0.45)" });
  };

  const resetAuthForm = () => {
    setAuthFullName("");
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirmPassword("");
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    if (!authMode || busy) return;
    if (authMode === "signup" && authPassword !== authConfirmPassword) {
      showToast("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = authMode === "signup"
        ? await daymarkApi.signup(authFullName.trim(), authEmail.trim(), authPassword)
        : await daymarkApi.login(authEmail.trim(), authPassword);

      setUser(response.user);
      setProfileName(response.user.fullName);
      setProfileEmail(response.user.email);
      setAuthMode(null);
      resetAuthForm();
      await refreshQueue();

      if (authMode === "signup") {
        await loadProfile(response.user);
        setView("profile");
        showToast("Account created. Finish your profile setup.");
      } else {
        setView("timer");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<{ goal: GoalView }>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refreshQueue();
      if (timerRef.current) gsap.fromTo(timerRef.current, { opacity: 0.45, y: 7 }, { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" });
      if (message) showToast(message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const createGoal = async () => {
    const title = goalTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const created = await daymarkApi.createGoal(setDate, title, goalNote.trim());
      await refreshQueue();
      setGoalModal(false);
      setGoalTitle("");
      setGoalNote("");
      showToast(`Goal ${created.goal.sequence} added to your queue.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create goal");
    } finally {
      setBusy(false);
    }
  };

  const chooseReason = async (reason: string) => {
    if (!reasonMode || !goal) return;
    const status = reasonMode;
    setReasonMode(null);
    setCustomReason("");
    await run(() => daymarkApi.setStatus(goal.id, status, reason), status === "DISTRACTION" ? "Distraction recorded." : "Intentional switch recorded.");
  };

  const complete = async () => {
    if (!goal || busy) return;
    setBusy(true);
    try {
      const response = await daymarkApi.completeGoal(goal.id);
      setCompletion(response.goal);
      await refreshQueue();
      if (response.nextGoal) showToast(`Goal ${response.nextGoal.sequence} is next.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not complete goal");
    } finally {
      setBusy(false);
    }
  };

  const changeView = async (next: ViewName, event?: MouseEvent<HTMLButtonElement>) => {
    if (event) animateAction(event.currentTarget);
    setView(next);
    try {
      if (next === "timer") await refreshQueue();
      if (next === "history") {
        const [historyResponse] = await Promise.all([
          daymarkApi.history(),
          loadPeriodReport(reportPeriod, reportAnchor),
        ]);
        setHistory(historyResponse.goals);
      }
      if (next === "profile") await loadProfile();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load view");
    }
  };

  const changeReportPeriod = async (period: ReportPeriod) => {
    const anchor = setDate;
    setReportPeriod(period);
    setReportAnchor(anchor);
    try {
      await loadPeriodReport(period, anchor);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load report");
    }
  };

  const moveReport = async (direction: -1 | 1) => {
    const anchor = shiftReportAnchor(reportAnchor, reportPeriod, direction);
    setReportAnchor(anchor);
    try {
      await loadPeriodReport(reportPeriod, anchor);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load report");
    }
  };

  const resetReportToCurrent = async () => {
    setReportAnchor(setDate);
    try {
      await loadPeriodReport(reportPeriod, setDate);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load report");
    }
  };

  const saveProfile = async () => {
    if (busy || !profileName.trim() || !profileEmail.trim()) return;
    setBusy(true);
    try {
      const response = await daymarkApi.updateProfile({ fullName: profileName.trim(), email: profileEmail.trim() });
      setUser(response.user);
      setProfileName(response.user.fullName);
      setProfileEmail(response.user.email);
      showToast("Profile updated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update profile");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      showToast("New passwords do not match.");
      return;
    }
    if (!currentPassword || newPassword.length < 8) {
      showToast("Enter your current password and a new password with at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      await daymarkApi.updatePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      showToast("Password updated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  const saveTelegram = async () => {
    setBusy(true);
    try {
      const settings = await daymarkApi.saveTelegramSettings({ enabled: telegramEnabled, chatId: chatId.trim(), botToken: botToken.trim() || undefined });
      setTelegram(settings);
      setBotToken("");
      showToast("Telegram connection saved.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save Telegram settings");
    } finally {
      setBusy(false);
    }
  };

  const testTelegram = async () => {
    setBusy(true);
    try {
      await daymarkApi.testTelegram();
      showToast("Test notification sent.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Telegram test failed");
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    daymarkApi.logout();
    setUser(null);
    setGoals([]);
    setGoal(null);
    setHistory([]);
    setPeriodReport(null);
    setTelegram(null);
    setView("timer");
    setAuthMode("login");
  };

  if (sessionLoading) return <div className="loading">Opening Daymark</div>;

  if (!user) {
    return (
      <div className="auth-shell" ref={authRef}>
        <div className="auth-brand">DAYMARK</div>
        <div className="auth-hero">
          <div className="eyebrow auth-proof">Personal execution system</div>
          <h1 className="auth-title">Measure execution, not intention.</h1>
          <p className="auth-copy">Set the goal. Start the clock. Record every distraction, break, and intentional switch until the outcome is actually finished.</p>
          <div className="auth-actions">
            <button className="empty-action" onClick={() => setAuthMode("signup")}>Create account</button>
            <button className="control-button" onClick={() => setAuthMode("login")}>Sign in</button>
          </div>
          <div className="auth-proof-grid">
            <div className="auth-proof"><strong>One queue</strong><span>Goals continue across days.</span></div>
            <div className="auth-proof"><strong>Real timing</strong><span>Focus and distraction are measured separately.</span></div>
            <div className="auth-proof"><strong>Accountability</strong><span>Send status changes to your Telegram bot.</span></div>
          </div>
        </div>

        {authMode && <div className="modal-layer"><div className="modal-backdrop" onClick={() => setAuthMode(null)} /><form className="modal" ref={authModalRef} onSubmit={(event) => void submitAuth(event)}><div className="modal-kicker">{authMode === "signup" ? "Create your Daymark" : "Welcome back"}</div><h2 className="modal-title">{authMode === "signup" ? "Start measuring the work that matters." : "Continue where you left off."}</h2>{authMode === "signup" && <label className="field"><span className="field-label">Full name</span><input className="text-input" autoFocus value={authFullName} onChange={(event) => setAuthFullName(event.target.value)} autoComplete="name" /></label>}<label className="field"><span className="field-label">Email</span><input className="text-input" type="email" autoFocus={authMode === "login"} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" /></label><label className="field"><span className="field-label">Password</span><input className="text-input" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"} /></label>{authMode === "signup" && <label className="field"><span className="field-label">Confirm password</span><input className="text-input" type="password" value={authConfirmPassword} onChange={(event) => setAuthConfirmPassword(event.target.value)} autoComplete="new-password" /></label>}<div className="modal-actions auth-modal-actions"><button className="control-button" type="button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>{authMode === "signup" ? "I already have an account" : "Create an account"}</button><button className="control-button primary" type="submit" disabled={busy || !authEmail.trim() || !authPassword || (authMode === "signup" && (!authFullName.trim() || !authConfirmPassword))}>{authMode === "signup" ? "Create account" : "Sign in"}</button></div></form></div>}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="shell" ref={rootRef}>
      <aside className="rail">
        <div className="mark">DM</div>
        <nav className="rail-nav" aria-label="Primary">
          <button className={`rail-button ${view === "timer" ? "active" : ""}`} title="Timer" onClick={(event) => void changeView("timer", event)}><Icon name="timer" /></button>
          <button className={`rail-button ${view === "history" ? "active" : ""}`} title="Reports" onClick={(event) => void changeView("history", event)}><Icon name="history" /></button>
        </nav>
        <button className={`rail-button rail-settings ${view === "profile" ? "active" : ""}`} title="Profile" onClick={(event) => void changeView("profile", event)}><Icon name="profile" /></button>
      </aside>

      <main className="main">
        <header className="topbar"><div className="topbar-kicker">Daymark / {view === "history" ? "reports" : view}</div><button className="account-chip" onClick={() => void changeView("profile")}><span>{user.fullName}</span><small>{user.email}</small></button></header>
        <div className="view" ref={viewRef}>
          {view === "timer" && <div className="today-grid">
            <section className="focus-stage">
              <div>
                <div className="eyebrow intro-reveal">{goal ? `Goal ${goal.sequence} · Set ${formatShortDate(goal.setDate)}` : "Timer ready"}</div>
                <h1 className={`goal-title intro-reveal ${!goal ? "goal-title-empty" : ""}`}>{goal?.title ?? "No active goal yet."}</h1>
                {goal?.note ? <p className="goal-note intro-reveal">{goal.note}</p> : !goal ? <p className="goal-note intro-reveal">The timer is always here. Add your first goal to the queue, then start when you are actually ready to work.</p> : null}
              </div>

              <div className="timer-wrap intro-reveal">
                <div className="status-line"><span className="status-dot" />{goal ? statusLabel(goal.currentStatus) : "Waiting for a goal"}</div>
                <div className="timer" ref={timerRef}>{formatDuration(liveFocusedMs, true)}</div>
                <div className="timer-sub">{goal ? `${formatDuration(liveElapsed)} total elapsed since start` : "Focused time will appear here"}</div>
              </div>

              {!goal ? <div className="control-dock intro-reveal"><button className="control-button primary" onClick={() => setGoalModal(true)}>+ Add first goal</button></div> : goal.status === "PLANNED" ? <div className="control-dock intro-reveal"><button className="control-button primary" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); void run(() => daymarkApi.startGoal(goal.id)); }}><Icon name="focus" /> Start goal {goal.sequence}</button><button className="control-button" onClick={() => setGoalModal(true)}>+ Queue another</button></div> : <div className="control-dock intro-reveal">
                <button className={`control-button ${goal.currentStatus === "FOCUS" ? "active" : ""}`} disabled={busy || goal.currentStatus === "FOCUS"} onClick={(event) => { animateAction(event.currentTarget); void run(() => daymarkApi.setStatus(goal.id, "FOCUS"), "Back in focus."); }}><Icon name="focus" /> Focus</button>
                <button className={`control-button ${goal.currentStatus === "BREAK" ? "active" : ""}`} disabled={busy || goal.currentStatus === "BREAK"} onClick={(event) => { animateAction(event.currentTarget); void run(() => daymarkApi.setStatus(goal.id, "BREAK"), "Break started."); }}><Icon name="break" /> Break</button>
                <button className="control-button danger" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); setReasonMode("DISTRACTION"); }}><Icon name="distract" /> Distracted</button>
                <button className="control-button" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); setReasonMode("SWITCH"); }}><Icon name="switch" /> Switch</button>
                <button className="control-button primary" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); void complete(); }}><Icon name="check" /> Goal achieved</button>
              </div>}
            </section>

            <aside className="side-stack">
              <section className="side-section"><div className="side-section-head"><h2 className="side-heading">Goal queue</h2><button className="mini-add" onClick={() => setGoalModal(true)}>+ Add</button></div><div className="sequence-list">{goals.length === 0 && <div className="field-hint">Nothing queued yet.</div>}{goals.map((item) => <div className="sequence-item" key={item.id}><span className="sequence-number">{String(item.sequence).padStart(2, "0")}</span><div className="sequence-copy"><div className={item.id === goal?.id ? "sequence-title active" : "sequence-title"}>{item.title}</div><div className="field-hint">Set {formatShortDate(item.setDate)} · {goalStateLabel(item)}</div></div><span className={`sequence-state ${item.status.toLowerCase()}`}>{item.status === "ACTIVE" ? "LIVE" : "NEXT"}</span></div>)}</div></section>

              <section className="side-section"><h2 className="side-heading">Current goal</h2><div className="metric"><span className="metric-label">Focused</span><span className="metric-value">{formatDuration(liveFocusedMs)}</span></div><div className="metric"><span className="metric-label">Total elapsed</span><span className="metric-value">{formatDuration(liveElapsed)}</span></div><div className="metric"><span className="metric-label">Distracted</span><span className="metric-value">{formatDuration(liveDistractionMs)}</span></div><div className="metric"><span className="metric-label">Breaks</span><span className="metric-value">{formatDuration(liveBreakMs)}</span></div><div className="metric"><span className="metric-label">Interruptions</span><span className="metric-value">{goal?.interruptions ?? 0}</span></div><div className="metric"><span className="metric-label">Longest run</span><span className="metric-value">{formatDuration(Math.max(goal?.longestFocusMs ?? 0, currentOpen?.type === "FOCUS" ? currentOpen.durationMs + Math.max(0, now - new Date(currentOpen.startedAt).getTime()) : 0))}</span></div></section>

              {goal && <section className="side-section"><h2 className="side-heading">Activity</h2><div className="activity-list">{[...goal.activities].reverse().slice(0, 8).map((activity) => <div className={`activity-row ${activity.type.toLowerCase()}`} key={activity.id}><span className="activity-pip" /><span className="activity-name">{activity.reason || statusLabel(activity.type)}</span><span className="activity-time">{formatDuration(activity.durationMs + (!activity.endedAt ? Math.max(0, now - new Date(activity.startedAt).getTime()) : 0))}</span></div>)}</div></section>}
            </aside>
          </div>}

          {view === "history" && <section>
            <div className="section-head report-page-head"><div><div className="eyebrow">Execution reports</div><h1 className="section-title">What you actually did.</h1><p className="section-copy">Week, month, and year reports separate what you achieved from what remained unfinished. Individual goal reports show the full lifetime cost of each outcome.</p></div></div>

            <div className="period-toolbar">
              <div className="period-tabs">{(["week", "month", "year"] as ReportPeriod[]).map((period) => <button key={period} className={reportPeriod === period ? "period-tab active" : "period-tab"} onClick={() => void changeReportPeriod(period)}>{period}</button>)}</div>
              <div className="period-nav"><button onClick={() => void moveReport(-1)}>←</button><button onClick={() => void resetReportToCurrent()}>Current</button><button disabled={Boolean(periodReport && periodReport.endDate >= setDate)} onClick={() => void moveReport(1)}>→</button></div>
            </div>

            {periodReport && <article className="period-report">
              <div className="period-report-head"><div><div className="panel-kicker">{periodReport.isClosed ? "Final report" : "Live report"}</div><h2>{formatPeriodLabel(periodReport)}</h2></div><div className="period-rate"><strong>{periodReport.totals.completionRate}%</strong><span>completion</span></div></div>
              <div className="period-summary-grid"><div><span>Goals set</span><strong>{periodReport.totals.goalsSet}</strong></div><div><span>Achieved</span><strong>{periodReport.totals.achievedCount}</strong></div><div><span>Not achieved</span><strong>{periodReport.totals.notAchievedCount}</strong></div><div><span>Focused</span><strong>{formatDuration(periodReport.totals.focusedMs)}</strong></div><div><span>Distracted</span><strong>{formatDuration(periodReport.totals.distractionMs)}</strong></div><div><span>Breaks</span><strong>{formatDuration(periodReport.totals.breakMs)}</strong></div><div><span>Switches</span><strong>{formatDuration(periodReport.totals.switchMs)}</strong></div><div><span>Interruptions</span><strong>{periodReport.totals.interruptions}</strong></div></div>
              <div className="outcome-columns">
                <section className="outcome-column achieved"><div className="outcome-heading"><span>Achieved</span><strong>{periodReport.achieved.length}</strong></div>{periodReport.achieved.length === 0 ? <p className="outcome-empty">No goals completed in this period.</p> : <div className="outcome-list">{periodReport.achieved.map((item) => <div className="outcome-item" key={item.id}><span className="outcome-index">{String(item.sequence).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.carriedFromEarlier ? "Carried in · " : ""}completed {item.completedAt ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.completedAt)) : "in period"}</small></div></div>)}</div>}
                </section>
                <section className="outcome-column missed"><div className="outcome-heading"><span>Not achieved</span><strong>{periodReport.notAchieved.length}</strong></div>{periodReport.notAchieved.length === 0 ? <p className="outcome-empty">Nothing unfinished at this period boundary.</p> : <div className="outcome-list">{periodReport.notAchieved.map((item) => <div className="outcome-item" key={item.id}><span className="outcome-index">{String(item.sequence).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.carriedFromEarlier ? "Carried from earlier · " : `Set ${formatShortDate(item.setDate)} · `}{item.completedLater ? "completed later" : "still open"}</small></div></div>)}</div>}
                </section>
              </div>
            </article>}

            <div className="goal-report-heading"><div className="eyebrow">Completed goals</div><h2>What each outcome cost.</h2></div>
            <div className="report-list">{history.length === 0 && <div className="empty-report">Complete your first goal and its report will appear here.</div>}{history.map((item) => <article className="report-card" key={item.id}><div className="report-head"><div><div className="report-sequence">Goal {String(item.sequence).padStart(2, "0")}</div><h2>{item.title}</h2></div><div className="report-dates"><span>Set {formatShortDate(item.setDate)}</span><span>Completed {item.completedAt ? new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(item.completedAt)) : "—"}</span></div></div><div className="report-metrics"><div><span>Total elapsed</span><strong>{formatDuration(item.elapsedMs)}</strong></div><div><span>Focused</span><strong>{formatDuration(item.focusedMs)}</strong></div><div><span>Distracted</span><strong>{formatDuration(item.distractionMs)}</strong></div><div><span>Breaks</span><strong>{formatDuration(item.breakMs)}</strong></div><div><span>Intentional switches</span><strong>{formatDuration(item.switchMs)}</strong></div><div><span>Interruptions</span><strong>{item.interruptions}</strong></div><div><span>Longest focus run</span><strong>{formatDuration(item.longestFocusMs)}</strong></div><div><span>Focus share</span><strong>{item.elapsedMs > 0 ? `${Math.round((item.focusedMs / item.elapsedMs) * 100)}%` : "0%"}</strong></div></div></article>)}</div>
          </section>}

          {view === "profile" && <section><div className="section-head profile-heading"><div><div className="eyebrow">Your account</div><h1 className="section-title">Profile & connections.</h1><p className="section-copy">Your identity, password, and Telegram accountability channel live here.</p></div><button className="control-button" onClick={logout}>Sign out</button></div><div className="profile-grid">
            <section className="profile-panel"><div className="panel-kicker">Profile</div><h2>Account information</h2><label className="field"><span className="field-label">Full name</span><input className="text-input" value={profileName} onChange={(event) => setProfileName(event.target.value)} autoComplete="name" /></label><label className="field"><span className="field-label">Email</span><input className="text-input" type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} autoComplete="email" /></label><div className="form-actions"><button className="control-button primary" disabled={busy || !profileName.trim() || !profileEmail.trim()} onClick={() => void saveProfile()}>Save profile</button></div></section>

            <section className="profile-panel"><div className="panel-kicker">Security</div><h2>Change password</h2><label className="field"><span className="field-label">Current password</span><input className="text-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label><label className="field"><span className="field-label">New password</span><input className="text-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label><label className="field"><span className="field-label">Confirm new password</span><input className="text-input" type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} autoComplete="new-password" /></label><div className="form-actions"><button className="control-button primary" disabled={busy || !currentPassword || newPassword.length < 8 || !confirmNewPassword} onClick={() => void savePassword()}>Update password</button></div></section>

            <section className="profile-panel telegram-panel"><div className="panel-kicker">Telegram</div><h2>Accountability connection</h2><p className="panel-copy">Daymark is still a normal website. Your bot simply receives the status and completion notifications you choose to send.</p><div className="field toggle-row"><div><span className="field-label">Telegram notifications</span><div className="field-hint">Send goal starts, status changes, and completion reports.</div></div><button className={`toggle ${telegramEnabled ? "on" : ""}`} type="button" aria-pressed={telegramEnabled} onClick={() => setTelegramEnabled((value) => !value)}><span className="toggle-thumb" /></button></div><label className="field"><span className="field-label">Bot token</span><input className="text-input" type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder={telegram?.tokenConfigured ? `Configured ${telegram.tokenHint ?? ""}` : "123456:ABC..."} autoComplete="off" /><div className="field-hint">Leave blank to keep the encrypted token already stored.</div></label><label className="field"><span className="field-label">Chat ID</span><input className="text-input" value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="-1001234567890" /></label><div className="form-actions"><button className="control-button primary" disabled={busy} onClick={() => void saveTelegram()}>Save Telegram</button><button className="control-button" disabled={busy || !telegram?.tokenConfigured || !telegram?.chatId} onClick={() => void testTelegram()}>Send test</button></div></section>
          </div></section>}
        </div>
      </main>

      {goalModal && <div className="modal-layer"><div className="modal-backdrop" onClick={() => setGoalModal(false)} /><section className="modal" ref={modalRef}><div className="modal-kicker">New goal</div><h2 className="modal-title">What outcome comes next?</h2><label className="field"><span className="field-label">Goal</span><input className="text-input" autoFocus value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Finish Workforce mobile parity" onKeyDown={(event) => { if (event.key === "Enter" && goalTitle.trim()) void createGoal(); }} /></label><label className="field"><span className="field-label">Definition of done · optional</span><textarea className="text-area" value={goalNote} onChange={(event) => setGoalNote(event.target.value)} placeholder="What specifically counts as finished?" /></label><div className="field-hint goal-set-note">This goal will be recorded as set on {formatShortDate(setDate)}. It can continue for as many days as needed.</div><div className="modal-actions"><button className="control-button" onClick={() => setGoalModal(false)}>Cancel</button><button className="control-button primary" disabled={!goalTitle.trim() || busy} onClick={() => void createGoal()}>Add to queue</button></div></section></div>}

      {reasonMode && <div className="modal-layer"><div className="modal-backdrop" onClick={() => setReasonMode(null)} /><section className="modal" ref={modalRef}><div className="modal-kicker">{reasonMode === "DISTRACTION" ? "Record the leak" : "Intentional switch"}</div><h2 className="modal-title">{reasonMode === "DISTRACTION" ? "What pulled you away?" : "Why are you switching?"}</h2><div className="reason-grid">{(reasonMode === "DISTRACTION" ? distractionReasons : switchReasons).map((reason) => <button className="reason-button" key={reason} onClick={() => void chooseReason(reason)}>{reason}</button>)}</div><label className="field"><span className="field-label">Or write it</span><input className="text-input" value={customReason} onChange={(event) => setCustomReason(event.target.value)} placeholder="Short reason" onKeyDown={(event) => { if (event.key === "Enter" && customReason.trim()) void chooseReason(customReason.trim()); }} /></label><div className="modal-actions"><button className="control-button" onClick={() => setReasonMode(null)}>Cancel</button><button className="control-button primary" disabled={!customReason.trim()} onClick={() => void chooseReason(customReason.trim())}>Record</button></div></section></div>}

      {completion && <div className="completion-layer" ref={completionRef} onClick={() => setCompletion(null)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setCompletion(null); }}>{Array.from({ length: 24 }, (_, index) => <span key={index} className="spark" style={{ transform: `rotate(${index * 15}deg) translateY(-180px)` }} />)}<div className="completion-inner"><div className="completion-kicker">Goal {completion.sequence} achieved</div><div className="completion-title">Marked.</div><div className="completion-summary">{formatDuration(completion.focusedMs)} focused · {formatDuration(completion.elapsedMs)} elapsed · {formatDuration(completion.distractionMs)} distracted</div></div></div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
