import { App, TFile, normalizePath } from "obsidian";
import type { ParsedCommand } from "./parser";

/**
 * Загружает шаблон для intent из папки шаблонов.
 * Ищет `<folder>/<intent>.md`, при отсутствии — `<folder>/note.md`,
 * при отсутствии и его — встроенный минимальный шаблон.
 */
export async function loadTemplate(
  app: App,
  templateFolder: string,
  intent: string
): Promise<string> {
  for (const name of [intent, "note"]) {
    const path = normalizePath(`${templateFolder}/${name}.md`);
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return app.vault.read(file);
  }
  return BUILTIN_TEMPLATE;
}

/** Подставляет значения команды в {{плейсхолдеры}} шаблона. */
export function renderTemplate(template: string, cmd: ParsedCommand): string {
  const values: Record<string, string> = {
    title: cmd.title,
    intent: cmd.intent,
    date: cmd.date ?? "",
    time: cmd.time ?? "",
    location: cmd.location ?? "",
    transcript: cmd.transcript,
    created: new Date().toISOString(),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
}

const BUILTIN_TEMPLATE = `---
created: {{created}}
type: {{intent}}
date: {{date}}
location: {{location}}
---

# {{title}}

- **Дата:** {{date}} {{time}}
- **Место:** {{location}}

> Голосовая команда: {{transcript}}
`;
