import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "http://localhost:5000/inventory";

const EMPTY_FORM = {
  product_name: "",
  quantity: "",
  price: "",
  expiry_date: "",
  batch_no: "",
  harvest_date: "",
  shelf_life_days: "",
  storage_temp: "",
  quality_grade: "",
};

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const statusForItem = (item) => {
  const quantity = Number(item.quantity) || 0;
  const expiry = item.expiry_date ? new Date(item.expiry_date) : null;
  const today = startOfToday();

  if (expiry && !Number.isNaN(expiry.getTime())) {
    if (expiry < today) return "Expired";

    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 3) return "Expiring Soon";
  }

  if (quantity < 5) return "Low Stock";
  return "Fresh";
};

const rowClassForStatus = (status) => {
  const normalized = status.toLowerCase().replace(/\s+/g, "-");
  return `row-${normalized}`;
};

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [sortBy, setSortBy] = useState("expiry-asc");

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_URL);
      setItems(res.data);
      setError("");
    } catch (err) {
      setError("Failed to fetch inventory. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const resetForm = () => setFormData(EMPTY_FORM);

  const openAddModal = () => {
    resetForm();
    setEditingId(null);
    setError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    setEditingId(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const payload = {
      product_name: formData.product_name.trim(),
      quantity: Number(formData.quantity),
      price: Number(formData.price),
      expiry_date: formData.expiry_date,
      batch_no: formData.batch_no.trim(),
      harvest_date: formData.harvest_date,
      shelf_life_days: Number(formData.shelf_life_days),
      storage_temp: Number(formData.storage_temp),
      quality_grade: formData.quality_grade.trim().toUpperCase(),
    };

    try {
      if (editingId) {
        await axios.put(`${API_URL}/${editingId}`, payload);
      } else {
        await axios.post(API_URL, payload);
      }

      closeModal();
      fetchItems();
    } catch (err) {
      setError(err.response?.data?.error || "Operation failed");
    }
  };

  const handleEdit = (item) => {
    setFormData({
      product_name: item.product_name || "",
      quantity: item.quantity ?? "",
      price: item.price ?? "",
      expiry_date: item.expiry_date ? item.expiry_date.split("T")[0] : "",
      batch_no: item.batch_no || "",
      harvest_date: item.harvest_date ? item.harvest_date.split("T")[0] : "",
      shelf_life_days: item.shelf_life_days ?? "",
      storage_temp: item.storage_temp ?? "",
      quality_grade: item.quality_grade || "",
    });

    setEditingId(item.id);
    setError("");
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = window.confirm("Delete this item?");
    if (!ok) return;

    try {
      await axios.delete(`${API_URL}/${id}`);
      fetchItems();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete item");
    }
  };

  const totalItems = items.length;
  const lowStockItems = items.filter((item) => Number(item.quantity) < 5).length;
  const expiredItems = items.filter((item) => statusForItem(item) === "Expired").length;
  const expiringSoonItems = items.filter((item) => statusForItem(item) === "Expiring Soon").length;
  const totalValue = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    let data = [...items].filter((item) => {
      const status = statusForItem(item);
      const grade = (item.quality_grade || "").toString().trim().toUpperCase();

      const matchesSearch =
        !q ||
        [
          item.product_name,
          item.batch_no,
          item.quality_grade,
          item.expiry_date,
          item.harvest_date,
        ].some((value) => String(value || "").toLowerCase().includes(q));

      const matchesStatus = statusFilter === "All" || status === statusFilter;
      const matchesGrade = gradeFilter === "All" || grade === gradeFilter;

      return matchesSearch && matchesStatus && matchesGrade;
    });

    const sorters = {
      "expiry-asc": (a, b) => new Date(a.expiry_date) - new Date(b.expiry_date),
      "expiry-desc": (a, b) => new Date(b.expiry_date) - new Date(a.expiry_date),
      "qty-asc": (a, b) => Number(a.quantity) - Number(b.quantity),
      "qty-desc": (a, b) => Number(b.quantity) - Number(a.quantity),
      recent: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    };

    data.sort(sorters[sortBy] || sorters["expiry-asc"]);
    return data;
  }, [items, search, statusFilter, gradeFilter, sortBy]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setGradeFilter("All");
    setSortBy("expiry-asc");
  };
  const [mlStatus, setMlStatus] = useState(null);
  const checkEnvironment = async () => {
  try {
    const res = await fetch("http://localhost:8000/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        temperature: 28,
        humidity: 80,
        co2: 900,
      }),
    });

    const data = await res.json();
    setMlStatus(data);
  } catch (err) {
    console.error("ML error:", err);
  }
};

  return (
    <div className="app-shell">
      <div className="page">
        <header className="hero-card">
          <div className="hero-copy">
            <div className="eyebrow">Oyster Mushroom Inventory System</div>
            <h1>Premium inventory control for batches, freshness, and quality</h1>
            <p>
              Track batch numbers, harvest dates, storage temperature, shelf life,
              and expiry status in one polished dashboard.
            </p>

            <div className="hero-chips">
              <span>FIFO ready</span>
              <span>Low-stock alerts</span>
              <span>Expiry tracking</span>
              <span>Grade-wise inventory</span>
            </div>
          </div>

          <div className="hero-actions">
            <button className="primary-btn" onClick={openAddModal}>
              + Add Batch
            </button>
            <button className="secondary-btn" onClick={fetchItems}>
              Refresh
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <div className="stat-card stat-blue">
            <span>Total Batches</span>
            <strong>{totalItems}</strong>
          </div>
          <div className="stat-card stat-yellow">
            <span>Low Stock</span>
            <strong>{lowStockItems}</strong>
          </div>
          <div className="stat-card stat-red">
            <span>Expired</span>
            <strong>{expiredItems}</strong>
          </div>
          <div className="stat-card stat-orange">
            <span>Expiring Soon</span>
            <strong>{expiringSoonItems}</strong>
          </div>
          <div className="stat-card stat-green">
            <span>Total Value</span>
            <strong>₹{formatMoney(totalValue)}</strong>
          </div>
        </section>

        {error && <div className="alert-banner">{error}</div>}

        <section className="panel toolbar-panel">
          <div className="toolbar-grid">
            <div className="search-box">
              <span className="search-icon">⌕</span>
              <input
                type="text"
                placeholder="Search product, batch, grade, or date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Status</option>
              <option value="Fresh">Fresh</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Expiring Soon">Expiring Soon</option>
              <option value="Expired">Expired</option>
            </select>

            <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="All">All Grades</option>
              <option value="A">Grade A</option>
              <option value="B">Grade B</option>
              <option value="C">Grade C</option>
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="expiry-asc">Expiry: Soonest First</option>
              <option value="expiry-desc">Expiry: Latest First</option>
              <option value="qty-asc">Quantity: Low to High</option>
              <option value="qty-desc">Quantity: High to Low</option>
              <option value="recent">Newest First</option>
            </select>

            <button className="ghost-btn" type="button" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </section>

        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <h2>Inventory Table</h2>
              <p>Sorted by expiry date, with batch and quality details.</p>
            </div>
          </div>

          {loading ? (
            <div className="center-state">
              <div className="spinner" />
              <p>Loading inventory...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <h3>No matching items</h3>
              <p>Try adjusting your search or add a new batch.</p>
              <button className="primary-btn" onClick={openAddModal}>
                Add Item
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Harvest</th>
                    <th>Expiry</th>
                    <th>Shelf Life</th>
                    <th>Temp</th>
                    <th>Grade</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map((item) => {
                    const status = statusForItem(item);

                    return (
                      <tr key={item.id} className={rowClassForStatus(status)}>
                        <td>
                          <div className="product-cell">
                            <strong>{item.product_name}</strong>
                            <span>Record #{item.id}</span>
                          </div>
                        </td>
                        <td>{item.batch_no || "-"}</td>
                        <td>{item.quantity}</td>
                        <td>₹{Number(item.price).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,})}</td>
                        <td>{formatDate(item.harvest_date)}</td>
                        <td>{formatDate(item.expiry_date)}</td>
                        <td>{item.shelf_life_days ?? "-"}</td>
                        <td>{item.storage_temp ?? "-"}°C</td>
                        <td>{item.quality_grade || "-"}</td>
                        <td>
                          <span className={`status-pill status-${status.toLowerCase().replace(/\s+/g, "-")}`}>
                            {status}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="action-btn edit"
                              onClick={() => handleEdit(item)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="action-btn delete"
                              onClick={() => handleDelete(item.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isModalOpen && (
          <div
            className="modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div className="modal-card">
              <div className="modal-header">
                <div>
                  <h2>{editingId ? "Edit Batch" : "Add New Batch"}</h2>
                  <p>Fill in the oyster mushroom inventory details.</p>
                </div>
                <button type="button" className="close-btn" onClick={closeModal}>
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="field">
                    <label>Product Name</label>
                    <input
                      name="product_name"
                      value={formData.product_name}
                      onChange={handleChange}
                      placeholder="Oyster Mushroom"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Batch No</label>
                    <input
                      name="batch_no"
                      value={formData.batch_no}
                      onChange={handleChange}
                      placeholder="BATCH-001"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Quantity</label>
                    <input
                      type="number"
                      min="0"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleChange}
                      placeholder="20"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name="price"
                      value={formData.price}
                      onChange={handleChange}
                      placeholder="180"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Harvest Date</label>
                    <input
                      type="date"
                      name="harvest_date"
                      value={formData.harvest_date}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Expiry Date</label>
                    <input
                      type="date"
                      name="expiry_date"
                      value={formData.expiry_date}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Shelf Life (days)</label>
                    <input
                      type="number"
                      min="0"
                      name="shelf_life_days"
                      value={formData.shelf_life_days}
                      onChange={handleChange}
                      placeholder="5"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Storage Temp (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      name="storage_temp"
                      value={formData.storage_temp}
                      onChange={handleChange}
                      placeholder="4"
                      required
                    />
                  </div>

                  <div className="field field-full">
                    <label>Quality Grade</label>
                    <input
                      name="quality_grade"
                      value={formData.quality_grade}
                      onChange={handleChange}
                      placeholder="A / B / C"
                      required
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="secondary-btn" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn">
                    {editingId ? "Update Batch" : "Add Batch"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <footer className="page-footer">
          © 2026 Oyster Mushroom Inventory System
        </footer>
      </div>
    </div>
  );
}

export default App;