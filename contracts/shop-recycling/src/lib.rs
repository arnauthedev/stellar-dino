//! Airport shop + recycling credit.
//!
//! - The shop lists products; some are marked sustainable.
//! - Buying a bottle product counts a bottle for the user.
//! - The recycling business records a recycled bottle (only if the user has an
//!   unrecycled bottle bought here) and the user earns a FIXED credit.
//! - Credit only applies to sustainable products. At checkout the user pays
//!   price - credit and the government pool (held by this contract) pays the
//!   credit, both to the shop in the same transaction.
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
    ProductNotFound = 1,
    NoBottleToRecycle = 2,
    InvalidAmount = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub shop: Address,
    pub government: Address,
    pub recycler: Address,
    pub token: Address,
    pub credit_per_bottle: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Product {
    pub id: Symbol,
    pub name: String,
    pub price: i128,
    pub sustainable: bool,
    /// Buying it gives the user a recyclable bottle.
    pub bottle: bool,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Bottles {
    pub bought: u32,
    pub recycled: u32,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Stats {
    pub products_sold: u32,
    pub bottles_sold: u32,
    pub bottles_recycled: u32,
    pub subsidy_paid: i128,
    pub pool_funded: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub price: i128,
    pub user_paid: i128,
    pub gov_paid: i128,
}

#[contracttype]
enum Key {
    Config,
    ProductIds,
    Stats,
    Product(Symbol),
    Credit(Address),
    Bottles(Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProductAdded {
    #[topic]
    pub product: Symbol,
    pub price: i128,
    pub sustainable: bool,
    pub note: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProductSold {
    #[topic]
    pub user: Address,
    #[topic]
    pub product: Symbol,
    pub price: i128,
    pub user_paid: i128,
    pub gov_paid: i128,
    pub note: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubsidyPaid {
    #[topic]
    pub user: Address,
    #[topic]
    pub product: Symbol,
    pub amount: i128,
    pub note: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BottleRecycled {
    #[topic]
    pub user: Address,
    pub credit_added: i128,
    pub credit: i128,
    pub note: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolFunded {
    #[topic]
    pub government: Address,
    pub amount: i128,
    pub pool: i128,
    pub note: String,
}

fn config(env: &Env) -> Config {
    env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    env.storage().instance().get(&Key::Config).unwrap()
}

fn stats(env: &Env) -> Stats {
    env.storage().instance().get(&Key::Stats).unwrap_or_default()
}

fn get_persistent<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &Key) -> Option<V> {
    let storage = env.storage().persistent();
    let value = storage.get(key);
    if value.is_some() {
        storage.extend_ttl(key, TTL_MIN, TTL_MAX);
    }
    value
}

fn set_persistent<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &Key, value: &V) {
    let storage = env.storage().persistent();
    storage.set(key, value);
    storage.extend_ttl(key, TTL_MIN, TTL_MAX);
}

#[contract]
pub struct ShopRecycling;

#[contractimpl]
impl ShopRecycling {
    pub fn __constructor(
        env: Env,
        shop: Address,
        government: Address,
        recycler: Address,
        token: Address,
        credit_per_bottle: i128,
    ) {
        if credit_per_bottle <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        env.storage().instance().set(
            &Key::Config,
            &Config { shop, government, recycler, token, credit_per_bottle },
        );
        env.storage().instance().set(&Key::ProductIds, &Vec::<Symbol>::new(&env));
    }

    /// Shop lists (or updates) a product and its sustainable flag.
    pub fn add_product(env: Env, id: Symbol, name: String, price: i128, sustainable: bool, bottle: bool) {
        let cfg = config(&env);
        cfg.shop.require_auth();
        if price <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let mut ids: Vec<Symbol> = env.storage().instance().get(&Key::ProductIds).unwrap();
        if !ids.contains(&id) {
            ids.push_back(id.clone());
            env.storage().instance().set(&Key::ProductIds, &ids);
        }
        let product = Product { id: id.clone(), name: name.clone(), price, sustainable, bottle };
        set_persistent(&env, &Key::Product(id.clone()), &product);

        let mut note = Note::new("Shop lists ");
        note.string(&name).text(" at ").amount(price).text(" USDC");
        if sustainable {
            note.text(" (sustainable)");
        }
        ProductAdded { product: id, price, sustainable, note: note.build(&env) }.publish(&env);
    }

    pub fn products(env: Env) -> Vec<Product> {
        config(&env);
        let ids: Vec<Symbol> = env.storage().instance().get(&Key::ProductIds).unwrap();
        let mut out = Vec::new(&env);
        for id in ids.iter() {
            if let Some(p) = get_persistent::<Product>(&env, &Key::Product(id)) {
                out.push_back(p);
            }
        }
        out
    }

    /// User buys a product. Sustainable products use the user's recycling
    /// credit; the government pool pays that part in the same transaction.
    pub fn buy(env: Env, user: Address, product_id: Symbol) -> Receipt {
        user.require_auth();
        let cfg = config(&env);
        let product: Product = get_persistent(&env, &Key::Product(product_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::ProductNotFound));
        let usdc = token::TokenClient::new(&env, &cfg.token);
        let me = env.current_contract_address();

        let credit_key = Key::Credit(user.clone());
        let credit: i128 = get_persistent(&env, &credit_key).unwrap_or(0);
        let gov_paid = if product.sustainable {
            credit.min(product.price).min(usdc.balance(&me)).max(0)
        } else {
            0
        };
        let user_paid = product.price - gov_paid;

        if user_paid > 0 {
            usdc.transfer(&user, &cfg.shop, &user_paid);
        }
        if gov_paid > 0 {
            usdc.transfer(&me, &cfg.shop, &gov_paid);
            set_persistent(&env, &credit_key, &(credit - gov_paid));
        }

        let mut s = stats(&env);
        s.products_sold += 1;
        s.subsidy_paid += gov_paid;
        if product.bottle {
            s.bottles_sold += 1;
            let key = Key::Bottles(user.clone());
            let mut b: Bottles = get_persistent(&env, &key).unwrap_or_default();
            b.bought += 1;
            set_persistent(&env, &key, &b);
        }
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("Airport shop: ");
        note.string(&product.name).text(" ").amount(product.price).text(" USDC. You paid ").amount(user_paid);
        if gov_paid > 0 {
            note.text(", Government paid ").amount(gov_paid);
        }
        ProductSold {
            user: user.clone(),
            product: product_id.clone(),
            price: product.price,
            user_paid,
            gov_paid,
            note: note.build(&env),
        }
        .publish(&env);

        if gov_paid > 0 {
            let mut note = Note::new("subsidy_paid: ");
            note.amount(gov_paid).text(" USDC by Government for product ").string(&product.name);
            SubsidyPaid { user, product: product_id, amount: gov_paid, note: note.build(&env) }.publish(&env);
        }

        Receipt { price: product.price, user_paid, gov_paid }
    }

    /// Recycling business records one recycled bottle for the user. The user
    /// must have an unrecycled bottle bought at this shop. Returns new credit.
    pub fn record_recycling(env: Env, user: Address) -> i128 {
        let cfg = config(&env);
        cfg.recycler.require_auth();

        let key = Key::Bottles(user.clone());
        let mut b: Bottles = get_persistent(&env, &key).unwrap_or_default();
        if b.recycled >= b.bought {
            panic_with_error!(&env, Error::NoBottleToRecycle);
        }
        b.recycled += 1;
        set_persistent(&env, &key, &b);

        let credit_key = Key::Credit(user.clone());
        let credit: i128 = get_persistent::<i128>(&env, &credit_key).unwrap_or(0) + cfg.credit_per_bottle;
        set_persistent(&env, &credit_key, &credit);

        let mut s = stats(&env);
        s.bottles_recycled += 1;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("Bottle recycled: +");
        note.amount(cfg.credit_per_bottle).text(" USDC credit for sustainable products");
        BottleRecycled { user, credit_added: cfg.credit_per_bottle, credit, note: note.build(&env) }.publish(&env);
        credit
    }

    /// Government deposits subsidy money into the pool.
    pub fn fund_pool(env: Env, amount: i128) {
        let cfg = config(&env);
        cfg.government.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let usdc = token::TokenClient::new(&env, &cfg.token);
        let me = env.current_contract_address();
        usdc.transfer(&cfg.government, &me, &amount);

        let mut s = stats(&env);
        s.pool_funded += amount;
        env.storage().instance().set(&Key::Stats, &s);

        let mut note = Note::new("Government funds recycling pool: ");
        note.amount(amount).text(" USDC");
        PoolFunded { government: cfg.government, amount, pool: usdc.balance(&me), note: note.build(&env) }
            .publish(&env);
    }

    pub fn credit_of(env: Env, user: Address) -> i128 {
        config(&env);
        get_persistent(&env, &Key::Credit(user)).unwrap_or(0)
    }

    pub fn bottles_of(env: Env, user: Address) -> Bottles {
        config(&env);
        get_persistent(&env, &Key::Bottles(user)).unwrap_or_default()
    }

    pub fn pool_balance(env: Env) -> i128 {
        let cfg = config(&env);
        token::TokenClient::new(&env, &cfg.token).balance(&env.current_contract_address())
    }

    pub fn stats(env: Env) -> Stats {
        config(&env);
        stats(&env)
    }

    pub fn config(env: Env) -> Config {
        config(&env)
    }

    /// Demo reset: clears a user's credit and bottle counters (shop only).
    pub fn reset_user(env: Env, user: Address) {
        let cfg = config(&env);
        cfg.shop.require_auth();
        env.storage().persistent().remove(&Key::Credit(user.clone()));
        env.storage().persistent().remove(&Key::Bottles(user));
    }
}

#[cfg(test)]
mod test;
