import { requestUrl } from "obsidian";

/** Результат разбора голосовой команды. */
export interface ParsedCommand {
  /** trip | task | meeting | order | checklist | plan | note (fallback) — определяет действие. */
  intent: string;
  /** Короткий заголовок заметки / название пункта или ивента. */
  title: string;
  /** Дата события / дедлайна / дня плана в формате YYYY-MM-DD, null если не прозвучала. */
  date: string | null;
  /** Время начала HH:mm (meeting, plan), null если не прозвучало. */
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
  /** Куда добавить пункт чек-листа: today | week (только для intent=checklist). */
  scope: string | null;
  /** Категория ивента плана дня: учёба/работа/выпускная/личное/другое (только для intent=plan). */
  planCategory: string | null;
  /** Длительность ивента плана дня в минутах, по умолчанию 60 (только для intent=plan). */
  durationMinutes: number | null;
  /** Действие с финансами: income | expense | set_stipend | set_investments (только для intent=finance). */
  financeAction: string | null;
  /** Название карты одним словом, напр. "моно" (только для income/expense). */
  cardName: string | null;
  /** Сумма операции / новое значение (только для intent=finance). */
  amount: number | null;
  /** Полный исходный транскрипт. */
  transcript: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["trip", "task", "meeting", "order", "checklist", "plan", "finance", "note"],
    },
    title: { type: "string" },
    date: { type: ["string", "null"] },
    time: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    client: { type: ["string", "null"] },
    price: { type: ["number", "null"] },
    currency: {
      anyOf: [{ type: "string", enum: ["RUB", "UAH", "USD", "EUR"] }, { type: "null" }],
    },
    orderType: { type: ["string", "null"] },
    scope: { anyOf: [{ type: "string", enum: ["today", "week"] }, { type: "null" }] },
    planCategory: {
      anyOf: [
        { type: "string", enum: ["учёба", "работа", "выпускная", "личное", "другое"] },
        { type: "null" },
      ],
    },
    durationMinutes: { type: ["number", "null"] },
    financeAction: {
      anyOf: [
        { type: "string", enum: ["income", "expense", "set_stipend", "set_investments"] },
        { type: "null" },
      ],
    },
    cardName: { type: ["string", "null"] },
    amount: { type: ["number", "null"] },
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
    "scope",
    "planCategory",
    "durationMinutes",
    "financeAction",
    "cardName",
    "amount",
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
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        `Ты разбираешь голосовые команды для Obsidian-плагина в строгий JSON. Сегодня ${today} (${weekday}).`,
        `Относительные даты ("в пятницу", "завтра", "через неделю") разрешай в ближайшую будущую дату от сегодня.`,
        ``,
        `ВАЖНОЕ ПРАВИЛО ПРИОРИТЕТА: если во фразе есть сумма денег И слово "карта"/"карточка"/"счёт"/` +
          `"стипендия"/"инвестиции" — это ВСЕГДА intent=finance, даже если фраза звучит как констатация факта ` +
          `("потратил X", "пришло Y на карту"), а не как явная команда.`,
        ``,
        `Виды intent (с примерами голосовых фраз):`,
        `- trip — поездка/путешествие. Пример: "Запланируй поездку в кафе в пятницу".`,
        `- task — задача/дело, заслуживающее отдельной заметки. Пример: "Создай задачу — доделать отчёт до вторника".`,
        `- meeting — встреча/созвон с деталями. Пример: "Запланируй встречу с клиентом в четверг в 15:00 в офисе".`,
        `- order — заказ/комиссия для клиента: назван клиент и цена за работу. ` +
          `Пример: "Создай заказ для DeltaMine на 8000 рублей, дедлайн в пятницу".`,
        `- checklist — короткое дело без даты и времени, просто отметить галочкой. ` +
          `Пример: "Добавь в чек-лист позвонить в банк".`,
        `- plan — ивент с конкретным временем начала в расписании дня. ` +
          `Пример: "Поставь в план на 15:00 созвон с клиентом на полчаса".`,
        `- finance — деньги: трата/пополнение карты, стипендия, инвестиции. Примеры: ` +
          `"Потратил 500 гривен с карточки Ощадбанк", "Закинул 1000 на карту Моно", "Стипендия 700", ` +
          `"Инвестиции 1300 долларов, акции Apple".`,
        `- note — всё остальное, что не подошло ни под одно из перечисленного выше. ` +
          `Пример: "Запиши мысль про новый дизайн лобби".`,
        ``,
        `title — короткий заголовок на языке команды, без дат.`,
        ``,
        `Дополнительные поля по каждому intent (для остальных intent эти поля — null):`,
        ``,
        `order: client — имя заказчика; price — число без валюты; currency — RUB/UAH/USD/EUR ` +
          `("рублей"/"руб"→RUB, "гривен"/"грн"→UAH, "долларов"/"баксов"→USD, "евро"→EUR, не названа→RUB); ` +
          `orderType — тип работы 1-2 словами, иначе null; date — дедлайн заказа.`,
        `checklist: scope — "week", если явно сказано "на этой неделе"/"на неделю", иначе "today".`,
        `plan: time — HH:mm (не названо → "утром"=09:00, "днём"=13:00, "вечером"=19:00); ` +
          `durationMinutes — минуты, если названы ("на полчаса"=30, "на час"=60), иначе 60; ` +
          `planCategory — учёба/работа/выпускная/личное/другое по смыслу, иначе "другое"; ` +
          `date — день (не сказано → сегодня, ${today}).`,
        `finance: financeAction — "expense" (потратил/списал/заплатил/снял), "income" ` +
          `(закинул/пополнил/получил/положил), "set_stipend" (назвал новую сумму стипендии), ` +
          `"set_investments" (назвал новую сумму инвестиций); cardName — одно слово в нижнем регистре ` +
          `без пробелов (например "ощадбанк", "моно"), не названа явно → "основная", null для ` +
          `set_stipend/set_investments; amount — число суммы; для set_investments можно также currency ` +
          `(валюта инвестиций) и title — краткое описание одной фразой ("акции Apple, не для трат"), ` +
          `для остальных finance-действий title — пустая строка.`,
      ].join("\n"),
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
