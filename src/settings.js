/**
 * ============================================================================
 * MODULE DATABASE & SETTINGS REGISTRATION
 * ============================================================================
 * This script registers all custom data flags with the Foundry VTT database.
 * It defines both the public UI settings (visible in the core settings menu)
 * and the hidden system variables (used to track migration states or store
 * complex JSON mappings).
 * ============================================================================
 */

import { performWorldSweep, RMUConfigApp } from "./migration.js";

/**
 * Registers all module settings during the 'init' hook.
 */
export function registerSettings() {
    // ------------------------------------------------------------------------
    // PUBLIC SETTINGS (config: true)
    // These appear directly in Foundry's core "Configure Settings" menu.
    // ------------------------------------------------------------------------

    // Magical Light Degradation Toggle
    game.settings.register("rmu-lighting-vision", "magicalLightDegrades", {
        name: "rmu.settings.magicalLightDegrades.name",
        hint: "rmu.settings.magicalLightDegrades.hint",
        scope: "world", // Forces this setting to apply to all players in the campaign
        config: true, // Generates a native checkbox in the Foundry UI
        type: Boolean,
        default: false, // Default: Magical light acts as a strict spotlight with no falloff
        onChange: async () => {
            // If the GM changes this setting while the module is active, instantly sweep
            // the world database to recalculate the radii of all magical light sources.
            if (game.settings.get("rmu-lighting-vision", "enableLightingEngine")) {
                await performWorldSweep(true);
            }
        },
    });

    // ------------------------------------------------------------------------
    // HIDDEN SYSTEM VARIABLES (config: false)
    // These do not appear in the core UI. They are managed programmatically
    // by the module's custom interfaces or migration scripts.
    // ------------------------------------------------------------------------

    // The Custom Visual Mapping JSON Object
    // Stores the GM's configuration from Tab 1 and Tab 2 of the RMU Configuration Panel.
    game.settings.register("rmu-lighting-vision", "customMapping", {
        scope: "world",
        config: false,
        type: Object,
        // The default fallback state if the GM has never opened the Configuration Panel
        default: {
            // Default Canvas Render: Bright, Uneven, Dim = Bright | Shadowy, Dark = Dim | Extremely Dark, Pitch Black = Unlit
            canvas: { 0: "bright", 1: "bright", 2: "bright", 3: "dim", 4: "dim", 5: "off", 6: "off" },
            vision: {
                // Default Basic Vision (Gritty): Dim areas on the canvas appear completely Unlit
                basic: { bright: "bright", dim: "off", off: "off" },
                // Default Nightvision: Dim areas on the canvas appear Dim, rather than Unlit
                nightvision: { bright: "bright", dim: "dim", off: "dim" },
            },
        },
    });

    // The Global Master Switch
    // Tracks whether the GM has applied the RMU rules or restored Foundry defaults.
    game.settings.register("rmu-lighting-vision", "enableLightingEngine", {
        name: "Engine Active",
        scope: "world",
        config: false,
        type: Boolean,
        default: true,
    });

    // The Migration Welcome Flag
    // Tracks if the GM has already seen the one-time welcome dialogue box on first boot.
    game.settings.register("rmu-lighting-vision", "firstBootAddressed", {
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
    });

    // ------------------------------------------------------------------------
    // CUSTOM UI MENUS
    // ------------------------------------------------------------------------

    // Registers the ApplicationV2 Configuration Panel button into the Foundry settings tab.
    game.settings.registerMenu("rmu-lighting-vision", "configurationMenu", {
        name: "rmu.settings.configMenu.name",
        label: "rmu.settings.configMenu.label",
        hint: "rmu.settings.configMenu.hint",
        type: RMUConfigApp, // Links the button directly to your custom ApplicationV2 class
        restricted: true, // Ensures only the Game Master can see and click this button
    });
}
