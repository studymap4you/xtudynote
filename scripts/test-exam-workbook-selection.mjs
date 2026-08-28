import assert from "node:assert/strict";
import test from "node:test";
import { resolveOutputCount, selectionShortfall } from "../src/lib/examWorkbook.ts";

test("37 selected items can produce a 30-question workbook", () => {
  assert.equal(resolveOutputCount(37, 30), 30);
  assert.equal(37 - resolveOutputCount(37, 30), 7);
  assert.equal(selectionShortfall(37, 30), 0);
});

test("requesting more than the selected count reports the exact shortfall", () => {
  assert.equal(selectionShortfall(37, 40), 3);
});

test("all keeps every selected item", () => {
  assert.equal(resolveOutputCount(37, "all"), 37);
  assert.equal(selectionShortfall(37, "all"), 0);
});

test("invalid counts cannot reach workbook creation", () => {
  assert.equal(resolveOutputCount(10, 0), 0);
  assert.equal(resolveOutputCount(10, -1), 0);
  assert.equal(resolveOutputCount(10, 2.5), 0);
});
