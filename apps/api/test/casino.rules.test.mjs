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
  assert.equal(roulettePayout(100, "red", "red", DEFAULT_SETTINGS), 200);
  assert.equal(roulettePayout(100, "black", "black", DEFAULT_SETTINGS), 200);
  assert.equal(roulettePayout(100, "green", "green", DEFAULT_SETTINGS), 3348);
  assert.equal(roulettePayout(100, "red", "black", DEFAULT_SETTINGS), 0);
  assert.equal(roulettePayout(1, "red", "red", DEFAULT_SETTINGS), 2);
});

test("jackpot chance requires a qualifying bet and grows gently with bet and pot", () => {
  assert.equal(jackpotChance(0, 1, DEFAULT_SETTINGS), 0);
  assert.equal(jackpotChance(0, 10, DEFAULT_SETTINGS), 2);
  assert.equal(jackpotChance(0, 1000, DEFAULT_SETTINGS), 20);
  assert.equal(jackpotChance(100000, 10, DEFAULT_SETTINGS), 3);
  assert.equal(jackpotChance(1000000000, 100000, DEFAULT_SETTINGS), 1000);
});
