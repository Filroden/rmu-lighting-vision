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

import { calculateLightRenderingData } from "./visual-mapping.js";
import { getActorVisionCapabilities } from "./vision-parser.js";
import { registerVisionModes } from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The main configuration panel for the RMU Lighting module.
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

        context.canvasTiers = tierLabels.map((label, id) => ({
            id,
            label,
            canvas: canvasMap[id] ?? "off",
        }));

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

        await game.settings.set("rmu-lighting-vision", "customMapping", expandedData);
        ui.notifications.info(game.i18n.localize("rmu.settings.mapping.savedSuccess"));

        registerVisionModes();

        if (game.settings.get("rmu-lighting-vision", "enableLightingEngine")) {
            await performWorldSweep(true);
        }

        if (canvas.ready) {
            canvas.perception.update({ initializeVision: true, refreshLighting: true }, true);
        }

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
 * ============================================================================
 * MIGRATION ENGINE HELPERS
 * ============================================================================
 */

/**
 * Evaluates a single Ambient Light document and determines the exact payload required to update it.
 * @returns {Object|null} The update payload, or null if no update is required.
 */
function _prepareAmbientLightUpdate(light, isEnabled) {
    const rmuFlags = light.flags?.["rmu-lighting-vision"];
    if (!rmuFlags) return null;

    if (!isEnabled && rmuFlags.originalRadii) {
        return {
            _id: light.id,
            config: { bright: rmuFlags.originalRadii.bright, dim: rmuFlags.originalRadii.dim },
        };
    }

    if (isEnabled) {
        const rawTier = rmuFlags.baseIllumination ?? -1;
        const tier = Number.parseInt(rawTier, 10);
        let isMagical = rmuFlags.isMagical ?? false;
        const isUtter = rmuFlags.isUtter ?? false;
        const isConstant = rmuFlags.isConstant ?? false;

        let flagsUpdate = { isSweep: true };
        if (isUtter) {
            isMagical = true;
            flagsUpdate.isMagical = true;
        }

        const isDarknessSource = tier >= 6 || light?.config?.isDarkness === true || (light?.config?.luminosity ?? 0) < 0;

        let coreRadius = 0;
        if (isMagical || isConstant) {
            coreRadius = rmuFlags.magicalRadius ?? Math.max(light?.config?.dim ?? 0, light?.config?.bright ?? 0);
            flagsUpdate.magicalRadius = coreRadius;
        }

        const renderData = calculateLightRenderingData(tier, isMagical, isUtter, isDarknessSource, coreRadius, isConstant);

        return {
            _id: light.id,
            flags: { "rmu-lighting-vision": flagsUpdate },
            config: {
                bright: renderData.bright,
                dim: renderData.dim,
                priority: renderData.priority,
            },
        };
    }

    return null;
}

/**
 * Evaluates a single Token document and determines the exact payload required to update its vision and emitted light.
 * @returns {Object|null} The update payload, or null if no update is required.
 */
function _prepareTokenUpdate(token, isEnabled) {
    const rmuFlags = token.flags?.["rmu-lighting-vision"];
    const actor = token.actor;
    let tokenPatch = { _id: token.id };
    let requiresUpdate = false;

    // STEP A: Handle Light Emitted by the Token
    if (rmuFlags) {
        if (!isEnabled && rmuFlags.originalRadii) {
            tokenPatch.light = { bright: rmuFlags.originalRadii.bright, dim: rmuFlags.originalRadii.dim };
            requiresUpdate = true;
        } else if (isEnabled) {
            const rawTier = rmuFlags.baseIllumination ?? -1;
            const tier = Number.parseInt(rawTier, 10);
            let isMagical = rmuFlags.isMagical ?? false;
            const isUtter = rmuFlags.isUtter ?? false;
            const isConstant = rmuFlags.isConstant ?? false;

            let flagsUpdate = { isSweep: true };
            if (isUtter) {
                isMagical = true;
                flagsUpdate.isMagical = true;
            }

            const isDarknessSource = tier >= 6 || token?.light?.isDarkness === true || (token?.light?.luminosity ?? 0) < 0;

            let coreRadius = 0;
            if (isMagical || isConstant) {
                coreRadius = rmuFlags.magicalRadius ?? Math.max(token?.light?.dim ?? 0, token?.light?.bright ?? 0);
                flagsUpdate.magicalRadius = coreRadius;
            }

            const renderData = calculateLightRenderingData(tier, isMagical, isUtter, isDarknessSource, coreRadius, isConstant);

            tokenPatch.flags = { "rmu-lighting-vision": flagsUpdate };
            tokenPatch.light = {
                bright: renderData.bright,
                dim: renderData.dim,
                priority: renderData.priority,
            };
            requiresUpdate = true;
        }
    }

    // STEP B: Handle Token Perception (Sight & Detection Modes)
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

        tokenPatch.detectionModes = {
            basicSight: { enabled: true, range: optimalRange },
            lightPerception: { enabled: true, range: null },
            ...nativeVision.detectionModes,
        };
        requiresUpdate = true;
    }

    return requiresUpdate ? tokenPatch : null;
}

/**
 * ============================================================================
 * MASTER SWEEP FUNCTION
 * ============================================================================
 */

/**
 * Sweeps the entire world database to enforce or revoke RMU lighting and vision changes.
 * Iterates through every scene and executes a single bulk `updateEmbeddedDocuments` call.
 * @param {boolean} isEnabled - Whether the engine is being turned ON (true) or OFF (false).
 */
export async function performWorldSweep(isEnabled) {
    let updatedCount = 0;

    for (const scene of game.scenes) {
        // Extract processing logic into clean array maps, filtering out any null returns
        const ambientUpdates = scene.lights.map((light) => _prepareAmbientLightUpdate(light, isEnabled)).filter((update) => update !== null);

        const tokenUpdates = scene.tokens.map((token) => _prepareTokenUpdate(token, isEnabled)).filter((update) => update !== null);

        // Execute bulk database transactions
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
