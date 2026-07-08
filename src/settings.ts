import { App, PluginSettingTab, Setting } from "obsidian";
import type VoiceCommandPlugin from "./main";

export interface VoiceCommandSettings {
  /** API-ключ OpenAI (Whisper STT). */
  openaiApiKey: string;
  /** API-ключ Anthropic (разбор команды в JSON). */
  anthropicApiKey: string;
  /** Язык речи для Whisper (ISO-639-1), пусто = автоопределение. */
  language: string;
  /** Папка vault с шаблонами заметок (по одному .md на intent). */
  templateFolder: string;
  /** Папка vault, куда складывать созданные заметки. */
  notesFolder: string;
  /** Папка для заказов (intent=order) — должна совпадать с ordersFolder плагина "Дашборд заказов". */
  ordersFolder: string;
  /** Показывать превью и просить подтверждение перед созданием заметки. */
  confirmBeforeCreate: boolean;
  /** Режим призрака: без уведомлений, заметка не открывается. */
  ghostMode: boolean;
  /** Писать маркер-файл о завершении обработки (для внешнего wrapper-скрипта PowerToys). */
  writeDoneMarker: boolean;
}

export const DEFAULT_SETTINGS: VoiceCommandSettings = {
  openaiApiKey: "",
  anthropicApiKey: "",
  language: "ru",
  templateFolder: "Templates/VoiceCommands",
  notesFolder: "VoiceNotes",
  ordersFolder: "Работа/Орджус/Заказы",
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
      .setName("OpenAI API key")
      .setDesc("Используется для транскрипции речи (Whisper).")
      .addText((t) =>
        t
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async (v) => {
            this.plugin.settings.openaiApiKey = v.trim();
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
      .setDesc("Код ISO-639-1 для Whisper (например ru). Пусто — автоопределение.")
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
