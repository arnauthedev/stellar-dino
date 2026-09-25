//! Demo museum with timed-entry slots. A booking can be moved to another
//! free slot on the same day at no cost.
#![no_std]

use notes::Note;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, String, Vec,
};

const DAY: u32 = 17_280;
const TTL_MIN: u32 = 30 * DAY;
const TTL_MAX: u32 = 60 * DAY;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    SlotNotFound = 1,
    SlotFull = 2,
    AlreadyBooked = 3,
    NoBooking = 4,
    InvalidAmount = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub museum: Address,
    pub token: Address,
    pub price: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Slot {
    /// Minutes after midnight.
    pub time: u32,
    pub capacity: u32,
    pub booked: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Booking {
    /// yyyymmdd
    pub date: u32,
    pub time: u32,
    pub price: i128,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Stats {
    pub tickets_sold: u32,
    pub reschedules: u32,
    pub revenue: i128,
}

#[contracttype]
enum Key {
    Config,
    Stats,
    Slots(u32),
    Booking(Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TicketSold {
    #[topic]
    pub user: Address,
    pub date: u32,
    pub time: u32,
    pub price: i128,
    pub note: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rescheduled {
    #[topic]
    pub user: Address,
    pub date: u32,
    pub from_time: u32,
    pub to_time: u32,
    pub note: String,
}

fn config(env: &Env) -> Config {
    env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    env.storage().instance().get(&Key::Config).unwrap()
}

fn stats(env: &Env) -> Stats {
    env.storage().instance().get(&Key::Stats).unwrap_or_default()
}

fn get<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &Key) -> Option<V> {
    let v = env.storage().persistent().get(key);
    if v.is_some() {
        env.storage().persistent().extend_ttl(key, TTL_MIN, TTL_MAX);
    }
    v
}

fn put<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &Key, v: &V) {
    env.storage().persistent().set(key, v);
    env.storage().persistent().extend_ttl(key, TTL_MIN, TTL_MAX);
}

/// Adjust the booked count of a slot; panics if missing or full.
fn change_slot(env: &Env, date: u32, time: u32, delta: i32) {
    let key = Key::Slots(date);
    let mut slots: Vec<Slot> = get(env, &key).unwrap_or_else(|| panic_with_error!(env, Error::SlotNotFound));
    let idx = slots
        .iter()
        .position(|s| s.time == time)
        .unwrap_or_else(|| panic_with_error!(env, Error::SlotNotFound)) as u32;
    let mut slot = slots.get(idx).unwrap();
    if delta > 0 && slot.booked >= slot.capacity {
        panic_with_error!(env, Error::SlotFull);
    }
    slot.booked = (slot.booked as i32 + delta).max(0) as u32;
    slots.set(idx, slot);
    put(env, &key, &slots);
}

#[contract]
pub struct Museum;

#[contractimpl]
impl Museum {
    pub fn __constructor(env: Env, museum: Address, token: Address, price: i128) {
        if price <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        env.storage().instance().set(&Key::Config, &Config { museum, token, price });
    }

    /// Museum opens (or resets) the slots for a date.
    pub fn set_slots(env: Env, date: u32, times: Vec<u32>, capacity: u32) {
        let cfg = config(&env);
        cfg.museum.require_auth();
        let mut slots = Vec::new(&env);
        for time in times.iter() {
            slots.push_back(Slot { time, capacity, booked: 0 });
        }
        put(&env, &Key::Slots(date), &slots);
    }

    /// Slots for a date with how many places are booked.
    pub fn slots(env: Env, date: u32) -> Vec<Slot> {
        config(&env);
        get(&env, &Key::Slots(date)).unwrap_or(Vec::new(&env))
    }

    pub fn buy_ticket(env: Env, user: Address, date: u32, time: u32) -> Booking {
        user.require_auth();
        let cfg = config(&env);
        let key = Key::Booking(user.clone());
        if get::<Booking>(&env, &key).is_some() {
            panic_with_error!(&env, Error::AlreadyBooked);
        }
        change_slot(&env, date, time, 1);
        token::TokenClient::new(&env, &cfg.token).transfer(&user, &cfg.museum, &cfg.price);

        let booking = Booking { date, time, price: cfg.price };
        put(&env, &key, &booking);
        let mut s = stats(&env);
        s.tickets_sold += 1;
        s.revenue += cfg.price;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("Museum entry ");
        note.time(time).text(": ").amount(cfg.price).text(" USDC");
        TicketSold { user, date, time, price: cfg.price, note: note.build(&env) }.publish(&env);
        booking
    }

    /// Move the user's booking to another slot on the same date, free of charge.
    pub fn reschedule(env: Env, user: Address, new_time: u32) -> Booking {
        user.require_auth();
        config(&env);
        let key = Key::Booking(user.clone());
        let mut booking: Booking = get(&env, &key).unwrap_or_else(|| panic_with_error!(&env, Error::NoBooking));
        let from_time = booking.time;
        if from_time == new_time {
            return booking;
        }
        change_slot(&env, booking.date, new_time, 1);
        change_slot(&env, booking.date, from_time, -1);
        booking.time = new_time;
        put(&env, &key, &booking);

        let mut s = stats(&env);
        s.reschedules += 1;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("Museum visit moved from ");
        note.time(from_time).text(" to ").time(new_time).text(" at no cost");
        Rescheduled { user, date: booking.date, from_time, to_time: new_time, note: note.build(&env) }.publish(&env);
        booking
    }

    pub fn booking_of(env: Env, user: Address) -> Option<Booking> {
        config(&env);
        get(&env, &Key::Booking(user))
    }

    pub fn stats(env: Env) -> Stats {
        config(&env);
        stats(&env)
    }

    pub fn config(env: Env) -> Config {
        config(&env)
    }

    /// Demo reset: removes a user's booking (museum only). Call set_slots to reset counts.
    pub fn reset_user(env: Env, user: Address) {
        let cfg = config(&env);
        cfg.museum.require_auth();
        env.storage().persistent().remove(&Key::Booking(user));
    }
}

#[cfg(test)]
mod test;
