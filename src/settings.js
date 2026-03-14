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
}
