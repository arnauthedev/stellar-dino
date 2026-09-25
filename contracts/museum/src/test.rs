extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, token::StellarAssetClient, vec, Address, Env};

const U: i128 = 10_000_000;

#[test]
fn book_and_reschedule() {
    let env = Env::default();
    env.mock_all_auths();
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let museum = Address::generate(&env);
    let user = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&user, &(100 * U));
    let id = env.register(Museum, (&museum, &sac.address(), &(18 * U)));
    let c = MuseumClient::new(&env, &id);
    c.set_slots(&20260926, &vec![&env, 825u32, 945, 1065], &1);

    c.buy_ticket(&user, &20260926, &825);
    assert_eq!(token::TokenClient::new(&env, &sac.address()).balance(&museum), 18 * U);
    assert_eq!(c.slots(&20260926).get(0).unwrap().booked, 1);

    // slot full for someone else
    let other = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&other, &(100 * U));
    assert!(c.try_buy_ticket(&other, &20260926, &825).is_err());

    let b = c.reschedule(&user, &1065);
    assert_eq!(b.time, 1065);
    let slots = c.slots(&20260926);
    assert_eq!((slots.get(0).unwrap().booked, slots.get(2).unwrap().booked), (0, 1));
    assert_eq!(c.stats().reschedules, 1);
    // still charged only once
    assert_eq!(token::TokenClient::new(&env, &sac.address()).balance(&user), 82 * U);
}
