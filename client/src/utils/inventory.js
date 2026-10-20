export const DAY_MS = 24 * 60 * 60 * 1000;

export const parseDateOnly = (value) => {
  if (!value) return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

export const formatDate = (dateString) => {
  const date = parseDateOnly(dateString);
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const minQuantityFor = (item) => {
  if (item.min_quantity === undefined || item.min_quantity === null) return 5;
  return Number(item.min_quantity);
};

export const statusForItem = (item, today = startOfToday()) => {
  const quantity = Number(item.quantity) || 0;
  const expiry = parseDateOnly(item.expiry_date);

  if (expiry) {
    if (expiry < today) return "Expired";

    const diffDays = Math.ceil((expiry - today) / DAY_MS);
    if (diffDays >= 0 && diffDays <= 3) return "Expiring Soon";
  }

  if (quantity < minQuantityFor(item)) return "Low Stock";
  return "Fresh";
};

export const statusClass = (status) =>
  status.toLowerCase().replace(/\s+/g, "-");

export const rowClassForStatus = (status) => `row-${statusClass(status)}`;
