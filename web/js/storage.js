const KEY = "detailflow-app-v1";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function referralCode() {
  return `USER${Math.floor(10000 + Math.random() * 90000)}`;
}

function seed() {
  const customerId = uid();
  const vehicleA = uid();
  const vehicleB = uid();
  const now = new Date().toISOString();
  return {
    currentCustomerId: customerId,
    customers: [
      { id: customerId, fullName: "Adrian", referralCode: referralCode(), creditCents: 0 },
    ],
    vehicles: [
      { id: vehicleA, customerId, year: 2022, make: "Honda", model: "Accord", color: "Blue", isPrimary: true, vin: "" },
      { id: vehicleB, customerId, year: 2021, make: "Tesla", model: "Model Y", color: "White", isPrimary: false, vin: "" },
    ],
    addresses: [
      { id: uid(), customerId, line1: "1501 4th Ave, Seattle, WA", label: "Home", isDefault: true },
    ],
    bookings: [],
    messages: [],
    tracking: [],
    createdAt: now,
  };
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const initial = seed();
    localStorage.setItem(KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(raw);
  } catch (_e) {
    const initial = seed();
    localStorage.setItem(KEY, JSON.stringify(initial));
    return initial;
  }
}

export function saveState(nextState) {
  localStorage.setItem(KEY, JSON.stringify(nextState));
}

export function createBooking(payload) {
  const state = loadState();
  const id = uid();
  const booking = {
    id,
    status: "confirmed",
    createdAt: new Date().toISOString(),
    ...payload,
  };
  state.bookings.unshift(booking);
  saveState(state);
  return booking;
}

export function addMessage(bookingId, sender, body) {
  const state = loadState();
  state.messages.push({
    id: uid(),
    bookingId,
    sender,
    body,
    createdAt: new Date().toISOString(),
  });
  saveState(state);
}

export function addVehicle(vehicle) {
  const state = loadState();
  const newVehicle = { id: uid(), ...vehicle };
  state.vehicles.push(newVehicle);
  saveState(state);
  return newVehicle;
}

export function getAppData() {
  return loadState();
}
