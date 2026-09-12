"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import gsap from "gsap";
import { ActivityType, daymarkApi, GoalView, TelegramSettings } from "@/lib/api";

type ViewName = "today" | "history" | "settings";
type ReasonMode = "DISTRACTION" | "SWITCH" | null;

const distractionReasons = ["Betting dashboard", "Phone", "Social media", "Random browsing", "Someone interrupted me", "Other"];
const switchReasons = ["Coding agent running", "Urgent project", "Waiting on dependency", "Planned task switch", "Meeting / call", "Other"];

function localDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(ms: number, includeSeconds = false) {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (includeSeconds) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit" }).format(new Date(`${date}T12:00:00`));
}

function statusLabel(status: ActivityType | null) {
  if (!status) return "Ready";
  if (status === "FOCUS") return "Focused";
  if (status === "BREAK") return "On break";
  if (status === "DISTRACTION") return "Distracted";
  return "Intentional switch";
}

function Icon({ name }: { name: "today" | "history" | "settings" | "focus" | "break" | "distract" | "switch" | "check" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "today") return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "history") return <svg viewBox="0 0 24 24" {...common}><path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.7" /><path d="M4 4v4.7h4.7M12 8v4l2.6 1.5" /></svg>;
  if (name === "settings") return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7a6 6 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a6 6 0 0 0-1.7-.7L10.8 2h-3l-.7 2.3a6 6 0 0 0-1.7.7l-1.9-.9-2.1 2.1.9 1.9a6 6 0 0 0-.7 1.7l-2 .7v3l2 .7a6 6 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a6 6 0 0 0 1.7.7l.7 2.3h3l.7-2.3a6 6 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a6 6 0 0 0 .7-1.7z" transform="translate(1.1 0) scale(.9)" /></svg>;
  if (name === "focus") return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" /></svg>;
  if (name === "break") return <svg viewBox="0 0 24 24" {...common}><path d="M8 5v14M16 5v14" /></svg>;
  if (name === "distract") return <svg viewBox="0 0 24 24" {...common}><path d="M12 3 3 20h18L12 3Z" /><path d="M12 9v5M12 17h.01" /></svg>;
  if (name === "switch") return <svg viewBox="0 0 24 24" {...common}><path d="M4 8h12M13 5l3 3-3 3M20 16H8M11 13l-3 3 3 3" /></svg>;
  return <svg viewBox="0 0 24 24" {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

export function DaymarkApp() {
  const [view, setView] = useState<ViewName>("today");
  const [goal, setGoal] = useState<GoalView | null>(null);
  const [history, setHistory] = useState<GoalView[]>([]);
  const [telegram, setTelegram] = useState<TelegramSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [goalModal, setGoalModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalNote, setGoalNote] = useState("");
  const [reasonMode, setReasonMode] = useState<ReasonMode>(null);
  const [customReason, setCustomReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [completion, setCompletion] = useState<GoalView | null>(null);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const date = useMemo(localDateKey, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshToday = useCallback(async () => {
    const response = await daymarkApi.today(date);
    setGoal(response.goal);
  }, [date]);

  useEffect(() => {
    void refreshToday().catch((error: Error) => showToast(error.message)).finally(() => setLoading(false));
  }, [refreshToday, showToast]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useLayoutEffect(() => {
    if (!rootRef.current || loading) return;
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline.from(".rail", { x: -34, opacity: 0, duration: 0.65 }).from(".topbar", { y: -20, opacity: 0, duration: 0.55 }, "<0.12").from(".intro-reveal", { y: 36, opacity: 0, duration: 0.72, stagger: 0.075 }, "<0.08").from(".side-section", { x: 24, opacity: 0, duration: 0.55, stagger: 0.09 }, "<0.18");
    }, rootRef);
    return () => ctx.revert();
  }, [loading]);

  useLayoutEffect(() => {
    if (!viewRef.current || loading) return;
    gsap.fromTo(viewRef.current, { opacity: 0, y: 16, filter: "blur(5px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.48, ease: "power3.out" });
  }, [view, loading]);

  useLayoutEffect(() => {
    if (!viewRef.current) return;
    const selector = view === "history" ? ".history-row" : view === "settings" ? ".field, .form-actions" : ".metric, .activity-row";
    gsap.fromTo(viewRef.current.querySelectorAll(selector), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.035, ease: "power3.out", clearProps: "transform" });
  }, [view, history.length, telegram?.tokenConfigured]);

  useLayoutEffect(() => {
    if (!modalRef.current || (!goalModal && !reasonMode)) return;
    const modal = modalRef.current;
    gsap.fromTo(modal.parentElement?.querySelector(".modal-backdrop"), { opacity: 0 }, { opacity: 1, duration: 0.24 });
    gsap.fromTo(modal, { y: 34, scale: 0.965, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.46, ease: "power4.out" });
  }, [goalModal, reasonMode]);

  useLayoutEffect(() => {
    if (!completion || !completionRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo(".completion-layer", { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.7, ease: "power4.inOut" }).from(".completion-kicker", { y: 18, opacity: 0, duration: 0.4 }, "-=0.15").from(".completion-title", { y: 70, opacity: 0, rotateX: -18, duration: 0.8, ease: "power4.out" }, "-=0.15").from(".completion-summary", { y: 18, opacity: 0, duration: 0.45 }, "-=0.35").fromTo(".spark", { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.55, stagger: 0.018, ease: "power2.out" }, "-=0.7");
      gsap.to(".spark", { rotation: "+=28", duration: 4.5, ease: "none", repeat: -1 });
    }, completionRef);
    return () => ctx.revert();
  }, [completion]);

  const liveFocusedMs = useMemo(() => {
    if (!goal) return 0;
    if (goal.status !== "ACTIVE" || goal.currentStatus !== "FOCUS") return goal.focusedMs;
    const open = [...goal.activities].reverse().find((activity) => activity.type === "FOCUS" && !activity.endedAt);
    if (!open) return goal.focusedMs;
    return goal.focusedMs + Math.max(0, now - new Date(open.startedAt).getTime());
  }, [goal, now]);

  const animateAction = (target: HTMLElement) => {
    gsap.fromTo(target, { scale: 0.96 }, { scale: 1, duration: 0.42, ease: "elastic.out(1, 0.45)" });
  };

  const run = async (action: () => Promise<{ goal: GoalView }>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await action();
      setGoal(response.goal);
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
      await daymarkApi.createGoal(date, title, goalNote.trim());
      const started = await daymarkApi.startGoal(date);
      setGoal(started.goal);
      setGoalModal(false);
      setGoalTitle("");
      setGoalNote("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create goal");
    } finally {
      setBusy(false);
    }
  };

  const chooseReason = async (reason: string) => {
    if (!reasonMode) return;
    const status = reasonMode;
    setReasonMode(null);
    setCustomReason("");
    await run(() => daymarkApi.setStatus(date, status, reason), status === "DISTRACTION" ? "Distraction recorded." : "Intentional switch recorded.");
  };

  const complete = async () => {
    if (!goal || busy) return;
    setBusy(true);
    try {
      const response = await daymarkApi.completeGoal(date);
      setGoal(response.goal);
      setCompletion(response.goal);
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
      if (next === "history") {
        const response = await daymarkApi.history();
        setHistory(response.goals);
      }
      if (next === "settings") {
        const settings = await daymarkApi.telegramSettings();
        setTelegram(settings);
        setChatId(settings.chatId);
        setTelegramEnabled(settings.enabled);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load view");
    }
  };

  const saveTelegram = async () => {
    setBusy(true);
    try {
      const settings = await daymarkApi.saveTelegramSettings({ enabled: telegramEnabled, chatId: chatId.trim(), botToken: botToken.trim() || undefined });
      setTelegram(settings);
      setBotToken("");
      showToast("Telegram settings saved.");
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

  if (loading) return <div className="loading">Opening Daymark</div>;

  const currentOpen = goal?.activities.find((activity) => !activity.endedAt) ?? null;
  const liveElapsed = goal?.startedAt && goal.status === "ACTIVE" ? Math.max(goal.elapsedMs, now - new Date(goal.startedAt).getTime()) : goal?.elapsedMs ?? 0;

  return (
    <div className="shell" ref={rootRef}>
      <aside className="rail">
        <div className="mark">DM</div>
        <nav className="rail-nav" aria-label="Primary">
          <button className={`rail-button ${view === "today" ? "active" : ""}`} title="Today" onClick={(event) => void changeView("today", event)}><Icon name="today" /></button>
          <button className={`rail-button ${view === "history" ? "active" : ""}`} title="History" onClick={(event) => void changeView("history", event)}><Icon name="history" /></button>
        </nav>
        <button className={`rail-button rail-settings ${view === "settings" ? "active" : ""}`} title="Settings" onClick={(event) => void changeView("settings", event)}><Icon name="settings" /></button>
      </aside>

      <main className="main">
        <header className="topbar"><div className="topbar-kicker">Daymark / {view}</div><div className="topbar-date">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</div></header>
        <div className="view" ref={viewRef}>
          {view === "today" && !goal && <section className="empty-stage"><div className="eyebrow intro-reveal">Today has one job</div><h1 className="empty-title intro-reveal">Decide what makes today count.</h1><p className="empty-copy intro-reveal">Choose one outcome worth finishing. Daymark will measure the work between this decision and the moment it is done — including every distraction that tries to steal it.</p><button className="empty-action intro-reveal" onClick={() => setGoalModal(true)}>Set today&apos;s goal</button></section>}

          {view === "today" && goal && <div className="today-grid">
            <section className="focus-stage">
              <div><div className="eyebrow intro-reveal">Today&apos;s commitment</div><h1 className="goal-title intro-reveal">{goal.title}</h1>{goal.note && <p className="goal-note intro-reveal">{goal.note}</p>}</div>
              <div className="timer-wrap intro-reveal"><div className="status-line"><span className="status-dot" />{goal.status === "COMPLETED" ? "Achieved" : statusLabel(goal.currentStatus)}</div><div className="timer" ref={timerRef}>{formatDuration(liveFocusedMs, true)}</div><div className="timer-sub">Focused time · {formatDuration(liveElapsed)} elapsed since start</div></div>
              {goal.status === "PLANNED" ? <div className="control-dock intro-reveal"><button className="control-button primary" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); void run(() => daymarkApi.startGoal(date)); }}><Icon name="focus" /> Begin</button></div> : goal.status === "ACTIVE" ? <div className="control-dock intro-reveal">
                <button className={`control-button ${goal.currentStatus === "FOCUS" ? "active" : ""}`} disabled={busy || goal.currentStatus === "FOCUS"} onClick={(event) => { animateAction(event.currentTarget); void run(() => daymarkApi.setStatus(date, "FOCUS"), "Back in focus."); }}><Icon name="focus" /> Focus</button>
                <button className={`control-button ${goal.currentStatus === "BREAK" ? "active" : ""}`} disabled={busy || goal.currentStatus === "BREAK"} onClick={(event) => { animateAction(event.currentTarget); void run(() => daymarkApi.setStatus(date, "BREAK"), "Break started."); }}><Icon name="break" /> Break</button>
                <button className="control-button danger" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); setReasonMode("DISTRACTION"); }}><Icon name="distract" /> Distracted</button>
                <button className="control-button" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); setReasonMode("SWITCH"); }}><Icon name="switch" /> Switch</button>
                <button className="control-button primary" disabled={busy} onClick={(event) => { animateAction(event.currentTarget); void complete(); }}><Icon name="check" /> Goal achieved</button>
              </div> : <div className="control-dock intro-reveal"><button className="control-button primary" onClick={() => setCompletion(goal)}><Icon name="check" /> View result</button></div>}
            </section>
            <aside className="side-stack"><section className="side-section"><h2 className="side-heading">Today</h2><div className="metric"><span className="metric-label">Focused</span><span className="metric-value">{formatDuration(liveFocusedMs)}</span></div><div className="metric"><span className="metric-label">Longest run</span><span className="metric-value">{formatDuration(Math.max(goal.longestFocusMs, currentOpen?.type === "FOCUS" ? currentOpen.durationMs + (now - new Date(currentOpen.startedAt).getTime()) : 0))}</span></div><div className="metric"><span className="metric-label">Interruptions</span><span className="metric-value">{goal.interruptions}</span></div><div className="metric"><span className="metric-label">Lost to distraction</span><span className="metric-value">{formatDuration(goal.distractionMs)}</span></div></section>
              <section className="side-section"><h2 className="side-heading">Activity</h2><div className="activity-list">{[...goal.activities].reverse().slice(0, 8).map((activity) => <div className={`activity-row ${activity.type.toLowerCase()}`} key={activity.id}><span className="activity-pip" /><span className="activity-name">{activity.reason || statusLabel(activity.type)}</span><span className="activity-time">{formatDuration(activity.durationMs + (!activity.endedAt ? now - new Date(activity.startedAt).getTime() : 0))}</span></div>)}</div></section>
            </aside>
          </div>}

          {view === "history" && <section><div className="section-head"><div><div className="eyebrow">Execution archive</div><h1 className="section-title">What you finished.</h1></div></div><div className="history-list">{history.length === 0 && <div className="field-hint" style={{ padding: "28px 0" }}>No finished days yet.</div>}{history.map((item) => <article className="history-row" key={item.id}><div className="history-date">{formatShortDate(item.goalDate)}</div><div><div className="history-goal">{item.title}</div><div className="history-status">{item.status === "COMPLETED" ? "Achieved" : item.status.toLowerCase()}</div></div><div><div className="history-stat-label">Focus</div><div className="history-stat-value">{formatDuration(item.focusedMs)}</div></div><div><div className="history-stat-label">Elapsed</div><div className="history-stat-value">{formatDuration(item.elapsedMs)}</div></div><div><div className="history-stat-label">Interruptions</div><div className="history-stat-value">{item.interruptions}</div></div></article>)}</div></section>}

          {view === "settings" && <section className="settings-grid"><div className="settings-copy"><div className="eyebrow">Outbound integration</div><h2>Telegram, without becoming Telegram.</h2><p>Daymark stays a standalone website. Your bot is only the accountability channel. The bot token is encrypted by the NestJS backend before it is stored and is never returned to the browser.</p></div><div><div className="settings-form"><div className="field toggle-row"><div><span className="field-label">Telegram notifications</span><div className="field-hint">Send goal and status events to your selected chat.</div></div><button className={`toggle ${telegramEnabled ? "on" : ""}`} type="button" aria-pressed={telegramEnabled} onClick={() => setTelegramEnabled((value) => !value)}><span className="toggle-thumb" /></button></div><label className="field"><span className="field-label">Bot token</span><input className="text-input" type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder={telegram?.tokenConfigured ? `Configured ${telegram.tokenHint ?? ""}` : "123456:ABC..."} autoComplete="off" /><div className="field-hint">Leave blank to keep the existing encrypted token.</div></label><label className="field"><span className="field-label">Chat ID</span><input className="text-input" value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="-1001234567890" /><div className="field-hint">Works with a private chat, group, or channel your bot can message.</div></label></div><div className="form-actions"><button className="control-button primary" disabled={busy} onClick={() => void saveTelegram()}>Save settings</button><button className="control-button" disabled={busy || !telegram?.tokenConfigured || !telegram?.chatId} onClick={() => void testTelegram()}>Send test</button></div></div></section>}
        </div>
      </main>

      {goalModal && <div className="modal-layer"><div className="modal-backdrop" onClick={() => setGoalModal(false)} /><section className="modal" ref={modalRef}><div className="modal-kicker">One outcome</div><h2 className="modal-title">What must be true before today is done?</h2><label className="field"><span className="field-label">Today&apos;s goal</span><input className="text-input" autoFocus value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Finish Workforce mobile parity" onKeyDown={(event) => { if (event.key === "Enter" && goalTitle.trim()) void createGoal(); }} /></label><label className="field"><span className="field-label">Definition of done · optional</span><textarea className="text-area" value={goalNote} onChange={(event) => setGoalNote(event.target.value)} placeholder="What specifically counts as finished?" /></label><div className="modal-actions"><button className="control-button" onClick={() => setGoalModal(false)}>Cancel</button><button className="control-button primary" disabled={!goalTitle.trim() || busy} onClick={() => void createGoal()}>Commit to it</button></div></section></div>}

      {reasonMode && <div className="modal-layer"><div className="modal-backdrop" onClick={() => setReasonMode(null)} /><section className="modal" ref={modalRef}><div className="modal-kicker">{reasonMode === "DISTRACTION" ? "Record the leak" : "Intentional switch"}</div><h2 className="modal-title">{reasonMode === "DISTRACTION" ? "What pulled you away?" : "Why are you switching?"}</h2><div className="reason-grid">{(reasonMode === "DISTRACTION" ? distractionReasons : switchReasons).map((reason) => <button className="reason-button" key={reason} onClick={() => void chooseReason(reason)}>{reason}</button>)}</div><label className="field"><span className="field-label">Or write it</span><input className="text-input" value={customReason} onChange={(event) => setCustomReason(event.target.value)} placeholder="Short reason" onKeyDown={(event) => { if (event.key === "Enter" && customReason.trim()) void chooseReason(customReason.trim()); }} /></label><div className="modal-actions"><button className="control-button" onClick={() => setReasonMode(null)}>Cancel</button><button className="control-button primary" disabled={!customReason.trim()} onClick={() => void chooseReason(customReason.trim())}>Record</button></div></section></div>}

      {completion && <div className="completion-layer" ref={completionRef} onClick={() => setCompletion(null)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setCompletion(null); }}>{Array.from({ length: 24 }, (_, index) => <span key={index} className="spark" style={{ transform: `rotate(${index * 15}deg) translateY(-180px)` }} />)}<div className="completion-inner"><div className="completion-kicker">Goal achieved</div><div className="completion-title">Day marked.</div><div className="completion-summary">{formatDuration(completion.focusedMs)} focused · {formatDuration(completion.elapsedMs)} elapsed · {completion.interruptions} interruptions</div></div></div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
