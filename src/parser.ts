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
      system:
        `Ты разбираешь голосовые команды для создания заметок. Сегодня ${today} (${weekday}). ` +
        `Относительные даты ("в пятницу", "завтра", "через неделю") разрешай в ближайшую будущую дату от сегодня. ` +
        `intent: trip — поездки/путешествия; task — задачи/дела, которые заслуживают отдельной заметки; ` +
        `meeting — встречи/созвоны, которые заслуживают отдельной заметки; ` +
        `order — заказ/комиссия для клиента (ключевые слова: "заказ", "закажи", "клиент", "комиссия", ` +
        `упоминание цены/суммы за работу); ` +
        `checklist — короткое дело без даты и точного времени, которое нужно просто отметить галочкой ` +
        `(например "добавь в чек-лист позвонить в банк", "не забыть купить корм"); ` +
        `plan — конкретный ивент с точным временем начала на определённый день, который нужно вставить ` +
        `в расписание/план дня (например "поставь в план на 15:00 созвон с клиентом", ` +
        `"добавь в расписание в 9 утра тренировку на полчаса"); ` +
        `finance — движение денег: траты/пополнения по карте, изменение стипендии или инвестиций ` +
        `(ключевые слова: "потратил", "закинул", "пополнил", "снял", "стипендия", "инвестиции"); ` +
        `note — всё остальное. ` +
        `title — короткий заголовок на языке команды, без дат. ` +
        `Для intent=order дополнительно заполни: client — имя заказчика; price — число (без валюты); ` +
        `currency — RUB/UAH/USD/EUR (если явно не названа валюта, но названы "рублей"/"руб" → RUB, ` +
        `"гривен"/"грн" → UAH, "долларов"/"баксов" → USD, "евро" → EUR; если валюта вообще не упомянута → RUB); ` +
        `orderType — тип работы одним-двумя словами (например "спавн", "карта", "лобби"), null если не ясно; ` +
        `date — дедлайн заказа, если прозвучал. ` +
        `Для intent=checklist дополнительно заполни: scope — "week", если явно сказано "на этой неделе"/"на неделю", ` +
        `иначе "today". ` +
        `Для intent=plan дополнительно заполни: time — время начала HH:mm (если не названо — предположи разумное ` +
        `по контексту, например "утром"→09:00, "днём"→13:00, "вечером"→19:00); ` +
        `durationMinutes — длительность в минутах, если названа ("на полчаса"→30, "на час"→60), иначе 60; ` +
        `planCategory — одно из "учёба"/"работа"/"выпускная"/"личное"/"другое" по смыслу команды, иначе "другое"; ` +
        `date — на какой день (если не сказано — сегодня, ${today}). ` +
        `Для intent=finance дополнительно заполни: financeAction — "expense" если потратил/списал деньги ` +
        `с карты; "income" если закинул/пополнил/получил деньги на карту; "set_stipend" если назвал новую ` +
        `сумму стипендии; "set_investments" если назвал новую сумму инвестиций. ` +
        `cardName — название карты одним словом в нижнем регистре без пробелов (например "моно", "приват"), ` +
        `если не названа явно — "основная"; null для set_stipend/set_investments. ` +
        `amount — число: сумма траты/пополнения, новая сумма стипендии или инвестиций. ` +
        `Для set_investments можно также заполнить currency (валюта инвестиций) и title — краткое описание ` +
        `одной фразой (например "акции Apple, не для трат"), иначе title пустой строкой. ` +
        `Поля client/price/currency/orderType/scope/planCategory/durationMinutes/financeAction/cardName/amount, ` +
        `не относящиеся к текущему intent, — null (кроме случаев, явно описанных выше).`,
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
