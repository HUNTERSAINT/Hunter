import type { ChatInputCommandInteraction } from "discord.js";

export type Values = Record<string, string | number | boolean | { id: string }>;

export type CommandSpec = {
  commandName: string;
  group?: string;
  sub?: string;
  values?: Values;
};

/**
 * Wraps a button, modal or menu interaction so an existing slash command can run on it unchanged.
 * Everything (reply, defer, user, guild...) passes through to the real interaction. Only `options`
 * is replaced, answering from the values collected through forms and menus.
 */
export function asCommandInteraction(source: object, spec: CommandSpec): ChatInputCommandInteraction {
  const values = spec.values ?? {};
  const read = (name: string) => {
    const value = values[name];
    return value === undefined || value === "" ? null : value;
  };

  const options = {
    getString(name: string, required?: boolean): string | null {
      const value = read(name);
      if (value === null) {
        if (required) throw new Error(`Missing option: ${name}`);
        return null;
      }
      return typeof value === "object" ? value.id : String(value);
    },
    getBoolean(name: string, required?: boolean): boolean | null {
      const value = read(name);
      if (typeof value === "boolean") return value;
      if (required) throw new Error(`Missing option: ${name}`);
      return null;
    },
    getInteger(name: string, required?: boolean): number | null {
      const value = read(name);
      const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (Number.isInteger(number)) return number;
      if (required) throw new Error(`Missing option: ${name}`);
      return null;
    },
    getChannel(name: string, required?: boolean): { id: string } | null {
      const value = read(name);
      if (value === null) {
        if (required) throw new Error(`Missing option: ${name}`);
        return null;
      }
      return { id: typeof value === "object" ? value.id : String(value) };
    },
    getSubcommand(): string {
      if (!spec.sub) throw new Error("No subcommand");
      return spec.sub;
    },
    getSubcommandGroup(): string | null {
      return spec.group ?? null;
    },
  };

  return new Proxy(source, {
    get(target, prop) {
      if (prop === "options") return options;
      if (prop === "commandName") return spec.commandName;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as ChatInputCommandInteraction;
}
