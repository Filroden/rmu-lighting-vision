import { toggleLightingEngine } from "./migration.js";

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

    // Toggle to enable or disable the automated RMU lighting calculations
    game.settings.register("rmu-lighting-vision", "enableLightingEngine", {
        name: "rmu.settings.enableEngine.name",
        hint: "rmu.settings.enableEngine.hint",
        scope: "world", // Only the GM can change this
        config: true,
        type: Boolean,
        default: true,
        onChange: (value) => {
            // Trigger the world sweep whenever the GM toggles this setting
            toggleLightingEngine(value);
        },
    });
}
