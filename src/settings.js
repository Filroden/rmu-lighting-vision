// file: src/settings.js
import { performWorldSweep, RMUConfigApp } from "./migration.js";

export function registerSettings() {
    game.settings.register("rmu-lighting-vision", "magicalLightDegrades", {
        name: "rmu.settings.magicalLightDegrades.name",
        hint: "rmu.settings.magicalLightDegrades.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: async () => {
            if (game.settings.get("rmu-lighting-vision", "enableLightingEngine")) {
                await performWorldSweep(true);
            }
        },
    });

    // The unified JSON object storing all custom mapping logic
    game.settings.register("rmu-lighting-vision", "customMapping", {
        scope: "world",
        config: false,
        type: Object,
        default: {
            canvas: { 0: "bright", 1: "bright", 2: "bright", 3: "dim", 4: "dim", 5: "off", 6: "off" },
            vision: {
                basic: { bright: "bright", dim: "off", off: "off" }, // Default: Gritty
                nightvision: { bright: "bright", dim: "dim", off: "dim" },
            },
        },
    });

    game.settings.register("rmu-lighting-vision", "enableLightingEngine", {
        name: "Engine Active",
        scope: "world",
        config: false,
        type: Boolean,
        default: true,
    });

    // The new unified Configuration Panel
    game.settings.registerMenu("rmu-lighting-vision", "configurationMenu", {
        name: "rmu.settings.configMenu.name",
        label: "rmu.settings.configMenu.label",
        hint: "rmu.settings.configMenu.hint",
        type: RMUConfigApp,
        restricted: true,
    });

    game.settings.register("rmu-lighting-vision", "firstBootAddressed", {
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
    });
}
