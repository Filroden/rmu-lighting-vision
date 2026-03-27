import { registerVisionModes, registerDetectionModes } from "./src/config.js";
import { registerSettings } from "./src/settings.js";
import { determineLightingState } from "./src/calculator.js";
import { outputLightingToChat } from "./src/chat.js";
import { registerVisionSourceOverride } from "./src/rmu-vision-source.js";
import { performWorldSweep } from "./src/migration.js";
import { initHeatmapListener } from "./src/heatmap.js";
import "./src/ui.js";
import "./src/light-sync.js";
import "./src/vision-sync.js";

/**
 * Primary initialisation hook for the RMU Lighting & Vision module.
 * Bootstraps settings, vision modes, keybindings, and exposes the public API.
 */
Hooks.once("init", async () => {
    console.log("RMU Lighting & Vision | Initialising module");

    // Preload Handlebars templates during the init phase.
    // This ensures that when complex UIs (like the Configuration Panel or Chat Cards) are summoned,
    // they render instantaneously without causing the VTT to stutter while fetching files.
    await foundry.applications.handlebars.loadTemplates([
        "modules/rmu-lighting-vision/templates/light-settings.hbs",
        "modules/rmu-lighting-vision/templates/chat-message.hbs",
        "modules/rmu-lighting-vision/templates/rmu-config.hbs",
    ]);

    // Register module-specific settings (e.g., magical light degradation toggles, custom visual mappings)
    registerSettings();

    // Inject custom RMU Vision Modes (e.g., Demon Sight, Thermal) into Foundry's WebGL rendering pipeline
    registerVisionModes();

    // Inject custom RMU Detection Modes (e.g., Life Sense) to draw token outlines through walls
    registerDetectionModes();

    // Apply patches to Foundry's core vision source logic to handle RMU-specific edge cases
    registerVisionSourceOverride();

    // ------------------------------------------------------------------------
    // PUBLIC API EXPOSURE
    // ------------------------------------------------------------------------
    // We attach our API directly to the module instance. This allows the core RMU system
    // (or other macro writers) to ingest our mathematical engine without needing to duplicate code.
    const module = game.modules.get("rmu-lighting-vision");
    module.api = {
        /**
         * Analyses the canvas to determine the exact RMU lighting tier and applied vision penalties.
         * * @param {TokenDocument} targetToken - The token being observed (the target).
         * @param {TokenDocument} [sourceToken] - The token observing (the player character).
         * Defaults to the first currently controlled token if omitted.
         * @returns {Object|null} The environmental lighting state object (tier, distance, line of sight, etc.).
         */
        getLightingState: (targetToken, sourceToken = canvas.tokens.controlled[0]?.document) => {
            if (!sourceToken) {
                console.warn("RMU Lighting & Vision | API requires a valid source token document.");
                return null;
            }
            return determineLightingState(sourceToken, targetToken);
        },
    };

    // ------------------------------------------------------------------------
    // KEYBINDINGS
    // ------------------------------------------------------------------------
    // Registers the Shift + L hotkey to manually output RMU lighting penalties to the chat.
    game.keybindings.register("rmu-lighting-vision", "checkTargetLighting", {
        name: "rmu.keybinds.checkLighting.name",
        hint: "rmu.keybinds.checkLighting.hint",
        editable: [{ key: "KeyL", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT] }],
        onDown: () => {
            // Step 1: Enforce a single observer token to prevent mathematical conflicts.
            const sourceTokens = canvas.tokens.controlled;
            if (sourceTokens.length !== 1) {
                ui.notifications.warn(game.i18n.localize("rmu.warnings.selectOneTarget"));
                return true;
            }

            const sourceDoc = sourceTokens[0].document;
            const targets = Array.from(game.user.targets);

            let targetEntity;
            let targetName = "";

            // Step 2: Determine if the user is checking a physical token or an empty map coordinate.
            if (targets.length === 1) {
                // Scenario A: A physical token is targeted.
                targetEntity = targets[0].document;
                targetName = targetEntity.name;
            } else {
                // Scenario B: No token is targeted. Fallback to the current mouse cursor coordinates.
                const rawMousePos = canvas.mousePosition;

                // Snap the raw mouse coordinates to the absolute centre of the grid square.
                // This prevents rounding errors when calculating distance degradation boundaries.
                const snappedPos = canvas.grid.getCenterPoint(rawMousePos);
                targetEntity = snappedPos;

                // Construct a string name for the UI so the chat card parser does not panic
                // when trying to read a '.name' property from a raw mathematical coordinate.
                targetName = `Canvas Point (${Math.round(snappedPos.x)}, ${Math.round(snappedPos.y)})`;
            }

            // Step 3: Run the entity-agnostic calculator to extract the RMU penalties.
            const lightingState = determineLightingState(sourceDoc, targetEntity);

            // Step 4: Dispatch the results to the chat window.
            outputLightingToChat(sourceDoc, targetName, lightingState);

            return true;
        },
    });
});

/**
 * Secondary initialisation hook. Fires once the canvas and UI are fully mounted.
 * Used for actions that require the DOM or the WebGL canvas to be completely ready.
 */
Hooks.once("ready", async () => {
    // ------------------------------------------------------------------------
    // GM-ONLY DIAGNOSTIC TOOLS
    // ------------------------------------------------------------------------
    // Initialise the Alt + L heatmap tool. Strictly guarded to prevent players
    // from processing heavy geometry or meta-gaming absolute darkness boundaries.
    if (!game.user.isGM) return;
    initHeatmapListener();

    // ------------------------------------------------------------------------
    // MIGRATION & FIRST-BOOT LOGIC
    // ------------------------------------------------------------------------
    // Check if the GM has ever been prompted to apply the RMU lighting rules to this world.
    const firstBootAddressed = game.settings.get("rmu-lighting-vision", "firstBootAddressed");

    if (!firstBootAddressed) {
        // We use the modern ApplicationV2 Dialog pattern here to ensure forward compatibility.
        const { DialogV2 } = foundry.applications.api;

        await DialogV2.confirm({
            window: { title: game.i18n.localize("rmu.migration.welcome.title") },
            content: `
                <div class="rmu-welcome-dialog">
                    <p>${game.i18n.localize("rmu.migration.welcome.p1")}</p>
                    <p>${game.i18n.localize("rmu.migration.welcome.p2")}</p>
                    <p>${game.i18n.localize("rmu.migration.welcome.p3")}</p>
                </div>
            `,
            yes: {
                label: game.i18n.localize("rmu.migration.welcome.yes"),
                callback: async () => {
                    // If accepted, immediately trigger a full world sweep to update all
                    // pre-existing tokens and light sources to the new visual mappings.
                    ui.notifications.info(game.i18n.localize("rmu.migration.inProgress"));
                    await game.settings.set("rmu-lighting-vision", "enableLightingEngine", true);
                    await performWorldSweep(true);

                    // Mark as addressed so the dialogue never appears again.
                    await game.settings.set("rmu-lighting-vision", "firstBootAddressed", true);
                },
            },
            no: {
                label: game.i18n.localize("rmu.migration.welcome.no"),
                callback: async () => {
                    // If declined, simply mark as addressed. The GM can trigger the sweep later
                    // via the RMU Lighting Configuration Panel in module settings.
                    await game.settings.set("rmu-lighting-vision", "firstBootAddressed", true);
                },
            },
        });
    }
});
