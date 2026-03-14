import { registerVisionModes } from "./src/config.js";
import { registerSettings } from "./src/settings.js";
import { determineLightingState } from "./src/calculator.js";
import { outputLightingToChat } from "./src/chat.js";
import "./src/ui.js";

/**
 * Primary initialisation hook for the RMU Lighting & Vision module.
 * Bootstraps settings, vision modes, keybindings, and the public API.
 */
Hooks.once("init", async () => {
    console.log("RMU Lighting & Vision | Initialising module");

    // Preload Handlebars templates to ensure instantaneous rendering
    await loadTemplates(["modules/rmu-lighting-vision/templates/light-settings.hbs", "modules/rmu-lighting-vision/templates/chat-message.hbs"]);

    // Register module-specific settings (e.g., magical light degradation toggle)
    registerSettings();

    // Register native Canvas vision modes (Nightvision, Darkvision)
    registerVisionModes();

    // Expose the public API for the RMU system developer to ingest
    const module = game.modules.get("rmu-lighting-vision");
    module.api = {
        /**
         * Analyses the canvas to determine the lighting tier and vision capabilities.
         * @param {TokenDocument} targetToken - The token being observed.
         * @param {TokenDocument} [sourceToken] - The token observing. Defaults to the first controlled token.
         * @returns {Object|null} The environmental lighting state object.
         */
        getLightingState: (targetToken, sourceToken = canvas.tokens.controlled[0]?.document) => {
            if (!sourceToken) {
                console.warn("RMU Lighting & Vision | API requires a valid source token document.");
                return null;
            }
            return determineLightingState(sourceToken, targetToken);
        },
    };

    // Register the hotkey for GMs and players to manually output penalties to chat
    game.keybindings.register("rmu-lighting-vision", "checkTargetLighting", {
        name: "rmu.keybinds.checkLighting.name",
        hint: "rmu.keybinds.checkLighting.hint",
        editable: [{ key: "KeyL", modifiers: [KeyboardManager.MODIFIER_KEYS.SHIFT] }],
        onDown: () => {
            // Ensure exactly one observer and one target are selected for the calculation
            const sourceTokens = canvas.tokens.controlled;
            const targets = Array.from(game.user.targets);

            if (sourceTokens.length !== 1 || targets.length !== 1) {
                ui.notifications.warn(game.i18n.localize("rmu.warnings.selectOneTarget"));
                return true;
            }

            // Extract the documents to pass into our pure mathematical calculator
            const sourceDoc = sourceTokens[0].document;
            const targetDoc = targets[0].document;

            const lightingState = determineLightingState(sourceDoc, targetDoc);
            outputLightingToChat(sourceDoc, targetDoc, lightingState);

            return true;
        },
    });
});
