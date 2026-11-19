import { describe, expect, test } from "bun:test";
import { takeKeyboard } from "../src/bot";
import { miniAppLink } from "../src/links";

const urls = (kb: ReturnType<typeof takeKeyboard>) => kb.inline_keyboard.flat().map((b) => ("url" in b ? b.url : ""));

describe("take buttons", () => {
  test("without a Mini App they go through the bot's /go and the browser", () => {
    expect(urls(takeKeyboard("https://bot.x", "AbC_12-xyz", 101, "https://play.x"))).toEqual(["https://bot.x/go/AbC_12-xyz?side=yes", "https://bot.x/go/AbC_12-xyz?side=no", "https://play.x/m/101"]);
  });
  test("with a Mini App they open Terrace inside Telegram, in a half-height sheet", () => {
    expect(urls(takeKeyboard("https://bot.x", "AbC_12-xyz", 101, "https://play.x", "https://t.me/TerraceSocialBot/play"))).toEqual([
      "https://t.me/TerraceSocialBot/play?startapp=yAbC_12-xyz&mode=compact",
      "https://t.me/TerraceSocialBot/play?startapp=nAbC_12-xyz&mode=compact",
      "https://t.me/TerraceSocialBot/play?startapp=m101&mode=compact",
    ]);
  });
  test("start params stay inside Telegram's allowed characters", () => {
    expect(new URL(miniAppLink("https://t.me/b/a", "yAbC_12-xyz")).searchParams.get("startapp")).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});
