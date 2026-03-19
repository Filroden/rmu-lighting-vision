import { getRadiiForTier, getLightMapping, getMagicalExtension } from "./visual-mapping.js";
import { getActorVisionCapabilities } from "./vision-parser.js";
import { registerVisionModes } from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RMUConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "rmu-config-app",
        classes: ["rmu-lighting-app"],
        window: {
            title: "rmu.settings.configMenu.title",
            resizable: false,
        },
        position: { width: 550, height: "auto" },
        actions: {
            saveMapping: RMUConfigApp._onSaveMapping,
            applyRMU: RMUConfigApp._onApplyRMU,
            restoreFoundry: RMUConfigApp._onRestoreFoundry,
        },
    };

    static PARTS = {
        form: { template: "modules/rmu-lighting-vision/templates/rmu-config.hbs" },
    };

    tabGroups = { primary: "canvas" };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};
        const canvasMap = customMap.canvas || {};
        const visionMap = customMap.vision || { basic: {}, nightvision: {} };

        context.tabState = {
            canvas: this.tabGroups.primary === "canvas" ? "active" : "",
            vision: this.tabGroups.primary === "vision" ? "active" : "",
            system: this.tabGroups.primary === "system" ? "active" : "",
        };

        context.choices = {
            bright: game.i18n.localize("rmu.settings.mapping.choices.bright"),
            dim: game.i18n.localize("rmu.settings.mapping.choices.dim"),
            off: game.i18n.localize("rmu.settings.mapping.choices.off"),
        };

        const tierLabels = [
            game.i18n.localize("rmu.light.tiers.bright"),
            game.i18n.localize("rmu.light.tiers.uneven"),
            game.i18n.localize("rmu.light.tiers.dim"),
            game.i18n.localize("rmu.light.tiers.shadowy"),
            game.i18n.localize("rmu.light.tiers.dark"),
            game.i18n.localize("rmu.light.tiers.extremelyDark"),
            game.i18n.localize("rmu.light.tiers.pitchBlack"),
        ];

        // Prepare Tab 1 Data
        context.canvasTiers = tierLabels.map((label, id) => ({
            id,
            label,
            canvas: canvasMap[id] ?? "off",
        }));

        // Prepare Tab 2 Data
        context.visionLevels = [
            { id: "bright", label: context.choices.bright, basic: visionMap.basic.bright, nightvision: visionMap.nightvision.bright },
            { id: "dim", label: context.choices.dim, basic: visionMap.basic.dim, nightvision: visionMap.nightvision.dim },
            { id: "off", label: context.choices.off, basic: visionMap.basic.off, nightvision: visionMap.nightvision.off },
        ];

        return context;
    }

    static async _onSaveMapping(event, target) {
        const form = target.closest("form");
        const formData = new foundry.applications.ux.FormDataExtended(form);
        const expandedData = foundry.utils.expandObject(formData.object);

        // Save to the database
        await game.settings.set("rmu-lighting-vision", "customMapping", expandedData);
        ui.notifications.info(game.i18n.localize("rmu.settings.mapping.savedSuccess"));

        // HOT RELOAD: Rebuild the core Vision Modes instantly using the new data
        registerVisionModes();

        // Update all physical light radii
        if (game.settings.get("rmu-lighting-vision", "enableLightingEngine")) {
            await performWorldSweep(true);
        }

        // HOT RELOAD: Force the WebGL engine to redraw the vision masks
        if (canvas.ready) {
            canvas.perception.update({ initializeVision: true, refreshLighting: true }, true);
        }

        // Close the window
        this.close();
    }
    static async _onApplyRMU(event, target) {
        await game.settings.set("rmu-lighting-vision", "enableLightingEngine", true);
        await performWorldSweep(true);
        ui.notifications.info(game.i18n.localize("rmu.migration.appliedSuccess"));
    }

    static async _onRestoreFoundry(event, target) {
        await game.settings.set("rmu-lighting-vision", "enableLightingEngine", false);
        await performWorldSweep(false);
        ui.notifications.info(game.i18n.localize("rmu.migration.restoredSuccess"));
    }
}

/**
 * Sweeps the entire world to enforce or revoke RMU lighting and vision changes.
 * @param {boolean} isEnabled - Whether the engine was just turned on or off.
 */
export async function performWorldSweep(isEnabled) {
    let updatedCount = 0;
    const mapping = getLightMapping();

    for (const scene of game.scenes) {
        const ambientUpdates = [];
        const tokenUpdates = [];

        // 1. Process Ambient Lights
        for (const light of scene.lights) {
            const rmuFlags = light.flags?.["rmu-lighting-vision"];
            if (!rmuFlags) continue;

            if (!isEnabled && rmuFlags.originalRadii) {
                ambientUpdates.push({
                    _id: light.id,
                    config: { bright: rmuFlags.originalRadii.bright, dim: rmuFlags.originalRadii.dim },
                });
            } else if (isEnabled) {
                const rawTier = rmuFlags.baseIllumination ?? -1;
                const tier = parseInt(rawTier, 10);
                let isMagical = rmuFlags.isMagical ?? false;
                const isUtter = rmuFlags.isUtter ?? false;

                // UX Auto-Sync
                let flagsUpdate = { isSweep: true };
                if (isUtter) {
                    isMagical = true;
                    flagsUpdate.isMagical = true;
                }

                const isDarknessSource = tier >= 6 || light?.config?.isDarkness === true || (light?.config?.luminosity ?? 0) < 0;

                let targetBright = 0;
                let targetDim = 0;
                let targetPriority = 0;

                if (isMagical) {
                    if (isDarknessSource) targetPriority = isUtter ? 15 : 5;
                    else targetPriority = isUtter ? 20 : 10;
                }

                if (!isMagical && tier !== -1) {
                    const generatedRadii = getRadiiForTier(tier);
                    targetBright = generatedRadii.bright;
                    targetDim = generatedRadii.dim;
                } else if (isMagical) {
                    let coreRadius = rmuFlags.magicalRadius;
                    if (coreRadius === undefined) {
                        coreRadius = Math.max(light?.config?.dim ?? 0, light?.config?.bright ?? 0);
                    }

                    targetBright = coreRadius;
                    flagsUpdate.magicalRadius = coreRadius; // Save the core radius to prevent double-scaling on future sweeps

                    if (isDarknessSource || !game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
                        targetDim = coreRadius;
                    } else {
                        const safeTier = tier === -1 ? 0 : tier;
                        const boundaryTier = Math.min(safeTier + 2, 6);
                        targetDim = coreRadius + getMagicalExtension(boundaryTier);
                    }
                }

                // Bypass the mapping crusher
                if (!isDarknessSource && tier !== -1) {
                    const radiusCategory = mapping[tier];
                    if (radiusCategory === "dim") {
                        targetDim = Math.max(targetBright, targetDim);
                        targetBright = 0;
                    } else if (radiusCategory === "off") {
                        targetBright = 0;
                        targetDim = 0;
                    }
                }

                ambientUpdates.push({
                    _id: light.id,
                    flags: { "rmu-lighting-vision": flagsUpdate },
                    config: {
                        bright: targetBright,
                        dim: Math.max(targetBright, targetDim),
                        priority: targetPriority,
                    },
                });
            }
        }

        // 2. Process Tokens
        for (const token of scene.tokens) {
            const rmuFlags = token.flags?.["rmu-lighting-vision"];
            const actor = token.actor;
            let tokenPatch = { _id: token.id };
            let requiresUpdate = false;

            if (rmuFlags) {
                if (!isEnabled && rmuFlags.originalRadii) {
                    tokenPatch.light = { bright: rmuFlags.originalRadii.bright, dim: rmuFlags.originalRadii.dim };
                    requiresUpdate = true;
                } else if (isEnabled) {
                    const rawTier = rmuFlags.baseIllumination ?? -1;
                    const tier = parseInt(rawTier, 10);
                    let isMagical = rmuFlags.isMagical ?? false;
                    const isUtter = rmuFlags.isUtter ?? false;

                    let flagsUpdate = { isSweep: true };
                    if (isUtter) {
                        isMagical = true;
                        flagsUpdate.isMagical = true;
                    }

                    const isDarknessSource = tier >= 6 || token?.light?.isDarkness === true || (token?.light?.luminosity ?? 0) < 0;

                    let targetBright = 0;
                    let targetDim = 0;
                    let targetPriority = 0;

                    if (isMagical) {
                        if (isDarknessSource) targetPriority = isUtter ? 15 : 5;
                        else targetPriority = isUtter ? 20 : 10;
                    }

                    if (!isMagical && tier !== -1) {
                        const generatedRadii = getRadiiForTier(tier);
                        targetBright = generatedRadii.bright;
                        targetDim = generatedRadii.dim;
                    } else if (isMagical) {
                        let coreRadius = rmuFlags.magicalRadius;
                        if (coreRadius === undefined) {
                            coreRadius = Math.max(token?.light?.dim ?? 0, token?.light?.bright ?? 0);
                        }

                        targetBright = coreRadius;
                        flagsUpdate.magicalRadius = coreRadius;

                        if (isDarknessSource || !game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
                            targetDim = coreRadius;
                        } else {
                            const safeTier = tier === -1 ? 0 : tier;
                            const boundaryTier = Math.min(safeTier + 2, 6);
                            targetDim = coreRadius + getMagicalExtension(boundaryTier);
                        }
                    }

                    // Bypass the mapping crusher
                    if (!isDarknessSource && tier !== -1) {
                        const radiusCategory = mapping[tier];
                        if (radiusCategory === "dim") {
                            targetDim = Math.max(targetBright, targetDim);
                            targetBright = 0;
                        } else if (radiusCategory === "off") {
                            targetBright = 0;
                            targetDim = 0;
                        }
                    }

                    tokenPatch.flags = { "rmu-lighting-vision": flagsUpdate };
                    tokenPatch.light = {
                        bright: targetBright,
                        dim: Math.max(targetBright, targetDim),
                        priority: targetPriority,
                    };
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
