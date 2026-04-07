/**
 * ============================================================================
 * TOKEN CREATION SYNCHRONISATION (V14 READY)
 * ============================================================================
 * This script intercepts the exact moment a Game Master drags an actor from
 * the sidebar onto the canvas. It parses the actor's character sheet and
 * automatically configures their token's vision and detection modes before
 * the token is physically created in the database.
 * ============================================================================
 */

import { getActorVisionCapabilities } from "./vision-parser.js";

/**
 * Intercepts token creation to auto-configure native vision modes and ranges
 * based on RMU actor talents.
 * @param {TokenDocument} tokenDoc - The token document being prepared for the canvas.
 */
function autoConfigureTokenVision(tokenDoc) {
    // ESCAPE HATCH: Abort if the GM has disabled the automated engine via module settings.
    if (!game.settings.get("rmu-lighting-vision", "enableLightingEngine")) return;

    const actor = tokenDoc.actor;
    if (!actor) return;

    // Recalculate and enforce vision modes based on the actor's current talents.
    // This calls our parser to translate narrative text into mechanical data.
    const nativeVision = getActorVisionCapabilities(actor);
    let optimalMode = "basic";
    let optimalRange = 0;

    // --- VISION HIERARCHY RESOLUTION ---
    // A character might possess multiple vision talents. We must determine the
    // single most powerful WebGL shader to apply to their vision mask.
    // We also check for synergistic combinations (e.g., Thermal + Nightvision).
    if (nativeVision.hasDemonSight) {
        optimalMode = "rmuDemonSight";
        optimalRange = nativeVision.demonSightRange;
    } else if (nativeVision.hasThermalVision) {
        optimalMode = nativeVision.hasNativeNightvision ? "rmuThermalNight" : "rmuThermal";
        optimalRange = nativeVision.thermalRange;
    } else if (nativeVision.hasNativeDarkvision) {
        optimalMode = nativeVision.hasNativeNightvision ? "darkvisionNight" : "darkvision";
        optimalRange = nativeVision.darkvisionRange;
    } else if (nativeVision.hasNativeNightvision) {
        optimalMode = "nightvision";
    }

    // --- NON-DESTRUCTIVE BACKUP ---
    // Before we overwrite the token's sight, we save its original Foundry settings.
    // This ensures that if the GM ever disables the module and runs a world sweep,
    // the tokens will gracefully revert to their pre-RMU visual state.
    const originalSight = {
        enabled: tokenDoc.sight?.enabled ?? true,
        visionMode: tokenDoc.sight?.visionMode ?? "basic",
        range: tokenDoc.sight?.range ?? 0,
    };

    // Backup must be a Dictionary object, not an Array
    const originalDetectionModes = tokenDoc.detectionModes || {};

    // Extract the specific shader slider defaults (colour tint, contrast, etc.)
    // that we defined in config.js for the chosen vision mode.
    const modeDefaults = CONFIG.Canvas.visionModes[optimalMode]?.vision?.defaults || {};

    // Assemble the mandatory core detection dictionary alongside our custom parsed modes
    const finalDetectionModes = {
        basicSight: { enabled: true, range: optimalRange },
        lightPerception: { enabled: true, range: null },
        ...nativeVision.detectionModes,
    };

    // --- DATABASE MUTATION ---
    // Because we are in a 'preCreate' hook, we use updateSource() to mutate the
    // document payload directly. This prevents the VTT from writing the token to
    // the database and then immediately firing a secondary update, which would
    // cause the canvas to lag and render twice.
    tokenDoc.updateSource({
        "flags.rmu-lighting-vision.originalSight": originalSight,
        "flags.rmu-lighting-vision.originalDetectionModes": originalDetectionModes,
        sight: {
            enabled: true,
            visionMode: optimalMode,
            range: optimalRange,
            ...modeDefaults, // Spreads the precise slider settings directly into the token's sight data
        },
        detectionModes: finalDetectionModes,
    });
}

// Bind the synchronisation logic to Foundry's core document creation cycle
Hooks.on("preCreateToken", autoConfigureTokenVision);
