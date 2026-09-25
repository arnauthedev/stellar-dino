extern crate std;

use super::*;
use soroban_sdk::{
    symbol_short, testutils::Address as _, testutils::Events as _, token::StellarAssetClient, vec, Address, Env,
    TryFromVal,
};
use std::string::ToString;

const U: i128 = 10_000_000;
const D: u32 = 20260926;

struct T {
    env: Env,
    museum: Address,
    usdc: token::TokenClient<'static>,
    admin: StellarAssetClient<'static>,
    c: MuseumContractClient<'static>,
}

fn setup() -> T {
    let env = Env::default();
    env.mock_all_auths();
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let museum = Address::generate(&env);
    let id = env.register(MuseumContract, (&museum, &sac.address()));
    let c = MuseumContractClient::new(&env, &id);
    let s = |v: &str| String::from_str(&env, v);
    c.set_museums(&vec![
        &env,
        Museum { id: symbol_short!("gulbenk"), name: s("Museu Calouste Gulbenkian"), style: s("classic art"), price: 14 * U },
        Museum { id: symbol_short!("maat"), name: s("MAAT"), style: s("contemporary art and architecture"), price: 13 * U },
    ]);
    let usdc = token::TokenClient::new(&env, &sac.address());
    let admin = StellarAssetClient::new(&env, &sac.address());
    T { env, museum, usdc, admin, c }
}

fn user(t: &T) -> Address {
    let u = Address::generate(&t.env);
    t.admin.mint(&u, &(100 * U));
    u
}

fn last_note(env: &Env) -> std::string::String {
    let events = env.events().all();
    let ev = events.events().last().unwrap().clone();
    let soroban_sdk::xdr::ContractEventBody::V0(body) = ev.body;
    let data = soroban_sdk::Val::try_from_val(env, &body.data).unwrap();
    let map = Map::<Symbol, soroban_sdk::Val>::try_from_val(env, &data).unwrap();
    String::try_from_val(env, &map.get(Symbol::new(env, "note")).unwrap()).unwrap().to_string()
}

#[test]
fn default_schedule_any_date() {
    let t = setup();
    let slots = t.c.slots(&symbol_short!("maat"), &20261231);
    assert_eq!(slots.len(), 17);
    assert_eq!(slots.get(0).unwrap(), Slot { time: 600, capacity: 20, booked: 0 });
    assert_eq!(slots.get(16).unwrap().time, 1080);
    assert!(t.c.try_slots(&symbol_short!("nope"), &D).is_err());
    assert_eq!(t.c.museums().len(), 2);
}

#[test]
fn book_and_reschedule() {
    let t = setup();
    let gul = symbol_short!("gulbenk");
    let u = user(&t);
    let b = t.c.buy_ticket(&u, &gul, &D, &900);
    assert_eq!(last_note(&t.env), "Museu Calouste Gulbenkian 26/09 15:00: 14.00 USDC");
    assert_eq!((b.price, b.time), (14 * U, 900));
    assert_eq!(t.usdc.balance(&t.museum), 14 * U);
    assert_eq!(t.c.slots(&gul, &D).get(10).unwrap().booked, 1);
    // one booking per museum and date; other museum or date is fine
    assert!(t.c.try_buy_ticket(&u, &gul, &D, &930).is_err());
    t.c.buy_ticket(&u, &symbol_short!("maat"), &D, &900);
    t.c.buy_ticket(&u, &gul, &(D + 1), &600);
    assert_eq!(t.c.bookings_of(&u).len(), 3);
    // not a slot
    assert!(t.c.try_buy_ticket(&u, &symbol_short!("maat"), &(D + 1), &615).is_err());

    let b = t.c.reschedule(&u, &gul, &D, &1020);
    assert_eq!(last_note(&t.env), "Museu Calouste Gulbenkian visit moved from 15:00 to 17:00 at no cost");
    assert_eq!(b.time, 1020);
    let slots = t.c.slots(&gul, &D);
    assert_eq!((slots.get(10).unwrap().booked, slots.get(14).unwrap().booked), (0, 1));
    assert_eq!(t.c.stats().reschedules, 1);
    assert_eq!(t.c.bookings_of(&u).get(0).unwrap().time, 1020);
    assert!(t.c.try_reschedule(&u, &gul, &(D + 2), &1020).is_err());
    // charged only for the three tickets
    assert_eq!(t.usdc.balance(&u), 100 * U - 14 * U - 13 * U - 14 * U);
}

#[test]
fn slot_capacity_and_reset() {
    let t = setup();
    let gul = symbol_short!("gulbenk");
    for _ in 0..20 {
        let u = user(&t);
        t.c.buy_ticket(&u, &gul, &D, &600);
    }
    let late = user(&t);
    assert!(t.c.try_buy_ticket(&late, &gul, &D, &600).is_err());
    t.c.buy_ticket(&late, &gul, &D, &630);
    t.c.reset_user(&late);
    assert_eq!(t.c.bookings_of(&late).len(), 0);
    let slots = t.c.slots(&gul, &D);
    assert_eq!((slots.get(0).unwrap().booked, slots.get(1).unwrap().booked), (20, 0));
    t.c.buy_ticket(&late, &gul, &D, &630);
}
