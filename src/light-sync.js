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

import { calculateLightRenderingData } from "./visual-mapping.js";

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

    let coreRadius = 0;

    if (isMagical) {
        // --- IMMUTABLE MAGICAL RADIUS LOGIC ---
        const dimChanged = updatedLight?.dim !== undefined && updatedLight.dim !== currentLight?.dim;
        const brightChanged = updatedLight?.bright !== undefined && updatedLight.bright !== currentLight?.bright;
        const userChangedRadius = !isSweep && (dimChanged || brightChanged);

        if (userChangedRadius) {
            coreRadius = Math.max(updatedLight?.dim ?? currentLight?.dim ?? 0, updatedLight?.bright ?? currentLight?.bright ?? 0);
        } else {
            coreRadius = currentFlags.magicalRadius ?? Math.max(currentLight?.dim ?? 0, currentLight?.bright ?? 0);
        }

        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].magicalRadius = coreRadius;
    }

    // --- THE UNIFIED CALCULATION ENGINE ---
    const renderData = calculateLightRenderingData(tier, isMagical, isUtter, isDarknessSource, coreRadius);

    // --- INJECT THE MUTATION ---
    // Finally, forcefully apply the calculated values to the incoming data payload.
    if (isToken) {
        updateData.light = updateData.light || {};
        updateData.light.bright = renderData.bright;
        updateData.light.dim = renderData.dim;
        updateData.light.priority = renderData.priority;
    } else {
        updateData.config = updateData.config || {};
        updateData.config.bright = renderData.bright;
        updateData.config.dim = renderData.dim;
        updateData.config.priority = renderData.priority;
    }
}

// Hook into Foundry's core document update cycle
Hooks.on("preUpdateAmbientLight", syncLightRadii);
Hooks.on("preUpdateToken", syncLightRadii);
