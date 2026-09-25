//! Demo airline. Flights come from a daily timetable: a flight is a route
//! code plus a date (yyyymmdd), so every route flies every day. On purchase
//! most of the ticket goes to the airline and a share (hold_bps, e.g. 20%) is
//! held in this contract. The demo oracle then reports the flight: on time ->
//! hold released to the airline; delayed -> hold refunded to each passenger.
//! Status and passengers are stored per (code, date) only when something happens.
#![no_std]

use notes::Note;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token, Address, Env, String, Symbol, Vec,
};

const DAY: u32 = 17_280;
const TTL_MIN: u32 = 30 * DAY;
const TTL_MAX: u32 = 60 * DAY;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    FlightNotFound = 1,
    InvalidAmount = 2,
    AlreadySettled = 3,
    AlreadyBooked = 4,
    InvalidDate = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub airline: Address,
    pub oracle: Address,
    pub token: Address,
    /// Share of each ticket held until landing, in basis points (2000 = 20%).
    pub hold_bps: u32,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlightStatus {
    Scheduled,
    OnTime,
    Delayed,
}

/// A daily route of the timetable.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Route {
    pub code: Symbol,
    /// IATA codes, e.g. "BCN".
    pub from: String,
    pub to: String,
    pub from_city: String,
    pub to_city: String,
    /// Minutes after midnight.
    pub depart: u32,
    pub arrive: u32,
    pub price: i128,
}

/// A route on a given date.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Flight {
    pub code: Symbol,
    /// yyyymmdd
    pub date: u32,
    pub from: String,
    pub to: String,
    pub from_city: String,
    pub to_city: String,
    pub depart: u32,
    pub arrive: u32,
    pub price: i128,
    pub status: FlightStatus,
    pub delay_minutes: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlightState {
    pub status: FlightStatus,
    pub delay_minutes: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Ticket {
    pub user: Address,
    pub code: Symbol,
    pub date: u32,
    pub price: i128,
    pub held: i128,
    pub settled: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlightRef {
    pub code: Symbol,
    pub date: u32,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Stats {
    pub tickets_sold: u32,
    pub revenue: i128,
    pub holds_released: i128,
    pub refunds_paid: u32,
    pub refunded: i128,
}

#[contracttype]
enum Key {
    Config,
    Timetable,
    Stats,
    State(Symbol, u32),
    Tickets(Symbol, u32),
    UserFlights(Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TicketSold {
    #[topic]
    pub user: Address,
    #[topic]
    pub flight: Symbol,
    pub date: u32,
    pub price: i128,
    pub paid_to_airline: i128,
    pub held: i128,
    pub note: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HoldReleased {
    #[topic]
    pub user: Address,
    #[topic]
    pub flight: Symbol,
    pub date: u32,
    pub amount: i128,
    pub note: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelayRefund {
    #[topic]
    pub user: Address,
    #[topic]
    pub flight: Symbol,
    pub date: u32,
    pub amount: i128,
    pub delay_minutes: u32,
    pub note: String,
}

fn config(env: &Env) -> Config {
    env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    env.storage().instance().get(&Key::Config).unwrap()
}

fn stats(env: &Env) -> Stats {
    env.storage().instance().get(&Key::Stats).unwrap_or_default()
}

fn timetable(env: &Env) -> Vec<Route> {
    env.storage().instance().get(&Key::Timetable).unwrap_or(Vec::new(env))
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

fn state(env: &Env, code: &Symbol, date: u32) -> FlightState {
    get(env, &Key::State(code.clone(), date))
        .unwrap_or(FlightState { status: FlightStatus::Scheduled, delay_minutes: 0 })
}

fn tickets(env: &Env, code: &Symbol, date: u32) -> Vec<Ticket> {
    get(env, &Key::Tickets(code.clone(), date)).unwrap_or(Vec::new(env))
}

fn flight(env: &Env, code: &Symbol, date: u32) -> Flight {
    check_date(env, date);
    let r = timetable(env)
        .iter()
        .find(|r| r.code == *code)
        .unwrap_or_else(|| panic_with_error!(env, Error::FlightNotFound));
    let s = state(env, code, date);
    Flight {
        code: r.code,
        date,
        from: r.from,
        to: r.to,
        from_city: r.from_city,
        to_city: r.to_city,
        depart: r.depart,
        arrive: r.arrive,
        price: r.price,
        status: s.status,
        delay_minutes: s.delay_minutes,
    }
}

/// "SK101" from a small Symbol (<= 9 chars, bit-packed in the Val: 8 tag
/// bits, then 6 bits per char, first char highest).
fn code_text(note: &mut Note, code: &Symbol) {
    let val = code.to_val();
    if val.get_payload() & 0xff != 14 {
        note.text("flight");
        return;
    }
    let mut body = val.get_payload() >> 8;
    let mut chars = [0u8; 10];
    let mut n = 0;
    while body != 0 && n < chars.len() {
        chars[n] = match (body & 63) as u8 {
            1 => b'_',
            c @ 2..=11 => b'0' + c - 2,
            c @ 12..=37 => b'A' + c - 12,
            c @ 38..=63 => b'a' + c - 38,
            _ => b'?',
        };
        body >>= 6;
        n += 1;
    }
    chars[..n].reverse();
    note.text(core::str::from_utf8(&chars[..n]).unwrap_or("flight"));
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

fn delay_text(note: &mut Note, minutes: u32) {
    if minutes > 0 && minutes % 60 == 0 {
        note.uint((minutes / 60) as u128).text(" h");
    } else {
        note.uint(minutes as u128).text(" min");
    }
}

#[contract]
pub struct Airline;

#[contractimpl]
impl Airline {
    pub fn __constructor(env: Env, airline: Address, oracle: Address, token: Address, hold_bps: u32) {
        if hold_bps > 10_000 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        env.storage().instance().set(&Key::Config, &Config { airline, oracle, token, hold_bps });
        env.storage().instance().set(&Key::Timetable, &Vec::<Route>::new(&env));
    }

    /// Airline replaces the daily timetable.
    pub fn set_timetable(env: Env, routes: Vec<Route>) {
        let cfg = config(&env);
        cfg.airline.require_auth();
        for r in routes.iter() {
            if r.price <= 0 || r.depart >= 24 * 60 {
                panic_with_error!(&env, Error::InvalidAmount);
            }
        }
        env.storage().instance().set(&Key::Timetable, &routes);
    }

    pub fn timetable(env: Env) -> Vec<Route> {
        config(&env);
        timetable(&env)
    }

    /// Every route of the timetable on a date, with its status.
    pub fn flights(env: Env, date: u32) -> Vec<Flight> {
        config(&env);
        check_date(&env, date);
        let mut out = Vec::new(&env);
        for r in timetable(&env).iter() {
            out.push_back(flight(&env, &r.code, date));
        }
        out
    }

    pub fn flight(env: Env, code: Symbol, date: u32) -> Flight {
        config(&env);
        flight(&env, &code, date)
    }

    pub fn passengers(env: Env, code: Symbol, date: u32) -> Vec<Ticket> {
        config(&env);
        tickets(&env, &code, date)
    }

    /// The user's tickets, in purchase order.
    pub fn tickets_of(env: Env, user: Address) -> Vec<Ticket> {
        config(&env);
        let refs: Vec<FlightRef> = get(&env, &Key::UserFlights(user.clone())).unwrap_or(Vec::new(&env));
        let mut out = Vec::new(&env);
        for f in refs.iter() {
            if let Some(t) = tickets(&env, &f.code, f.date).iter().find(|t| t.user == user) {
                out.push_back(t);
            }
        }
        out
    }

    /// User buys a ticket: the airline gets price - hold, the contract holds the rest.
    pub fn buy_ticket(env: Env, user: Address, code: Symbol, date: u32) -> Ticket {
        user.require_auth();
        let cfg = config(&env);
        let f = flight(&env, &code, date);
        if f.status != FlightStatus::Scheduled {
            panic_with_error!(&env, Error::AlreadySettled);
        }
        let mut list = tickets(&env, &code, date);
        if list.iter().any(|t| t.user == user) {
            panic_with_error!(&env, Error::AlreadyBooked);
        }

        let held = f.price * cfg.hold_bps as i128 / 10_000;
        let to_airline = f.price - held;
        let usdc = token::TokenClient::new(&env, &cfg.token);
        usdc.transfer(&user, &cfg.airline, &to_airline);
        if held > 0 {
            usdc.transfer(&user, &env.current_contract_address(), &held);
        }

        let ticket = Ticket { user: user.clone(), code: code.clone(), date, price: f.price, held, settled: false };
        list.push_back(ticket.clone());
        put(&env, &Key::Tickets(code.clone(), date), &list);

        let ukey = Key::UserFlights(user.clone());
        let mut refs: Vec<FlightRef> = get(&env, &ukey).unwrap_or(Vec::new(&env));
        refs.push_back(FlightRef { code: code.clone(), date });
        put(&env, &ukey, &refs);

        let mut s = stats(&env);
        s.tickets_sold += 1;
        s.revenue += f.price;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("Ticket ");
        code_text(&mut note, &code);
        note.text(" ").string(&f.from).text("-").string(&f.to).text(" ");
        date_text(&mut note, date);
        note.text(": ")
            .amount(f.price)
            .text(" USDC. ")
            .amount(to_airline)
            .text(" to airline, ")
            .amount(held)
            .text(" held until landing");
        TicketSold {
            user,
            flight: code,
            date,
            price: f.price,
            paid_to_airline: to_airline,
            held,
            note: note.build(&env),
        }
        .publish(&env);
        ticket
    }

    /// Demo oracle reports the flight. Settles every unsettled hold.
    pub fn report_status(env: Env, code: Symbol, date: u32, delayed: bool, delay_minutes: u32) {
        let cfg = config(&env);
        cfg.oracle.require_auth();
        let f = flight(&env, &code, date);
        if f.status != FlightStatus::Scheduled {
            panic_with_error!(&env, Error::AlreadySettled);
        }
        let st = FlightState {
            status: if delayed { FlightStatus::Delayed } else { FlightStatus::OnTime },
            delay_minutes: if delayed { delay_minutes } else { 0 },
        };
        put(&env, &Key::State(code.clone(), date), &st);

        let usdc = token::TokenClient::new(&env, &cfg.token);
        let me = env.current_contract_address();
        let mut s = stats(&env);
        let list = tickets(&env, &code, date);
        let mut settled = Vec::new(&env);
        for mut t in list.iter() {
            if !t.settled && t.held > 0 {
                let mut note = Note::new("Flight ");
                code_text(&mut note, &code);
                note.text(" ");
                date_text(&mut note, date);
                if delayed {
                    usdc.transfer(&me, &t.user, &t.held);
                    s.refunds_paid += 1;
                    s.refunded += t.held;
                    note.text(" delayed ");
                    delay_text(&mut note, delay_minutes);
                    note.text(": ").amount(t.held).text(" USDC refunded to passenger");
                    DelayRefund {
                        user: t.user.clone(),
                        flight: code.clone(),
                        date,
                        amount: t.held,
                        delay_minutes,
                        note: note.build(&env),
                    }
                    .publish(&env);
                } else {
                    usdc.transfer(&me, &cfg.airline, &t.held);
                    s.holds_released += t.held;
                    note.text(" landed on time: ").amount(t.held).text(" USDC hold released to airline");
                    HoldReleased { user: t.user.clone(), flight: code.clone(), date, amount: t.held, note: note.build(&env) }
                        .publish(&env);
                }
            }
            t.settled = true;
            settled.push_back(t);
        }
        if !settled.is_empty() {
            put(&env, &Key::Tickets(code, date), &settled);
        }
        env.storage().instance().set(&Key::Stats, &s);
    }

    /// Demo reset (airline only): removes the user's tickets and resets the
    /// status and passengers of those flights.
    pub fn reset_user(env: Env, user: Address) {
        let cfg = config(&env);
        cfg.airline.require_auth();
        let ukey = Key::UserFlights(user);
        let refs: Vec<FlightRef> = env.storage().persistent().get(&ukey).unwrap_or(Vec::new(&env));
        for f in refs.iter() {
            env.storage().persistent().remove(&Key::Tickets(f.code.clone(), f.date));
            env.storage().persistent().remove(&Key::State(f.code, f.date));
        }
        env.storage().persistent().remove(&ukey);
    }

    pub fn stats(env: Env) -> Stats {
        config(&env);
        stats(&env)
    }

    pub fn config(env: Env) -> Config {
        config(&env)
    }
}

#[cfg(test)]
mod test;
