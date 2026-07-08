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
  return intent === "order" ? BUILTIN_ORDER_TEMPLATE : BUILTIN_TEMPLATE;
}

/** Подставляет значения команды в {{плейсхолдеры}} шаблона. */
export function renderTemplate(template: string, cmd: ParsedCommand): string {
  const values: Record<string, string> = {
    title: cmd.title,
    intent: cmd.intent,
    date: cmd.date ?? "",
    time: cmd.time ?? "",
    location: cmd.location ?? "",
    client: cmd.client ?? "—",
    price: String(cmd.price ?? 0),
    currency: cmd.currency ?? "RUB",
    orderType: cmd.orderType ?? "",
    transcript: cmd.transcript,
    created: new Date().toISOString(),
    createdDate: new Date().toLocaleDateString("sv-SE"),
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

/**
 * Формат frontmatter совпадает с тем, что создаёт модалка "Новый заказ"
 * плагина "Дашборд заказов" (orders-dashboard) — статус/клиент/цена/валюта/
 * оплачено/дедлайн/прогресс/тип — чтобы заметка сразу появилась на дашборде.
 */
const BUILTIN_ORDER_TEMPLATE = `---
статус: новый
клиент: {{client}}
цена: {{price}}
валюта: {{currency}}
оплачено: 0
дедлайн: {{date}}
прогресс: 0
тип: {{orderType}}
создан: {{createdDate}}
---

## ТЗ

{{transcript}}

## Референсы

## Заметки по работе

`;
