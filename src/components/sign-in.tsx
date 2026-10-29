"use client";
import { useI18n } from "./i18n-provider";

import { useState } from "react";
import { Spinner } from "./ui";
export function SignIn({ configured }: { configured: boolean }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/workspace",
          errorCallbackURL: "/?error=access",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.url)
        throw new Error(
          result.message ||
            t("Google sign-in is unavailable. Please try again."),
        );
      window.location.assign(result.url);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("Couldn’t sign in. Please try again."),
      );
      setLoading(false);
    }
  }
  return (
    <div className="sign-in-control">
      <button
        className="google-button"
        disabled={loading || !configured}
        onClick={login}
      >
        {loading ? (
          <Spinner />
        ) : (
          <svg aria-hidden="true" width="19" height="19" viewBox="0 0 48 48">
            <path
              fill="#4285F4"
              d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z"
            />
            <path
              fill="#34A853"
              d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.9-3.6-11.5-8.4H5.7v5.3A20.4 20.4 0 0 0 24 44Z"
            />
            <path
              fill="#FBBC05"
              d="M12.5 27.6a12.2 12.2 0 0 1 0-7.2v-5.3H5.7a20 20 0 0 0 0 17.8l6.8-5.3Z"
            />
            <path
              fill="#EA4335"
              d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.3 19.3 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15.1l6.8 5.3C14.1 15.6 18.7 12 24 12Z"
            />
          </svg>
        )}
        {loading ? t("Connecting…") : t("Continue with Google")}
      </button>
      {!configured && (
        <p className="config-note">
          {t(
            "Google sign-in is awaiting deployment configuration. You can explore the demo below.",
          )}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
