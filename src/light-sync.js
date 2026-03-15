export const RADIUS_MAPPING = {
    "-1": { bright: 0, dim: 0 },
    0: { bright: 30, dim: 100 },
    1: { bright: 10, dim: 30 },
    2: { bright: 0, dim: 10 },
    3: { bright: 0, dim: 0 },
    4: { bright: 0, dim: 0 },
    5: { bright: 0, dim: 0 },
    6: { bright: 0, dim: 0 },
};

/**
 * Intercepts document updates to auto-populate native light radii based on RMU tiers.
 */
function syncLightRadii(document, updateData) {
    // ESCAPE HATCH
    if (!game.settings.get("rmu-lighting-vision", "enableLightingEngine")) return;

    const rmuFlags = updateData.flags?.["rmu-lighting-vision"] || {};
    const currentFlags = document.flags?.["rmu-lighting-vision"] || {};

    // Check if this document has RMU lighting active, either in this update or already saved
    const tierValue = rmuFlags.baseIllumination ?? currentFlags.baseIllumination;
    if (tierValue === undefined || tierValue === -1) return;

    const tier = parseInt(tierValue, 10);
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
        // NATURAL LIGHT: Strictly enforce the RMU visual mapping
        if (RADIUS_MAPPING[tier]) {
            targetBright = RADIUS_MAPPING[tier].bright;
            targetDim = RADIUS_MAPPING[tier].dim;
        }
    } else {
        // MAGICAL LIGHT: Respect the GM's entered Bright Radius as the Spell's Area of Effect
        const updatedLight = isToken ? updateData.light : updateData.config;
        const coreRadius = updatedLight?.bright ?? currentLight?.bright ?? 0;

        targetBright = coreRadius;

        if (!game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
            // Strict Mode: Hard visual edge. Bright and Dim radii are identical.
            targetDim = coreRadius;
        } else {
            // Designer Mode: Light drops 2 tiers immediately outside the spell boundary
            const boundaryTier = Math.min(tier + 2, 6);
            const dimExtension = RADIUS_MAPPING[boundaryTier]?.dim || 0;
            targetDim = coreRadius + dimExtension;
        }
    }

    // INJECT RADII INTO THE DATABASE UPDATE
    // We use Math.max to ensure Foundry's engine doesn't crash from Dim being smaller than Bright
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
