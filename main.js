import { registerVisionModes, registerDetectionModes } from "./src/config.js";
import { registerSettings } from "./src/settings.js";
import { determineLightingState } from "./src/calculator.js";
import { outputLightingToChat } from "./src/chat.js";
import { registerVisionSourceOverride } from "./src/rmu-vision-source.js";
import "./src/ui.js";
import "./src/light-sync.js";
import "./src/vision-sync.js";

/**
 * Primary initialisation hook for the RMU Lighting & Vision module.
 * Bootstraps settings, vision modes, keybindings, and the public API.
 */
Hooks.once("init", async () => {
    console.log("RMU Lighting & Vision | Initialising module");

    // Preload Handlebars templates to ensure instantaneous rendering
    await foundry.applications.handlebars.loadTemplates(["modules/rmu-lighting-vision/templates/light-settings.hbs", "modules/rmu-lighting-vision/templates/chat-message.hbs"]);

    // Register module-specific settings (e.g., magical light degradation toggle)
    registerSettings();

    // Register Canvas vision modes
    registerVisionModes();

    // Register Canvas detection modes
    registerDetectionModes();

    // Inject the core overrides
    registerVisionSourceOverride();

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
        editable: [{ key: "KeyL", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT] }],
        onDown: () => {
            const sourceTokens = canvas.tokens.controlled;
            if (sourceTokens.length !== 1) {
                ui.notifications.warn(game.i18n.localize("rmu.warnings.selectOneTarget"));
                return true;
            }

            const sourceDoc = sourceTokens[0].document;
            const targets = Array.from(game.user.targets);

            let targetEntity;
            let targetName = "";

            if (targets.length === 1) {
                // We have a targeted token
                targetEntity = targets[0].document;
                targetName = targetEntity.name;
            } else {
                // Fallback to the current mouse cursor position on the canvas
                const rawMousePos = canvas.mousePosition;
                // Snap to the center of the grid square for accurate measurement
                const snappedPos = canvas.grid.getCenterPoint(rawMousePos);
                targetEntity = snappedPos;
                targetName = `Canvas Point (${Math.round(snappedPos.x)}, ${Math.round(snappedPos.y)})`;
            }

            // Calculate state using our updated, entity-agnostic function
            const lightingState = determineLightingState(sourceDoc, targetEntity);

            // Pass the name as a string so the chat card doesn't crash trying to read '.name' from a coordinate
            outputLightingToChat(sourceDoc, targetName, lightingState);

            return true;
        },
    });
});
