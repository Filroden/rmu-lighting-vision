import { getRadiiForTier } from "./visual-mapping.js";
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
            } else if (isEnabled && rmuFlags.baseIllumination !== undefined && rmuFlags.baseIllumination !== -1) {
                const tier = parseInt(rmuFlags.baseIllumination, 10);
                const isMagical = rmuFlags.isMagical ?? false;
                let targetBright = 0;
                let targetDim = 0;

                if (!isMagical) {
                    const generatedRadii = getRadiiForTier(tier);
                    targetBright = generatedRadii.bright;
                    targetDim = generatedRadii.dim;
                } else {
                    // Retrieve the saved magical radius, falling back to current if it's the first time
                    const currentRadius = light.config?.bright ?? 0; // Use token.light?.bright in the Token loop!
                    const coreRadius = rmuFlags.magicalRadius ?? currentRadius;

                    targetBright = coreRadius;
                    if (!game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
                        targetDim = coreRadius;
                    } else {
                        const boundaryTier = Math.min(tier + 2, 6);
                        targetDim = coreRadius + getRadiiForTier(boundaryTier).dim;
                    }
                }

                ambientUpdates.push({
                    _id: light.id,
                    config: { bright: targetBright, dim: Math.max(targetBright, targetDim) },
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
                } else if (isEnabled && rmuFlags.baseIllumination !== undefined && rmuFlags.baseIllumination !== -1) {
                    const tier = parseInt(rmuFlags.baseIllumination, 10);
                    const isMagical = rmuFlags.isMagical ?? false;
                    let targetBright = 0;
                    let targetDim = 0;

                    if (!isMagical) {
                        const generatedRadii = getRadiiForTier(tier);
                        targetBright = generatedRadii.bright;
                        targetDim = generatedRadii.dim;
                    } else {
                        // Retrieve the saved magical radius, falling back to current if it's the first time
                        const currentRadius = light.config?.bright ?? 0; // Use token.light?.bright in the Token loop!
                        const coreRadius = rmuFlags.magicalRadius ?? currentRadius;

                        targetBright = coreRadius;
                        if (!game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
                            targetDim = coreRadius;
                        } else {
                            const boundaryTier = Math.min(tier + 2, 6);
                            targetDim = coreRadius + getRadiiForTier(boundaryTier).dim;
                        }
                    }

                    tokenPatch.light = { bright: targetBright, dim: Math.max(targetBright, targetDim) };
                    requiresUpdate = true;
                }
            }

            // --- Handle Token Perception (Sight & Detection) ---
            if (!isEnabled) {
                // Restore Sight
                if (rmuFlags?.originalSight) {
                    tokenPatch.sight = rmuFlags.originalSight;
                    requiresUpdate = true;
                }
                // Restore Detection Modes
                if (rmuFlags?.originalDetectionModes !== undefined) {
                    tokenPatch.detectionModes = rmuFlags.originalDetectionModes;
                    requiresUpdate = true;
                }
            } else if (isEnabled && actor) {
                // Recalculate and enforce vision modes based on current talents
                const nativeVision = getActorVisionCapabilities(actor);
                let optimalMode = "basic";
                let optimalRange = 0;

                // HIERARCHY: Checks the most powerful vision modes first
                if (nativeVision.hasDemonSight) {
                    optimalMode = "rmuDemonSight";
                    optimalRange = nativeVision.demonSightRange;
                } else if (nativeVision.hasThermalVision) {
                    optimalMode = "rmuThermal";
                    optimalRange = nativeVision.thermalRange;
                } else if (nativeVision.hasNativeDarkvision) {
                    optimalMode = "darkvision";
                    optimalRange = nativeVision.darkvisionRange;
                } else if (nativeVision.hasNativeNightvision) {
                    optimalMode = "nightvision";
                }

                // Grab and spread the shader defaults
                const modeDefaults = CONFIG.Canvas.visionModes[optimalMode]?.vision?.defaults || {};

                tokenPatch.sight = {
                    enabled: true,
                    visionMode: optimalMode,
                    range: optimalRange,
                    ...modeDefaults,
                };
                tokenPatch.detectionModes = nativeVision.detectionModes;
                requiresUpdate = true;
            }

            if (requiresUpdate) {
                tokenUpdates.push(tokenPatch);
            }
        }

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
