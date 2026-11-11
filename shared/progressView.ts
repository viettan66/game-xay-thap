// Dựng tiến độ gửi xuống overlay (ProgressView) từ trạng thái xây. Hàm thuần: server dùng cho overlay thật,
// trang thử /tools/build dùng cho bản xây thử trong trình duyệt.

import { fillTemplate, progressNumbers, type ProgressState, type ResolvedProject } from './project.js';
import type { ProgressItem, ProgressView } from './protocol.js';

/** Mẫu chữ trên thanh tiến độ (config.json labels.progress). */
export interface ProgressLabels {
  item: string;
  stage: string;
  project: string;
  completed: string;
}

export function progressView(s: ProgressState, p: ResolvedProject, L: ProgressLabels, totalPoints: number): ProgressView {
  const n = progressNumbers(s, p);
  const item = p.items[n.itemNumber - 1]!;
  const stage = item.stages[s.stageIndex]!;
  const items: ProgressItem[] = p.items.map((it, i) => ({
    id: it.id,
    name: it.name,
    area: it.area,
    status: s.completed || i < n.itemNumber - 1 ? 'done' : i === n.itemNumber - 1 ? 'building' : 'todo',
    // Giá giai đoạn đang xây là giá đã chốt (có thể khác config sau khi đổi giá).
    stages: it.stages.map((st, k) => ({ name: st.name, cost: it.id === s.itemId && k === s.stageIndex ? s.stageCost : st.cost, build: st.build })),
  }));
  return {
    projectName: p.name,
    item: { id: item.id, name: item.name, number: n.itemNumber, count: n.itemCount, size: item.size, area: item.area },
    stage: { number: s.stageIndex + 1, count: n.stageCount, name: stage.name, ritual: stage.ritual, build: stage.build },
    stagePoints: s.stagePoints,
    stageCost: s.stageCost,
    percent: n.percent,
    itemPercent: n.itemPercent,
    projectPercent: n.projectPercent,
    donePoints: n.donePoints,
    projectCost: n.projectCost,
    totalPoints,
    completed: s.completed,
    lines: s.completed
      ? { item: fillTemplate(L.completed, { project: p.name }), stage: '', project: fillTemplate(L.project, { percent: 100 }) }
      : {
          item: fillTemplate(L.item, { number: n.itemNumber, count: n.itemCount, item: item.name }),
          stage: fillTemplate(L.stage, { number: s.stageIndex + 1, count: n.stageCount, stage: stage.name }),
          project: fillTemplate(L.project, { percent: n.projectPercent }),
        },
    items,
  };
}
