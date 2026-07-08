import { requestUrl } from "obsidian";

/** Результат разбора голосовой команды. */
export interface ParsedCommand {
  /** trip | task | meeting | order | note (fallback) — определяет файл шаблона. */
  intent: string;
  /** Короткий заголовок заметки. */
  title: string;
  /** Дата события / дедлайна в формате YYYY-MM-DD, null если не прозвучала. */
  date: string | null;
  /** Время HH:mm, null если не прозвучало. */
  time: string | null;
  /** Место, null если не прозвучало. */
  location: string | null;
  /** Заказчик (только для intent=order), null если не прозвучал. */
  client: string | null;
  /** Цена (только для intent=order), null если не прозвучала. */
  price: number | null;
  /** Валюта цены: RUB | UAH | USD | EUR (только для intent=order). */
  currency: string | null;
  /** Тип заказа, напр. "спавн"/"карта"/"лобби" (только для intent=order). */
  orderType: string | null;
  /** Полный исходный транскрипт. */
  transcript: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["trip", "task", "meeting", "order", "note"] },
    title: { type: "string" },
    date: { type: ["string", "null"] },
    time: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    client: { type: ["string", "null"] },
    price: { type: ["number", "null"] },
    currency: { type: ["string", "null"], enum: ["RUB", "UAH", "USD", "EUR", null] },
    orderType: { type: ["string", "null"] },
  },
  required: [
    "intent",
    "title",
    "date",
    "time",
    "location",
    "client",
    "price",
    "currency",
    "orderType",
  ],
  additionalProperties: false,
} as const;

/**
 * Разбирает транскрипт голосовой команды в структуру через Claude.
 * JSON гарантируется схемой в output_config.format — парсим первый text-блок.
 */
export async function parseCommand(
  transcript: string,
  apiKey: string
): Promise<ParsedCommand> {
  if (!apiKey) throw new Error("Не задан Anthropic API key (настройки плагина)");

  const now = new Date();
  const today = now.toLocaleDateString("sv-SE"); // YYYY-MM-DD в локальной таймзоне
  const weekday = now.toLocaleDateString("ru-RU", { weekday: "long" });

  const resp = await requestUrl({
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system:
        `Ты разбираешь голосовые команды для создания заметок. Сегодня ${today} (${weekday}). ` +
        `Относительные даты ("в пятницу", "завтра", "через неделю") разрешай в ближайшую будущую дату от сегодня. ` +
        `intent: trip — поездки/путешествия; task — задачи/дела; meeting — встречи/созвоны; ` +
        `order — заказ/комиссия для клиента (ключевые слова: "заказ", "закажи", "клиент", "комиссия", ` +
        `упоминание цены/суммы за работу); note — всё остальное. ` +
        `title — короткий заголовок на языке команды, без дат. ` +
        `Для intent=order дополнительно заполни: client — имя заказчика; price — число (без валюты); ` +
        `currency — RUB/UAH/USD/EUR (если явно не названа валюта, но названы "рублей"/"руб" → RUB, ` +
        `"гривен"/"грн" → UAH, "долларов"/"баксов" → USD, "евро" → EUR; если валюта вообще не упомянута → RUB); ` +
        `orderType — тип работы одним-двумя словами (например "спавн", "карта", "лобби"), null если не ясно; ` +
        `date — дедлайн заказа, если прозвучал. Для остальных intent поля client/price/currency/orderType — null.`,
      messages: [{ role: "user", content: transcript }],
      output_config: {
        format: { type: "json_schema", schema: RESPONSE_SCHEMA },
      },
    }),
    throw: false,
  });

  if (resp.status !== 200) {
    throw new Error(`Claude API ${resp.status}: ${resp.text?.slice(0, 300)}`);
  }

  const block = (resp.json?.content ?? []).find(
    (b: { type: string }) => b.type === "text"
  );
  if (!block) throw new Error("Claude не вернул текстовый блок");

  const data = JSON.parse(block.text);
  return { ...data, transcript };
}
