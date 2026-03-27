/**
 * ============================================================================
 * CONFIGURATION UI & WORLD MIGRATION ENGINE
 * ============================================================================
 * This script handles the user interface for the RMU Configuration Panel,
 * utilising Foundry V13's ApplicationV2 architecture.
 * * It also houses the 'World Sweep' engine, a high-performance script that
 * iterates through every scene in the database to instantly upgrade or
 * downgrade tokens and lights between Foundry defaults and RMU rules.
 * ============================================================================
 */

import { getRadiiForTier, getLightMapping, getMagicalExtension } from "./visual-mapping.js";
import { getActorVisionCapabilities } from "./vision-parser.js";
import { registerVisionModes } from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The main configuration panel for the RMU Lighting module.
 * Uses the modern ApplicationV2 Handlebars mixin to ensure instantaneous
 * rendering and native V13 compatibility.
 */
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

    /**
     * Gathers and formats all the data required by the Handlebars template before rendering.
     * This includes reading current database settings and localising UI strings.
     */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};
        const canvasMap = customMap.canvas || {};
        const visionMap = customMap.vision || { basic: {}, nightvision: {} };

        // Manage UI tab visibility states
        context.tabState = {
            canvas: this.tabGroups.primary === "canvas" ? "active" : "",
            vision: this.tabGroups.primary === "vision" ? "active" : "",
            system: this.tabGroups.primary === "system" ? "active" : "",
        };

        // Localise the dropdown options for the user
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

        // Prepare Tab 1 Data (Canvas Rendering Mapping)
        context.canvasTiers = tierLabels.map((label, id) => ({
            id,
            label,
            canvas: canvasMap[id] ?? "off",
        }));

        // Prepare Tab 2 Data (Vision Mode Perception Mapping)
        context.visionLevels = [
            { id: "bright", label: context.choices.bright, basic: visionMap.basic.bright, nightvision: visionMap.nightvision.bright },
            { id: "dim", label: context.choices.dim, basic: visionMap.basic.dim, nightvision: visionMap.nightvision.dim },
            { id: "off", label: context.choices.off, basic: visionMap.basic.off, nightvision: visionMap.nightvision.off },
        ];

        return context;
    }

    /**
     * Action handler: Triggered when the user clicks 'Save Settings'.
     * Manages the "Hot Reload" sequence to update the game without a browser refresh.
     */
    static async _onSaveMapping(event, target) {
        const form = target.closest("form");
        const formData = new foundry.applications.ux.FormDataExtended(form);
        const expandedData = foundry.utils.expandObject(formData.object);

        // 1. Save the new mappings to the world database
        await game.settings.set("rmu-lighting-vision", "customMapping", expandedData);
        ui.notifications.info(game.i18n.localize("rmu.settings.mapping.savedSuccess"));

        // 2. HOT RELOAD: Rebuild the core WebGL Vision Modes instantly using the new data
        registerVisionModes();

        // 3. Update all physical light radii on the canvas to reflect the new mapping
        if (game.settings.get("rmu-lighting-vision", "enableLightingEngine")) {
            await performWorldSweep(true);
        }

        // 4. Force the WebGL engine to redraw the vision masks immediately
        if (canvas.ready) {
            canvas.perception.update({ initializeVision: true, refreshLighting: true }, true);
        }

        // Close the ApplicationV2 window
        this.close();
    }

    /** Action handler: Sweeps the world to enforce RMU logic */
    static async _onApplyRMU(event, target) {
        await game.settings.set("rmu-lighting-vision", "enableLightingEngine", true);
        await performWorldSweep(true);
        ui.notifications.info(game.i18n.localize("rmu.migration.appliedSuccess"));
    }

    /** Action handler: Strips RMU logic and restores Foundry core lighting */
    static async _onRestoreFoundry(event, target) {
        await game.settings.set("rmu-lighting-vision", "enableLightingEngine", false);
        await performWorldSweep(false);
        ui.notifications.info(game.i18n.localize("rmu.migration.restoredSuccess"));
    }
}

/**
 * Sweeps the entire world database to enforce or revoke RMU lighting and vision changes.
 * PERFORMANCE NOTE: This script gathers hundreds of individual document changes into an array,
 * and then executes a single `updateEmbeddedDocuments` call per scene.
 * This prevents database throttling, race conditions, and UI freezing.
 * * @param {boolean} isEnabled - Whether the engine is being turned ON (true) or OFF (false).
 */
export async function performWorldSweep(isEnabled) {
    let updatedCount = 0;
    const mapping = getLightMapping();

    for (const scene of game.scenes) {
        const ambientUpdates = [];
        const tokenUpdates = [];

        // ====================================================================
        // 1. PROCESS AMBIENT LIGHTS (Static map light sources)
        // ====================================================================
        for (const light of scene.lights) {
            const rmuFlags = light.flags?.["rmu-lighting-vision"];
            // Skip lights that have never been touched by the RMU configuration menu
            if (!rmuFlags) continue;

            if (!isEnabled && rmuFlags.originalRadii) {
                // DOWNGRADE: Restore the backup radii saved before the module was active
                ambientUpdates.push({
                    _id: light.id,
                    config: { bright: rmuFlags.originalRadii.bright, dim: rmuFlags.originalRadii.dim },
                });
            } else if (isEnabled) {
                // UPGRADE/UPDATE: Recalculate radii based on current rules
                const rawTier = rmuFlags.baseIllumination ?? -1;
                const tier = parseInt(rawTier, 10);
                let isMagical = rmuFlags.isMagical ?? false;
                const isUtter = rmuFlags.isUtter ?? false;

                // Provide an 'isSweep' flag so the `light-sync.js` preUpdate hook knows
                // this is an automated database operation, not a human typing numbers.
                let flagsUpdate = { isSweep: true };

                // UX Auto-Sync: Utter logic inherently requires the source to be magical
                if (isUtter) {
                    isMagical = true;
                    flagsUpdate.isMagical = true;
                }

                const isDarknessSource = tier >= 6 || light?.config?.isDarkness === true || (light?.config?.luminosity ?? 0) < 0;

                let targetBright = 0;
                let targetDim = 0;
                let targetPriority = 0;

                // Determine WebGL z-index rendering priority based on RMU magical hierarchy
                if (isMagical) {
                    if (isDarknessSource) targetPriority = isUtter ? 15 : 5;
                    else targetPriority = isUtter ? 20 : 10;
                }

                // Calculate baseline geometry
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
                    // Save the core radius to prevent compounding double-scaling on future sweeps
                    flagsUpdate.magicalRadius = coreRadius;

                    if (isDarknessSource || !game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
                        targetDim = coreRadius;
                    } else {
                        const safeTier = tier === -1 ? 0 : tier;
                        const boundaryTier = Math.min(safeTier + 2, 6);
                        targetDim = coreRadius + getMagicalExtension(boundaryTier);
                    }
                }

                // Apply the GM's custom visual mapping (e.g., crushing shadowy light to 0)
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

                // Queue the calculated changes for this ambient light
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

        // ====================================================================
        // 2. PROCESS TOKENS (Dynamic light sources and vision capabilities)
        // ====================================================================
        for (const token of scene.tokens) {
            const rmuFlags = token.flags?.["rmu-lighting-vision"];
            const actor = token.actor;
            let tokenPatch = { _id: token.id };
            let requiresUpdate = false;

            // Step A: Handle Light Emitted by the Token (e.g., carrying a torch)
            // This mirrors the logic used above for Ambient Lights.
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

            // Step B: Handle Token Perception (Sight & Detection Modes)
            if (!isEnabled) {
                // DOWNGRADE: Restore the vision parameters the token had before RMU took over
                if (rmuFlags?.originalSight) {
                    tokenPatch.sight = rmuFlags.originalSight;
                    requiresUpdate = true;
                }
                if (rmuFlags?.originalDetectionModes !== undefined) {
                    tokenPatch.detectionModes = rmuFlags.originalDetectionModes;
                    requiresUpdate = true;
                }
            } else if (isEnabled && actor) {
                // UPGRADE: Parse the RMU Actor sheet to find specific vision talents
                const nativeVision = getActorVisionCapabilities(actor);
                let optimalMode = "basic";
                let optimalRange = 0;

                // Determine the highest priority vision mode to apply to the WebGL shader
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

                // Inject the latest custom shader configurations (colours, contrast, etc.)
                const modeDefaults = CONFIG.Canvas.visionModes[optimalMode]?.vision?.defaults || {};

                tokenPatch.sight = {
                    enabled: true,
                    visionMode: optimalMode,
                    range: optimalRange,
                    ...modeDefaults,
                };

                // Inject the array of parsed Detection Modes (e.g., Life Sense, Presence Sense)
                tokenPatch.detectionModes = nativeVision.detectionModes;
                requiresUpdate = true;
            }

            if (requiresUpdate) {
                tokenUpdates.push(tokenPatch);
            }
        }

        // ====================================================================
        // 3. EXECUTE BULK DATABASE TRANSACTIONS
        // ====================================================================
        // By pushing the entire array of updates in a single API call, we prevent
        // the server from choking on hundreds of individual write requests.
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
