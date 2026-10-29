import { getTranslator, type Locale } from "./core";
export function eventMessage(message: string, locale: Locale) {
  const t = getTranslator(locale);
  const simple = message.match(
    /^(created|updated|completed|archived|restored) “(.*)”$/s,
  );
  if (simple) return t(`${simple[1]} “{title}”`, { title: simple[2] });
  const comment = message.match(/^commented on “(.*)”$/s);
  if (comment) return t("commented on “{title}”", { title: comment[1] });
  const moved = message.match(/^moved “(.*)” to (.+)$/s);
  if (moved) {
    const statuses: Record<string, string> = {
      todo: "To do",
      "to do": "To do",
      backlog: "Backlog",
      "in progress": "In progress",
      in_progress: "In progress",
      review: "In review",
      done: "Done",
    };
    return t("moved “{title}” to {status}", {
      title: moved[1],
      status: t(statuses[moved[2]] || moved[2]),
    });
  }
  const recipient = message.match(
    /^(.*) (assigned you|commented on|left feedback on) “(.*)”$/s,
  );
  if (recipient)
    return t(`{name} ${recipient[2]} “{title}”`, {
      name: recipient[1],
      title: recipient[3],
    });
  const project = message.match(/^(created|updated) the (.*) project$/s);
  if (project)
    return t(`${project[1]} the {project} project`, { project: project[2] });
  const template = message.match(/^saved the (.*) task template$/s);
  if (template)
    return t("saved the {name} task template", { name: template[1] });
  for (const prefix of [
    "granted workspace access to",
    "revoked workspace access for",
    "restored workspace access for",
    "updated the profile of",
  ]) {
    if (message.startsWith(prefix + " "))
      return t(prefix + " {email}", {
        email: message.slice(prefix.length + 1),
      });
  }
  return t(message);
}
