extern crate std;

use std::string::ToString;

use super::*;
use soroban_sdk::{
    symbol_short, testutils::Address as _, testutils::Events as _, token::StellarAssetClient, vec, Address, Env,
    String, TryFromVal,
};

const U: i128 = 10_000_000;
const D: u32 = 20260926;

fn setup() -> (Env, Address, Address, token::TokenClient<'static>, AirlineClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let airline = Address::generate(&env);
    let oracle = Address::generate(&env);
    let user = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&user, &(500 * U));
    let id = env.register(Airline, (&airline, &oracle, &sac.address(), &2000u32));
    let client = AirlineClient::new(&env, &id);
    let s = |v: &str| String::from_str(&env, v);
    let route = |code: Symbol, from: &str, to: &str, fc: &str, tc: &str, dep: u32, arr: u32, price: i128| Route {
        code,
        from: s(from),
        to: s(to),
        from_city: s(fc),
        to_city: s(tc),
        depart: dep,
        arrive: arr,
        price: price * U,
    };
    client.set_timetable(&vec![
        &env,
        route(symbol_short!("SK101"), "BCN", "LIS", "Barcelona", "Lisbon", 480, 545, 89),
        route(symbol_short!("SK202"), "LIS", "CDG", "Lisbon", "Paris", 600, 815, 120),
    ]);
    let usdc = token::TokenClient::new(&env, &sac.address());
    (env, airline, user, usdc, client)
}

fn last_note(env: &Env) -> std::string::String {
    let events = env.events().all();
    let ev = events.events().last().unwrap().clone();
    let soroban_sdk::xdr::ContractEventBody::V0(body) = ev.body;
    let data = soroban_sdk::Val::try_from_val(env, &body.data).unwrap();
    let map = soroban_sdk::Map::<Symbol, soroban_sdk::Val>::try_from_val(env, &data).unwrap();
    let note = String::try_from_val(env, &map.get(Symbol::new(env, "note")).unwrap()).unwrap();
    note.to_string()
}

#[test]
fn flights_for_any_date() {
    let (_env, _airline, _user, _usdc, client) = setup();
    let fs = client.flights(&D);
    assert_eq!(fs.len(), 2);
    let f = fs.get(0).unwrap();
    assert_eq!((f.code, f.date, f.status, f.price), (symbol_short!("SK101"), D, FlightStatus::Scheduled, 89 * U));
    assert_eq!(client.flights(&20261003).len(), 2);
    assert!(client.try_flight(&symbol_short!("XX1"), &D).is_err());
    assert!(client.try_flights(&20261332).is_err());
}

#[test]
fn delay_refunds_hold_to_user() {
    let (env, airline, user, usdc, client) = setup();
    let t = client.buy_ticket(&user, &symbol_short!("SK202"), &D);
    assert_eq!(last_note(&env), "Ticket SK202 LIS-CDG 26/09: 120.00 USDC. 96.00 to airline, 24.00 held until landing");
    assert_eq!(t.held, 24 * U);
    assert_eq!(usdc.balance(&airline), 96 * U);
    client.report_status(&symbol_short!("SK202"), &D, &true, &120);
    assert_eq!(last_note(&env), "Flight SK202 26/09 delayed 2 h: 24.00 USDC refunded to passenger");
    assert_eq!(usdc.balance(&user), 500 * U - 96 * U);
    let f = client.flight(&symbol_short!("SK202"), &D);
    assert_eq!((f.status, f.delay_minutes), (FlightStatus::Delayed, 120));
    // other dates are unaffected
    assert_eq!(client.flight(&symbol_short!("SK202"), &(D + 1)).status, FlightStatus::Scheduled);
    assert_eq!(client.stats().refunds_paid, 1);
    assert!(client.tickets_of(&user).get(0).unwrap().settled);
    assert!(client.try_report_status(&symbol_short!("SK202"), &D, &false, &0).is_err());
}

#[test]
fn on_time_releases_hold_to_airline() {
    let (env, airline, user, usdc, client) = setup();
    client.buy_ticket(&user, &symbol_short!("SK101"), &D);
    client.report_status(&symbol_short!("SK101"), &D, &false, &0);
    assert_eq!(last_note(&env), "Flight SK101 26/09 landed on time: 17.80 USDC hold released to airline");
    assert_eq!(usdc.balance(&airline), 89 * U);
    assert_eq!(usdc.balance(&user), 411 * U);
}

#[test]
fn one_ticket_per_flight_and_date() {
    let (_env, _airline, user, _usdc, client) = setup();
    client.buy_ticket(&user, &symbol_short!("SK101"), &D);
    assert!(client.try_buy_ticket(&user, &symbol_short!("SK101"), &D).is_err());
    client.buy_ticket(&user, &symbol_short!("SK101"), &(D + 1));
    client.buy_ticket(&user, &symbol_short!("SK202"), &(D + 1));
    assert_eq!(client.tickets_of(&user).len(), 3);
    assert_eq!(client.passengers(&symbol_short!("SK101"), &D).len(), 1);
}

#[test]
fn reset_user_clears_tickets_and_status() {
    let (_env, _airline, user, _usdc, client) = setup();
    client.buy_ticket(&user, &symbol_short!("SK101"), &D);
    client.report_status(&symbol_short!("SK101"), &D, &true, &90);
    client.reset_user(&user);
    assert_eq!(client.tickets_of(&user).len(), 0);
    assert_eq!(client.passengers(&symbol_short!("SK101"), &D).len(), 0);
    assert_eq!(client.flight(&symbol_short!("SK101"), &D).status, FlightStatus::Scheduled);
    client.buy_ticket(&user, &symbol_short!("SK101"), &D);
}
