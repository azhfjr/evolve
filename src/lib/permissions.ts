import type { Actor, Member } from "./types";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function resolveActor(
  identity: {
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
  } | null,
  members: Member[],
  adminEmail: string | undefined,
): Actor {
  if (!identity) throw new AppError("Sign in with Google to continue.", 401);
  if (!identity.emailVerified)
    throw new AppError("A verified Google email is required.", 403);
  if (!adminEmail)
    throw new AppError(
      "The workspace administrator has not been configured.",
      503,
    );
  const email = identity.email.toLowerCase();
  const isAdmin = email === adminEmail.toLowerCase();
  if (!isAdmin && !members.some((m) => m.email === email && !m.disabled))
    throw new AppError(
      "Your account hasn’t been invited to Evolve. Ask the workspace administrator for access.",
      403,
    );
  const profile = members.find((m) => m.email === email);
  return {
    email,
    name: profile?.name || identity.name,
    image: profile?.avatarId
      ? `/api/attachments/${profile.avatarId}/content`
      : identity.image,
    isAdmin,
  };
}
export function requireAdmin(actor: Actor) {
  if (!actor.isAdmin)
    throw new AppError("Only the workspace administrator can do that.", 403);
}
export function checkMutationOrigin(origin: string | null, expected: string) {
  if (!origin || origin !== new URL(expected).origin)
    throw new AppError("Request origin is not allowed.", 403);
}
