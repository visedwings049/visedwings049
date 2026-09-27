import assert from "node:assert/strict";
import { test } from "node:test";
import { matchNext } from "../matcher.js";
import { parseNotes } from "../parser.js";

test("parseNotes extracts plain and prompt-override phrases in order", () => {
  const notes = "In the beginning there was [[chaos]], then [[peace|a dove over still water]] came.";
  const { segments, phrases } = parseNotes(notes);
  assert.equal(phrases.length, 2);
  assert.equal(phrases[0].phrase, "chaos");
  assert.equal(phrases[0].promptOverride, undefined);
  assert.equal(phrases[1].phrase, "peace");
  assert.equal(phrases[1].promptOverride, "a dove over still water");
  assert.equal(
    segments.map((s) => s.type).join(","),
    "text,keyword,text,keyword,text"
  );
});

test("matchNext only fires on the next expected keyword within lookahead", () => {
  const keywords = [
    { id: "a", phrase: "chaos", aliases: [] },
    { id: "b", phrase: "peace", aliases: ["shalom"] },
    { id: "c", phrase: "hope", aliases: [] },
  ];
  assert.equal(matchNext("there was total hope in the room", keywords, 0, 0), null);
  const hit = matchNext("there was total hope in the room", keywords, 0, 2);
  assert.equal(hit?.index, 2);
  const aliasHit = matchNext("we found shalom today", keywords, 1);
  assert.equal(aliasHit?.keywordId, "b");
});

test("matchNext does not match substrings across word boundaries", () => {
  const keywords = [{ id: "a", phrase: "peace", aliases: [] }];
  assert.equal(matchNext("masterpeace is not a match", keywords, 0), null);
  assert.notEqual(matchNext("we need peace now", keywords, 0), null);
});
