// Hand a Linear issue to someone in a Buzz channel (an agent such as Hermes, usually): what the message says, who can be picked,
// and what is remembered between issues. Pure, so the unit tests cover it without a host.
import type { ChannelSummary, Profile } from "./buzz";
import type { Issue } from "./linear/types";

export const DESCRIPTION_LIMIT = 1500;
const STORAGE_KEY = "megatech.linear.handoff.v1";

export type Candidate = { pubkey: string; name: string; agent: boolean };
export type Remembered = { channelId?: string; pubkey?: string };

/** Channels a message can be sent to: ordinary conversations the viewer can write in. */
export function writableChannels(channels: readonly ChannelSummary[]): ChannelSummary[] {
  return channels
    .filter(
      (c) =>
        !c.archived &&
        !c.readOnly &&
        !c.hidden &&
        !c.huddle &&
        (c.channelType === undefined || c.channelType === "stream" || c.channelType === "solo"),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone in the channel but the viewer, agents first. Names come from profiles; an unknown one shows a short key. */
export function candidates(
  channel: ChannelSummary | undefined,
  viewer: string | undefined,
  profiles: ReadonlyMap<string, Profile>,
): Candidate[] {
  return [...new Set(channel?.members ?? [])]
    .filter((pubkey) => pubkey !== viewer)
    .map((pubkey) => {
      const profile = profiles.get(pubkey);
      return { pubkey, name: profile?.name || `${pubkey.slice(0, 8)}…`, agent: profile?.isAgent === true };
    })
    .sort((a, b) => Number(b.agent) - Number(a.agent) || a.name.localeCompare(b.name));
}

/** The remembered pick if still there, else someone called Hermes, else the first agent, else nobody. */
export function defaultCandidate(list: readonly Candidate[], remembered: string | undefined): Candidate | undefined {
  return (
    list.find((c) => c.pubkey === remembered) ??
    list.find((c) => /\bhermes\b/i.test(c.name)) ??
    list.find((c) => c.agent)
  );
}

/** The remembered channel if still writable, else the first one with someone called Hermes in it, else the first. */
export function defaultChannel(
  channels: readonly ChannelSummary[],
  remembered: string | undefined,
  profiles: ReadonlyMap<string, Profile>,
): ChannelSummary | undefined {
  return (
    channels.find((c) => c.id === remembered) ??
    channels.find((c) => c.members?.some((pubkey) => /\bhermes\b/i.test(profiles.get(pubkey)?.name ?? ""))) ??
    channels[0]
  );
}

/** A Markdown link label: brackets and backslashes escaped, one line. */
function label(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\\[\]]/g, "\\$&");
}

/**
 * The message. The recipient is notified by the mention tag the host adds, not by the `@name` text, which is only there to
 * read well. The description is quoted (it is what someone wrote in Linear, not an instruction) and cut at DESCRIPTION_LIMIT;
 * the link is how an agent with Linear access reads the rest.
 */
export function compose(
  issue: Pick<Issue, "identifier" | "title" | "url" | "priority">,
  details: { state?: string | undefined; description?: string | undefined },
  recipient: string,
): string {
  const facts = [details.state, ["", "Urgent", "High", "Medium", "Low"][issue.priority] || undefined]
    .filter(Boolean)
    .join(" · ");
  const lines = [
    `@${recipient} Grill & build: [${label(`${issue.identifier} ${issue.title}`)}](${issue.url})${facts ? ` (${facts})` : ""}`,
    "",
    "Read the issue in Linear, with its comments and sub-issues. Grill me first: ask the questions that decide scope, behaviour and architecture, a few at a time, until the plan is locked. Then build it in a fresh worktree, open a draft PR that links the issue, and report back here.",
  ];
  const description = details.description?.trim();
  if (description) {
    const cut =
      description.length > DESCRIPTION_LIMIT ? `${description.slice(0, DESCRIPTION_LIMIT).trimEnd()}…` : description;
    lines.push("", ...cut.split("\n").map((line) => `> ${line}`.trimEnd()));
  }
  return lines.join("\n");
}

export function readRemembered(storage: Pick<Storage, "getItem">): Remembered {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object") return {};
    const { channelId, pubkey } = value as Record<string, unknown>;
    return {
      ...(typeof channelId === "string" ? { channelId } : {}),
      ...(typeof pubkey === "string" && /^[0-9a-f]{64}$/.test(pubkey) ? { pubkey } : {}),
    };
  } catch {
    return {};
  }
}

export function writeRemembered(storage: Pick<Storage, "setItem">, value: Remembered): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A full or blocked storage only loses the remembered pick.
  }
}
