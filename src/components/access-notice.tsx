"use client";
import Link from "next/link";
import { Logo } from "./ui";
import { useI18n } from "./i18n-provider";
export function AccessNotice({
  reason,
  message,
}: {
  reason: "configuration" | "denied" | "unavailable";
  message?: string;
}) {
  const { t } = useI18n();
  return (
    <main className="access-page">
      <Logo />

      <h1>
        {reason === "configuration"
          ? t("Your workspace is almost here.")
          : reason === "denied"
            ? t("An invitation makes it official.")
            : t("We couldn’t open your workspace.")}
      </h1>
      <p>
        {message ||
          (reason === "configuration"
            ? t(
                "Google sign-in and the database need to be connected in deployment settings before your team can sign in.",
              )
            : t(
                "The database may be temporarily unavailable. Please try again or contact your administrator.",
              ))}
      </p>
      {reason === "configuration" && (
        <Link href="/demo" className="button primary">
          {t("Explore the demo")}
        </Link>
      )}
      <Link href="/" className="text-link">
        {t("Back to sign in")}
      </Link>
    </main>
  );
}
