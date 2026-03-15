import { RADIUS_MAPPING } from "./light-sync.js";
import { getActorVisionCapabilities } from "./vision-parser.js";

/**
 * Sweeps the world to enforce or revoke RMU lighting and vision changes.
 * @param {boolean} isEnabled - Whether the engine was just turned on or off.
 */
export async function toggleLightingEngine(isEnabled) {
    let updatedCount = 0;

    for (const scene of game.scenes) {
        const ambientUpdates = [];
        const tokenUpdates = [];

        // 1. Process Ambient Lights (Emission Only)
        for (const light of scene.lights) {
            const rmuFlags = light.flags?.["rmu-lighting-vision"];
            if (!rmuFlags) continue;

            if (!isEnabled && rmuFlags.originalRadii) {
                ambientUpdates.push({
                    _id: light.id,
                    config: { bright: rmuFlags.originalRadii.bright, dim: rmuFlags.originalRadii.dim },
                });
            } else if (isEnabled && rmuFlags.baseIllumination !== undefined && RADIUS_MAPPING[rmuFlags.baseIllumination]) {
                const targetRadii = RADIUS_MAPPING[rmuFlags.baseIllumination];
                ambientUpdates.push({
                    _id: light.id,
                    config: { bright: targetRadii.bright, dim: targetRadii.dim },
                });
            }
        }

        // 2. Process Tokens (Emission + Vision)
        for (const token of scene.tokens) {
            const rmuFlags = token.flags?.["rmu-lighting-vision"];
            const actor = token.actor;
            let tokenPatch = { _id: token.id };
            let requiresUpdate = false;

            // --- Handle Token Emission (Light) ---
            if (rmuFlags) {
                if (!isEnabled && rmuFlags.originalRadii) {
                    tokenPatch.light = { bright: rmuFlags.originalRadii.bright, dim: rmuFlags.originalRadii.dim };
                    requiresUpdate = true;
                } else if (isEnabled && rmuFlags.baseIllumination !== undefined && RADIUS_MAPPING[rmuFlags.baseIllumination]) {
                    const targetRadii = RADIUS_MAPPING[rmuFlags.baseIllumination];
                    tokenPatch.light = { bright: targetRadii.bright, dim: targetRadii.dim };
                    requiresUpdate = true;
                }
            }

            // --- Handle Token Perception (Sight) ---
            if (!isEnabled && rmuFlags?.originalSight) {
                tokenPatch.sight = rmuFlags.originalSight;
                requiresUpdate = true;
            } else if (isEnabled && actor) {
                // Recalculate and enforce vision modes based on current talents
                const nativeVision = getActorVisionCapabilities(actor);
                let optimalMode = "basic";
                let optimalRange = 0;

                if (nativeVision.hasNativeDarkvision) {
                    optimalMode = "darkvision";
                    optimalRange = nativeVision.darkvisionRange;
                } else if (nativeVision.hasNativeNightvision) {
                    optimalMode = "nightvision";
                }

                tokenPatch.sight = { enabled: true, visionMode: optimalMode, range: optimalRange };
                requiresUpdate = true;
            }

            if (requiresUpdate) {
                tokenUpdates.push(tokenPatch);
            }
        }

        // Dispatch bulk updates per scene
        if (ambientUpdates.length > 0) {
            await scene.updateEmbeddedDocuments("AmbientLight", ambientUpdates);
            updatedCount += ambientUpdates.length;
        }
        if (tokenUpdates.length > 0) {
            await scene.updateEmbeddedDocuments("Token", tokenUpdates);
            updatedCount += tokenUpdates.length;
        }
    }

    const actionStr = isEnabled ? "Applied RMU rules to" : "Restored native data for";
    ui.notifications.info(`RMU Lighting | World Sweep Complete. ${actionStr} ${updatedCount} sources/tokens.`);
}
