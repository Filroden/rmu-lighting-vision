/**
 * ============================================================================
 * LIGHTING DATABASE SYNCHRONISATION
 * ============================================================================
 * This script intercepts database update requests for both Tokens and
 * Ambient Lights. It mathematically overrides their physical light radii
 * and rendering priorities to enforce the RMU lighting rules before the
 * data is ever saved to the server.
 * ============================================================================
 */

import { getRadiiForTier, getLightMapping, getMagicalExtension } from "./visual-mapping.js";

/**
 * The core mutation function that enforces RMU lighting mathematics.
 * @param {Document} document - The existing Document (Token or AmbientLight) in the database.
 * @param {Object} updateData - The incoming data payload requested by the UI or a macro.
 */
function syncLightRadii(document, updateData) {
    // Escape hatch: If the GM has disabled the module's engine, allow native Foundry behaviour.
    if (!game.settings.get("rmu-lighting-vision", "enableLightingEngine")) return;

    // Extract the incoming flags (if any) and the current database flags.
    const rmuFlags = updateData.flags?.["rmu-lighting-vision"] || {};
    const currentFlags = document.flags?.["rmu-lighting-vision"] || {};

    // --- TRANSIENT MIGRATION FLAG ---
    // 'isSweep' is a temporary flag injected by the migration script to bypass manual
    // user-input checks. We must delete it from the payload so it does not permanently
    // bloat the token's database entry.
    const isSweep = rmuFlags.isSweep ?? false;
    if (isSweep && updateData.flags?.["rmu-lighting-vision"]) {
        delete updateData.flags["rmu-lighting-vision"].isSweep;
    }

    // Determine the intended illumination tier and magical properties.
    let rawTier = rmuFlags.baseIllumination ?? currentFlags.baseIllumination ?? -1;
    let tier = parseInt(rawTier, 10);

    let isMagical = rmuFlags.isMagical ?? currentFlags.isMagical ?? false;
    const isUtter = rmuFlags.isUtter ?? currentFlags.isUtter ?? false;

    // Foundry handles Token light data and AmbientLight data in slightly different object structures.
    const isToken = document.documentName === "Token";
    const currentLight = isToken ? document.light : document.config;
    const updatedLight = isToken ? updateData.light : updateData.config;

    // --- UX AUTO-SYNC: Utter implies Magical ---
    // If a user ticks the 'Utterdark/light' box but forgets to tick 'Magical',
    // we automatically enforce the magical property to prevent logic conflicts.
    if (isUtter && !isMagical) {
        isMagical = true;
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].isMagical = true;
    }

    // Abort if this is a standard, unconfigured Foundry light source
    if (isNaN(tier) || (tier === -1 && !isMagical && !isUtter)) return;

    // Read-only check: Identify if this is a darkness source (Pitch Black tier, or a native Foundry negative light).
    const isDarknessSource = tier >= 6 || (updatedLight?.isDarkness ?? currentLight?.isDarkness ?? false) === true || (updatedLight?.luminosity ?? currentLight?.luminosity ?? 0) < 0;

    // --- THE BACKUP SYSTEM ---
    // Before we completely overwrite the token's light radii, we save a backup of
    // their original Foundry configuration. This allows the GM to hit "Restore Foundry Defaults"
    // later and instantly recover their original map lighting.
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

    // --- WEBGL RENDERING PRIORITY ---
    // By default, Foundry draws light sources based on elevation or creation order.
    // To enforce the RMU absolute hierarchy, we manipulate the WebGL z-index priority.
    // Utterdark (15) > Magical Darkness (5) | Utterlight (20) > Magical Light (10) > Mundane (0).
    if (isMagical) {
        if (isDarknessSource) targetPriority = isUtter ? 15 : 5;
        else targetPriority = isUtter ? 20 : 10;
    }

    // --- RADII CALCULATION ---
    if (!isMagical && tier !== -1) {
        // Mundane light strictly follows the predefined physical distances from Table 15-7.
        const generatedRadii = getRadiiForTier(tier);
        targetBright = generatedRadii.bright;
        targetDim = generatedRadii.dim;
    } else if (isMagical) {
        // --- IMMUTABLE MAGICAL RADIUS LOGIC ---
        // Magical light scales dynamically. To prevent the module from constantly overwriting
        // the radius every time the token moves, we must identify if the incoming radius change
        // was triggered by a human typing a number, or by our own automated system sweep.
        const dimChanged = updatedLight?.dim !== undefined && updatedLight.dim !== currentLight?.dim;
        const brightChanged = updatedLight?.bright !== undefined && updatedLight.bright !== currentLight?.bright;
        const userChangedRadius = !isSweep && (dimChanged || brightChanged);

        let coreRadius;
        if (userChangedRadius) {
            // The human GM actively typed a new radius in the configuration sheet.
            // We adopt this as the new immutable core radius for the magical light.
            coreRadius = Math.max(updatedLight?.dim ?? currentLight?.dim ?? 0, updatedLight?.bright ?? currentLight?.bright ?? 0);
            updateData.flags = updateData.flags || {};
            updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
            updateData.flags["rmu-lighting-vision"].magicalRadius = coreRadius;
        } else {
            // It is an automated update; read the saved core radius from the database.
            coreRadius = currentFlags.magicalRadius ?? Math.max(currentLight?.dim ?? 0, currentLight?.bright ?? 0);

            // Safety catch for pre-existing lights being converted to magical for the first time.
            if (currentFlags.magicalRadius === undefined) {
                updateData.flags = updateData.flags || {};
                updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
                updateData.flags["rmu-lighting-vision"].magicalRadius = coreRadius;
            }
        }

        targetBright = coreRadius;

        // Determine if magical light spills beyond its core radius (based on GM settings).
        if (isDarknessSource || !game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
            targetDim = coreRadius;
        } else {
            // Step the light down 2 tiers at the boundary, and calculate how far it extends.
            const safeTier = tier === -1 ? 0 : tier;
            const boundaryTier = Math.min(safeTier + 2, 6);
            const dimExtension = getMagicalExtension(boundaryTier);
            targetDim = coreRadius + dimExtension;
        }
    }

    // --- THE VISUAL MAPPING CRUSHER ---
    // Before finalising, we pass the calculated radii through the GM's custom Tab 1 visual mappings.
    // If the GM configured "Shadowy" light to render as completely Unlit, we crush the bright/dim values to 0 here.
    if (!isDarknessSource && tier !== -1) {
        const mapping = getLightMapping();
        const radiusCategory = mapping[tier];

        if (radiusCategory === "dim") {
            targetDim = Math.max(targetBright, targetDim);
            targetBright = 0; // Crush bright light down to dim
        } else if (radiusCategory === "off") {
            targetBright = 0; // Completely extinguish visual light
            targetDim = 0;
        }
    }

    // --- INJECT THE MUTATION ---
    // Finally, forcefully apply the calculated values to the incoming data payload.
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

// Hook into Foundry's core document update cycle
Hooks.on("preUpdateAmbientLight", syncLightRadii);
Hooks.on("preUpdateToken", syncLightRadii);
