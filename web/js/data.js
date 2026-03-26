import { APP_CONFIG } from "./config.js";
import {
  addMessage as addMessageLocal,
  addVehicle as addVehicleLocal,
  createBooking as createBookingLocal,
  getAppData as getAppDataLocal,
} from "./storage.js";

function toIsoOrNow() {
  return new Date().toISOString();
}

class LocalAdapter {
  mode = "local";
  async init() {}
  async getAppData() { return getAppDataLocal(); }
  async createBooking(payload) { return createBookingLocal(payload); }
  async addMessage(bookingId, sender, body) { return addMessageLocal(bookingId, sender, body); }
  async addVehicle(vehicle) { return addVehicleLocal(vehicle); }
}

class SupabaseAdapter {
  mode = "supabase";
  client = null;
  user = null;
  profile = null;
  tiersBySlug = new Map();
  tiersById = new Map();

  async init() {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    this.client = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);

    const {
      data: { session },
    } = await this.client.auth.getSession();

    if (session?.user) {
      this.user = session.user;
    } else {
      const anonRes = await this.client.auth.signInAnonymously();
      if (anonRes.error || !anonRes.data?.user) {
        throw new Error(`Supabase auth failed: ${anonRes.error?.message || "unknown"}`);
      }
      this.user = anonRes.data.user;
    }

    await this.ensureProfile();
    await this.loadTiers();
  }

  async ensureProfile() {
    const uid = this.user.id;
    const { data: existing, error: selectErr } = await this.client
      .from("marketplace_profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (selectErr) throw selectErr;
    if (existing) {
      this.profile = existing;
      return;
    }

    const fallbackCode = `USER${Math.floor(10000 + Math.random() * 90000)}`;
    const { data, error } = await this.client
      .from("marketplace_profiles")
      .insert({
        id: uid,
        role: "customer",
        full_name: "Customer",
        referral_code: fallbackCode,
      })
      .select("*")
      .single();
    if (error) throw error;
    this.profile = data;
  }

  async loadTiers() {
    const { data, error } = await this.client
      .from("service_tiers")
      .select("id, slug, display_name, base_duration_minutes")
      .eq("active", true);
    if (error) throw error;
    this.tiersBySlug.clear();
    this.tiersById.clear();
    for (const t of data || []) {
      this.tiersBySlug.set(t.slug, t);
      this.tiersById.set(t.id, t);
    }
  }

  async getOrCreateDefaultAddress(line1 = "Set address in booking flow") {
    const uid = this.user.id;
    const { data: existing, error: readErr } = await this.client
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", uid)
      .eq("is_default", true)
      .maybeSingle();
    if (readErr) throw readErr;
    if (existing) return existing;

    const { data, error } = await this.client
      .from("customer_addresses")
      .insert({
        customer_id: uid,
        line1,
        label: "Home",
        is_default: true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async getAppData() {
    const uid = this.user.id;
    const [{ data: profile }, { data: vehicles }, { data: addresses }, { data: bookings }] = await Promise.all([
      this.client.from("marketplace_profiles").select("*").eq("id", uid).single(),
      this.client.from("vehicles").select("*").eq("customer_id", uid).order("created_at", { ascending: false }),
      this.client.from("customer_addresses").select("*").eq("customer_id", uid).order("created_at", { ascending: false }),
      this.client.from("bookings").select("*").eq("customer_id", uid).order("created_at", { ascending: false }),
    ]);

    const bookingIds = (bookings || []).map((b) => b.id);
    const vehicleMap = new Map((vehicles || []).map((v) => [v.id, v]));
    const addressMap = new Map((addresses || []).map((a) => [a.id, a]));

    let messages = [];
    if (bookingIds.length > 0) {
      const { data: m } = await this.client
        .from("booking_messages")
        .select("*")
        .in("booking_id", bookingIds)
        .order("created_at", { ascending: true });
      messages = m || [];
    }

    const transformedBookings = (bookings || []).map((b) => {
      const v = vehicleMap.get(b.vehicle_id);
      const a = addressMap.get(b.address_id);
      const tier = this.tiersById.get(b.tier_id);
      return {
        id: b.id,
        customerId: b.customer_id,
        detailerId: b.detailer_id,
        detailerName: b.detailer_label || "Auto-assigned detailer",
        vehicleId: b.vehicle_id,
        vehicleLabel: v ? `${v.year} ${v.make} ${v.model}` : "Vehicle",
        address: a?.line1 || "Address",
        tierId: tier?.slug || "full",
        tierName: tier?.display_name || "Full Detail",
        durationMinutes: tier?.base_duration_minutes || 150,
        dirtLevel: b.dirt_level || "standard",
        dirtUpcharge: (b.dirt_upcharge_cents || 0) / 100,
        addonIds: [],
        dateLabel: b.scheduled_for ? new Date(b.scheduled_for).toLocaleDateString() : "Scheduled",
        timeLabel: b.scheduled_for ? new Date(b.scheduled_for).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
        total: (b.total_cents || 0) / 100,
        startedAt: b.started_at || b.created_at || toIsoOrNow(),
        createdAt: b.created_at || toIsoOrNow(),
      };
    });

    return {
      currentCustomerId: uid,
      customers: [{
        id: uid,
        fullName: profile?.full_name || "Customer",
        referralCode: profile?.referral_code || "",
        creditCents: profile?.referral_credit_cents || 0,
      }],
      vehicles: (vehicles || []).map((v) => ({
        id: v.id,
        customerId: v.customer_id,
        year: v.year,
        make: v.make,
        model: v.model,
        color: v.color,
        isPrimary: v.is_primary,
        vin: v.vin,
      })),
      addresses: (addresses || []).map((a) => ({
        id: a.id,
        customerId: a.customer_id,
        line1: a.line1,
        label: a.label,
        isDefault: a.is_default,
      })),
      bookings: transformedBookings,
      messages: (messages || []).map((m) => ({
        id: m.id,
        bookingId: m.booking_id,
        sender: m.sender_id === uid ? "customer" : "detailer",
        body: m.body,
        createdAt: m.created_at,
      })),
      tracking: [],
      createdAt: toIsoOrNow(),
    };
  }

  async createBooking(payload) {
    const uid = this.user.id;
    const address = await this.getOrCreateDefaultAddress(payload.address || "Address required");
    if (payload.address && address.line1 !== payload.address) {
      await this.client.from("customer_addresses").update({ line1: payload.address }).eq("id", address.id);
    }

    const tier = this.tiersBySlug.get(payload.tierId) || [...this.tiersBySlug.values()][0];
    if (!tier) throw new Error("No service tiers found. Run SQL seed in 03_marketplace_mvp.sql.");

    const totalCents = Math.round(Number(payload.total || 0) * 100);
    const dirtUpchargeCents = Math.round(Number(payload.dirtUpcharge || 0) * 100);
    const tierPriceCents = Math.max(0, totalCents - dirtUpchargeCents);

    const scheduledFor = new Date().toISOString();
    const { data, error } = await this.client
      .from("bookings")
      .insert({
        customer_id: uid,
        detailer_id: null,
        detailer_label: payload.detailerName || "Auto-assigned detailer",
        vehicle_id: payload.vehicleId,
        address_id: address.id,
        tier_id: tier.id,
        status: "confirmed",
        dirt_level: payload.dirtLevel || "standard",
        dirt_upcharge_cents: dirtUpchargeCents,
        tier_price_cents: tierPriceCents,
        addons_total_cents: 0,
        total_cents: totalCents,
        started_at: toIsoOrNow(),
        scheduled_for: scheduledFor,
      })
      .select("*")
      .single();
    if (error) throw error;

    return {
      id: data.id,
      customerId: uid,
      detailerId: data.detailer_id,
      detailerName: data.detailer_label || payload.detailerName || "Auto-assigned detailer",
      vehicleId: payload.vehicleId,
      vehicleLabel: payload.vehicleLabel,
      address: payload.address,
      tierId: payload.tierId,
      tierName: payload.tierName,
      durationMinutes: payload.durationMinutes,
      dirtLevel: payload.dirtLevel,
      dirtUpcharge: payload.dirtUpcharge,
      addonIds: payload.addonIds || [],
      dateLabel: payload.dateLabel,
      timeLabel: payload.timeLabel,
      total: payload.total,
      startedAt: data.started_at || toIsoOrNow(),
      createdAt: data.created_at || toIsoOrNow(),
    };
  }

  async addMessage(bookingId, sender, body) {
    const senderId = this.user.id;
    const { error } = await this.client.from("booking_messages").insert({
      booking_id: bookingId,
      sender_id: senderId,
      body,
    });
    if (error) throw error;
  }

  async addVehicle(vehicle) {
    const uid = this.user.id;
    const { data, error } = await this.client
      .from("vehicles")
      .insert({
        customer_id: uid,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color || null,
        vin: vehicle.vin || null,
        is_primary: false,
      })
      .select("*")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      customerId: data.customer_id,
      year: data.year,
      make: data.make,
      model: data.model,
      color: data.color,
      isPrimary: data.is_primary,
      vin: data.vin,
    };
  }
}

export async function createDataAdapter() {
  if (!APP_CONFIG.enableSupabase || !APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
    const local = new LocalAdapter();
    await local.init();
    return local;
  }

  try {
    const supabase = new SupabaseAdapter();
    await supabase.init();
    return supabase;
  } catch (error) {
    console.error("Supabase init failed; falling back to local mode.", error);
    const local = new LocalAdapter();
    await local.init();
    return local;
  }
}
