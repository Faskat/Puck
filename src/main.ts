import { App, Modal, Notice, Plugin, TFile, normalizePath } from "obsidian";
import {
  DEFAULT_SETTINGS,
  VoiceCommandSettings,
  VoiceCommandSettingTab,
} from "./settings";
import { AudioRecorder } from "./recorder";
import { transcribe } from "./transcriber";
import { parseCommand, ParsedCommand } from "./parser";
import { loadTemplate, renderTemplate } from "./templates";
import { ActivityLog } from "./logger";

type PipelineState = "idle" | "recording" | "processing" | "ok" | "error";

const STATUS_ICONS: Record<PipelineState, string> = {
  idle: "🎙",
  recording: "🔴",
  processing: "⏳",
  ok: "✅",
  error: "⛔",
};

export default class VoiceCommandPlugin extends Plugin {
  settings: VoiceCommandSettings = DEFAULT_SETTINGS;
  private recorder = new AudioRecorder();
  private log = new ActivityLog();
  private statusBar: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new VoiceCommandSettingTab(this.app, this));

    this.statusBar = this.addStatusBarItem();
    this.statusBar.onClickEvent(() => this.log.show(this.app));
    this.setState("idle");

    // Основная команда: старт/стоп записи. Хоткей назначается в Settings → Hotkeys.
    // Извне (PowerToys + Advanced URI) вызывается по ID:
    //   obsidian://advanced-uri?commandid=voice-command-notes%3Atoggle-recording
    this.addCommand({
      id: "toggle-recording",
      name: "Start / stop voice command recording",
      callback: () => this.toggleRecording(),
    });

    this.addCommand({
      id: "cancel-recording",
      name: "Cancel recording",
      callback: () => {
        this.recorder.cancel();
        this.setState("idle");
        this.notify("Запись отменена");
      },
    });

    this.addCommand({
      id: "show-log",
      name: "Show activity log",
      callback: () => this.log.show(this.app),
    });
  }

  onunload(): void {
    this.recorder.cancel();
  }

  // ---- Пайплайн ----

  private async toggleRecording(): Promise<void> {
    if (this.recorder.isRecording) {
      await this.stopAndProcess();
    } else {
      try {
        await this.recorder.start();
        this.setState("recording");
        this.notify("Запись… нажмите хоткей ещё раз, чтобы остановить");
      } catch (e) {
        this.fail(`Не удалось начать запись: ${errMsg(e)}`);
      }
    }
  }

  private async stopAndProcess(): Promise<void> {
    this.setState("processing");
    try {
      const audio = await this.recorder.stop();
      this.log.info(`Записано ${(audio.size / 1024).toFixed(0)} КБ аудио`);

      this.notify("Транскрибация…");
      const transcript = await transcribe(
        audio,
        this.settings.openaiApiKey,
        this.settings.language
      );
      this.log.info(`Транскрипт: ${transcript}`);

      this.notify("Разбор команды…");
      const cmd = await parseCommand(transcript, this.settings.anthropicApiKey);
      this.log.info(
        `Команда: intent=${cmd.intent}, title="${cmd.title}", date=${cmd.date}`
      );

      if (this.settings.confirmBeforeCreate && !this.settings.ghostMode) {
        const ok = await this.confirm(cmd);
        if (!ok) {
          this.setState("idle");
          this.notify("Отменено");
          return;
        }
      }

      const file = await this.createNote(cmd);
      this.log.info(`Создана заметка: ${file.path}`);
      this.notify(`Заметка создана: ${file.basename}`);

      if (!this.settings.ghostMode) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }
      await this.writeDoneMarker(true, file.path);
      this.flashState("ok");
    } catch (e) {
      this.fail(errMsg(e));
      await this.writeDoneMarker(false, null);
    }
  }

  private async createNote(cmd: ParsedCommand): Promise<TFile> {
    const template = await loadTemplate(
      this.app,
      this.settings.templateFolder,
      cmd.intent
    );
    const content = renderTemplate(template, cmd);

    // Заказы (intent=order) кладём в отдельную папку, совместимую с плагином
    // "Дашборд заказов" — иначе он их не увидит.
    const folder =
      cmd.intent === "order" ? this.settings.ordersFolder : this.settings.notesFolder;
    if (folder && !this.app.vault.getAbstractFileByPath(normalizePath(folder))) {
      await this.app.vault.createFolder(normalizePath(folder)).catch(() => {});
    }

    const safeTitle =
      cmd.title.replace(/[\\/:*?"<>|#^[\]]/g, "").trim() || "Voice note";
    let path = normalizePath(`${folder}/${safeTitle}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
      path = normalizePath(`${folder}/${safeTitle} ${i}.md`);
    }
    return this.app.vault.create(path, content);
  }

  /** Маркер завершения для внешнего wrapper-скрипта (PowerToys, Фаза 8). */
  private async writeDoneMarker(ok: boolean, notePath: string | null): Promise<void> {
    if (!this.settings.writeDoneMarker) return;
    const marker = normalizePath(
      `${this.app.vault.configDir}/plugins/voice-command-notes/last-run.json`
    );
    await this.app.vault.adapter.write(
      marker,
      JSON.stringify({ ok, notePath, finishedAt: new Date().toISOString() })
    );
  }

  // ---- UI-хелперы ----

  /** Notice только вне режима призрака; в лог пишем всегда. */
  private notify(message: string): void {
    if (!this.settings.ghostMode) new Notice(message);
  }

  private fail(message: string): void {
    this.log.error(message);
    if (!this.settings.ghostMode) new Notice(`Voice command: ${message}`, 8000);
    this.flashState("error");
  }

  private setState(state: PipelineState): void {
    this.statusBar?.setText(`${STATUS_ICONS[state]} voice`);
  }

  /** Кратко показывает ok/error, затем возвращается в idle. */
  private flashState(state: PipelineState): void {
    this.setState(state);
    window.setTimeout(() => this.setState("idle"), 3000);
  }

  private confirm(cmd: ParsedCommand): Promise<boolean> {
    return new Promise((resolve) => {
      new ConfirmModal(this.app, cmd, resolve).open();
    });
  }

  // ---- Настройки ----

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private cmd: ParsedCommand,
    private resolve: (ok: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Создать заметку?");
    const c = this.contentEl;
    c.createEl("p", { text: `Заголовок: ${this.cmd.title}` });
    c.createEl("p", { text: `Тип: ${this.cmd.intent}` });
    if (this.cmd.date)
      c.createEl("p", {
        text: `Дата: ${this.cmd.date}${this.cmd.time ? " " + this.cmd.time : ""}`,
      });
    if (this.cmd.location) c.createEl("p", { text: `Место: ${this.cmd.location}` });
    if (this.cmd.intent === "order") {
      c.createEl("p", { text: `Клиент: ${this.cmd.client ?? "—"}` });
      c.createEl("p", {
        text: `Цена: ${this.cmd.price ?? 0} ${this.cmd.currency ?? "RUB"}`,
      });
      if (this.cmd.orderType) c.createEl("p", { text: `Тип заказа: ${this.cmd.orderType}` });
    }
    c.createEl("p", { text: `«${this.cmd.transcript}»` }).style.opacity = "0.7";

    const buttons = c.createDiv();
    buttons.style.display = "flex";
    buttons.style.gap = "8px";
    buttons.style.justifyContent = "flex-end";

    const cancel = buttons.createEl("button", { text: "Отмена" });
    cancel.onclick = () => {
      this.resolve(false);
      this.close();
    };
    const ok = buttons.createEl("button", { text: "Создать", cls: "mod-cta" });
    ok.onclick = () => {
      this.resolve(true);
      this.close();
    };
  }

  onClose(): void {
    this.resolve(false); // повторный resolve после кнопок — no-op
    this.contentEl.empty();
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
