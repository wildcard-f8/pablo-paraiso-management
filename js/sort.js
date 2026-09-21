/* sort.js - Reusable table sorting utility.
   Provides sortCompare() for comparing values of different types, and
   manageSortState() for tracking current sort column + direction.
*/

/** Type-aware comparison — returns negative/zero/positive */
export function sortCompare(a, b, type = "string") {
  const av = a === undefined || a === null || a === "" ? (type === "number" ? -Infinity : "") : a;
  const bv = b === undefined || b === null || b === "" ? (type === "number" ? -Infinity : "") : b;

  if (type === "number") {
    return (Number(av) || 0) - (Number(bv) || 0);
  }
  if (type === "date") {
    return new Date(av).getTime() - new Date(bv).getTime();
  }
  // string (default)
  return String(av).localeCompare(String(bv));
}

/** Track sort state for a table. Returns {column, direction} or null. */
export function getSortKey() {
  const s = localStorage.getItem("tableSort");
  return s ? JSON.parse(s) : null;
}

export function setSortKey(key) {
  if (key) localStorage.setItem("tableSort", JSON.stringify(key));
  else localStorage.removeItem("tableSort");
}

/** Apply sorting to a data array based on sort state.
    @param {Array} rows   - data array
    @param {Array} cols   - column defs: [{key, label, type}]
    @param {{column,direction}|null} sortState
    @returns {Array} sorted rows
*/
export function applySort(rows, cols, sortState) {
  if (!sortState || !sortState.column) return rows;
  const col = cols.find((c) => c.key === sortState.column);
  if (!col) return rows;
  const dir = sortState.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => dir * sortCompare(a[col.key], b[col.key], col.type || "string"));
}

/** Toggle sort direction for a column. Returns new sortState. */
export function toggleSort(current, column) {
  if (current && current.column === column) {
    return {
      column,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { column, direction: "asc" };
}

/** Build a sortable <th> element. */
export function sortableHeader(label, sortState, column) {
  const active = sortState && sortState.column === column;
  const dir = active ? sortState.direction : null;
  const indicator = !active ? " ⇅" : dir === "asc" ? " ↑" : " ↓";
  const th = document.createElement("th");
  th.textContent = label + indicator;
  th.className = "sortable" + (active ? " active" : "");
  th.style.cursor = "pointer";
  th.dataset.sortCol = column;
  return th;
}
