import { APP_CONFIG } from "./config.js";
import { createDataAdapter } from "./data.js";

const detailers = [
  { id: "d1", name: "David", rating: 4.9 },
  { id: "d2", name: "Marcus", rating: 4.8 },
  { id: "auto", name: "Auto-assign", rating: null },
];
const tiers = [
  { id: "basic", name: "Basic Wash", price: 59, minutes: 60 },
  { id: "interior", name: "Interior Detail", price: 99, minutes: 90 },
  { id: "full", name: "Full Detail", price: 149, minutes: 150 },
];
const addons = [
  { id: "paint", name: "Paint decontamination", price: 35 },
  { id: "lights", name: "Headlight restore", price: 45 },
];
const sampleAddressHints = [
  "1501 4th Ave, Seattle, WA",
  "600 Pine St, Seattle, WA",
  "500 Terry Ave N, Seattle, WA",
];

const appState = {
  selectedTab: "book",
  selectedSlot: "9:00 AM",
  selectedDate: "Sat, Mar 28",
  dirtUpcharge: 0,
  dirtyLevel: "standard",
  activeBookingId: null,
  adapter: null,
  data: null,
};

const tabs = [...document.querySelectorAll(".tabs button")];
const screens = {
  book: document.getElementById("screen-book"),
  jobs: document.getElementById("screen-jobs"),
  garage: document.getElementById("screen-garage"),
  referral: document.getElementById("screen-referral"),
  admin: document.getElementById("screen-admin"),
};

function money(v) {
  return `$${Number(v).toFixed(0)}`;
}

function modeLabel() {
  if (!appState.adapter) return "Loading...";
  return appState.adapter.mode === "supabase" ? "Supabase mode" : "Local mode";
}

function switchTab(name) {
  appState.selectedTab = name;
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.screen === name));
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

function getLatestBooking(data) {
  return data.bookings[0] || null;
}

function renderBook() {
  const data = appState.data;
  const customerId = data.currentCustomerId;
  const vehicles = data.vehicles.filter((v) => v.customerId === customerId);
  const primaryAddress = data.addresses.find((a) => a.customerId === customerId && a.isDefault) || data.addresses[0];

  const defaultVehicle = vehicles.find((v) => v.isPrimary) || vehicles[0];
  const tierOptions = tiers.map((t) => `<option value="${t.id}">${t.name} - ${money(t.price)}</option>`).join("");
  const vehicleOptions = vehicles.map((v) =>
    `<option value="${v.id}">${v.year} ${v.make} ${v.model}${v.isPrimary ? " (Primary)" : ""}</option>`
  ).join("");
  const detailerOptions = detailers.map((d) =>
    `<option value="${d.id}">${d.name}${d.rating ? ` - ${d.rating} stars` : ""}</option>`
  ).join("");

  screens.book.innerHTML = `
    <div class="grid">
      <div class="card stack">
        <h2>1) Car + Address</h2>
        <select id="vehicleSelect">${vehicleOptions}</select>
        <div class="row">
          <input id="addressInput" value="${primaryAddress?.line1 || ""}" placeholder="Type address" />
          <button class="secondary" id="locateBtn">Locate me</button>
        </div>
        <div class="small muted">Quick hints: ${sampleAddressHints.join(" | ")}</div>
      </div>
      <div class="card stack">
        <h2>2) Service + Condition</h2>
        <select id="tierSelect">${tierOptions}</select>
        <div class="row">
          <button class="ghost" id="assessBtn">AI dirt check</button>
          <span id="dirtyBadge" class="status ok">Standard (+$0)</span>
        </div>
      </div>
    </div>
    <div class="grid" style="margin-top: 16px;">
      <div class="card stack">
        <h2>3) Detailer</h2>
        <select id="detailerSelect">${detailerOptions}</select>
        <div class="muted">If no pick, system auto-assigns after 2 minutes.</div>
      </div>
      <div class="card stack">
        <h2>4) Date + Time</h2>
        <select id="dateSelect">
          <option>Sat, Mar 28</option>
          <option>Sun, Mar 29</option>
          <option>Mon, Mar 30</option>
        </select>
        <div class="slots" id="slotWrap">
          ${["9:00 AM", "11:00 AM", "2:30 PM"].map((s) => `<button class="slot ${s === appState.selectedSlot ? "active" : ""}" data-slot="${s}">${s}</button>`).join("")}
        </div>
      </div>
    </div>
    <div class="card stack" style="margin-top: 16px;">
      <h2>5) Review + Add-ons + Pay</h2>
      <div class="kpi">
        <div><div class="small muted">Vehicle</div><div id="reviewVehicle">${defaultVehicle.year} ${defaultVehicle.make} ${defaultVehicle.model}</div></div>
        <div><div class="small muted">Address</div><div id="reviewAddress">${primaryAddress?.line1 || "Add address"}</div></div>
        <div><div class="small muted">Duration</div><div id="reviewDuration">~150m</div></div>
      </div>
      <div class="divider"></div>
      <div class="row">
        ${addons.map((a) => `<label><input class="addonCheck" type="checkbox" value="${a.id}" /> ${a.name} (+${money(a.price)})</label>`).join("")}
      </div>
      <div class="divider"></div>
      <div class="row" style="justify-content:space-between;">
        <div><div class="small muted">Total</div><div id="totalText" style="font-weight:700;font-size:1.2rem;">$149</div></div>
        <button class="primary" id="confirmBookingBtn">Confirm booking</button>
      </div>
      <div id="bookStatus" class="small muted"></div>
    </div>
    <div class="card stack" style="margin-top: 16px;">
      <h2>Add vehicle to garage</h2>
      <div class="row">
        <input id="newYear" placeholder="Year" />
        <input id="newMake" placeholder="Make" />
        <input id="newModel" placeholder="Model" />
        <button class="secondary" id="addVehicleBtn">Add car</button>
      </div>
    </div>
  `;

  const tierSelect = document.getElementById("tierSelect");
  const addressInput = document.getElementById("addressInput");
  const vehicleSelect = document.getElementById("vehicleSelect");
  const totalText = document.getElementById("totalText");
  const reviewAddress = document.getElementById("reviewAddress");
  const reviewVehicle = document.getElementById("reviewVehicle");
  const reviewDuration = document.getElementById("reviewDuration");
  const bookStatus = document.getElementById("bookStatus");

  function selectedTier() {
    return tiers.find((t) => t.id === tierSelect.value) || tiers[2];
  }

  function selectedVehicle() {
    return vehicles.find((v) => v.id === vehicleSelect.value) || defaultVehicle;
  }

  function addonTotal() {
    const checks = [...document.querySelectorAll(".addonCheck:checked")];
    return checks.reduce((sum, c) => {
      const a = addons.find((x) => x.id === c.value);
      return sum + (a ? a.price : 0);
    }, 0);
  }

  function calcTotal() {
    const t = selectedTier();
    const total = t.price + appState.dirtUpcharge + addonTotal();
    totalText.textContent = money(total);
    reviewDuration.textContent = `~${t.minutes}m`;
    return total;
  }

  calcTotal();

  tierSelect.addEventListener("change", calcTotal);
  addressInput.addEventListener("input", () => { reviewAddress.textContent = addressInput.value; });
  vehicleSelect.addEventListener("change", () => {
    const v = selectedVehicle();
    reviewVehicle.textContent = `${v.year} ${v.make} ${v.model}`;
  });
  document.querySelectorAll(".addonCheck").forEach((c) => c.addEventListener("change", calcTotal));

  document.getElementById("slotWrap").addEventListener("click", (e) => {
    if (!e.target.classList.contains("slot")) return;
    appState.selectedSlot = e.target.dataset.slot;
    renderBook();
  });
  document.getElementById("dateSelect").addEventListener("change", (e) => {
    appState.selectedDate = e.target.value;
  });

  document.getElementById("assessBtn").addEventListener("click", () => {
    const options = [
      { level: "standard", upcharge: 0, label: "Standard (+$0)", cls: "ok" },
      { level: "moderate", upcharge: 25, label: "Moderate (+$25)", cls: "warn" },
      { level: "heavy", upcharge: 60, label: "Heavy (+$60)", cls: "warn" },
    ];
    const pick = options[Math.floor(Math.random() * options.length)];
    appState.dirtyLevel = pick.level;
    appState.dirtUpcharge = pick.upcharge;
    const badge = document.getElementById("dirtyBadge");
    badge.textContent = pick.label;
    badge.className = `status ${pick.cls}`;
    calcTotal();
  });

  document.getElementById("locateBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      bookStatus.textContent = "Browser does not support geolocation.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        addressInput.value = "Current location selected";
        reviewAddress.textContent = addressInput.value;
      },
      () => {
        bookStatus.textContent = "Location denied. Please type your address.";
      }
    );
  });

  document.getElementById("addVehicleBtn").addEventListener("click", () => {
    const year = Number(document.getElementById("newYear").value);
    const make = document.getElementById("newMake").value.trim();
    const model = document.getElementById("newModel").value.trim();
    if (!year || !make || !model) {
      bookStatus.textContent = "Enter year, make, and model to add a car.";
      return;
    }
    appState.adapter.addVehicle({
      customerId,
      year,
      make,
      model,
      color: "",
      isPrimary: false,
      vin: "",
    }).then(async () => {
      bookStatus.textContent = `Added ${year} ${make} ${model} to garage.`;
      await renderAll();
    }).catch((error) => {
      console.error(error);
      bookStatus.textContent = `Failed to add vehicle: ${error.message}`;
    });
  });

  document.getElementById("confirmBookingBtn").addEventListener("click", () => {
    const tier = selectedTier();
    const vehicle = selectedVehicle();
    const detailerId = document.getElementById("detailerSelect").value;
    const detailer = detailers.find((d) => d.id === detailerId) || detailers[2];
    const selectedAddonIds = [...document.querySelectorAll(".addonCheck:checked")].map((x) => x.value);
    const total = calcTotal();
    appState.adapter.createBooking({
      customerId,
      detailerId: detailer.id,
      detailerName: detailer.name,
      vehicleId: vehicle.id,
      vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      address: addressInput.value,
      tierId: tier.id,
      tierName: tier.name,
      durationMinutes: tier.minutes,
      dirtLevel: appState.dirtyLevel,
      dirtUpcharge: appState.dirtUpcharge,
      addonIds: selectedAddonIds,
      dateLabel: appState.selectedDate,
      timeLabel: appState.selectedSlot,
      total,
      startedAt: new Date().toISOString(),
    }).then(async (booking) => {
      appState.activeBookingId = booking.id;
      bookStatus.textContent = `Booking confirmed with ${detailer.name} at ${appState.selectedDate} ${appState.selectedSlot}.`;
      await renderAll();
      switchTab("jobs");
    }).catch((error) => {
      console.error(error);
      bookStatus.textContent = `Booking failed: ${error.message}`;
    });
  });
}

function renderJobs() {
  const data = appState.data;
  const booking = appState.activeBookingId
    ? data.bookings.find((b) => b.id === appState.activeBookingId)
    : getLatestBooking(data);

  if (!booking) {
    screens.jobs.innerHTML = `<div class="card"><h2>No active jobs</h2><div class="muted">Create a booking first.</div></div>`;
    return;
  }

  const elapsed = Math.max(0, Math.round((Date.now() - new Date(booking.startedAt).getTime()) / 60000));
  const pct = Math.min(100, Math.round((elapsed / booking.durationMinutes) * 100));
  const remaining = Math.max(0, booking.durationMinutes - elapsed);
  const chat = data.messages.filter((m) => m.bookingId === booking.id);

  screens.jobs.innerHTML = `
    <div class="grid">
      <div class="card stack">
        <h2>Live job tracker</h2>
        <div class="muted">Detailer: <strong>${booking.detailerName}</strong> | ${booking.dateLabel} ${booking.timeLabel}</div>
        <div class="muted">Vehicle: ${booking.vehicleLabel}</div>
        <div class="muted">Address: ${booking.address}</div>
        <div class="bar"><span style="width: ${pct}%;"></span></div>
        <div class="small muted">Elapsed ${elapsed}m / ${booking.durationMinutes}m. ~${remaining}m remaining.</div>
      </div>
      <div class="card stack">
        <h2>In-app chat</h2>
        <div id="chatBox" class="chat">
          ${chat.map((m) => `<div class="msg ${m.sender === "customer" ? "me" : ""}">${m.sender}: ${m.body}</div>`).join("")}
        </div>
        <div class="row">
          <input id="chatInput" placeholder="Type message..." />
          <button class="primary" id="sendMsgBtn">Send</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("sendMsgBtn").addEventListener("click", () => {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;
    appState.adapter.addMessage(booking.id, "customer", text)
      .then(() => renderAll())
      .catch((err) => console.error(err));
  });
}

function renderGarage() {
  const data = appState.data;
  const vehicles = data.vehicles.filter((v) => v.customerId === data.currentCustomerId);
  const bookings = data.bookings;
  screens.garage.innerHTML = `
    <div class="card">
      <h2>Garage</h2>
      <div class="list">
        ${vehicles.map((v) => {
          const last = bookings.find((b) => b.vehicleId === v.id);
          const label = `${v.year} ${v.make} ${v.model}`;
          return `
            <div class="vehicle">
              <div class="row" style="justify-content:space-between;">
                <strong>${label}</strong>
                ${v.isPrimary ? `<span class="status ok">Primary</span>` : ""}
              </div>
              <div class="small muted">Last detail: ${last ? new Date(last.createdAt).toLocaleDateString() : "No services yet"}</div>
              <button class="secondary book-again-btn" data-vehicle-id="${v.id}">Book again</button>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
  document.querySelectorAll(".book-again-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.selectedTab = "book";
      switchTab("book");
    });
  });
}

function renderReferral() {
  const data = appState.data;
  const customer = data.customers.find((c) => c.id === data.currentCustomerId);
  screens.referral.innerHTML = `
    <div class="card stack">
      <h2>Referral</h2>
      <div class="muted">Your code</div>
      <div style="font-weight:700;font-size:1.25rem;">${customer.referralCode}</div>
      <div class="muted">Give $20, get $20 after your friend's first completed detail.</div>
    </div>
  `;
}

function renderAdmin() {
  const data = appState.data;
  screens.admin.innerHTML = `
    <div class="card stack">
      <h2>Data snapshot</h2>
      <div class="small muted">Use this to verify your app data while building backend integrations.</div>
      <textarea rows="18">${JSON.stringify(data, null, 2)}</textarea>
    </div>
  `;
}

async function renderAll() {
  if (!appState.adapter) return;
  appState.data = await appState.adapter.getAppData();
  document.getElementById("dataModePill").textContent = modeLabel();
  renderBook();
  renderJobs();
  renderGarage();
  renderReferral();
  renderAdmin();
}

tabs.forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.screen)));

async function bootstrap() {
  appState.adapter = await createDataAdapter();
  await renderAll();
}

bootstrap();

setInterval(async () => {
  if (appState.selectedTab === "jobs") await renderAll();
}, 20000);
