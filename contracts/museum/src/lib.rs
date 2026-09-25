//! Demo museums with timed-entry slots. Every museum opens every date with a
//! default schedule (10:00-18:00 every 30 min, 20 places per slot); booked
//! counts are stored only once someone books. A booking can be moved to
//! another free slot on the same day at no cost.
#![no_std]

use notes::Note;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, Map, String, Symbol, Vec,
};

const DAY: u32 = 17_280;
const TTL_MIN: u32 = 30 * DAY;
const TTL_MAX: u32 = 60 * DAY;

/// Default schedule: first slot, last slot, step (minutes after midnight), capacity.
const OPEN: u32 = 10 * 60;
const LAST: u32 = 18 * 60;
const STEP: u32 = 30;
const CAPACITY: u32 = 20;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    SlotNotFound = 1,
    SlotFull = 2,
    AlreadyBooked = 3,
    NoBooking = 4,
    InvalidAmount = 5,
    MuseumNotFound = 6,
    InvalidDate = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub museum: Address,
    pub token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Museum {
    pub id: Symbol,
    pub name: String,
    pub style: String,
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
    pub museum_id: Symbol,
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
    Museums,
    Stats,
    /// Booked count per slot time for a museum and date.
    Counts(Symbol, u32),
    Bookings(Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TicketSold {
    #[topic]
    pub user: Address,
    #[topic]
    pub museum_id: Symbol,
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
    #[topic]
    pub museum_id: Symbol,
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

fn museums(env: &Env) -> Vec<Museum> {
    env.storage().instance().get(&Key::Museums).unwrap_or(Vec::new(env))
}

fn museum(env: &Env, id: &Symbol) -> Museum {
    museums(env)
        .iter()
        .find(|m| m.id == *id)
        .unwrap_or_else(|| panic_with_error!(env, Error::MuseumNotFound))
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

fn check_date(env: &Env, date: u32) {
    let (m, d) = ((date / 100) % 100, date % 100);
    if date < 2000_01_01 || date > 2999_12_31 || m == 0 || m > 12 || d == 0 || d > 31 {
        panic_with_error!(env, Error::InvalidDate);
    }
}

fn is_slot(time: u32) -> bool {
    (OPEN..=LAST).contains(&time) && (time - OPEN) % STEP == 0
}

fn counts(env: &Env, id: &Symbol, date: u32) -> Map<u32, u32> {
    get(env, &Key::Counts(id.clone(), date)).unwrap_or(Map::new(env))
}

/// Adjust the booked count of a slot; panics if it does not exist or is full.
fn change_slot(env: &Env, id: &Symbol, date: u32, time: u32, delta: i32) {
    if !is_slot(time) {
        panic_with_error!(env, Error::SlotNotFound);
    }
    let mut c = counts(env, id, date);
    let booked = c.get(time).unwrap_or(0);
    if delta > 0 && booked >= CAPACITY {
        panic_with_error!(env, Error::SlotFull);
    }
    let next = (booked as i32 + delta).max(0) as u32;
    if next == 0 {
        c.remove(time);
    } else {
        c.set(time, next);
    }
    let key = Key::Counts(id.clone(), date);
    if c.is_empty() {
        env.storage().persistent().remove(&key);
    } else {
        put(env, &key, &c);
    }
}

fn bookings(env: &Env, user: &Address) -> Vec<Booking> {
    get(env, &Key::Bookings(user.clone())).unwrap_or(Vec::new(env))
}

/// "26/09" from yyyymmdd.
fn date_text(note: &mut Note, date: u32) {
    let (m, d) = ((date / 100) % 100, date % 100);
    if d < 10 {
        note.text("0");
    }
    note.uint(d as u128).text("/");
    if m < 10 {
        note.text("0");
    }
    note.uint(m as u128);
}

#[contract]
pub struct MuseumContract;

#[contractimpl]
impl MuseumContract {
    pub fn __constructor(env: Env, museum: Address, token: Address) {
        env.storage().instance().set(&Key::Config, &Config { museum, token });
        env.storage().instance().set(&Key::Museums, &Vec::<Museum>::new(&env));
    }

    /// Museum organisation replaces the list of museums.
    pub fn set_museums(env: Env, museums: Vec<Museum>) {
        let cfg = config(&env);
        cfg.museum.require_auth();
        for m in museums.iter() {
            if m.price <= 0 {
                panic_with_error!(&env, Error::InvalidAmount);
            }
        }
        env.storage().instance().set(&Key::Museums, &museums);
    }

    pub fn museums(env: Env) -> Vec<Museum> {
        config(&env);
        museums(&env)
    }

    /// Slots of a museum on a date with how many places are booked.
    pub fn slots(env: Env, museum_id: Symbol, date: u32) -> Vec<Slot> {
        config(&env);
        museum(&env, &museum_id);
        check_date(&env, date);
        let c = counts(&env, &museum_id, date);
        let mut out = Vec::new(&env);
        let mut time = OPEN;
        while time <= LAST {
            out.push_back(Slot { time, capacity: CAPACITY, booked: c.get(time).unwrap_or(0) });
            time += STEP;
        }
        out
    }

    /// One booking per user, museum and date.
    pub fn buy_ticket(env: Env, user: Address, museum_id: Symbol, date: u32, time: u32) -> Booking {
        user.require_auth();
        let cfg = config(&env);
        let m = museum(&env, &museum_id);
        check_date(&env, date);
        let mut list = bookings(&env, &user);
        if list.iter().any(|b| b.museum_id == museum_id && b.date == date) {
            panic_with_error!(&env, Error::AlreadyBooked);
        }
        change_slot(&env, &museum_id, date, time, 1);
        token::TokenClient::new(&env, &cfg.token).transfer(&user, &cfg.museum, &m.price);

        let booking = Booking { museum_id: museum_id.clone(), date, time, price: m.price };
        list.push_back(booking.clone());
        put(&env, &Key::Bookings(user.clone()), &list);
        let mut s = stats(&env);
        s.tickets_sold += 1;
        s.revenue += m.price;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("");
        note.string(&m.name).text(" ");
        date_text(&mut note, date);
        note.text(" ").time(time).text(": ").amount(m.price).text(" USDC");
        TicketSold { user, museum_id, date, time, price: m.price, note: note.build(&env) }.publish(&env);
        booking
    }

    /// Move the user's booking for a museum and date to another slot, free of charge.
    pub fn reschedule(env: Env, user: Address, museum_id: Symbol, date: u32, new_time: u32) -> Booking {
        user.require_auth();
        config(&env);
        let m = museum(&env, &museum_id);
        let mut list = bookings(&env, &user);
        let idx = list
            .iter()
            .position(|b| b.museum_id == museum_id && b.date == date)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoBooking)) as u32;
        let mut booking = list.get(idx).unwrap();
        let from_time = booking.time;
        if from_time == new_time {
            return booking;
        }
        change_slot(&env, &museum_id, date, new_time, 1);
        change_slot(&env, &museum_id, date, from_time, -1);
        booking.time = new_time;
        list.set(idx, booking.clone());
        put(&env, &Key::Bookings(user.clone()), &list);

        let mut s = stats(&env);
        s.reschedules += 1;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("");
        note.string(&m.name)
            .text(" visit moved from ")
            .time(from_time)
            .text(" to ")
            .time(new_time)
            .text(" at no cost");
        Rescheduled { user, museum_id, date, from_time, to_time: new_time, note: note.build(&env) }.publish(&env);
        booking
    }

    pub fn bookings_of(env: Env, user: Address) -> Vec<Booking> {
        config(&env);
        bookings(&env, &user)
    }

    pub fn stats(env: Env) -> Stats {
        config(&env);
        stats(&env)
    }

    pub fn config(env: Env) -> Config {
        config(&env)
    }

    /// Demo reset (museum only): removes the user's bookings and frees their places.
    pub fn reset_user(env: Env, user: Address) {
        let cfg = config(&env);
        cfg.museum.require_auth();
        for b in bookings(&env, &user).iter() {
            change_slot(&env, &b.museum_id, b.date, b.time, -1);
        }
        env.storage().persistent().remove(&Key::Bookings(user));
    }
}

#[cfg(test)]
mod test;
