import { assertEquals } from "https://deno.land/std@0.71.0/testing/asserts.ts";

Deno.test({
  name: "Just Release Already",
  fn() {
    assertEquals(1 + 1, 2);
  },
});
