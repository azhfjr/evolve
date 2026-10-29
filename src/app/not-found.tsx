"use client";
import { useI18n } from "@/components/i18n-provider";

import Link from "next/link";
export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="access-page">
      <h1>{t("A little off track.")}</h1>
      <p>
        {t("That page doesn’t exist. Let’s get you back to your workspace.")}
      </p>
      <Link href="/app" className="button primary">
        {t("Open Evolve")}
      </Link>
    </main>
  );
}
