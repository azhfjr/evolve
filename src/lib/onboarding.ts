/** Only the configured auth origin is suitable for a durable invitation handoff. */
export function workspaceOnboardingUrl() {
  try {
    const base = new URL(process.env.BETTER_AUTH_URL || "");
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password
    )
      return null;
    return new URL("/workspace", base.origin).toString();
  } catch {
    return null;
  }
}
