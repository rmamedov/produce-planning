import { describe, expect, it } from "vitest";

import {
  WORDS,
  batchStatusLine,
  buildPrepSheet,
  clockDay,
  clockTime,
  completeReducer,
  completedToastText,
  countLabel,
  deltaLabel,
  displayedTotal,
  distributionHint,
  filialSpreadLabel,
  formatClock,
  formatQty,
  formatWindowHours,
  initialCompleteState,
  laneBadges,
  lateText,
  minutesLate,
  prepInProgressNote,
  prepLayout,
  producedByFilial,
  qtyPair,
  rowSum,
  scopeEyebrow,
  sheetLayout,
  sliceByFilial,
  startedToastText,
  type CompleteAction,
  type CompleteState
} from "@/features/production-tasks/presentation/presentation-view";
import { groupPresentationTasks, type GroupableTask } from "@/lib/presentation-grouping";

const at = (hh: number, mm: number) => new Date(2026, 8, 30, hh, mm).getTime();
const iso = (hh: number, mm: number) => new Date(at(hh, mm)).toISOString();

let seq = 0;
function task(overrides: Partial<GroupableTask> = {}): GroupableTask {
  seq += 1;
  return {
    id: `t${String(seq).padStart(3, "0")}`,
    filial_id: 3361,
    lager_id: 437495,
    lager_name: "Круасан, 50г",
    unit: "шт",
    status: "NEW",
    priority: "MEDIUM",
    quantity: 10,
    operational_ready_at: iso(9, 10),
    history_date: "2026-09-30",
    batch_id: null,
    started_at: null,
    promo_mechanics: null,
    is_guest_promise: false,
    ecom_orders_qty: null,
    bakery_type: "Кондитерська",
    ...overrides
  };
}

function croissant() {
  return [
    task({ filial_id: 3361, quantity: 24, operational_ready_at: iso(9, 10), priority: "CRITICAL" }),
    task({ filial_id: 2048, quantity: 18, operational_ready_at: iso(10, 5), priority: "HIGH" }),
    task({ filial_id: 2043, quantity: 30, operational_ready_at: iso(12, 10), priority: "MEDIUM" })
  ];
}

describe("formatting", () => {
  it("formats quantities with a comma and one decimal", () => {
    expect(formatQty(1.5)).toBe("1,5");
    expect(formatQty(3)).toBe("3");
    expect(formatQty(0.1 + 0.2)).toBe("0,3");
    expect(formatQty(-0.04)).toBe("0");
  });

  it("never adds pieces and kilograms together", () => {
    expect(qtyPair(90, 6)).toBe("90 шт + 6 кг");
    expect(qtyPair(90, 0)).toBe("90 шт");
    expect(qtyPair(0, 2.5)).toBe("2,5 кг");
    expect(qtyPair(0, 0)).toBe("0");
  });

  it("formats the grouping window in hours", () => {
    expect(formatWindowHours(300)).toBe("5 год");
    expect(formatWindowHours(30)).toBe("0,5 год");
    expect(formatWindowHours(450)).toBe("7,5 год");
  });

  it("uses Ukrainian plural forms", () => {
    expect(countLabel(1, WORDS.batch)).toBe("1 партія");
    expect(countLabel(3, WORDS.filial)).toBe("3 філії");
    expect(countLabel(11, WORDS.task)).toBe("11 задач");
    expect(countLabel(22, WORDS.position)).toBe("22 позиції");
  });

  it("prints local clock time and whole overdue minutes (at least 1)", () => {
    expect(clockTime(at(9, 5))).toBe("09:05");
    expect(minutesLate(at(9, 0), at(9, 42))).toBe(42);
    expect(minutesLate(at(9, 0), at(9, 0) + 20_000)).toBe(1);
    expect(lateText(at(9, 0), at(9, 32))).toBe("32\u00a0хв");
  });
});

describe("formatClock", () => {
  // Local calendar dates, like the rest of the board.
  const sep = (day: number, hh: number, mm: number) => new Date(2026, 8, day, hh, mm).getTime();
  const oct = (day: number, hh: number, mm: number) => new Date(2026, 9, day, hh, mm).getTime();

  it("prints just the time on the same day", () => {
    expect(formatClock(sep(30, 9, 10), sep(30, 8, 0))).toBe("09:10");
    expect(formatClock(sep(30, 23, 59), sep(30, 0, 0))).toBe("23:59");
    expect(clockDay(sep(30, 9, 10), sep(30, 8, 0))).toBeNull();
  });

  it("names tomorrow and yesterday", () => {
    expect(formatClock(oct(1, 0, 43), sep(30, 20, 0))).toBe("завтра\u00a000:43");
    expect(formatClock(sep(29, 22, 15), sep(30, 8, 0))).toBe("вчора\u00a022:15");
    expect(clockDay(oct(1, 7, 0), sep(30, 8, 0))).toBe("завтра");
  });

  it("switches exactly at local midnight", () => {
    expect(formatClock(sep(30, 23, 59), sep(30, 23, 50))).toBe("23:59");
    expect(formatClock(oct(1, 0, 0), sep(30, 23, 59))).toBe("завтра\u00a000:00");
    expect(formatClock(sep(30, 23, 59), oct(1, 0, 1))).toBe("вчора\u00a023:59");
    expect(formatClock(oct(1, 0, 5), oct(1, 0, 1))).toBe("00:05");
  });

  it("falls back to dd.MM two or more days away; day words cross month and year ends", () => {
    expect(formatClock(oct(2, 9, 5), sep(30, 8, 0))).toBe("02.10\u00a009:05");
    expect(formatClock(sep(27, 18, 0), sep(30, 8, 0))).toBe("27.09\u00a018:00");
    expect(formatClock(new Date(2027, 0, 1, 1, 0).getTime(), new Date(2026, 11, 31, 22, 0).getTime())).toBe(
      "завтра\u00a001:00"
    );
  });
});

describe("sliceByFilial", () => {
  it("sums one filial's members and keeps the first-seen order", () => {
    const members = [
      task({ filial_id: 2048, quantity: 4, operational_ready_at: iso(10, 0), priority: "HIGH" }),
      task({ filial_id: 3361, quantity: 2 }),
      task({ filial_id: 2048, quantity: 1.5, operational_ready_at: iso(9, 30), priority: "CRITICAL" })
    ];
    const slices = sliceByFilial(members);
    expect(slices.map((slice) => slice.filialId)).toEqual([2048, 3361]);
    expect(slices[0].quantity).toBe(5.5);
    expect(slices[0].readyAt).toBe(at(9, 30));
    expect(slices[0].priority).toBe("CRITICAL");
    expect(slices[0].taskIds).toEqual([members[0].id, members[2].id]);
  });

  it("treats LOW as Нормальний and keeps readiness null when absent", () => {
    const [slice] = sliceByFilial([task({ priority: "LOW", operational_ready_at: null })]);
    expect(slice.priority).toBe("MEDIUM");
    expect(slice.readyAt).toBeNull();
  });
});

describe("row labels", () => {
  it("says where a batch goes", () => {
    expect(filialSpreadLabel([3361, 2048, 2043])).toBe("на 3 філії");
    expect(filialSpreadLabel([3361, 2048, 2043, 1, 2])).toBe("на 5 філій");
    expect(filialSpreadLabel([3361])).toBe("лише Березнева");
  });

  it("shows the window for NEW batches only", () => {
    const now = at(8, 0);
    const [window] = groupPresentationTasks(croissant(), 300);
    expect(batchStatusLine(window, 300, now)).toBe("вікно 09:10–14:10 · 3 філії");

    const [noTime] = groupPresentationTasks([task({ operational_ready_at: null })], 300);
    expect(batchStatusLine(noTime, 300, now)).toBe("без часу готовності · 1 філія");

    const [batch] = groupPresentationTasks(
      [task({ status: "IN_PROGRESS", batch_id: "b1" }), task({ status: "IN_PROGRESS", batch_id: "b1", filial_id: 2048 })],
      300
    );
    expect(batchStatusLine(batch, 300, now)).toBe("2 філії");
  });

  it("names the day of a window end that is not today", () => {
    const [late] = groupPresentationTasks([task({ operational_ready_at: iso(22, 30) })], 300);
    expect(batchStatusLine(late, 300, at(20, 0))).toBe("вікно 22:30–03:30\u00a0(завтра) · 1 філія");
    expect(batchStatusLine(late, 300, at(23, 59) + 2 * 60000)).toBe("вікно 22:30–03:30 · 1 філія");
  });

  it("builds the scope eyebrow from the visible batches", () => {
    const groups = groupPresentationTasks(
      [...croissant(), task({ operational_ready_at: iso(17, 20), filial_id: 2048 })],
      300
    );
    expect(scopeEyebrow(3, 300, groups)).toBe(
      "Представлення · 3 філії · групування 5 год · 2 партії / 4 задачі"
    );
  });

  it("unions the article badges of a lane", () => {
    const groups = groupPresentationTasks(
      [
        task({ promo_mechanics: "знижка/кешбек", ecom_orders_qty: 2 }),
        task({ promo_mechanics: "кешбек", operational_ready_at: iso(17, 0), is_guest_promise: true, ecom_orders_qty: 1 })
      ],
      60
    );
    expect(laneBadges(groups)).toEqual({
      promo: ["знижка", "кешбек"],
      guest: true,
      ecom: 3,
      bakeryType: "Кондитерська"
    });
  });
});

describe("toasts", () => {
  it("lists started filials and the ones taken elsewhere", () => {
    const parts = [
      { filialId: 3361, quantity: 24 },
      { filialId: 2048, quantity: 18 }
    ];
    expect(startedToastText("Круасан, 50г", parts, 0)).toBe(
      "Почато: Круасан, 50г · Березнева 24 · Січових Стрільців 18"
    );
    expect(startedToastText("Круасан, 50г", parts, 1)).toBe(
      "Почато: Круасан, 50г · Березнева 24 · Січових Стрільців 18 (1 уже взяли на іншому планшеті)"
    );
  });

  it("reports completion per filial, skipping zero rows", () => {
    const members = [task({ filial_id: 3361 }), task({ filial_id: 2048 }), task({ filial_id: 3361 })];
    const parts = producedByFilial(members, [2, 0, 1.5]);
    expect(parts).toEqual([{ filialId: 3361, quantity: 3.5 }]);
    expect(completedToastText("Хліб", parts)).toBe("Виконано: Хліб · Березнева 3,5 → у вкладці «Виконані»");
  });
});

describe("grid layouts", () => {
  it("uses the spec columns up to 4 filials", () => {
    expect(sheetLayout(3)).toEqual({
      columns: "140px minmax(200px, 1fr) repeat(3, 120px) 150px 216px",
      gap: 12,
      wide: false
    });
    expect(prepLayout(4).columns).toBe("minmax(240px, 1fr) repeat(4, 110px) 140px minmax(220px, 300px)");
  });

  it("narrows filial columns to 100px for 5–6 filials and scrolls beyond", () => {
    expect(sheetLayout(5).columns).toContain("repeat(5, 100px)");
    expect(sheetLayout(6).columns).toContain("repeat(6, 100px)");
    expect(sheetLayout(6).wide).toBe(false);
    expect(sheetLayout(7).wide).toBe(true);
    expect(prepLayout(6).columns).toContain("repeat(6, 100px)");
    expect(prepLayout(7).wide).toBe(true);
  });
});

describe("prepInProgressNote", () => {
  it("puts «партія» in the accusative and matches the pronoun", () => {
    expect(prepInProgressNote(1)).toBe("Не включено 1 партію «В роботі» — її вже готують.");
    expect(prepInProgressNote(2)).toBe("Не включено 2 партії «В роботі» — їх уже готують.");
    expect(prepInProgressNote(5)).toBe("Не включено 5 партій «В роботі» — їх уже готують.");
    expect(prepInProgressNote(21)).toBe("Не включено 21 партію «В роботі» — їх уже готують.");
  });
});

describe("buildPrepSheet", () => {
  const tasks = [
    ...croissant(),
    task({ lager_id: 1015159, lager_name: "Піца", unit: "кг", quantity: 1.5, bakery_type: "Допікання", operational_ready_at: iso(10, 30) }),
    task({ lager_id: 1015159, lager_name: "Піца", unit: null, quantity: 2, filial_id: 2043, bakery_type: "Допікання", operational_ready_at: iso(11, 40) }),
    task({ lager_id: 746131, lager_name: "Багет", quantity: 12, bakery_type: "Пекарня", operational_ready_at: iso(11, 20) }),
    task({ lager_id: 1, lager_name: "Без типу виріб", quantity: 5, bakery_type: null, operational_ready_at: iso(13, 0) }),
    task({ lager_id: 437495, quantity: 16, filial_id: 2048, operational_ready_at: iso(17, 20) }),
    task({ lager_id: 527091, lager_name: "Сосиска", quantity: 10, status: "IN_PROGRESS", batch_id: "b1", bakery_type: "Пекарня" })
  ];
  const groups = groupPresentationTasks(tasks, 300);

  it("groups NEW batches by bakery type in the canonical order, untyped last", () => {
    const sheet = buildPrepSheet(groups, null);
    expect(sheet.sections.map((section) => section.title)).toEqual([
      "Пекарня",
      "Допікання",
      "Кондитерська",
      "Без типу"
    ]);
    expect(sheet.sections[0].rows.map((row) => row.lagerName)).toEqual(["Багет"]);
  });

  it("sums per article and filial, with chips per batch in deadline order", () => {
    const sheet = buildPrepSheet(groups, null);
    const croissantRow = sheet.sections[2].rows[0];
    expect(croissantRow.perFilial).toEqual({ 3361: 24, 2048: 34, 2043: 30 });
    expect(croissantRow.total).toBe(88);
    expect(croissantRow.chips.map((chip) => [clockTime(chip.deadline as number), chip.total, chip.priority])).toEqual([
      ["09:10", 72, "CRITICAL"],
      ["17:20", 16, "MEDIUM"]
    ]);
    expect(sheet.sections[1]).toMatchObject({ pcs: 0, kg: 3.5 });
    expect(sheet.perFilial[3361]).toEqual({ pcs: 41, kg: 1.5 });
    expect(sheet.pcs).toBe(105);
    expect(sheet.kg).toBe(3.5);
  });

  it("keeps only batches starting within the horizon", () => {
    const sheet = buildPrepSheet(groups, at(12, 0));
    const titles = sheet.sections.map((section) => section.title);
    expect(titles).toEqual(["Пекарня", "Допікання", "Кондитерська"]);
    expect(sheet.sections[2].rows[0].chips).toHaveLength(1);
    expect(sheet.sections[2].rows[0].total).toBe(72);
  });

  it("never includes batches already in progress", () => {
    const sheet = buildPrepSheet(groups, null);
    const names = sheet.sections.flatMap((section) => section.rows.map((row) => row.lagerName));
    expect(names).not.toContain("Сосиска");
  });
});

describe("group completion input", () => {
  const run = (state: CompleteState, ...actions: CompleteAction[]) => actions.reduce(completeReducer, state);
  const digits = (value: string): CompleteAction[] =>
    value.split("").map((digit) => (digit === "," ? { type: "comma" } : { type: "digit", digit }));

  it("starts from the ordered quantities, total targeted", () => {
    const state = initialCompleteState([24, 18, 30], "шт");
    expect(state.total).toBe("72");
    expect(state.rows).toEqual(["24", "18", "30"]);
    expect(state.target).toBe("total");
    expect(distributionHint(state, ["Березнева", "Січових Стрільців", "Дніпровська Наб. 33"]).text).toBe(
      "Розподілено як у замовленні — підтвердіть одним тапом."
    );
  });

  it("the first key replaces the prefill; a shortage lands on the least urgent", () => {
    const state = run(initialCompleteState([24, 18, 30], "шт"), ...digits("66"));
    expect(state.total).toBe("66");
    expect(state.rows).toEqual(["24", "18", "24"]);
    expect(rowSum(state)).toBe(66);
    expect(distributionHint(state, ["Березнева", "Січових Стрільців", "Дніпровська Наб. 33"])).toEqual({
      tone: "warn",
      text: "Нестача 6 шт — недоотримає Дніпровська Наб. 33 (найменш термінова)"
    });
  });

  it("names every short filial in the plural", () => {
    const state = run(initialCompleteState([24, 18, 30], "шт"), ...digits("30"));
    expect(state.rows).toEqual(["24", "6", "0"]);
    expect(distributionHint(state, ["Березнева", "Січових Стрільців", "Дніпровська Наб. 33"]).text).toBe(
      "Нестача 42 шт — недоотримають Січових Стрільців, Дніпровська Наб. 33 (найменш термінові)"
    );
  });

  it("shares a surplus in proportion and omits +0 rows from the hint", () => {
    const state = run(initialCompleteState([24, 18, 30], "шт"), ...digits("80"));
    expect(state.rows).toEqual(["27", "20", "33"]);
    expect(distributionHint(state, ["Березнева", "Січових Стрільців", "Дніпровська Наб. 33"]).text).toBe(
      "Надлишок +8 шт: Березнева +3 · Січових Стрільців +2 · Дніпровська Наб. 33 +3"
    );
    const onlyOne = run(initialCompleteState([30, 1], "шт"), ...digits("32"));
    expect(onlyOne.rows).toEqual(["31", "1"]);
    expect(distributionHint(onlyOne, ["A", "B"]).text).toBe("Надлишок +1 шт: A +1");
  });

  it("a row edit switches to manual; «Разом» then follows the row sum", () => {
    let state = run(initialCompleteState([24, 18, 30], "шт"), { type: "target", target: 1 }, ...digits("12"));
    expect(state.manual).toBe(true);
    expect(state.rows).toEqual(["24", "12", "30"]);
    expect(displayedTotal(state)).toBe("66");
    expect(distributionHint(state, ["a", "b", "c"]).text).toBe(
      "Ручний розподіл: разом = сума рядків (66 шт). Зміна поля «Разом» знову розподілить автоматично."
    );

    state = run(state, { type: "target", target: "total" });
    expect(state.total).toBe("66");
    expect(state.manual).toBe(true);

    state = run(state, { type: "step", direction: 1 });
    expect(state.manual).toBe(false);
    expect(state.total).toBe("67");
    expect(state.rows).toEqual(["24", "18", "25"]);
  });

  it("«Розподілити автоматично» redistributes the visible total", () => {
    const state = run(
      initialCompleteState([24, 18, 30], "шт"),
      { type: "target", target: 0 },
      ...digits("20"),
      { type: "auto" }
    );
    expect(state.manual).toBe(false);
    expect(state.target).toBe("total");
    expect(state.total).toBe("68");
    expect(state.rows).toEqual(["24", "18", "26"]);
  });

  it("clear, backspace and zero rows", () => {
    let state = run(initialCompleteState([24, 18], "шт"), { type: "clear" });
    expect(state.total).toBe("0");
    expect(state.rows).toEqual(["0", "0"]);
    expect(distributionHint(state, ["a", "b"]).tone).toBe("warn");
    expect(distributionHint(state, ["a", "b"]).text).toMatch(/^Введіть кількість — 0 підтвердити не можна/);

    state = run(initialCompleteState([24, 18], "шт"), ...digits("35"), { type: "backspace" });
    expect(state.total).toBe("3");
    expect(state.rows).toEqual(["3", "0"]);
  });

  it("kilograms take one decimal and distribute in 0,1 steps", () => {
    let state = run(initialCompleteState([1.5, 2], "кг"), ...digits("3"));
    expect(state.rows).toEqual(["1,5", "1,5"]);
    state = run(state, ...digits(",5"));
    expect(state.total).toBe("3,5");
    expect(state.rows).toEqual(["1,5", "2"]);
    state = run(state, { type: "step", direction: 1 });
    expect(state.total).toBe("4");
    expect(state.rows).toEqual(["1,7", "2,3"]);
  });

  it("pieces ignore the comma key", () => {
    const state = run(initialCompleteState([5], "шт"), ...digits("4,5"));
    expect(state.total).toBe("45");
  });
});

describe("deltaLabel", () => {
  it("labels the difference to the order", () => {
    expect(deltaLabel(24, 24)).toEqual({ tone: "eq", text: "як замовлено" });
    expect(deltaLabel(24, 30)).toEqual({ tone: "minus", text: "−6" });
    expect(deltaLabel(2.3, 2)).toEqual({ tone: "plus", text: "+0,3" });
  });
});
