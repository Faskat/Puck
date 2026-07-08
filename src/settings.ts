import { App, PluginSettingTab, Setting } from "obsidian";
import type VoiceCommandPlugin from "./main";

export interface VoiceCommandSettings {
  /** API-ключ ElevenLabs (Scribe STT). */
  elevenLabsApiKey: string;
  /** API-ключ Anthropic (разбор команды в JSON). */
  anthropicApiKey: string;
  /** Язык речи для Scribe (ISO-639-1), пусто = автоопределение. */
  language: string;
  /** Папка vault с шаблонами заметок (по одному .md на intent). */
  templateFolder: string;
  /** Папка vault, куда складывать созданные заметки. */
  notesFolder: string;
  /** Папка для заказов (intent=order) — должна совпадать с ordersFolder плагина "Дашборд заказов". */
  ordersFolder: string;
  /** Заметка чек-листа (intent=checklist) — должна совпадать с checklistNote плагина "Дашборд заказов". */
  checklistNote: string;
  /** Папка планов дня (intent=plan) — должна совпадать с plansFolder плагина "Дашборд заказов". */
  plansFolder: string;
  /** Заметка финансов (intent=finance) — должна совпадать с financeNote плагина "Дашборд заказов". */
  financeNote: string;
  /** Показывать превью и просить подтверждение перед созданием заметки. */
  confirmBeforeCreate: boolean;
  /** Режим призрака: без уведомлений, заметка не открывается. */
  ghostMode: boolean;
  /** Писать маркер-файл о завершении обработки (для внешнего wrapper-скрипта PowerToys). */
  writeDoneMarker: boolean;
}

export const DEFAULT_SETTINGS: VoiceCommandSettings = {
  elevenLabsApiKey: "",
  anthropicApiKey: "",
  language: "ru",
  templateFolder: "Templates/VoiceCommands",
  notesFolder: "VoiceNotes",
  ordersFolder: "Работа/Орджус/Заказы",
  checklistNote: "Постоянные/Чек-лист.md",
  plansFolder: "Планы",
  financeNote: "Постоянные/Финансы.md",
  confirmBeforeCreate: true,
  ghostMode: false,
  writeDoneMarker: false,
};

export class VoiceCommandSettingTab extends PluginSettingTab {
  plugin: VoiceCommandPlugin;

  constructor(app: App, plugin: VoiceCommandPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("API-ключи").setHeading();

    new Setting(containerEl)
      .setName("ElevenLabs API key")
      .setDesc("Используется для транскрипции речи (Scribe STT).")
      .addText((t) =>
        t
          .setPlaceholder("sk_...")
          .setValue(this.plugin.settings.elevenLabsApiKey)
          .onChange(async (v) => {
            this.plugin.settings.elevenLabsApiKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Anthropic API key")
      .setDesc("Используется для разбора команды (intent, дата, место).")
      .addText((t) =>
        t
          .setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.anthropicApiKey)
          .onChange(async (v) => {
            this.plugin.settings.anthropicApiKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Язык речи")
      .setDesc("Код ISO-639-1 для Scribe (например ru). Пусто — автоопределение.")
      .addText((t) =>
        t.setValue(this.plugin.settings.language).onChange(async (v) => {
          this.plugin.settings.language = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Заметки и шаблоны").setHeading();

    new Setting(containerEl)
      .setName("Папка шаблонов")
      .setDesc(
        "Папка в vault с шаблонами. Имя файла = intent: trip.md, task.md, meeting.md, note.md (fallback)."
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.templateFolder).onChange(async (v) => {
          this.plugin.settings.templateFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Папка для новых заметок")
      .addText((t) =>
        t.setValue(this.plugin.settings.notesFolder).onChange(async (v) => {
          this.plugin.settings.notesFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Папка заказов")
      .setDesc(
        "Куда попадают заметки с intent=order (\"создай заказ для...\"). " +
          "Должна совпадать с папкой заказов в настройках плагина \"Дашборд заказов\", " +
          "иначе заказ не появится на дашборде."
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.ordersFolder).onChange(async (v) => {
          this.plugin.settings.ordersFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Заметка чек-листа")
      .setDesc(
        "Куда добавляются пункты с intent=checklist (\"добавь в чек-лист...\"). " +
          "Должна совпадать с настройкой \"Заметка чек-листа\" в плагине \"Дашборд заказов\" " +
          "(там ищутся разделы «## Сегодня» / «## На неделе»)."
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.checklistNote).onChange(async (v) => {
          this.plugin.settings.checklistNote = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Папка планов дня")
      .setDesc(
        "Куда добавляются ивенты с intent=plan (\"поставь в план на 15:00...\"). " +
          "Должна совпадать с настройкой папки планов в плагине \"Дашборд заказов\" " +
          "(файл вида <папка>/YYYY-MM-DD.md, раздел «## Ивенты»)."
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.plansFolder).onChange(async (v) => {
          this.plugin.settings.plansFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Заметка финансов")
      .setDesc(
        "Куда пишутся операции с intent=finance (\"потратил 500 гривен с карты Моно\", " +
          "\"стипендия 700\", \"инвестиции 1300 долларов\"). Должна совпадать с настройкой " +
          "\"Заметка финансов\" в плагине \"Дашборд заказов\" (правит поля карта_*, стипендия, " +
          "инвестиции, инвестиции_валюта, инвестиции_описание во frontmatter)."
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.financeNote).onChange(async (v) => {
          this.plugin.settings.financeNote = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Подтверждать перед созданием")
      .setDesc("Показывать распознанную команду и просить подтверждение. Игнорируется в режиме призрака.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.confirmBeforeCreate).onChange(async (v) => {
          this.plugin.settings.confirmBeforeCreate = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Режим призрака").setHeading();

    new Setting(containerEl)
      .setName("Ghost mode")
      .setDesc(
        "Заметки создаются в фоне: без уведомлений, без открытия заметки. Статус виден только по индикатору в статус-баре, ошибки — в логе (команда \"Show activity log\")."
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.ghostMode).onChange(async (v) => {
          this.plugin.settings.ghostMode = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Маркер завершения")
      .setDesc(
        "Писать last-run.json в папку плагина после каждой обработки — внешний скрипт (PowerToys wrapper) может ждать его, чтобы вернуть фокус."
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.writeDoneMarker).onChange(async (v) => {
          this.plugin.settings.writeDoneMarker = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
