import { getRadiiForTier, getLightMapping } from "./visual-mapping.js";
import { getActorVisionCapabilities } from "./vision-parser.js";

/**
 * Render the Migration Control Panel
 */
export class RMUMigrationMenu extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "rmu-migration-menu",
        window: {
            title: "rmu.migration.title",
            resizable: false,
        },
        position: {
            width: 400,
            height: "auto",
        },
        actions: {
            applyRMU: RMUMigrationMenu._onApplyRMU,
            restoreFoundry: RMUMigrationMenu._onRestoreFoundry,
        },
    };

    static PARTS = {
        form: {
            template: "modules/rmu-lighting-vision/templates/migration-menu.hbs",
        },
    };

    static async _onApplyRMU(event, target) {
        await game.settings.set("rmu-lighting-vision", "enableLightingEngine", true);
        await performWorldSweep(true);
        ui.notifications.info(game.i18n.localize("rmu.migration.appliedSuccess"));
        this.close();
    }

    static async _onRestoreFoundry(event, target) {
        await game.settings.set("rmu-lighting-vision", "enableLightingEngine", false);
        await performWorldSweep(false);
        ui.notifications.info(game.i18n.localize("rmu.migration.restoredSuccess"));
        this.close();
    }
}

/**
 * Sweeps the entire world to enforce or revoke RMU lighting and vision changes.
 * @param {boolean} isEnabled - Whether the engine was just turned on or off.
 */
export async function performWorldSweep(isEnabled) {
    let updatedCount = 0;
    const mapping = getLightMapping(); // Fetch the strict/forgiving setting once

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

                // Calculate Raw Radii
                if (!isMagical) {
                    const generatedRadii = getRadiiForTier(tier);
                    targetBright = generatedRadii.bright;
                    targetDim = generatedRadii.dim;
                } else {
                    const coreRadius = rmuFlags.magicalRadius ?? light.config?.bright ?? 0;
                    targetBright = coreRadius;

                    if (!game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
                        targetDim = coreRadius;
                    } else {
                        const boundaryTier = Math.min(tier + 2, 6);
                        targetDim = coreRadius + getRadiiForTier(boundaryTier).dim;
                    }
                }

                // Apply Light Mapping Strictness
                const radiusCategory = mapping[tier];
                if (radiusCategory === "dim") {
                    targetDim = Math.max(targetBright, targetDim);
                    targetBright = 0;
                } else if (radiusCategory === "off") {
                    targetBright = 0;
                    targetDim = 0;
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

                    // Calculate Raw Radii
                    if (!isMagical) {
                        const generatedRadii = getRadiiForTier(tier);
                        targetBright = generatedRadii.bright;
                        targetDim = generatedRadii.dim;
                    } else {
                        // FIXED BUG: Changed `light.config` to `token.light` to prevent ReferenceError
                        const coreRadius = rmuFlags.magicalRadius ?? token.light?.bright ?? 0;
                        targetBright = coreRadius;

                        if (!game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
                            targetDim = coreRadius;
                        } else {
                            const boundaryTier = Math.min(tier + 2, 6);
                            targetDim = coreRadius + getRadiiForTier(boundaryTier).dim;
                        }
                    }

                    // Apply Light Mapping Strictness
                    const radiusCategory = mapping[tier];
                    if (radiusCategory === "dim") {
                        targetDim = Math.max(targetBright, targetDim);
                        targetBright = 0;
                    } else if (radiusCategory === "off") {
                        targetBright = 0;
                        targetDim = 0;
                    }

                    tokenPatch.light = { bright: targetBright, dim: Math.max(targetBright, targetDim) };
                    requiresUpdate = true;
                }
            }

            // --- Handle Token Perception (Sight & Detection) ---
            if (!isEnabled) {
                if (rmuFlags?.originalSight) {
                    tokenPatch.sight = rmuFlags.originalSight;
                    requiresUpdate = true;
                }
                if (rmuFlags?.originalDetectionModes !== undefined) {
                    tokenPatch.detectionModes = rmuFlags.originalDetectionModes;
                    requiresUpdate = true;
                }
            } else if (isEnabled && actor) {
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

        // Execute updates for the current scene
        if (ambientUpdates.length > 0) {
            await scene.updateEmbeddedDocuments("AmbientLight", ambientUpdates);
            updatedCount += ambientUpdates.length;
        }
        if (tokenUpdates.length > 0) {
            await scene.updateEmbeddedDocuments("Token", tokenUpdates);
            updatedCount += tokenUpdates.length;
        }
    }
}
