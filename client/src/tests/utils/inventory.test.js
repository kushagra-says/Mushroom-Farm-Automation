import {
  formatDate,
  formatMoney,
  minQuantityFor,
  parseDateOnly,
  rowClassForStatus,
  startOfToday,
  statusClass,
  statusForItem,
} from "../../utils/inventory";

const today = new Date(2026, 9, 20);
const iso = (year, month, day) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const item = (overrides = {}) => ({
  quantity: 10,
  expiry_date: iso(2026, 11, 1),
  ...overrides,
});

describe("parseDateOnly", () => {
  test("parses a date-only string as a local calendar date", () => {
    const date = parseDateOnly("2026-10-20");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(20);
    expect(date.getHours()).toBe(0);
  });

  test("parses the date portion of a PostgreSQL timestamp", () => {
    expect(parseDateOnly("2026-10-20T00:00:00.000Z").getDate()).toBe(20);
  });

  test.each([
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
    ["non-date text", "not-a-date"],
    ["short month", "2026-1-2"],
    ["impossible day", "2026-02-31"],
  ])("returns null for %s", (_label, value) => {
    expect(parseDateOnly(value)).toBeNull();
  });
});

describe("statusForItem", () => {
  test("an expiry before today is Expired", () => {
    expect(statusForItem(item({ expiry_date: iso(2026, 10, 19) }), today)).toBe(
      "Expired"
    );
  });

  test("an expiry today is Expiring Soon", () => {
    expect(statusForItem(item({ expiry_date: iso(2026, 10, 20) }), today)).toBe(
      "Expiring Soon"
    );
  });

  test.each([1, 2, 3])("an expiry in %i day(s) is Expiring Soon", (days) => {
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + days);
    const value = iso(
      expiry.getFullYear(),
      expiry.getMonth() + 1,
      expiry.getDate()
    );

    expect(statusForItem(item({ expiry_date: value }), today)).toBe(
      "Expiring Soon"
    );
  });

  test("an expiry in 4 days is Fresh when stock is sufficient", () => {
    expect(statusForItem(item({ expiry_date: iso(2026, 10, 24) }), today)).toBe(
      "Fresh"
    );
  });

  test("Expired wins over low stock", () => {
    expect(
      statusForItem(
        item({ expiry_date: iso(2026, 10, 19), quantity: 1 }),
        today
      )
    ).toBe("Expired");
  });

  test("Expiring Soon wins over low stock", () => {
    expect(
      statusForItem(
        item({ expiry_date: iso(2026, 10, 21), quantity: 1 }),
        today
      )
    ).toBe("Expiring Soon");
  });

  test.each([
    ["0", 0],
    ["1", 1],
    ["4", 4],
    ["string 3", "3"],
    ["null", null],
  ])("quantity %s below the threshold is Low Stock", (_label, quantity) => {
    expect(statusForItem(item({ quantity }), today)).toBe("Low Stock");
  });

  test("quantity exactly 5 is the Fresh boundary", () => {
    expect(statusForItem(item({ quantity: 5 }), today)).toBe("Fresh");
  });

  test("a missing expiry does not throw and still reports stock state", () => {
    expect(statusForItem(item({ expiry_date: undefined }), today)).toBe(
      "Fresh"
    );
    expect(
      statusForItem(item({ expiry_date: undefined, quantity: 2 }), today)
    ).toBe("Low Stock");
  });

  test("an invalid expiry is ignored rather than marking the batch expired", () => {
    expect(statusForItem(item({ expiry_date: "not-a-date" }), today)).toBe(
      "Fresh"
    );
  });

  test("uses min_quantity when the item supplies one", () => {
    expect(
      statusForItem(item({ quantity: 3, min_quantity: 3 }), today)
    ).toBe("Fresh");
    expect(
      statusForItem(item({ quantity: 2, min_quantity: 3 }), today)
    ).toBe("Low Stock");
    expect(
      statusForItem(item({ quantity: 0, min_quantity: 0 }), today)
    ).toBe("Fresh");
  });
});

describe("minQuantityFor", () => {
  test("defaults to 5 when absent", () => {
    expect(minQuantityFor({})).toBe(5);
    expect(minQuantityFor({ min_quantity: null })).toBe(5);
  });

  test("honours an explicit value, including 0", () => {
    expect(minQuantityFor({ min_quantity: 0 })).toBe(0);
    expect(minQuantityFor({ min_quantity: "12" })).toBe(12);
  });
});

describe("startOfToday", () => {
  test("returns local midnight", () => {
    const date = startOfToday();

    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getMilliseconds()).toBe(0);
  });
});

describe("formatDate", () => {
  test("formats a calendar date without shifting the day", () => {
    const formatted = formatDate("2026-10-20");

    expect(formatted).toMatch(/20 Oct/);
    expect(formatted).toMatch(/2026/);
  });

  test.each([
    ["empty", ""],
    ["invalid", "not-a-date"],
    ["impossible", "2026-02-31"],
    ["null", null],
  ])("returns a dash for %s", (_label, value) => {
    expect(formatDate(value)).toBe("-");
  });
});

describe("formatMoney", () => {
  test("always shows two decimals", () => {
    expect(formatMoney(180.5)).toBe("180.50");
    expect(formatMoney("197.4")).toBe("197.40");
    expect(formatMoney(0)).toBe("0.00");
  });

  test("groups digits in the Indian numbering system", () => {
    expect(formatMoney(1234567.89)).toBe("12,34,567.89");
  });

  test("treats nullish values as zero", () => {
    expect(formatMoney(null)).toBe("0.00");
    expect(formatMoney(undefined)).toBe("0.00");
  });
});

describe("status classes", () => {
  test("normalizes multi-word statuses for CSS", () => {
    expect(statusClass("Expiring Soon")).toBe("expiring-soon");
    expect(statusClass("Low Stock")).toBe("low-stock");
    expect(rowClassForStatus("Expired")).toBe("row-expired");
    expect(rowClassForStatus("Expiring Soon")).toBe("row-expiring-soon");
  });
});
