// The part of Buzz's plugin API this plugin uses, trimmed from block/buzz-app
// (src/plugins/author.ts, src/features/{host,pages,settings}/service.ts at c2210b45).
// Block ships the full types as a preview package built from its own repository; this
// copy keeps the build reproducible from this repository alone. Update it with the
// host it was written against.
import type * as ReactNamespace from "react";

export type HostRequest = Readonly<{
  url: string;
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Readonly<Record<string, string>>;
  body?: string;
}>;

export type HostResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}>;

export type Host = {
  request(input: HostRequest): Promise<HostResponse>;
  /** Runs a command the manifest declares, with the program and arguments it fixes; `null` is any failure. */
  runCommand(id: string, input?: string): Promise<string | null>;
};

export type PageProps = Readonly<Record<string, unknown>>;

export type Page = Readonly<{
  id: string;
  title: string;
  component: ReactNamespace.ComponentType<PageProps>;
  layout?: "document" | "workspace";
  primary?: boolean;
  placement?: "sidebar" | "topbar" | "toolbar";
  /** A `data:image/<subtype>;...,<payload>` URL. */
  icon?: string;
}>;

export type SettingsCard = Readonly<{
  id: string;
  title: string;
  group?: string;
  component: ReactNamespace.ComponentType<{ active(): boolean }>;
}>;

/** The part of a relay session the hand-off uses (src/features/relay/{contracts,session,messages}.ts). */
export type ChannelSummary = Readonly<{
  id: string;
  name: string;
  channelType?: "stream" | "forum" | "dm" | "solo" | "system";
  archived?: true;
  readOnly?: true;
  hidden?: true;
  huddle?: true;
  members?: readonly string[];
}>;

export type Profile = Readonly<{ name: string; isAgent?: true }>;

export type RelaySession = {
  channels: {
    list(): Readonly<{ status: string; channels: readonly ChannelSummary[] }>;
    subscribeList(listener: () => void): () => void;
    ensureList(): void;
  };
  profiles: {
    snapshot(): ReadonlyMap<string, Profile>;
    subscribe(listener: () => void): () => void;
    ensure(pubkeys: readonly string[], priority?: "background"): Promise<void>;
  };
  channelWrites: { refreshMembership(channelId: string): Promise<ChannelSummary> };
  /** Queues a kind 9 message in the host's outbox, signed as the viewer; returns its id. */
  messages: { send(channelId: string, content: string, mentions?: readonly string[]): string };
};

export type RelaySnapshot = Readonly<{
  status: "disconnected" | "connecting" | "ready" | "error";
  generation: number;
  origin?: string;
  viewer?: string;
  session: RelaySession;
}>;

export type Relay = { snapshot(): RelaySnapshot; subscribe(listener: () => void): () => void };

export type OpenTarget =
  | { version: 1; kind: "settings"; section?: string }
  | {
      version: 1;
      kind: "conversation";
      scope: { viewer: string; communityOrigin: string };
      channelId: string;
      messageId?: string;
    };

export type Context = {
  react: typeof ReactNamespace;
  host: Host;
  relay: Relay;
  navigation: { open(target: OpenTarget): Promise<unknown> };
  pages: { register(page: Page): void };
  settingsCards: { register(card: SettingsCard): void };
  /** Runs `setup` now and its returned cleanup when the plugin's scope ends. */
  effect(setup: () => () => void): void;
};

// The classic JSX transform names the factory `React`, which here is a value, not the
// namespace TypeScript looks the JSX types up in. Point it at @types/react's.
declare global {
  namespace JSX {
    type Element = ReactNamespace.JSX.Element;
    type ElementClass = ReactNamespace.JSX.ElementClass;
    type LibraryManagedAttributes<C, P> = ReactNamespace.JSX.LibraryManagedAttributes<C, P>;
    interface ElementAttributesProperty extends ReactNamespace.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends ReactNamespace.JSX.ElementChildrenAttribute {}
    interface IntrinsicAttributes extends ReactNamespace.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends ReactNamespace.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends ReactNamespace.JSX.IntrinsicElements {}
  }
}
