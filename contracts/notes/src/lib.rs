//! Tiny no_std string builder for human-readable event notes,
//! e.g. "subsidy_paid: 0.50 USDC by Government for Bamboo bottle".
#![no_std]

use soroban_sdk::{Env, String};

/// USDC (Stellar asset) uses 7 decimals.
pub const DECIMALS: i128 = 10_000_000;

pub struct Note {
    buf: [u8; 200],
    len: usize,
}

impl Note {
    pub fn new(text: &str) -> Self {
        let mut note = Note { buf: [0; 200], len: 0 };
        note.text(text);
        note
    }

    pub fn text(&mut self, s: &str) -> &mut Self {
        self.bytes(s.as_bytes())
    }

    fn bytes(&mut self, b: &[u8]) -> &mut Self {
        let n = b.len().min(self.buf.len() - self.len);
        self.buf[self.len..self.len + n].copy_from_slice(&b[..n]);
        self.len += n;
        self
    }

    /// Append a Soroban String (e.g. a product name).
    pub fn string(&mut self, s: &String) -> &mut Self {
        let n = (s.len() as usize).min(self.buf.len() - self.len);
        let mut tmp = [0u8; 200];
        s.copy_into_slice(&mut tmp[..s.len() as usize]);
        self.bytes(&tmp[..n])
    }

    /// Append an unsigned integer.
    pub fn uint(&mut self, mut v: u128) -> &mut Self {
        let mut digits = [0u8; 40];
        let mut i = digits.len();
        if v == 0 {
            i -= 1;
            digits[i] = b'0';
        }
        while v > 0 {
            i -= 1;
            digits[i] = b'0' + (v % 10) as u8;
            v /= 10;
        }
        let tmp = digits;
        self.bytes(&tmp[i..])
    }

    /// Append a 7-decimal token amount rounded to 2 decimals, e.g. "12.50".
    pub fn amount(&mut self, stroops: i128) -> &mut Self {
        if stroops < 0 {
            self.text("-");
        }
        let cents = (stroops.unsigned_abs() + 50_000) / 100_000;
        self.uint(cents / 100);
        self.text(".");
        let frac = (cents % 100) as u8;
        self.bytes(&[b'0' + frac / 10, b'0' + frac % 10])
    }

    /// Append "HH:MM" from minutes after midnight.
    pub fn time(&mut self, minutes: u32) -> &mut Self {
        let (h, m) = ((minutes / 60) % 24, minutes % 60);
        self.bytes(&[
            b'0' + (h / 10) as u8,
            b'0' + (h % 10) as u8,
            b':',
            b'0' + (m / 10) as u8,
            b'0' + (m % 10) as u8,
        ])
    }

    pub fn build(&self, env: &Env) -> String {
        String::from_bytes(env, &self.buf[..self.len])
    }
}
