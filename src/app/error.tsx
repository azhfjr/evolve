"use client";
import { useI18n } from "@/components/i18n-provider";

import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <main className="access-page">
      <h1>{t("Let’s try that again.")}</h1>
      <p>
        {t(
          "Something interrupted this page. Your saved work is still in the workspace.",
        )}
      </p>
      <button onClick={reset} className="button primary">
        {t("Try again")}
      </button>
      <Link href="/" className="text-link">
        {t("Back to home")}
      </Link>
    </main>
  );
}
