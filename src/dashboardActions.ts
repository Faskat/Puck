import { App, TFile, normalizePath } from "obsidian";
import type { ParsedCommand } from "./parser";

/**
 * Добавление пунктов в чек-лист и события в план дня — форматы файлов
 * совпадают с тем, что использует плагин "Дашборд заказов" (парсит
 * `## Сегодня` / `## На неделе` как чекбоксы, `## Ивенты` как строки
 * `- [ ] HH:MM–HH:MM Название #категория`), поэтому добавленное отсюда
 * сразу видно на дашборде.
 */

function parseTimeToMin(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function fmtMin(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Вставляет строку сразу после заголовка `heading` в тексте; дописывает заголовок в конец, если его нет. */
function insertUnderHeading(text: string, headingRe: RegExp, heading: string, line: string): string {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => headingRe.test(l));
  if (idx === -1) {
    const sep = text.endsWith("\n") ? "" : "\n";
    return `${text}${sep}\n${heading}\n\n${line}\n`;
  }
  lines.splice(idx + 1, 0, line);
  return lines.join("\n");
}

async function ensureParentFolder(app: App, path: string): Promise<void> {
  const folder = path.substring(0, path.lastIndexOf("/"));
  if (folder && !app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder).catch(() => {});
  }
}

/** Добавляет пункт "- [ ] title" в раздел "Сегодня" или "На неделе" заметки чек-листа. */
export async function appendChecklistItem(
  app: App,
  checklistNotePath: string,
  title: string,
  scope: "today" | "week"
): Promise<TFile> {
  const path = normalizePath(checklistNotePath);
  const heading = scope === "week" ? "## На неделе" : "## Сегодня";
  const headingRe = scope === "week" ? /^##\s+.*недел/i : /^##\s+.*сегодня/i;
  const item = `- [ ] ${title}`;

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.process(existing, (text) => insertUnderHeading(text, headingRe, heading, item));
    return existing;
  }

  await ensureParentFolder(app, path);
  return app.vault.create(path, `${heading}\n\n${item}\n`);
}

/** Добавляет ивент в план дня — `<plansFolder>/<date>.md`, раздел "## Ивенты". */
export async function appendPlanEvent(
  app: App,
  plansFolder: string,
  cmd: ParsedCommand
): Promise<TFile> {
  const dateStr = cmd.date ?? new Date().toLocaleDateString("sv-SE");
  const path = normalizePath(`${plansFolder}/${dateStr}.md`);
  const start = cmd.time ? parseTimeToMin(cmd.time) : 9 * 60;
  const duration = cmd.durationMinutes ?? 60;
  const end = start + duration;
  const cat = cmd.planCategory ?? "другое";
  const line = `- [ ] ${fmtMin(start)}–${fmtMin(end)} ${cmd.title}${
    cat !== "другое" ? " #" + cat : ""
  }`;

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.process(existing, (text) =>
      insertUnderHeading(text, /^##\s+Ивенты/, "## Ивенты", line)
    );
    return existing;
  }

  await ensureParentFolder(app, path);
  const body = [
    "---",
    "tags: [план-дня]",
    "---",
    "",
    `# План — ${dateStr}`,
    "",
    "## Ивенты",
    "",
    line,
    "",
  ].join("\n");
  return app.vault.create(path, body);
}
