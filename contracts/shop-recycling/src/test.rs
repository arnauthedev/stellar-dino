extern crate std;

use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, token::StellarAssetClient, Address, Env, String};

const U: i128 = 10_000_000; // 1 USDC

struct Setup {
    env: Env,
    shop: Address,
    gov: Address,
    user: Address,
    usdc: token::TokenClient<'static>,
    client: ShopRecyclingClient<'static>,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let mint = StellarAssetClient::new(&env, &sac.address());
    let shop = Address::generate(&env);
    let gov = Address::generate(&env);
    let recycler = Address::generate(&env);
    let user = Address::generate(&env);
    mint.mint(&user, &(100 * U));
    mint.mint(&gov, &(50 * U));
    let id = env.register(ShopRecycling, (&shop, &gov, &recycler, &sac.address(), &(U / 2)));
    let client = ShopRecyclingClient::new(&env, &id);
    client.add_product(&symbol_short!("water"), &String::from_str(&env, "Water"), &(2 * U), &false, &true);
    client.add_product(&symbol_short!("bamboo"), &String::from_str(&env, "Bamboo bottle"), &(12 * U), &true, &false);
    client.fund_pool(&(10 * U));
    let usdc = token::TokenClient::new(&env, &sac.address());
    Setup { env, shop, gov, user, usdc, client }
}

#[test]
fn recycle_then_buy_sustainable_splits_payment() {
    let s = setup();
    let r = s.client.buy(&s.user, &symbol_short!("water"));
    assert_eq!(r, Receipt { price: 2 * U, user_paid: 2 * U, gov_paid: 0 });
    assert_eq!(s.client.record_recycling(&s.user), U / 2);

    let r = s.client.buy(&s.user, &symbol_short!("bamboo"));
    assert_eq!(r, Receipt { price: 12 * U, user_paid: 12 * U - U / 2, gov_paid: U / 2 });
    assert_eq!(s.client.credit_of(&s.user), 0);
    assert_eq!(s.usdc.balance(&s.shop), 14 * U);
    assert_eq!(s.usdc.balance(&s.user), 100 * U - 14 * U + U / 2);
    assert_eq!(s.client.pool_balance(), 10 * U - U / 2);
    assert_eq!(s.usdc.balance(&s.gov), 40 * U);
    let st = s.client.stats();
    assert_eq!((st.products_sold, st.bottles_sold, st.bottles_recycled, st.subsidy_paid), (2, 1, 1, U / 2));
}

#[test]
fn credit_not_used_on_non_sustainable() {
    let s = setup();
    s.client.buy(&s.user, &symbol_short!("water"));
    s.client.record_recycling(&s.user);
    let r = s.client.buy(&s.user, &symbol_short!("water"));
    assert_eq!(r.gov_paid, 0);
    assert_eq!(s.client.credit_of(&s.user), U / 2);
}

#[test]
fn cannot_recycle_without_bottle() {
    let s = setup();
    assert!(s.client.try_record_recycling(&s.user).is_err());
    s.client.buy(&s.user, &symbol_short!("water"));
    s.client.record_recycling(&s.user);
    // same bottle cannot be recycled twice
    assert!(s.client.try_record_recycling(&s.user).is_err());
    let _ = &s.env;
}
