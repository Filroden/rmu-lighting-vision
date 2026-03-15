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

    const nativeVision = getActorVisionCapabilities(actor);

    let optimalMode = "basic";
    let optimalRange = 0;

    if (nativeVision.hasNativeDarkvision) {
        optimalMode = "darkvision";
        optimalRange = nativeVision.darkvisionRange;
    } else if (nativeVision.hasNativeNightvision) {
        optimalMode = "nightvision";
    }

    // NON-DESTRUCTIVE BACKUP: Save the prototype token's native vision settings
    const originalSight = {
        enabled: tokenDoc.sight?.enabled ?? true,
        visionMode: tokenDoc.sight?.visionMode ?? "basic",
        range: tokenDoc.sight?.range ?? 0,
    };

    // Inject the optimal vision settings and the backup into the token's source data
    tokenDoc.updateSource({
        "flags.rmu-lighting-vision.originalSight": originalSight,
        sight: {
            enabled: true,
            visionMode: optimalMode,
            range: optimalRange,
        },
    });
}

Hooks.on("preCreateToken", autoConfigureTokenVision);
