// Chọn nguồn live, nối sự kiện vào lõi game, báo trạng thái cho phiên live và admin.
//
// - Hồ sơ production: luôn dùng liveSource trong config. Giả lập bị từ chối ở hồ sơ này (14.2).
// - Hồ sơ test: chọn "giả lập" (mặc định, overlay hiện "CHẾ ĐỘ THỬ") hoặc "live thật"
//   (chế độ diễn tập, overlay hiện "DIỄN TẬP"). Lựa chọn được nhớ riêng trong DB của hồ sơ test.

import type { LiveEvent } from '../../shared/types.js';
import type { GameCore } from '../core.js';
import { getSetting, setSetting } from '../db/settings.js';
import type { ProcessResult } from '../game/engine.js';
import type { Logger } from '../logger.js';
import type { LiveStatus } from '../session.js';
import { statusText, UnavailableAdapter, type AdapterStatus, type LiveAdapter, type LiveSource } from './adapter.js';
import { clampSpeed, SCENARIOS, SimulatorAdapter, type FireKind, type ScenarioKey } from './simulator.js';

export type SourceMode = 'simulator' | 'live';

export interface SimSettings {
  scenario: ScenarioKey;
  speed: number;
  running: boolean;
}

const SIM_KEY = 'simulator';
const MODE_KEY = 'liveMode';
const DEFAULT_SIM: SimSettings = { scenario: 'vua', speed: 1, running: false };

export class SimulatorNotAllowed extends Error {}

export interface LiveServiceOptions {
  logger: Logger;
  /** Gọi sau mỗi sự kiện đã xử lý (để cập nhật overlay). */
  onProcessed?: (r: ProcessResult, ev: LiveEvent) => void;
  /** Gọi khi trạng thái nguồn live đổi. */
  onStatus?: (s: AdapterStatus) => void;
  /** Giả lập có tự chạy bằng đồng hồ thật không (test tắt đi). */
  simulatorTimer?: boolean;
  seed?: number;
}

export function toSessionStatus(s: AdapterStatus): LiveStatus {
  if (s.state === 'connected') return 'live';
  if (s.state === 'offline') return 'offline';
  return 'disconnected';
}

export class LiveService {
  private adapter: LiveAdapter | null = null;
  private viewers: number | null = null;

  constructor(
    private readonly core: GameCore,
    private readonly opts: LiveServiceOptions,
  ) {}

  get isTestProfile(): boolean {
    return this.core.profile === 'test';
  }

  mode(): SourceMode {
    if (!this.isTestProfile) return 'live';
    if (this.core.config.liveSource === 'simulator') return 'simulator';
    return getSetting<SourceMode>(this.core.db, MODE_KEY, 'simulator');
  }

  /** Nhãn trên overlay: "CHẾ ĐỘ THỬ" khi giả lập, "DIỄN TẬP" khi hồ sơ test dùng live thật. */
  badge(): string | null {
    if (!this.isTestProfile) return null;
    const labels = this.core.config.labels;
    return this.mode() === 'simulator' ? labels.testBadge : labels.rehearsalBadge;
  }

  simulator(): SimulatorAdapter | null {
    return this.adapter instanceof SimulatorAdapter ? this.adapter : null;
  }

  start(): void {
    this.stop();
    const adapter = this.createAdapter();
    this.adapter = adapter;
    adapter.onEvent((ev) => this.handleEvent(ev));
    adapter.onStatus((s) => this.handleStatus(s));
    if (adapter instanceof SimulatorAdapter) {
      if (getSetting(this.core.db, SIM_KEY, DEFAULT_SIM).running) adapter.start();
      else this.handleStatus(adapter.status());
    } else {
      adapter.start();
    }
  }

  stop(): void {
    if (!this.adapter) return;
    this.adapter.stop();
    this.adapter = null;
  }

  /** Hồ sơ test: chuyển giữa giả lập và live thật (diễn tập). */
  setMode(mode: SourceMode): void {
    if (!this.isTestProfile) throw new SimulatorNotAllowed('Chỉ đổi được ở hồ sơ test');
    setSetting(this.core.db, MODE_KEY, mode);
    this.opts.logger.info(`Nguồn sự kiện hồ sơ test: ${mode === 'simulator' ? 'giả lập' : 'live thật (diễn tập)'}`);
    this.start();
  }

  status() {
    const s = this.adapter?.status() ?? { state: 'idle' as const };
    return {
      source: this.adapter?.source ?? this.core.config.liveSource,
      mode: this.mode(),
      status: s,
      text: statusText(s),
      viewers: this.viewers,
    };
  }

  simState(): (SimSettings & { viewers: number; scenarioLabel: string }) | null {
    const sim = this.simulator();
    if (!sim) return null;
    return {
      scenario: sim.scenario,
      speed: sim.speed,
      running: sim.running,
      viewers: sim.viewerCount,
      scenarioLabel: SCENARIOS[sim.scenario].label,
    };
  }

  simStart(settings?: Partial<Omit<SimSettings, 'running'>>): void {
    const sim = this.requireSim();
    if (settings) this.simSettings(settings);
    sim.start();
    this.saveSim();
  }

  simStop(): void {
    this.requireSim().stop();
    this.saveSim();
  }

  simSettings(settings: Partial<Omit<SimSettings, 'running'>>): void {
    const sim = this.requireSim();
    if (settings.scenario && settings.scenario in SCENARIOS) sim.setScenario(settings.scenario);
    if (settings.speed !== undefined) sim.setSpeed(clampSpeed(Number(settings.speed)));
    this.saveSim();
  }

  simFire(kind: FireKind): void {
    this.requireSim().fire(kind);
  }

  private requireSim(): SimulatorAdapter {
    const sim = this.simulator();
    if (!sim) {
      throw new SimulatorNotAllowed(
        this.isTestProfile ? 'Hồ sơ test đang dùng live thật, hãy chuyển sang giả lập trước' : 'Giả lập chỉ chạy ở hồ sơ test',
      );
    }
    return sim;
  }

  private saveSim(): void {
    const sim = this.simulator();
    if (!sim) return;
    setSetting(this.core.db, SIM_KEY, { scenario: sim.scenario, speed: sim.speed, running: sim.running });
  }

  private createAdapter(): LiveAdapter {
    if (this.isTestProfile && this.mode() === 'simulator') {
      const saved = getSetting(this.core.db, SIM_KEY, DEFAULT_SIM);
      return new SimulatorAdapter({
        scenario: saved.scenario in SCENARIOS ? saved.scenario : DEFAULT_SIM.scenario,
        speed: saved.speed,
        now: this.core.now,
        useTimer: this.opts.simulatorTimer ?? true,
        ...(this.opts.seed !== undefined ? { seed: this.opts.seed } : {}),
      });
    }
    const source: LiveSource = this.core.config.liveSource;
    if (source === 'simulator') {
      return new UnavailableAdapter(source, 'Giả lập chỉ chạy ở hồ sơ test (start-test.bat). Hãy đổi liveSource trong config.');
    }
    if (source === 'tiktok-connector') {
      return new UnavailableAdapter(source, 'Kết nối TikTok sẽ được làm ở giai đoạn 6');
    }
    return new UnavailableAdapter(source, `Nguồn "${source}" chỉ làm khi chủ dự án yêu cầu`);
  }

  private handleEvent(ev: LiveEvent): void {
    if (ev.type === 'viewers') this.viewers = ev.count;
    try {
      const r = this.core.processEvent(ev);
      this.opts.onProcessed?.(r, ev);
    } catch (e) {
      this.opts.logger.error(`Lỗi khi xử lý sự kiện ${ev.type}`, e);
    }
  }

  private handleStatus(s: AdapterStatus): void {
    this.core.sessions.handleStatus(toSessionStatus(s));
    this.opts.onStatus?.(s);
  }
}
