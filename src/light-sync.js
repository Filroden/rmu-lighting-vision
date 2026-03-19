import { getRadiiForTier, getLightMapping, getMagicalExtension } from "./visual-mapping.js";

function syncLightRadii(document, updateData) {
    if (!game.settings.get("rmu-lighting-vision", "enableLightingEngine")) return;

    const rmuFlags = updateData.flags?.["rmu-lighting-vision"] || {};
    const currentFlags = document.flags?.["rmu-lighting-vision"] || {};

    const isSweep = rmuFlags.isSweep ?? false;
    if (isSweep && updateData.flags?.["rmu-lighting-vision"]) {
        delete updateData.flags["rmu-lighting-vision"].isSweep;
    }

    let rawTier = rmuFlags.baseIllumination ?? currentFlags.baseIllumination ?? -1;
    let tier = parseInt(rawTier, 10);

    let isMagical = rmuFlags.isMagical ?? currentFlags.isMagical ?? false;
    const isUtter = rmuFlags.isUtter ?? currentFlags.isUtter ?? false;

    const isToken = document.documentName === "Token";
    const currentLight = isToken ? document.light : document.config;
    const updatedLight = isToken ? updateData.light : updateData.config;

    // --- UX AUTO-SYNC: Utter implies Magical ---
    if (isUtter && !isMagical) {
        isMagical = true;
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].isMagical = true;
    }

    if (isNaN(tier) || (tier === -1 && !isMagical && !isUtter)) return;

    // Read-only check: Identify if this is a darkness source without forcing the database
    const isDarknessSource = tier >= 6 || (updatedLight?.isDarkness ?? currentLight?.isDarkness ?? false) === true || (updatedLight?.luminosity ?? currentLight?.luminosity ?? 0) < 0;

    const existingBackup = currentFlags.originalRadii;

    if (!existingBackup) {
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].originalRadii = {
            bright: currentLight?.bright ?? 0,
            dim: currentLight?.dim ?? 0,
        };
    }

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
        // --- IMMUTABLE MAGICAL RADIUS LOGIC ---
        // Detect if the user manually typed a new radius by ensuring the incoming data actually differs from the canvas
        const dimChanged = updatedLight?.dim !== undefined && updatedLight.dim !== currentLight?.dim;
        const brightChanged = updatedLight?.bright !== undefined && updatedLight.bright !== currentLight?.bright;
        const userChangedRadius = !isSweep && (dimChanged || brightChanged);

        let coreRadius;
        if (userChangedRadius) {
            // Only update the immutable core if the user actively changed the numbers
            coreRadius = Math.max(updatedLight?.dim ?? currentLight?.dim ?? 0, updatedLight?.bright ?? currentLight?.bright ?? 0);
            updateData.flags = updateData.flags || {};
            updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
            updateData.flags["rmu-lighting-vision"].magicalRadius = coreRadius;
        } else {
            coreRadius = currentFlags.magicalRadius ?? Math.max(currentLight?.dim ?? 0, currentLight?.bright ?? 0);

            if (currentFlags.magicalRadius === undefined) {
                updateData.flags = updateData.flags || {};
                updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
                updateData.flags["rmu-lighting-vision"].magicalRadius = coreRadius;
            }
        }

        targetBright = coreRadius;

        if (isDarknessSource || !game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
            targetDim = coreRadius;
        } else {
            const safeTier = tier === -1 ? 0 : tier;
            const boundaryTier = Math.min(safeTier + 2, 6);
            const dimExtension = getMagicalExtension(boundaryTier);
            targetDim = coreRadius + dimExtension;
        }
    }

    if (!isDarknessSource && tier !== -1) {
        const mapping = getLightMapping();
        const radiusCategory = mapping[tier];

        if (radiusCategory === "dim") {
            targetDim = Math.max(targetBright, targetDim);
            targetBright = 0;
        } else if (radiusCategory === "off") {
            targetBright = 0;
            targetDim = 0;
        }
    }

    if (isToken) {
        updateData.light = updateData.light || {};
        updateData.light.bright = targetBright;
        updateData.light.dim = Math.max(targetBright, targetDim);
        updateData.light.priority = targetPriority;
    } else {
        updateData.config = updateData.config || {};
        updateData.config.bright = targetBright;
        updateData.config.dim = Math.max(targetBright, targetDim);
        updateData.config.priority = targetPriority;
    }
}

Hooks.on("preUpdateAmbientLight", syncLightRadii);
Hooks.on("preUpdateToken", syncLightRadii);
