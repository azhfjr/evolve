import { LandingPage } from "@/components/landing-page";
import { currentActor } from "@/lib/current-actor";
import { redirect } from "next/navigation";
import { authConfigured } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  let admitted = false;
  if (authConfigured() && !error) {
    try {
      await currentActor();
      admitted = true;
    } catch {
      /* Keep sign-in available if access has expired or been revoked. */
    }
  }
  if (admitted) redirect("/workspace");
  return <LandingPage configured={authConfigured()} error={error} />;
}
