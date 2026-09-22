/* calendar.js - FullCalendar v6 view populated from getCalendarEvents.
   Supports adding/editing/deleting calendar events, and clicking an event
   navigates to the bookings page for that booking.
*/
import { api } from "./auth.js?v=22";
import { utils } from "./utils.js?v=22";

let calendarRef = null;
let calendarEl = null;
let bookings = [];
let appRef = null;
let customers = {};

export function createCalendar(_args, ref) {
  appRef = ref;
  const section = document.createElement("section");
  section.className = "calendar-page";
  section.innerHTML = `
    <div class="toolbar">
      <button class="btn btn--primary btn--sm" onclick="appAddCalendarEvent()">＋ Add Event</button>
    </div>
    <div class="card calendar-card">
      <div id="calendarContainer">
        <div id="calendarEl"></div>
      </div>
    </div>
  `;
  calendarEl = section.querySelector("#calendarEl");

  initCalendar();

  const unmount = function unmount() {
    if (calendarRef) calendarRef.destroy();
    calendarRef = null;
  };
  section._unmount = unmount;
  return section;
}

async function initCalendar() {
  if (!calendarEl || calendarRef) return;
  try {
    // Preload bookings + customers so event titles can resolve the guest name.
    const [bk, cust] = await Promise.all([api.get("getBookings"), api.get("getCustomers")]);
    bookings = bk || [];
    customers = Object.fromEntries((cust || []).map((c) => [c.id, c]));

    const events = await loadEvents();

    calendarRef = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      },
      navLinks: true,
      editable: true,
      selectable: true,
      now: new Date().toISOString(),
      events,
      eventDidMount: (info) => {
        info.el.title = info.event.title;
        info.el.style.cursor = "pointer";
      },
      eventClick: (info) => {
        const bookingId = info.event.extendedProps?.bookingId;
        if (bookingId) {
          window.location.hash = "#/bookings";
          setTimeout(() => appRef.showToast(`Event: ${info.event.title} (booking ${bookingId})`, "info"), 200);
        } else {
          appRef.showToast(info.event.title, "info");
        }
      },
      select: (info) => {
        appAddCalendarEvent(info.startStr, info.endStr);
      },
      eventDrop: async (info) => {
        await saveEventChange(info.event, info.oldEvent);
      },
      eventResize: async (info) => {
        await saveEventChange(info.event, info.oldEvent);
      },
    });
    calendarRef.render();
  } catch (err) {
    calendarEl.innerHTML = `<div class="empty-state"><p>${utils.escapeHTML(err.message)}</p></div>`;
    appRef.showToast(`Calendar failed: ${err.message}`, "error");
  }
}

async function loadEvents() {
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, 0, 1).toISOString();
  const end = new Date(now.getFullYear() + 1, 11, 31).toISOString();
  const raw = await api.get("getCalendarEvents", { start, end });
  return (raw || []).map(enrichEvent);
}

/** Build a human-friendly title and resolve the linked booking/customer. */
function enrichEvent(evt) {
  let title = evt.title;
  if (!title && evt.bookingId) {
    const b = bookings.find((bk) => bk.id === evt.bookingId);
    if (b) {
      const custName = customers[b.customerId]?.name || b.customerId || "guest";
      title = `Booking: ${custName} — ${b.property || ""}`;
    } else {
      title = `Booking ${evt.bookingId}`;
    }
  }
  return {
    id: evt.id,
    title: title || "Untitled",
    start: evt.start,
    end: evt.end,
    allDay: !!evt.allDay,
    color: evt.color || "#3b82f6",
    extendedProps: { bookingId: evt.bookingId || null },
  };
}

async function saveEventChange(event, _old) {
  try {
    await api.post("updateCalendarEvent", {
      id: event.id,
      title: event.title,
      start: event.startStr,
      end: event.endStr,
      allDay: event.allDay,
      color: event.color,
    });
    appRef.showToast("Event updated", "info", 1500);
    refreshCalendar();
  } catch (err) {
    appRef.showToast(`Update failed: ${err.message}`, "error");
  }
}

export function refreshCalendar() {
  if (calendarRef) calendarRef.refetchEvents();
}

/* ── Event CRUD via modal ── */
window.appAddCalendarEvent = function (start, end) {
  appRef.openModal({
    title: "Add Calendar Event",
    submitLabel: "Add",
    fields: [
      { name: "title", label: "Title", type: "text", default: start ? "" : "", required: true },
      { name: "start", label: "Start", type: "datetime-local", default: start || "", required: true },
      { name: "end", label: "End", type: "datetime-local", default: end || "", required: true },
      { name: "allDay", label: "All day", type: "checkbox", default: false },
      { name: "color", label: "Color", type: "color", default: "#3b82f6" },
      { name: "bookingId", label: "Booking ID (optional)", type: "text", default: "" },
    ],
    onSubmit: async (form) => {
      try {
        await api.post("addCalendarEvent", {
          title: form.title,
          start: form.start,
          end: form.end,
          allDay: form.allDay === true,
          color: form.color,
          bookingId: form.bookingId || null,
        });
        appRef.closeModal();
        appRef.showToast("Event added", "info", 1500);
        refreshCalendar();
      } catch (err) {
        appRef.showToast(`Save failed: ${err.message}`, "error");
      }
    },
  });
};
