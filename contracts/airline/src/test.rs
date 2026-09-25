extern crate std;

use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, token::StellarAssetClient, Address, Env, String};

const U: i128 = 10_000_000;

fn setup() -> (Env, Address, Address, token::TokenClient<'static>, AirlineClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    StellarAssetClient::new(&env, &sac.address());
    let airline = Address::generate(&env);
    let oracle = Address::generate(&env);
    let user = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&user, &(500 * U));
    let id = env.register(Airline, (&airline, &oracle, &sac.address(), &2000u32));
    let client = AirlineClient::new(&env, &id);
    let s = |v: &str| String::from_str(&env, v);
    client.add_flight(&symbol_short!("TP432"), &s("TP432"), &s("LIS"), &s("CDG"), &600, &755, &(120 * U));
    let usdc = token::TokenClient::new(&env, &sac.address());
    (env, airline, user, usdc, client)
}

#[test]
fn delay_refunds_hold_to_user() {
    let (_env, airline, user, usdc, client) = setup();
    let t = client.buy_ticket(&user, &symbol_short!("TP432"));
    assert_eq!(t.held, 24 * U);
    assert_eq!(usdc.balance(&airline), 96 * U);
    client.report_status(&symbol_short!("TP432"), &true, &120);
    assert_eq!(usdc.balance(&user), 500 * U - 96 * U);
    assert_eq!(client.flight(&symbol_short!("TP432")).status, FlightStatus::Delayed);
    assert_eq!(client.stats().refunds_paid, 1);
    assert!(client.try_report_status(&symbol_short!("TP432"), &false, &0).is_err());
}

#[test]
fn on_time_releases_hold_to_airline() {
    let (_env, airline, user, usdc, client) = setup();
    client.buy_ticket(&user, &symbol_short!("TP432"));
    client.report_status(&symbol_short!("TP432"), &false, &0);
    assert_eq!(usdc.balance(&airline), 120 * U);
    assert_eq!(usdc.balance(&user), 380 * U);
}

#[test]
fn cannot_double_book() {
    let (_env, _airline, user, _usdc, client) = setup();
    client.buy_ticket(&user, &symbol_short!("TP432"));
    assert!(client.try_buy_ticket(&user, &symbol_short!("TP432")).is_err());
}
