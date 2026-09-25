//! Demo airline. On purchase most of the ticket goes to the airline and a
//! share (hold_bps, e.g. 20%) is held in this contract. The demo oracle then
//! reports the flight: on time -> hold released to the airline; delayed ->
//! hold refunded to each passenger as compensation.
#![no_std]

use notes::Note;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, String, Symbol, Vec,
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Flight {
    pub id: Symbol,
    pub code: String,
    pub from: String,
    pub to: String,
    /// Minutes after midnight.
    pub depart: u32,
    pub arrive: u32,
    pub price: i128,
    pub status: FlightStatus,
    pub delay_minutes: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Ticket {
    pub user: Address,
    pub flight: Symbol,
    pub price: i128,
    pub held: i128,
    pub settled: bool,
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
    FlightIds,
    Stats,
    Flight(Symbol),
    Tickets(Symbol),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TicketSold {
    #[topic]
    pub user: Address,
    #[topic]
    pub flight: Symbol,
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

fn flight(env: &Env, id: &Symbol) -> Flight {
    let key = Key::Flight(id.clone());
    let f = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::FlightNotFound));
    env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);
    f
}

fn tickets(env: &Env, id: &Symbol) -> Vec<Ticket> {
    let key = Key::Tickets(id.clone());
    let t = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    if env.storage().persistent().has(&key) {
        env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);
    }
    t
}

fn put<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &Key, v: &V) {
    env.storage().persistent().set(key, v);
    env.storage().persistent().extend_ttl(key, TTL_MIN, TTL_MAX);
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
        env.storage().instance().set(&Key::FlightIds, &Vec::<Symbol>::new(&env));
    }

    /// Airline adds (or resets) a flight. Resetting clears its passengers.
    pub fn add_flight(
        env: Env,
        id: Symbol,
        code: String,
        from: String,
        to: String,
        depart: u32,
        arrive: u32,
        price: i128,
    ) {
        let cfg = config(&env);
        cfg.airline.require_auth();
        if price <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let mut ids: Vec<Symbol> = env.storage().instance().get(&Key::FlightIds).unwrap();
        if !ids.contains(&id) {
            ids.push_back(id.clone());
            env.storage().instance().set(&Key::FlightIds, &ids);
        }
        let f = Flight {
            id: id.clone(),
            code,
            from,
            to,
            depart,
            arrive,
            price,
            status: FlightStatus::Scheduled,
            delay_minutes: 0,
        };
        put(&env, &Key::Flight(id.clone()), &f);
        env.storage().persistent().remove(&Key::Tickets(id));
    }

    pub fn flights(env: Env) -> Vec<Flight> {
        config(&env);
        let ids: Vec<Symbol> = env.storage().instance().get(&Key::FlightIds).unwrap();
        let mut out = Vec::new(&env);
        for id in ids.iter() {
            out.push_back(flight(&env, &id));
        }
        out
    }

    pub fn flight(env: Env, id: Symbol) -> Flight {
        config(&env);
        flight(&env, &id)
    }

    pub fn passengers(env: Env, flight_id: Symbol) -> Vec<Ticket> {
        config(&env);
        tickets(&env, &flight_id)
    }

    /// User buys a ticket: the airline gets price - hold, the contract holds the rest.
    pub fn buy_ticket(env: Env, user: Address, flight_id: Symbol) -> Ticket {
        user.require_auth();
        let cfg = config(&env);
        let f = flight(&env, &flight_id);
        if f.status != FlightStatus::Scheduled {
            panic_with_error!(&env, Error::AlreadySettled);
        }
        let mut list = tickets(&env, &flight_id);
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

        let ticket = Ticket { user: user.clone(), flight: flight_id.clone(), price: f.price, held, settled: false };
        list.push_back(ticket.clone());
        put(&env, &Key::Tickets(flight_id.clone()), &list);

        let mut s = stats(&env);
        s.tickets_sold += 1;
        s.revenue += f.price;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("Ticket ");
        note.string(&f.code)
            .text(" ")
            .string(&f.from)
            .text("-")
            .string(&f.to)
            .text(": ")
            .amount(f.price)
            .text(" USDC. ")
            .amount(to_airline)
            .text(" to airline, ")
            .amount(held)
            .text(" held until landing");
        TicketSold { user, flight: flight_id, price: f.price, paid_to_airline: to_airline, held, note: note.build(&env) }
            .publish(&env);
        ticket
    }

    /// Demo oracle reports the flight. Settles every unsettled hold.
    pub fn report_status(env: Env, flight_id: Symbol, delayed: bool, delay_minutes: u32) {
        let cfg = config(&env);
        cfg.oracle.require_auth();
        let mut f = flight(&env, &flight_id);
        if f.status != FlightStatus::Scheduled {
            panic_with_error!(&env, Error::AlreadySettled);
        }
        f.status = if delayed { FlightStatus::Delayed } else { FlightStatus::OnTime };
        f.delay_minutes = if delayed { delay_minutes } else { 0 };
        put(&env, &Key::Flight(flight_id.clone()), &f);

        let usdc = token::TokenClient::new(&env, &cfg.token);
        let me = env.current_contract_address();
        let mut s = stats(&env);
        let list = tickets(&env, &flight_id);
        let mut settled = Vec::new(&env);
        for mut t in list.iter() {
            if !t.settled && t.held > 0 {
                if delayed {
                    usdc.transfer(&me, &t.user, &t.held);
                    s.refunds_paid += 1;
                    s.refunded += t.held;
                    let mut note = Note::new("Flight ");
                    note.string(&f.code).text(" delayed ");
                    delay_text(&mut note, delay_minutes);
                    note.text(": ").amount(t.held).text(" USDC refunded to passenger");
                    DelayRefund {
                        user: t.user.clone(),
                        flight: flight_id.clone(),
                        amount: t.held,
                        delay_minutes,
                        note: note.build(&env),
                    }
                    .publish(&env);
                } else {
                    usdc.transfer(&me, &cfg.airline, &t.held);
                    s.holds_released += t.held;
                    let mut note = Note::new("Flight ");
                    note.string(&f.code).text(" landed on time: ").amount(t.held).text(" USDC hold released to airline");
                    HoldReleased { user: t.user.clone(), flight: flight_id.clone(), amount: t.held, note: note.build(&env) }
                        .publish(&env);
                }
            }
            t.settled = true;
            settled.push_back(t);
        }
        put(&env, &Key::Tickets(flight_id), &settled);
        env.storage().instance().set(&Key::Stats, &s);
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
