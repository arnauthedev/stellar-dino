//! User smart wallet built on OpenZeppelin's smart account.
//!
//! Context rules installed at deploy time (IDs are sequential from 0):
//! - 0 "owner":      Default scope, signed by the user's own key. Only this rule
//!                   can change wallet settings, including the spending limit.
//! - 1 "agent-usdc": USDC transfers only, signed by the agent key, with the
//!                   spending-limit policy attached.
//! - 2.. "agent-app": one rule per app contract (shop, airline, museum),
//!                   signed by the agent key, no policies.
//!
//! The agent has no Default rule, so it cannot bypass the spending limit or
//! change it. The limit is set by the user only.
#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, IntoVal, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::{
    policies::spending_limit::SpendingLimitAccountParams,
    smart_account::{self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount, SmartAccountError},
};

#[contract]
pub struct SmartWallet;

#[contractimpl]
impl SmartWallet {
    pub fn __constructor(
        e: &Env,
        owner: Signer,
        agent: Signer,
        usdc: Address,
        spending_policy: Address,
        spending_limit: i128,
        period_ledgers: u32,
        apps: Vec<Address>,
    ) {
        let none: Map<Address, Val> = Map::new(e);
        smart_account::add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "owner"),
            None,
            &Vec::from_array(e, [owner]),
            &none,
        );

        let mut limit_policy: Map<Address, Val> = Map::new(e);
        limit_policy.set(
            spending_policy,
            SpendingLimitAccountParams { spending_limit, period_ledgers }.into_val(e),
        );
        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(usdc),
            &String::from_str(e, "agent-usdc"),
            None,
            &Vec::from_array(e, [agent.clone()]),
            &limit_policy,
        );

        for app in apps.iter() {
            smart_account::add_context_rule(
                e,
                &ContextRuleType::CallContract(app),
                &String::from_str(e, "agent-app"),
                None,
                &Vec::from_array(e, [agent.clone()]),
                &none,
            );
        }
    }
}

#[contractimpl]
impl CustomAccountInterface for SmartWallet {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for SmartWallet {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for SmartWallet {}
