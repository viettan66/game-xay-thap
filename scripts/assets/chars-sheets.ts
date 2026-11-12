// Thứ tự hình trong từng ảnh gốc nhân vật, xe, tượng (giai đoạn 4c), dùng cho scripts/assets/build-chars.ts.
// Đọc từ trái sang phải, trên xuống dưới. Có test (tests/chars-sheets.test.ts).

const dir4 = (d: string) => [`${d}_0`, `${d}_1`, `${d}_2`, `${d}_3`];
/** Đi lại: nhìn thẳng (đi xuống), thấy lưng (đi lên), đi ngang sang phải; khung 0 = đứng yên. Hàng cuối: dáng mang vác. */
const WALK_15 = [...dir4('down'), ...dir4('up'), ...dir4('right'), 'brick_up_1', 'basket_up_1', 'wood_down_1'];
const WALK_17 = [...dir4('down'), ...dir4('up'), ...dir4('right'), 'brick_up_1', 'brick_up_2', 'basket_up_1', 'basket_up_2', 'wood_down_1'];

/** Thứ tự hình trong từng ảnh (đọc từ trái sang phải, trên xuống dưới). Tên "-" = bỏ hình đó (tách nền hỏng).
 *  minGap: hai mảng cách nhau dưới số điểm ảnh này coi là một hình (mặc định 14; tấm xếp sát nhau dùng nhỏ hơn).
 *  fit: dáng nào trong ảnh gốc vẽ to / nhỏ hơn các dáng khác thì cân riêng: khung _1 của dáng đó cao bao nhiêu điểm ảnh. */
export const SHEETS: {
  sheet: string;
  prefix: string;
  names: string[];
  group: 'chars' | 'vehicles' | 'honor';
  minGap?: number;
  fit?: Record<string, number>;
}[] = [
  { sheet: 'chars_danphu_nam_walk', prefix: 'chars/danphu_nam', names: WALK_15, group: 'chars' },
  {
    sheet: 'chars_danphu_nam_work',
    prefix: 'chars/danphu_nam',
    names: ['hoe_1', 'hoe_2', 'saw_1', 'saw_2', 'hammer_1', 'hammer_2', 'lay_1', 'lay_2', 'rope_1', 'rope_2', 'tile_1', 'tile_2'],
    group: 'chars',
  },
  { sheet: 'chars_danphu_nu_walk', prefix: 'chars/danphu_nu', names: WALK_17, group: 'chars' },
  {
    sheet: 'chars_danphu_nu_work',
    prefix: 'chars/danphu_nu',
    names: ['hoe_1', 'hoe_2', 'tile_1', 'tile_2', 'rope_1', 'rope_2', 'sand_1', 'sand_2', 'rope_3', 'rope_4', 'tile_3', 'tile_4'],
    group: 'chars',
  },
  { sheet: 'chars_thomoc_walk', prefix: 'chars/thomoc', names: WALK_17, group: 'chars' },
  {
    sheet: 'chars_thomoc_work',
    prefix: 'chars/thomoc',
    names: ['saw_1', 'saw_2', 'hammer_1', 'hammer_2', 'carve_1', 'carve_2', 'measure_1', 'measure_2', 'rope_1', 'rope_2', 'tile_1', 'tile_2'],
    group: 'chars',
  },
  { sheet: 'chars_thone_walk', prefix: 'chars/thone', names: WALK_15, group: 'chars' },
  {
    sheet: 'chars_thone_work',
    prefix: 'chars/thone',
    names: ['lay_1', 'lay_2', 'trowel_1', 'trowel_2', 'chisel_1', 'chisel_2', 'stone_1', 'stone_2', 'rope_1', 'rope_2', 'tile_1', 'tile_2'],
    group: 'chars',
  },
  { sheet: 'chars_tusi_walk', prefix: 'chars/tusi', names: WALK_17, group: 'chars' },
  {
    sheet: 'chars_tusi_work',
    prefix: 'chars/tusi',
    // Hình cuối (vác gỗ) mất thanh gỗ khi tách nền: bỏ. Các hình xếp sát nhau theo chiều dọc: khoảng tách 6.
    names: ['sweep_1', 'sweep_2', 'tile_1', 'tile_2', 'rope_1', 'rope_2', 'water_1', 'water_2', 'rope_3', 'rope_4', 'tile_3', 'tile_4', 'brick_up_3', 'basket_up_3', 'wood_down_2', '-'],
    group: 'chars',
    minGap: 6,
    // Chú tiểu cầm chổi vẽ to hơn các dáng khác chừng 15%.
    fit: { sweep: 121 },
  },
  {
    sheet: 'vehicles',
    prefix: 'vehicles',
    names: ['cart_up_1', 'cart_up_2', 'cart_up_3', 'cart_down_1', 'cart_down_2', 'cart_down_3', 'elephant_up_1', 'elephant_up_2', 'elephant_up_3', 'elephant_down_1', 'elephant_down_2', 'elephant_down_3'],
    group: 'vehicles',
  },
  { sheet: 'honor_statues', prefix: 'honor', names: ['statue_1', 'statue_2', 'statue_3'], group: 'honor' },
];

/** Tên ảnh (khóa trong manifest, đường dẫn trong assets/game bỏ đuôi .png): chars/<loại>_<…>, vehicles/<…>, honor/<…>. */
export function spriteName(prefix: string, name: string): string {
  return prefix.includes('/') ? `${prefix}_${name}` : `${prefix}/${name}`;
}
