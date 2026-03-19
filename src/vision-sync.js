import { getActorVisionCapabilities } from "./vision-parser.js";

/**
 * Intercepts token creation to auto-configure native vision modes and ranges based on RMU actor talents.
 * @param {TokenDocument} tokenDoc - The token document being prepared for the canvas.
 */
function autoConfigureTokenVision(tokenDoc) {
    // ESCAPE HATCH: Abort if the GM has disabled the automated engine
    if (!game.settings.get("rmu-lighting-vision", "enableLightingEngine")) return;

    const actor = tokenDoc.actor;
    if (!actor) return;

    // Recalculate and enforce vision modes based on current talents
    const nativeVision = getActorVisionCapabilities(actor);
    let optimalMode = "basic";
    let optimalRange = 0;

    // HIERARCHY: Checks the most powerful vision modes first and checks for combos
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

    // NON-DESTRUCTIVE BACKUP: Save native vision and detection settings
    const originalSight = {
        enabled: tokenDoc.sight?.enabled ?? true,
        visionMode: tokenDoc.sight?.visionMode ?? "basic",
        range: tokenDoc.sight?.range ?? 0,
    };
    const originalDetectionModes = tokenDoc.detectionModes || [];

    // Grab the specific shader slider defaults (tint, contrast, etc.) for the chosen mode
    const modeDefaults = CONFIG.Canvas.visionModes[optimalMode]?.vision?.defaults || {};

    // Inject the optimal settings and the backups into the token's source data
    tokenDoc.updateSource({
        "flags.rmu-lighting-vision.originalSight": originalSight,
        "flags.rmu-lighting-vision.originalDetectionModes": originalDetectionModes,
        sight: {
            enabled: true,
            visionMode: optimalMode,
            range: optimalRange,
            ...modeDefaults, // Spreads the slider settings directly into the token
        },
        detectionModes: nativeVision.detectionModes,
    });
}

Hooks.on("preCreateToken", autoConfigureTokenVision);
