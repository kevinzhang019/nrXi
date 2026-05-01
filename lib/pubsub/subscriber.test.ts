import { describe, expect, it } from "vitest";
import { parseSubscribeLine } from "./subscriber";

const sampleState = {
  gamePk: 12345,
  status: "Live",
  inning: 5,
  half: "Top",
};

describe("parseSubscribeLine", () => {
  it("parses a message line into the JSON payload", () => {
    const line = `data: message,nrxi:games,${JSON.stringify(sampleState)}`;
    expect(parseSubscribeLine(line)).toMatchObject(sampleState);
  });

  it("preserves commas and braces inside the JSON payload", () => {
    const stateWithCommas = {
      gamePk: 99,
      lineups: { away: [1, 2, 3], home: [4, 5, 6] },
      note: "pitch, swing, miss",
    };
    const line = `data: message,nrxi:games,${JSON.stringify(stateWithCommas)}`;
    expect(parseSubscribeLine(line)).toMatchObject(stateWithCommas);
  });

  it("ignores subscribe confirmation lines", () => {
    expect(parseSubscribeLine("data: subscribe,nrxi:games,1")).toBeNull();
  });

  it("ignores blank, comment, and non-data lines", () => {
    expect(parseSubscribeLine("")).toBeNull();
    expect(parseSubscribeLine(": ping")).toBeNull();
    expect(parseSubscribeLine("event: error")).toBeNull();
  });

  it("returns null on malformed JSON payload rather than throwing", () => {
    expect(parseSubscribeLine("data: message,nrxi:games,{not json")).toBeNull();
  });

  it("tolerates `data:` with no leading space", () => {
    const line = `data:message,nrxi:games,${JSON.stringify(sampleState)}`;
    expect(parseSubscribeLine(line)).toMatchObject(sampleState);
  });

  it("ignores lines with too few fields", () => {
    expect(parseSubscribeLine("data: message,nrxi:games")).toBeNull();
    expect(parseSubscribeLine("data: message")).toBeNull();
  });
});
