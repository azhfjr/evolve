"use client";
import { AppSelect } from "./app-select";
import { useI18n } from "./i18n-provider";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Unplug,
} from "lucide-react";
import { Spinner } from "./ui";
type CalendarStatus = {
  configured: boolean;
  enabledByAdmin: boolean;
  connected: boolean;
  syncScope: "assigned" | "all";
  reminders: number[];
  pending: number;
  version: number;
  errorCode: string | null;
  lastSyncedAt: string | null;
};
export function CalendarSettings({
  demo,
  email,
}: {
  demo: boolean;
  email: string;
}) {
  const { t, localeTag } = useI18n();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [scope, setScope] = useState<"assigned" | "all">("assigned");
  const [reminders, setReminders] = useState<number[]>([1440, 30]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disconnect, setDisconnect] = useState(false);
  const [callbackResult] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("calendar"),
  );
  useEffect(() => {
    if (
      demo ||
      !status?.connected ||
      !status.pending ||
      status.errorCode === "reconnect_required"
    )
      return;
    const abort = new AbortController();
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch("/api/calendar", {
          signal: abort.signal,
          cache: "no-store",
        });
        if (response.ok) {
          const next = await response.json();
          if (!abort.signal.aborted) setStatus(next);
        }
      } catch {
      } finally {
        inFlight = false;
      }
    }, 4000);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [demo, status?.connected, status?.pending, status?.errorCode]);
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    fetch("/api/calendar", { signal: abort.signal })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        return b;
      })
      .then((b) => {
        setStatus(b);
        setScope(b.syncScope);
        setReminders(b.reminders);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [demo]);
  async function action(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || t("Koneksi Calendar gagal."));
      if (result.url) window.location.assign(result.url);
      else {
        setStatus(result);
        setScope(result.syncScope);
        setReminders(result.reminders);
        setDisconnect(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="integration-loading">
        <Spinner />
        {t("Memeriksa koneksi…")}
      </p>
    );
  return (
    <div className="calendar-settings">
      {callbackResult === "connected" && (
        <p role="status" className="info-box">
          {t(
            "Kalender berhasil dihubungkan. Task bertenggat sedang disinkronkan.",
          )}
        </p>
      )}
      {callbackResult === "failed" && (
        <p role="alert" className="form-error">
          {t(
            "Koneksi Google belum berhasil. Pastikan Calendar API aktif, URI callback sesuai, dan akun Anda diizinkan pada OAuth consent screen, lalu hubungkan kembali.",
          )}
        </p>
      )}
      <div className="integration-identity">
        <CalendarDays size={32} />
        <div>
          <h3>Google Calendar</h3>
          <p>{email}</p>
        </div>
        <span className={`pill ${status?.connected ? "green" : "gray"}`}>
          {status?.connected ? t("Terhubung") : t("Belum terhubung")}
        </span>
      </div>
      <p>
        {t("Task bertenggat dikirim ke kalender khusus")}{" "}
        <strong>Evolve</strong>
        {t(
          ". Perubahan dilakukan di Evolve; kalender pribadi lainnya tetap terpisah.",
        )}
      </p>
      {!demo && status && !status.enabledByAdmin && (
        <p className="info-box">
          Calendar integration is paused by the administrator. Your connection
          is preserved.
        </p>
      )}
      <p className="field-help">
        Select individual tasks from their Google Calendar panel to include or
        exclude them from your calendar. All-day reminders are relative to
        midnight; use a due time for a precise reminder.
      </p>
      {demo ? (
        <div className="info-box">
          {t(
            "Hubungkan kalender pribadi setelah masuk ke workspace. Demo tidak meminta akses akun Google Anda.",
          )}
        </div>
      ) : !status?.configured ? (
        <div className="info-box">
          {t(
            "Koneksi Calendar belum siap. Hubungi admin untuk mengaktifkan integrasi Google Calendar.",
          )}
        </div>
      ) : !status.connected ? (
        <button
          className="button primary"
          disabled={busy || !status?.enabledByAdmin}
          onClick={() => void action({ action: "connect" })}
        >
          {busy ? <Spinner /> : <ExternalLink size={16} />}
          {t("Hubungkan Google Calendar")}
        </button>
      ) : (
        <>
          <div className="connection-status">
            <CheckCircle2 size={18} />
            <span>
              {status.errorCode
                ? t("Sinkronisasi memerlukan perhatian")
                : status.pending
                  ? t("{count} changes waiting to sync", {
                      count: status.pending,
                    })
                  : t("Kalender telah diperbarui")}
            </span>
            {status.lastSyncedAt && (
              <small>
                {t("Terakhir:")}{" "}
                {new Intl.DateTimeFormat(localeTag, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(status.lastSyncedAt))}
              </small>
            )}
          </div>
          {status.errorCode && (
            <p role="alert" className="form-error">
              {status.errorCode === "reconnect_required"
                ? t(
                    "Izin Google telah berakhir. Hubungkan kembali kalender Anda.",
                  )
                : status.errorCode === "integration_not_ready"
                  ? t(
                      "Google Calendar API belum siap pada project OAuth. Minta admin memeriksa pengaturan Google Cloud, lalu coba sinkronisasi ulang.",
                    )
                  : t(
                      "Google belum dapat menerima perubahan. Data task tetap tersimpan; Anda dapat mencoba sinkronisasi ulang.",
                    )}
            </p>
          )}
          <form
            className="standard-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action({
                action: "settings",
                version: status.version,
                syncScope: scope,
                reminders,
              });
            }}
          >
            <label>
              {t("Task yang disinkronkan")}
              <AppSelect
                aria-label={t("Task yang disinkronkan")}
                value={scope}
                onValueChange={(nextValue) =>
                  setScope(nextValue as "assigned" | "all")
                }
              >
                <option value="assigned">
                  {t("Task yang ditugaskan kepada saya")}
                </option>
                <option value="all">{t("Seluruh task aktif workspace")}</option>
              </AppSelect>
            </label>
            {scope === "all" && (
              <p className="info-box">
                {t(
                  "Judul, tenggat, dan tautan seluruh task aktif workspace akan disalin ke akun Google Anda.",
                )}
              </p>
            )}
            <fieldset className="preference-checks">
              <legend>
                {t("Pengingat Google Calendar untuk task berjam")}
              </legend>
              {[
                [1440, t("1 hari sebelumnya")],
                [60, t("1 jam sebelumnya")],
                [30, t("30 menit sebelumnya")],
                [10, t("10 menit sebelumnya")],
              ].map(([minutes, label]) => (
                <label key={minutes}>
                  <input
                    type="checkbox"
                    checked={reminders.includes(Number(minutes))}
                    onChange={(e) =>
                      setReminders(
                        e.target.checked
                          ? [...reminders, Number(minutes)]
                          : reminders.filter((m) => m !== Number(minutes)),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="muted small">
              {t(
                "Task tanpa jam menggunakan pengingat event sepanjang hari. Aktifkan notifikasi kalender Evolve di aplikasi Google Calendar dan izinkan notifikasi pada perangkat. Pengingat Google Calendar memiliki pengaturan terpisah dari notifikasi Evolve.",
              )}
            </p>
            <div className="form-actions">
              <button
                className="button primary"
                disabled={busy || !status?.enabledByAdmin}
              >
                {busy ? <Spinner /> : t("Simpan pengaturan Calendar")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !status?.enabledByAdmin}
                onClick={() => void action({ action: "retry" })}
              >
                <RefreshCw size={15} />
                {t("Sinkronkan ulang")}
              </button>
            </div>
          </form>
          {status.errorCode === "reconnect_required" && (
            <button
              className="button secondary"
              disabled={busy || !status?.enabledByAdmin}
              onClick={() => void action({ action: "connect" })}
            >
              {t("Hubungkan kembali")}
            </button>
          )}
          <div className="disconnect-section">
            {disconnect ? (
              <>
                <p>
                  {t(
                    "Putuskan koneksi? Sinkronisasi berhenti; event yang sudah ada tetap tersimpan di Google Calendar.",
                  )}
                </p>
                <button
                  className="button secondary"
                  onClick={() => setDisconnect(false)}
                >
                  {t("Batal")}
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => void action({ action: "disconnect" })}
                >
                  {t("Putuskan koneksi")}
                </button>
              </>
            ) : (
              <button className="text-link" onClick={() => setDisconnect(true)}>
                <Unplug size={15} />
                {t("Putuskan koneksi Calendar")}
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
    </div>
  );
}
