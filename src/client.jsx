import { StoreOverlay, StoreSettingsTab } from "./components.jsx";
import { StoreDialogController } from "./controller.js";
import { NS, en, zh } from "./locales.js";
import { installStyles } from "./styles.js";

export const inject = ["slots", "locale", "sessions"];

export function apply(ctx) {
  const dialogController = new StoreDialogController();
  const t = ctx.locale.bind(NS);

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dshmarketplace: locales");
  ctx.effect(() => installStyles(), "dshmarketplace: styles");

  // `/store` on the host side resolves to success; that is the signal to open.
  ctx.on("command/executed", (_sessionId, commandName, result) => {
    if (commandName === "store" && result.kind === "success") {
      dialogController.open(result.query ?? "");
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
