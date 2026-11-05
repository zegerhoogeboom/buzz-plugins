import { describe, expect, test } from "vitest";
import type { ChannelSummary, Profile } from "../../src/buzz";
import {
  DESCRIPTION_LIMIT,
  candidates,
  compose,
  defaultCandidate,
  defaultChannel,
  readRemembered,
  writableChannels,
  writeRemembered,
} from "../../src/handoff";

const key = (c: string) => c.repeat(64);
const VIEWER = key("a");
const HERMES = key("b");
const CLAUDE = key("c");
const TIM = key("d");

const issue = { identifier: "COR-12", title: "Export [beta] lists", url: "https://linear.app/coreties/issue/COR-12/x", priority: 2 as const };

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("Grill & build: where it can go", () => {
  test("only channels the viewer can write in, by name", () => {
    const list: ChannelSummary[] = [
      { id: "1", name: "zeta" },
      { id: "2", name: "alpha", channelType: "stream" },
      { id: "3", name: "old", archived: true },
      { id: "4", name: "preview", readOnly: true },
      { id: "5", name: "dm", channelType: "dm", hidden: true },
      { id: "6", name: "forum", channelType: "forum" },
      { id: "7", name: "room", huddle: true },
      { id: "8", name: "solo", channelType: "solo" },
    ];
    expect(writableChannels(list).map((c) => c.name)).toEqual(["alpha", "solo", "zeta"]);
  });

  test("everyone in the channel but the viewer, agents first; an unknown profile shows a short key", () => {
    const profiles = new Map<string, Profile>([
      [HERMES, { name: "Hermes" }],
      [CLAUDE, { name: "Claude", isAgent: true }],
      [VIEWER, { name: "Zeger" }],
    ]);
    const channel: ChannelSummary = { id: "1", name: "general", members: [VIEWER, TIM, HERMES, CLAUDE, HERMES] };
    expect(candidates(channel, VIEWER, profiles)).toEqual([
      { pubkey: CLAUDE, name: "Claude", agent: true },
      { pubkey: TIM, name: "dddddddd…", agent: false },
      { pubkey: HERMES, name: "Hermes", agent: false },
    ]);
    expect(candidates(undefined, VIEWER, profiles)).toEqual([]);
  });

  test("the default is the remembered pick, else Hermes, else the first agent, else nobody", () => {
    const list = [
      { pubkey: CLAUDE, name: "Claude", agent: true },
      { pubkey: HERMES, name: "Hermes", agent: false },
      { pubkey: TIM, name: "Tim", agent: false },
    ];
    expect(defaultCandidate(list, TIM)?.pubkey).toBe(TIM);
    expect(defaultCandidate(list, key("e"))?.pubkey).toBe(HERMES);
    expect(defaultCandidate(list.filter((c) => c.pubkey !== HERMES), undefined)?.pubkey).toBe(CLAUDE);
    expect(defaultCandidate([{ pubkey: TIM, name: "Tim", agent: false }], undefined)).toBeUndefined();
  });
});

describe("Grill & build: the message", () => {
  test("names the recipient, links the issue with an escaped label, and asks for grill first, then a draft PR", () => {
    const text = compose(issue, { state: "Todo", description: "" }, "Hermes");
    const [first, blank, ask, ...rest] = text.split("\n");
    expect(first).toBe(
      "@Hermes Grill & build: [COR-12 Export \\[beta\\] lists](https://linear.app/coreties/issue/COR-12/x) (Todo · High)",
    );
    expect(blank).toBe("");
    expect(ask).toMatch(/^Read the issue in Linear.*Grill me first.*draft PR/);
    expect(rest).toEqual([]);
  });

  test("leaves out what it does not know", () => {
    expect(compose({ ...issue, priority: 0 }, {}, "Hermes").split("\n")[0]).toBe(
      "@Hermes Grill & build: [COR-12 Export \\[beta\\] lists](https://linear.app/coreties/issue/COR-12/x)",
    );
  });

  test("quotes the description line by line and cuts a long one", () => {
    expect(compose(issue, { description: "One\n\nTwo  " }, "Hermes").split("\n").slice(3)).toEqual(["", "> One", ">", "> Two"]);
    const long = compose(issue, { description: "x".repeat(DESCRIPTION_LIMIT + 50) }, "Hermes");
    expect(long.endsWith(`> ${"x".repeat(DESCRIPTION_LIMIT)}…`)).toBe(true);
  });
});

describe("Grill & build: what is remembered", () => {
  test("round-trips the channel and the pick", () => {
    const storage = memory();
    writeRemembered(storage, { channelId: "chan", pubkey: HERMES });
    expect(readRemembered(storage)).toEqual({ channelId: "chan", pubkey: HERMES });
  });

  test("ignores anything malformed", () => {
    expect(readRemembered(memory({ "megatech.linear.handoff.v1": "not json" }))).toEqual({});
    expect(readRemembered(memory({ "megatech.linear.handoff.v1": "null" }))).toEqual({});
    expect(readRemembered(memory({ "megatech.linear.handoff.v1": '{"channelId":3,"pubkey":"nope"}' }))).toEqual({});
  });

  test("a storage that refuses to write is not an error", () => {
    expect(() =>
      writeRemembered(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        { channelId: "x" },
      ),
    ).not.toThrow();
  });
});

describe("Grill & build: the default channel", () => {
  const profiles = new Map<string, Profile>([[HERMES, { name: "Hermes" }]]);
  const channels: ChannelSummary[] = [
    { id: "eng", name: "eng", members: [VIEWER, CLAUDE] },
    { id: "gen", name: "general", members: [VIEWER, HERMES] },
  ];
  test("the remembered one, else the first with Hermes in it, else the first", () => {
    expect(defaultChannel(channels, "eng", profiles)?.id).toBe("eng");
    expect(defaultChannel(channels, "gone", profiles)?.id).toBe("gen");
    expect(defaultChannel(channels, undefined, new Map())?.id).toBe("eng");
    expect(defaultChannel([], undefined, profiles)).toBeUndefined();
  });
});
