import { performWorldSweep, RMUMigrationMenu } from "./migration.js";

/**
 * Registers all module-specific settings in the Foundry VTT settings menu.
 * This should be called during the 'init' hook.
 */
export function registerSettings() {
    // Toggle for whether magical light degrades over distance like natural light
    game.settings.register("rmu-lighting-vision", "magicalLightDegrades", {
        name: "rmu.settings.magicalLightDegrades.name",
        hint: "rmu.settings.magicalLightDegrades.hint",
        scope: "world", // Only the GM can alter this setting
        config: true, // Expose this setting in the UI
        type: Boolean,
        default: false, // Defaulting to false (magic doesn't degrade) until the official ruling
    });

    // Setting 1: How RMU Light Tiers map to Foundry Light Radii
    game.settings.register("rmu-lighting-vision", "lightMapping", {
        name: "rmu.settings.lightMapping.name",
        hint: "rmu.settings.lightMapping.hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
            forgiving: "rmu.settings.lightMapping.forgiving",
            strict: "rmu.settings.lightMapping.strict",
        },
        default: "forgiving",
        requiresReload: true,
        onChange: async () => {
            const isEnabled = game.settings.get("rmu-lighting-vision", "enableLightingEngine");
            if (isEnabled) {
                await performWorldSweep(true);
            }
        },
    });

    // Setting 2: How Vision Modes perceive the environment
    game.settings.register("rmu-lighting-vision", "visionStrictness", {
        name: "rmu.settings.visionStrictness.name",
        hint: "rmu.settings.visionStrictness.hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
            standard: "rmu.settings.visionStrictness.standard", // Shadowy/Dark -> Dim
            gritty: "rmu.settings.visionStrictness.gritty", // Shadowy/Dark -> Unlit
        },
        default: "gritty",
        requiresReload: true,
    });

    // 1. Hidden State Tracker
    game.settings.register("rmu-lighting-vision", "enableLightingEngine", {
        name: "Engine Active",
        scope: "world",
        config: false, // Hides it from the UI completely
        type: Boolean,
        default: true,
    });

    // 2. Migration Menu Button
    game.settings.registerMenu("rmu-lighting-vision", "migrationMenu", {
        name: "rmu.settings.migrationMenu.name",
        label: "rmu.settings.migrationMenu.label",
        hint: "rmu.settings.migrationMenu.hint",
        icon: "fas fa-exchange-alt",
        type: RMUMigrationMenu, // Links to FormApplication in migration.js
        restricted: true, // GM only
    });
}
