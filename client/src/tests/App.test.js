import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import App from "../App";

jest.mock("axios");

const API_URL = "http://localhost:5000/inventory";

const pad = (value) => String(value).padStart(2, "0");

function dateOffset(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function makeItem(overrides = {}) {
  return {
    id: 1,
    product_name: "Oyster Mushrooms",
    quantity: 10,
    price: "180.00",
    expiry_date: dateOffset(10),
    batch_no: "BATCH-001",
    harvest_date: dateOffset(-10),
    shelf_life_days: 20,
    storage_temp: "4.0",
    quality_grade: "A",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

async function renderWithItems(items) {
  axios.get.mockResolvedValue({ data: items });
  const view = render(<App />);
  await waitFor(() =>
    expect(screen.queryByText(/loading inventory/i)).not.toBeInTheDocument()
  );
  return view;
}

function bodyRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function rowFor(productName) {
  return bodyRows().find((row) => within(row).queryByText(productName));
}

function rowNames() {
  return bodyRows().map(
    (row) => row.querySelector(".product-cell strong").textContent
  );
}

function statValue(label) {
  const labelNode = screen
    .getAllByText(label)
    .find((node) => node.closest(".stat-card"));

  return labelNode.closest(".stat-card").querySelector("strong").textContent;
}

function modalFor(heading) {
  return screen.getByRole("heading", { name: heading }).closest(".modal-card");
}

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillBatchForm(overrides = {}) {
  const values = {
    "Product Name": "Lion's Mane",
    "Batch No": "BATCH-009",
    Quantity: "12",
    Price: "250.75",
    "Harvest Date": "2026-10-20",
    "Expiry Date": "2026-10-30",
    "Shelf Life (days)": "30",
    "Storage Temp (°C)": "4.5",
    "Quality Grade": "b",
    ...overrides,
  };

  for (const [label, value] of Object.entries(values)) {
    fill(label, value);
  }
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("inventory dashboard", () => {
  test("renders every fetched batch with its status", async () => {
    await renderWithItems([
      makeItem({ id: 1, product_name: "Oyster", batch_no: "B-1" }),
      makeItem({
        id: 2,
        product_name: "Shiitake",
        batch_no: "B-2",
        expiry_date: dateOffset(-1),
      }),
    ]);

    expect(axios.get).toHaveBeenCalledWith(API_URL);
    expect(bodyRows()).toHaveLength(2);
    expect(within(rowFor("Oyster")).getByText("Fresh")).toBeInTheDocument();
    expect(within(rowFor("Shiitake")).getByText("Expired")).toBeInTheDocument();
  });

  test("shows the loading state before data arrives", async () => {
    let resolveRequest;
    axios.get.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    render(<App />);

    expect(screen.getByText(/loading inventory/i)).toBeInTheDocument();

    resolveRequest({ data: [] });

    await waitFor(() =>
      expect(screen.queryByText(/loading inventory/i)).not.toBeInTheDocument()
    );
  });

  test("computes every dashboard statistic", async () => {
    await renderWithItems([
      makeItem({
        id: 1,
        product_name: "Fresh Batch",
        quantity: 10,
        price: "100.00",
        expiry_date: dateOffset(10),
      }),
      makeItem({
        id: 2,
        product_name: "Low Batch",
        quantity: 3,
        price: "50.00",
        expiry_date: dateOffset(10),
      }),
      makeItem({
        id: 3,
        product_name: "Expired Batch",
        quantity: 10,
        price: "20.00",
        expiry_date: dateOffset(-1),
      }),
      makeItem({
        id: 4,
        product_name: "Soon Batch",
        quantity: 10,
        price: "10.00",
        expiry_date: dateOffset(2),
      }),
    ]);

    expect(statValue("Total Batches")).toBe("4");
    expect(statValue("Low Stock")).toBe("1");
    expect(statValue("Expired")).toBe("1");
    expect(statValue("Expiring Soon")).toBe("1");
    expect(statValue("Total Value")).toBe("₹1,450.00");
  });

  test("shows the fetch error banner when the API is unreachable", async () => {
    axios.get.mockRejectedValue(new Error("down"));

    render(<App />);

    expect(
      await screen.findByText(/failed to fetch inventory/i)
    ).toBeInTheDocument();
  });
});

describe("search, filters, and sorting", () => {
  const items = [
    makeItem({
      id: 1,
      product_name: "Oyster Mushrooms",
      batch_no: "OY-001",
      quantity: 9,
      quality_grade: "A",
      expiry_date: dateOffset(10),
    }),
    makeItem({
      id: 2,
      product_name: "Shiitake Mushrooms",
      batch_no: "SH-002",
      quantity: 1,
      quality_grade: "B",
      expiry_date: dateOffset(5),
    }),
    makeItem({
      id: 3,
      product_name: "Enoki Mushrooms",
      batch_no: "EN-003",
      quantity: 5,
      quality_grade: "C",
      expiry_date: dateOffset(1),
    }),
  ];

  test("searches product names case-insensitively", async () => {
    await renderWithItems(items);

    await userEvent.type(
      screen.getByPlaceholderText(/search product/i),
      "shii"
    );

    expect(rowNames()).toEqual(["Shiitake Mushrooms"]);
  });

  test("searches batch numbers", async () => {
    await renderWithItems(items);

    await userEvent.type(
      screen.getByPlaceholderText(/search product/i),
      "EN-003"
    );

    expect(rowNames()).toEqual(["Enoki Mushrooms"]);
  });

  test("filters by status", async () => {
    await renderWithItems([
      ...items,
      makeItem({
        id: 4,
        product_name: "Expired One",
        expiry_date: dateOffset(-2),
      }),
    ]);

    await userEvent.selectOptions(
      screen.getByDisplayValue("All Status"),
      "Expired"
    );

    expect(rowNames()).toEqual(["Expired One"]);
  });

  test("filters by quality grade", async () => {
    await renderWithItems(items);

    await userEvent.selectOptions(
      screen.getByDisplayValue("All Grades"),
      "B"
    );

    expect(rowNames()).toEqual(["Shiitake Mushrooms"]);
  });

  test("sorts by quantity ascending and descending", async () => {
    await renderWithItems(items);

    await userEvent.selectOptions(
      screen.getByDisplayValue("Expiry: Soonest First"),
      "qty-asc"
    );
    expect(rowNames()).toEqual([
      "Shiitake Mushrooms",
      "Enoki Mushrooms",
      "Oyster Mushrooms",
    ]);

    await userEvent.selectOptions(
      screen.getByDisplayValue("Quantity: Low to High"),
      "qty-desc"
    );
    expect(rowNames()).toEqual([
      "Oyster Mushrooms",
      "Enoki Mushrooms",
      "Shiitake Mushrooms",
    ]);
  });

  test("clear restores the default view", async () => {
    await renderWithItems(items);

    await userEvent.type(
      screen.getByPlaceholderText(/search product/i),
      "oyster"
    );
    await userEvent.selectOptions(
      screen.getByDisplayValue("All Status"),
      "Fresh"
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByPlaceholderText(/search product/i)).toHaveValue("");
    expect(screen.getByDisplayValue("All Status")).toBeInTheDocument();
    expect(rowNames()).toHaveLength(3);
  });

  test("shows the empty state when nothing matches", async () => {
    await renderWithItems(items);

    await userEvent.type(
      screen.getByPlaceholderText(/search product/i),
      "nothing-like-this"
    );

    expect(screen.getByText(/no matching items/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("batch mutations", () => {
  test("creates a batch with a normalized numeric payload", async () => {
    await renderWithItems([makeItem()]);
    axios.post.mockResolvedValue({ data: {} });

    await userEvent.click(
      screen.getByRole("button", { name: /\+ add batch/i })
    );
    fillBatchForm();
    await userEvent.click(
      within(modalFor(/add new batch/i)).getByRole("button", {
        name: "Add Batch",
      })
    );

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(API_URL, {
        product_name: "Lion's Mane",
        quantity: 12,
        price: 250.75,
        expiry_date: "2026-10-30",
        batch_no: "BATCH-009",
        harvest_date: "2026-10-20",
        shelf_life_days: 30,
        storage_temp: 4.5,
        quality_grade: "B",
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: /add new batch/i })
      ).not.toBeInTheDocument()
    );
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  });

  test("edits an existing batch and sends PUT to its id", async () => {
    await renderWithItems([
      makeItem({
        id: 5,
        product_name: "Edit Me",
        quantity: 10,
        expiry_date: "2026-11-01",
        harvest_date: "2026-10-01",
      }),
    ]);
    axios.put.mockResolvedValue({ data: {} });

    await userEvent.click(
      within(rowFor("Edit Me")).getByRole("button", { name: "Edit" })
    );

    expect(
      screen.getByRole("heading", { name: /edit batch/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/product name/i)).toHaveValue("Edit Me");
    expect(screen.getByLabelText(/expiry date/i)).toHaveValue("2026-11-01");

    fill("Quantity", "7");
    await userEvent.click(
      within(modalFor(/edit batch/i)).getByRole("button", {
        name: "Update Batch",
      })
    );

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith(
        `${API_URL}/5`,
        expect.objectContaining({ quantity: 7, product_name: "Edit Me" })
      )
    );
  });

  test("deletes only after the user confirms", async () => {
    await renderWithItems([makeItem({ id: 8, product_name: "Delete Me" })]);
    jest.spyOn(window, "confirm").mockReturnValue(true);
    axios.delete.mockResolvedValue({ data: {} });

    await userEvent.click(
      within(rowFor("Delete Me")).getByRole("button", { name: "Delete" })
    );

    await waitFor(() =>
      expect(axios.delete).toHaveBeenCalledWith(`${API_URL}/8`)
    );
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test("does nothing when deletion is cancelled", async () => {
    await renderWithItems([makeItem({ id: 9, product_name: "Keep Me" })]);
    jest.spyOn(window, "confirm").mockReturnValue(false);

    await userEvent.click(
      within(rowFor("Keep Me")).getByRole("button", { name: "Delete" })
    );

    expect(axios.delete).not.toHaveBeenCalled();
  });

  test("surfaces a create failure in the page banner", async () => {
    await renderWithItems([makeItem()]);
    axios.post.mockRejectedValue({
      response: { data: { error: "Failed to add item" } },
    });

    await userEvent.click(
      screen.getByRole("button", { name: /\+ add batch/i })
    );
    fillBatchForm();
    await userEvent.click(
      within(modalFor(/add new batch/i)).getByRole("button", {
        name: "Add Batch",
      })
    );

    expect(await screen.findByText("Failed to add item")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /add new batch/i })
    ).toBeInTheDocument();
  });

  test("surfaces a delete failure in the page banner", async () => {
    await renderWithItems([makeItem({ id: 10, product_name: "Stuck" })]);
    jest.spyOn(window, "confirm").mockReturnValue(true);
    axios.delete.mockRejectedValue({
      response: { data: { error: "Cannot delete item" } },
    });

    await userEvent.click(
      within(rowFor("Stuck")).getByRole("button", { name: "Delete" })
    );

    expect(await screen.findByText("Cannot delete item")).toBeInTheDocument();
  });
});

describe("modal behavior", () => {
  test("closes when the overlay is clicked", async () => {
    await renderWithItems([makeItem()]);

    await userEvent.click(
      screen.getByRole("button", { name: /\+ add batch/i })
    );
    fireEvent.click(document.querySelector(".modal-overlay"));

    expect(
      screen.queryByRole("heading", { name: /add new batch/i })
    ).not.toBeInTheDocument();
  });

  test("cancel closes the modal without calling the API", async () => {
    await renderWithItems([makeItem()]);

    await userEvent.click(
      screen.getByRole("button", { name: /\+ add batch/i })
    );
    await userEvent.click(
      within(modalFor(/add new batch/i)).getByRole("button", {
        name: "Cancel",
      })
    );

    expect(
      screen.queryByRole("heading", { name: /add new batch/i })
    ).not.toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
