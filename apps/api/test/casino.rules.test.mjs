import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { rouletteColor, roulettePayout, jackpotChance } = require("../dist/casino/casino.service.js");
const { DEFAULT_SETTINGS } = require("../dist/settings/chat-settings.service.js");

test("European wheel has 18 red, 18 black and one green slot", () => {
  const colors = Array.from({ length: 37 }, (_, number) => rouletteColor(number));
  assert.equal(colors.filter(color => color === "red").length, 18);
  assert.equal(colors.filter(color => color === "black").length, 18);
  assert.equal(colors.filter(color => color === "green").length, 1);
  assert.equal(rouletteColor(0), "green");
});

test("payout includes stake and uses configured coefficients", () => {
  assert.equal(roulettePayout(100, "red", "red", DEFAULT_SETTINGS), 186);
  assert.equal(roulettePayout(100, "black", "black", DEFAULT_SETTINGS), 186);
  assert.equal(roulettePayout(100, "green", "green", DEFAULT_SETTINGS), 3348);
  assert.equal(roulettePayout(100, "red", "black", DEFAULT_SETTINGS), 0);
  assert.equal(roulettePayout(1, "red", "red", DEFAULT_SETTINGS), 1);
});

test("jackpot chance starts at one in a thousand, grows and stops at cap", () => {
  assert.equal(jackpotChance(0, DEFAULT_SETTINGS), 1000);
  assert.equal(jackpotChance(9999, DEFAULT_SETTINGS), 1000);
  assert.equal(jackpotChance(10000, DEFAULT_SETTINGS), 1050);
  assert.equal(jackpotChance(800000, DEFAULT_SETTINGS), 5000);
  assert.equal(jackpotChance(1000000, DEFAULT_SETTINGS), 5000);
});
