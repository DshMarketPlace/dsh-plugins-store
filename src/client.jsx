import { StoreOverlay, StoreSettingsTab } from "./components.jsx";
import { StoreDialogController } from "./controller.js";
import { NS, en, zh } from "./locales.js";
import { resolveStoreOpen } from "./shared.js";
import { installStyles } from "./styles.js";

export const inject = ["slots", "locale", "sessions"];

export function apply(ctx) {
  const dialogController = new StoreDialogController();
  const t = ctx.locale.bind(NS);

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dshmarketplace: locales");
  ctx.effect(() => installStyles(), "dshmarketplace: styles");

  // `/store` on the host side resolves to success; that is the signal to open.
  // This runs inside a host event: a throw here can escape into the runtime and
  // crash tool dispatch for the whole session (some DSH builds do not contain a
  // failing `command/executed` listener). Keep the body total — never throw.
  ctx.on("command/executed", (_sessionId, commandName, result) => {
    try {
      const { open, query } = resolveStoreOpen(commandName, result);
      if (open) dialogController.open(query);
    } catch (err) {
      console.error("dshmarketplace: command/executed handler failed", err);
    }
  });

  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      {
        name: "shell.overlay",
        id: "dshmarketplace-dialog",
        order: 40,
        locale: NS,
        inject: () => ({ dialogController, t, localeService: ctx.locale }),
      },
      StoreOverlay,
    ),
  );

  ctx.slots.inject("settings.plugins.tab", () =>
    ctx.slots.register(
      {
        name: "settings.plugins.tab",
        id: "dshmarketplace",
        order: 20,
        label: () => t("settings.tab"),
        locale: NS,
        inject: () => ({ t, localeService: ctx.locale }),
      },
      StoreSettingsTab,
    ),
  );
}
