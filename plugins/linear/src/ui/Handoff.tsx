import { React } from "../react";
import type { OpenTarget, Relay, RelaySession } from "../buzz";
import {
  candidates,
  compose,
  defaultCandidate,
  defaultChannel,
  readRemembered,
  writableChannels,
  writeRemembered,
} from "../handoff";
import type { Issue } from "../linear/types";

type Props = {
  relay: Relay;
  open(target: OpenTarget): Promise<unknown>;
  issue: Issue;
  state: string | undefined;
  /** `undefined` while the description is loading; an empty string when there is none or it could not be read. */
  description: string | undefined;
};

/** "Grill & build": posts the issue to a Buzz channel, mentioning the agent (or person) picked, as the viewer. */
export function Handoff(props: Props) {
  const relay = React.useSyncExternalStore(props.relay.subscribe, props.relay.snapshot);
  if (relay.status !== "ready") return <p className="mtl-muted">Grill & build needs a connected Buzz community.</p>;
  return (
    <SessionHandoff
      key={`${relay.origin ?? ""}:${relay.generation}`}
      {...props}
      session={relay.session}
      viewer={relay.viewer}
      origin={relay.origin}
    />
  );
}

function SessionHandoff({
  session,
  viewer,
  origin,
  open,
  issue,
  state,
  description,
}: Props & { session: RelaySession; viewer: string | undefined; origin: string | undefined }) {
  const list = React.useSyncExternalStore(session.channels.subscribeList, session.channels.list);
  const profiles = React.useSyncExternalStore(session.profiles.subscribe, session.profiles.snapshot);
  const remembered = React.useMemo(() => readRemembered(window.localStorage), []);
  const channels = React.useMemo(() => writableChannels(list.channels), [list.channels]);
  const [channelId, setChannelId] = React.useState(remembered.channelId ?? "");
  const [pubkey, setPubkey] = React.useState(remembered.pubkey ?? "");
  const [phase, setPhase] = React.useState<"idle" | "sending" | "error">("idle");
  const [sent, setSent] = React.useState<{ channelId: string; name: string; id: string } | null>(null);
  const alive = React.useRef(true);
  // A second click before React re-renders must not send twice.
  const running = React.useRef(false);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  React.useEffect(() => session.channels.ensureList(), [session]);

  // Names decide the default channel and who is listed, so every member of the listed channels is asked for once.
  // (The list changes with every message's preview; the joined key changes only when the members do.)
  const everyone = [...new Set(channels.flatMap((c) => c.members ?? []))].sort().join(",");
  React.useEffect(() => {
    if (everyone) void session.profiles.ensure(everyone.split(","), "background").catch(() => {});
  }, [session, everyone]);
  const channel = channels.find((c) => c.id === channelId) ?? defaultChannel(channels, remembered.channelId, profiles);

  const people = React.useMemo(() => candidates(channel, viewer, profiles), [channel, viewer, profiles]);
  const recipient = people.find((c) => c.pubkey === pubkey) ?? defaultCandidate(people, remembered.pubkey);
  const busy = phase === "sending";

  async function send() {
    if (!channel || !recipient || running.current || description === undefined) return;
    running.current = true;
    setPhase("sending");
    try {
      // The roster in the list can be stale: ask the relay before mentioning someone who may have left.
      const fresh = await session.channelWrites.refreshMembership(channel.id);
      if (fresh.archived || fresh.readOnly || !fresh.members?.includes(recipient.pubkey)) throw new Error("membership");
      const id = session.messages.send(channel.id, compose(issue, { state, description }, recipient.name), [
        recipient.pubkey,
      ]);
      writeRemembered(window.localStorage, { channelId: channel.id, pubkey: recipient.pubkey });
      if (!alive.current) return;
      setSent({ channelId: channel.id, name: channel.name, id });
      setPhase("idle");
    } catch {
      if (alive.current) setPhase("error");
    } finally {
      running.current = false;
    }
  }

  function openConversation() {
    if (!sent || !viewer || !origin) return;
    void open({
      version: 1,
      kind: "conversation",
      scope: { viewer, communityOrigin: origin },
      channelId: sent.channelId,
      ...(/^[0-9a-f]{64}$/.test(sent.id) ? { messageId: sent.id } : {}),
    }).catch(() => {});
  }

  if (sent)
    return (
      <div className="mtl-handoff" role="status">
        <span>
          Sent to <b>#{sent.name}</b>.
        </span>
        <button type="button" className="mtl-button" onClick={openConversation} disabled={!viewer || !origin}>
          Open conversation
        </button>
      </div>
    );

  if (list.status !== "ready" && channels.length === 0) return <p className="mtl-muted">Loading channels…</p>;
  if (channels.length === 0) return <p className="mtl-muted">No channel you can write in.</p>;

  return (
    <div className="mtl-handoff">
      <div className="mtl-handoff-row">
        <select
          aria-label="Channel"
          className="mtl-select"
          value={channel?.id ?? ""}
          disabled={busy}
          onChange={(event) => {
            setChannelId(event.target.value);
            setPhase("idle");
          }}
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Hand off to"
          className="mtl-select"
          value={recipient?.pubkey ?? ""}
          disabled={busy || people.length === 0}
          onChange={(event) => {
            setPubkey(event.target.value);
            setPhase("idle");
          }}
        >
          {!recipient && <option value="">{people.length ? "Choose who" : "Nobody else here"}</option>}
          {people.map((c) => (
            <option key={c.pubkey} value={c.pubkey}>
              {c.name}
              {c.agent ? " (agent)" : ""}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="mtl-button"
        data-primary
        disabled={!recipient || busy || description === undefined}
        onClick={() => void send()}
        title={recipient ? `Post this issue to #${channel?.name} and mention ${recipient.name}` : undefined}
      >
        {busy ? "Sending…" : `Grill & build${recipient ? ` with ${recipient.name}` : ""}`}
      </button>
      {phase === "error" && (
        <p className="mtl-muted" data-tone="error" role="alert">
          Not sent: the channel or its members changed. Check the channel and try again.
        </p>
      )}
    </div>
  );
}
