import { getRadiiForTier } from "./visual-mapping.js";

/**
 * Intercepts document updates to auto-populate native light radii based on RMU tiers.
 */
function syncLightRadii(document, updateData) {
    // ESCAPE HATCH
    if (!game.settings.get("rmu-lighting-vision", "enableLightingEngine")) return;

    const rmuFlags = updateData.flags?.["rmu-lighting-vision"] || {};
    const currentFlags = document.flags?.["rmu-lighting-vision"] || {};

    const rawTier = rmuFlags.baseIllumination ?? currentFlags.baseIllumination;
    if (rawTier === undefined || rawTier === null) return;

    const tier = parseInt(rawTier, 10);
    if (isNaN(tier) || tier === -1) return; // Safely abort if it is "None"

    const isMagical = rmuFlags.isMagical ?? currentFlags.isMagical ?? false;

    const isToken = document.documentName === "Token";
    const currentLight = isToken ? document.light : document.config;

    // NON-DESTRUCTIVE BACKUP
    const existingBackup = currentFlags.originalRadii;
    if (!existingBackup) {
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].originalRadii = {
            bright: currentLight?.bright ?? 0,
            dim: currentLight?.dim ?? 0,
        };
    }

    // CALCULATE RADII
    let targetBright = 0;
    let targetDim = 0;

    if (!isMagical) {
        // NATURAL LIGHT: Dynamically generate radii based on the consensus matrix
        const generatedRadii = getRadiiForTier(tier);
        targetBright = generatedRadii.bright;
        targetDim = generatedRadii.dim;
    } else {
        // MAGICAL LIGHT
        const updatedLight = isToken ? updateData.light : updateData.config;
        const coreRadius = updatedLight?.bright ?? currentLight?.bright ?? 0;

        // Preserve the custom spell radius in our flags so it survives the engine being toggled off
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].magicalRadius = coreRadius;

        targetBright = coreRadius;

        if (!game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
            targetDim = coreRadius;
        } else {
            const boundaryTier = Math.min(tier + 2, 6);
            const dimExtension = getRadiiForTier(boundaryTier).dim;
            targetDim = coreRadius + dimExtension;
        }
    }

    // INJECT RADII INTO THE DATABASE UPDATE
    if (isToken) {
        updateData.light = updateData.light || {};
        updateData.light.bright = targetBright;
        updateData.light.dim = Math.max(targetBright, targetDim);
    } else {
        updateData.config = updateData.config || {};
        updateData.config.bright = targetBright;
        updateData.config.dim = Math.max(targetBright, targetDim);
    }
}

Hooks.on("preUpdateAmbientLight", syncLightRadii);
Hooks.on("preUpdateToken", syncLightRadii);
