"use client";
import { AppSelect } from "./app-select";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  UserRound,
  Building2,
  Palette,
  CalendarDays,
  Save,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceData, Member } from "@/lib/types";
import {
  defaultProfile,
  DEFAULT_WORKSPACE,
  profileFields,
  workspaceFields,
} from "@/lib/preferences";
import type { AccountProfile, WorkspaceSettings } from "@/lib/preferences";
import type { RunCommand } from "./workspace-types";
import { Avatar, Modal, Spinner } from "./ui";
import { ImageUpload } from "./attachments";
import { WorkspaceControls } from "./workspace-controls";
import { FileManager } from "./file-manager";
import { CalendarSettings } from "./calendar-settings";
import { useI18n } from "./i18n-provider";
import { validationSummary } from "@/lib/i18n/validation";

const zones = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Bangkok",
  "Asia/Singapore",
  "UTC",
  "Europe/London",
  "America/New_York",
];
function TimeZone({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label>
      {t("Zona waktu")}
      <AppSelect
        aria-label={t("Zona waktu")}
        value={value}
        onValueChange={(nextValue) => onChange(nextValue)}
      >
        {[...new Set([value, ...zones])].map((zone) => (
          <option key={zone}>{zone}</option>
        ))}
      </AppSelect>
    </label>
  );
}
export function AccountSettings({
  data,
  run,
  demo,
  onExport,
  onLogout,
  initialTab,
  fileRoom = "locker",
  sharedFiles = false,
  onFilesRemoved,
}: {
  onFilesRemoved?: () => Promise<void>;
  sharedFiles?: boolean;
  fileRoom?: import("@/lib/file-management-model").FileRoom;
  data: Pick<WorkspaceData, "actor" | "profile" | "settings">;
  run: RunCommand;
  demo: boolean;
  onExport: () => void;
  onLogout: () => void;
  initialTab?: string;
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState(() => {
    const wanted =
      initialTab ??
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tab")
        : null);
    return wanted &&
      [
        "account",
        "appearance",
        ...(fileRoom === "locker" ? ["calendar"] : []),
        ...(data.actor.isAdmin
          ? [...(fileRoom === "locker" ? ["workspace"] : []), "files"]
          : []),
      ].includes(wanted)
      ? wanted
      : "account";
  });
  const [profile, setProfile] = useState(
    data.profile || defaultProfile(data.actor.name),
  );
  const savedProfile = useRef(data.profile);
  useEffect(() => {
    const incoming = data.profile;
    const previous = savedProfile.current;
    savedProfile.current = incoming;
    if (!incoming || !previous || incoming.version === previous.version) return;
    // Refresh untouched fields while preserving edits made in this form. This
    // also synchronizes sidebar theme saves without advancing a stale draft.
    setProfile((draft) => {
      const next = { ...incoming, preferences: { ...incoming.preferences } };
      for (const key of [
        "name",
        "jobTitle",
        "bio",
        "timeZone",
        "avatarId",
      ] as const)
        if (draft[key] !== previous[key])
          Object.assign(next, { [key]: draft[key] });
      for (const key of Object.keys(
        draft.preferences,
      ) as (keyof AccountProfile["preferences"])[])
        if (
          draft.preferences[key] !== previous.preferences[key] &&
          key !== "theme"
        )
          Object.assign(next.preferences, { [key]: draft.preferences[key] });
      // A sidebar theme save is authoritative; an unrelated profile refresh
      // keeps an unsaved appearance choice just like other form fields.
      if (incoming.preferences.theme === previous.preferences.theme)
        next.preferences.theme = draft.preferences.theme;
      return next;
    });
  }, [data.profile]);
  const [workspace, setWorkspace] = useState(
    data.settings || DEFAULT_WORKSPACE,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const parsed = profileFields.safeParse({
        name: profile.name,
        jobTitle: profile.jobTitle,
        bio: profile.bio,
        timeZone: profile.timeZone,
        avatarId: profile.avatarId,
        preferences: profile.preferences,
      });
      if (!parsed.success)
        throw new Error(validationSummary(parsed.error.issues, locale));
      const result = await run({
        action: "updateProfile",
        version: profile.version,
        ...parsed.data,
      });
      if (result.profile) setProfile(result.profile as AccountProfile);
      toast.success(t("Pengaturan akun tersimpan"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="account-settings">
      <div
        className="settings-navigation"
        role="tablist"
        aria-label={t("Pengaturan")}
        onKeyDown={(event) => {
          if (
            ![
              "ArrowRight",
              "ArrowLeft",
              "ArrowDown",
              "ArrowUp",
              "Home",
              "End",
            ].includes(event.key)
          )
            return;
          event.preventDefault();
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]',
            ),
          ];
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (current +
                    (["ArrowLeft", "ArrowUp"].includes(event.key)
                      ? buttons.length - 1
                      : 1)) %
                  buttons.length;
          buttons[next]?.focus();
          buttons[next]?.click();
        }}
      >
        {[
          ["account", t("Akun saya"), UserRound],
          ["appearance", t("Tampilan"), Palette],
          ...(fileRoom === "locker"
            ? [["calendar", "Google Calendar", CalendarDays]]
            : []),
          ...(data.actor.isAdmin
            ? [
                ...(fileRoom === "locker"
                  ? [["workspace", "Workspace", Building2]]
                  : []),
                ["files", "Files", HardDrive],
              ]
            : []),
        ].map(([key, label, Icon]) => {
          const TabIcon = Icon as typeof UserRound;
          return (
            <button
              role="tab"
              id={`settings-tab-${key}`}
              aria-controls={tab === key ? `settings-panel-${key}` : undefined}
              tabIndex={tab === key ? 0 : -1}
              aria-selected={tab === key}
              key={key as string}
              onClick={() => {
                setTab(key as string);
                setError("");
              }}
            >
              <TabIcon size={17} />
              {label as string}
            </button>
          );
        })}
      </div>
      <div className="settings-content">
        {data.actor.isAdmin && (
          <a
            className="button secondary"
            href="/board-room?section=project-template"
          >
            Project Fields
          </a>
        )}
        <section
          role="tabpanel"
          id={`settings-panel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          className="panel settings-detail"
        >
          <header>
            <span className="eyebrow">{t("PENGATURAN")}</span>
            <h2>
              {tab === "files"
                ? "Files and storage"
                : tab === "account"
                  ? t("Profil dan preferensi Anda")
                  : tab === "workspace"
                    ? t("Identitas workspace")
                    : tab === "appearance"
                      ? t("Ruang kerja sesuai cara Anda")
                      : t("Hubungkan jadwal Anda")}
            </h2>
            <p className="muted">
              {tab === "files"
                ? "View shared storage usage for both apps and manage this app’s private files. Administrator only."
                : tab === "workspace"
                  ? t(
                      "Perubahan berlaku untuk seluruh anggota. Hanya admin yang dapat mengelola workspace.",
                    )
                  : tab === "calendar"
                    ? t(
                        "Kelola koneksi dan pengingat pada akun Google Anda sendiri.",
                      )
                    : t(
                        "Preferensi tersimpan untuk akun Anda dan mengikuti saat berpindah perangkat.",
                      )}
            </p>
          </header>
          {tab === "files" && data.actor.isAdmin && (
            <FileManager
              room={fileRoom}
              shared={sharedFiles}
              data={data}
              demo={demo}
              onRemoved={async (ids, references) => {
                const own = references.profiles.find(
                  (item) => item.email === data.actor.email,
                );
                if (own)
                  setProfile((current) => ({
                    ...current,
                    avatarId: null,
                    version: own.version,
                  }));
                if (references.workspaceVersion !== null)
                  setWorkspace((current) => ({
                    ...current,
                    logoId: null,
                    version: references.workspaceVersion!,
                  }));
                await onFilesRemoved?.();
              }}
            />
          )}
          {(tab === "account" || tab === "appearance") && (
            <form className="standard-form" onSubmit={saveProfile}>
              {tab === "account" ? (
                <>
                  <ImageUpload
                    entityType="avatar"
                    entityId={data.actor.email}
                    demo={demo}
                    value={profile.avatarId}
                    onChange={(avatarId) =>
                      setProfile({ ...profile, avatarId })
                    }
                  />
                  <div className="settings-field-grid">
                    <label>
                      {t("Nama tampilan")}
                      <input
                        required
                        maxLength={80}
                        autoComplete="name"
                        value={profile.name}
                        onChange={(e) =>
                          setProfile({ ...profile, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Jabatan")}
                      <input
                        maxLength={100}
                        autoComplete="organization-title"
                        value={profile.jobTitle}
                        onChange={(e) =>
                          setProfile({ ...profile, jobTitle: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    {t("Email Google")}
                    <input
                      value={data.actor.email}
                      readOnly
                      aria-describedby="account-email-help"
                    />
                    <small id="account-email-help" className="muted">
                      {t(
                        "Identitas login mengikuti akun Google. Perubahan profil tidak mengganti akun Google.",
                      )}
                    </small>
                  </label>
                  <label>
                    Bio
                    <textarea
                      maxLength={500}
                      rows={3}
                      value={profile.bio}
                      onChange={(e) =>
                        setProfile({ ...profile, bio: e.target.value })
                      }
                    />
                  </label>
                  <TimeZone
                    value={profile.timeZone}
                    onChange={(timeZone) =>
                      setProfile({ ...profile, timeZone })
                    }
                  />
                  <fieldset className="preference-checks">
                    <legend>{t("Notifikasi dalam aplikasi")}</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={profile.preferences.assignmentNotifications}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            preferences: {
                              ...profile.preferences,
                              assignmentNotifications: e.target.checked,
                            },
                          })
                        }
                      />
                      {t("Penugasan task kepada saya")}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={profile.preferences.commentNotifications}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            preferences: {
                              ...profile.preferences,
                              commentNotifications: e.target.checked,
                            },
                          })
                        }
                      />
                      {t("Komentar pada task saya")}
                    </label>
                  </fieldset>
                </>
              ) : (
                <>
                  <fieldset className="appearance-options">
                    <legend>{t("Tema")}</legend>
                    {["system", "light", "dark"].map((theme) => (
                      <label key={theme}>
                        <input
                          type="radio"
                          name="theme"
                          value={theme}
                          checked={profile.preferences.theme === theme}
                          onChange={() =>
                            setProfile({
                              ...profile,
                              preferences: {
                                ...profile.preferences,
                                theme: theme as "system" | "light" | "dark",
                              },
                            })
                          }
                        />
                        <span>
                          {theme === "system"
                            ? t("Ikuti perangkat")
                            : theme === "light"
                              ? t("Terang")
                              : t("Gelap")}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    {t("Kepadatan tampilan")}
                    <AppSelect
                      aria-label={t("Kepadatan tampilan")}
                      value={profile.preferences.density}
                      onValueChange={(nextValue) =>
                        setProfile({
                          ...profile,
                          preferences: {
                            ...profile.preferences,
                            density: nextValue as "comfortable" | "compact",
                          },
                        })
                      }
                    >
                      <option value="comfortable">
                        {t("Nyaman — ruang lebih lega")}
                      </option>
                      <option value="compact">
                        {t("Rapat — lebih banyak task terlihat")}
                      </option>
                    </AppSelect>
                  </label>
                  <label className="checkbox-setting">
                    <input
                      type="checkbox"
                      checked={profile.preferences.sidebarCollapsed}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          preferences: {
                            ...profile.preferences,
                            sidebarCollapsed: e.target.checked,
                          },
                        })
                      }
                    />
                    {t("Perkecil sidebar pada desktop")}
                  </label>
                </>
              )}
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={profile.preferences.reduceMotion}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      preferences: {
                        ...profile.preferences,
                        reduceMotion: e.target.checked,
                      },
                    })
                  }
                />
                Reduce interface motion
              </label>
              <label>
                Default activity view
                <AppSelect
                  aria-label={"Default activity view"}
                  value={profile.preferences.activityScope}
                  onValueChange={(nextValue) =>
                    setProfile({
                      ...profile,
                      preferences: {
                        ...profile.preferences,
                        activityScope: nextValue as "workspace" | "mine",
                      },
                    })
                  }
                >
                  <option value="workspace">Workspace activity</option>
                  <option value="mine">My activity</option>
                </AppSelect>
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {t(error)}
                </p>
              )}
              <div className="form-actions">
                <button className="button primary" disabled={saving}>
                  {saving ? <Spinner /> : <Save size={16} />}
                  {t("Simpan pengaturan akun")}
                </button>
              </div>
            </form>
          )}
          {tab === "workspace" && data.actor.isAdmin && (
            <form
              className="standard-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (saving) return;
                setSaving(true);
                setError("");
                try {
                  const { version, ...fields } = workspace;
                  const checked = workspaceFields.safeParse(fields);
                  if (!checked.success)
                    throw new Error(
                      validationSummary(checked.error.issues, locale),
                    );
                  const parsed = checked.data;
                  const result = await run({
                    action: "updateWorkspace",
                    version,
                    ...parsed,
                  });
                  if (result.settings)
                    setWorkspace(result.settings as WorkspaceSettings);
                  toast.success(t("Workspace diperbarui"));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <ImageUpload
                entityType="workspace"
                entityId="primary"
                demo={demo}
                value={workspace.logoId}
                onChange={(logoId) => setWorkspace({ ...workspace, logoId })}
              />
              <label>
                {t("Nama workspace")}
                <input
                  required
                  maxLength={80}
                  value={workspace.name}
                  onChange={(e) =>
                    setWorkspace({ ...workspace, name: e.target.value })
                  }
                />
              </label>
              <label>
                {t("Deskripsi workspace")}
                <textarea
                  rows={3}
                  maxLength={500}
                  value={workspace.description}
                  onChange={(e) =>
                    setWorkspace({ ...workspace, description: e.target.value })
                  }
                />
              </label>
              <TimeZone
                value={workspace.timeZone}
                onChange={(timeZone) =>
                  setWorkspace({ ...workspace, timeZone })
                }
              />
              <p className="field-help">
                Workspace time zone is the default for newly invited members.
                Each member can choose their own time zone.
              </p>
              <fieldset className="color-picker">
                <legend>{t("Warna aksen")}</legend>
                {["green", "violet", "blue", "orange", "pink"].map((accent) => (
                  <label
                    className={`color-swatch color-${accent}`}
                    key={accent}
                  >
                    <input
                      type="radio"
                      name="workspace-accent"
                      checked={workspace.accent === accent}
                      onChange={() =>
                        setWorkspace({
                          ...workspace,
                          accent: accent as typeof workspace.accent,
                        })
                      }
                    />
                    <span className="sr-only">{accent}</span>
                    {workspace.accent === accent && <Check size={15} />}
                  </label>
                ))}
              </fieldset>
              <WorkspaceControls
                configuration={workspace.configuration || {}}
                onChange={(configuration) =>
                  setWorkspace({ ...workspace, configuration })
                }
              />
              {error && (
                <p role="alert" className="form-error">
                  {t(error)}
                </p>
              )}
              <div className="form-actions">
                <button className="button primary" disabled={saving}>
                  {saving ? <Spinner /> : <Save size={16} />}
                  {t("Simpan workspace")}
                </button>
              </div>
            </form>
          )}
          {tab === "calendar" && (
            <CalendarSettings demo={demo} email={data.actor.email} />
          )}
        </section>
        <section className="panel settings-utilities">
          <div>
            <h3>{t("Data dan sesi")}</h3>
            <p className="muted">
              {t("Unduh data pekerjaan atau akhiri sesi perangkat ini.")}
            </p>
          </div>
          <button className="button secondary" onClick={onExport}>
            {fileRoom === "board" ? "Export projects" : t("Ekspor task")}
          </button>
          <button className="button secondary" onClick={onLogout}>
            {demo ? t("Keluar demo") : t("Keluar akun")}
          </button>
        </section>
      </div>
    </div>
  );
}
export function EditMemberDialog({
  member,
  run,
  onClose,
}: {
  member: Member;
  run: RunCommand;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(member.name);
  const [jobTitle, setJobTitle] = useState(member.jobTitle || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={t("Edit profil anggota")}
      description={t(
        "Ubah informasi anggota di workspace. Email Google dan hak admin tetap mengikuti identitas akun.",
      )}
    >
      <form
        className="standard-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          setError("");
          try {
            await run({
              action: "updateMember",
              email: member.email,
              name,
              jobTitle,
              version: member.version || 1,
            });
            toast.success(t("Profil anggota diperbarui"));
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <Avatar name={member.name} />
        <p className="muted">{member.email}</p>
        <label>
          {t("Nama anggota")}
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t("Jabatan anggota")}
          <input
            maxLength={100}
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {t(error)}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {t("Batal")}
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? <Spinner /> : <Save size={16} />}
            {t("Simpan profil anggota")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
