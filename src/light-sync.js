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

    const isToken = document.documentName === "Token";

    // 1. Native Foundry Object Expansion (Fixes the flat keys bug)
    const expandedUpdate = foundry.utils.expandObject(updateData);

    // 2. Safe Flag Extraction
    const rmuFlags = expandedUpdate.flags?.["rmu-lighting-vision"] || {};
    const currentFlags = document.flags?.["rmu-lighting-vision"] || {};

    // 3. Identify if Visage is actively driving this update
    const isVisageUpdate = expandedUpdate.flags?.visage?.activeStack !== undefined;

    // --- REDUNDANCY CHECK ---
    const hasRmuUpdate = expandedUpdate.flags?.["rmu-lighting-vision"] !== undefined;
    const hasLightUpdate = isToken ? expandedUpdate.light !== undefined : expandedUpdate.config !== undefined;
    const isSweep = rmuFlags.isSweep ?? false;

    if (!hasRmuUpdate && !hasLightUpdate && !isSweep && !isVisageUpdate) {
        return;
    }

    // --- TRANSIENT MIGRATION FLAGS ---
    if (isSweep) {
        if (updateData.flags?.["rmu-lighting-vision"]) delete updateData.flags["rmu-lighting-vision"].isSweep;
        if (updateData["flags.rmu-lighting-vision"]) delete updateData["flags.rmu-lighting-vision"].isSweep;
        if (updateData["flags.rmu-lighting-vision.isSweep"]) delete updateData["flags.rmu-lighting-vision.isSweep"];
    }

    // --- VISAGE BYPASS ---
    // If Visage is asserting a native light overlay, completely bypass LVRMU math.
    if (rmuFlags.isVisageOverride) {
        if (updateData.flags?.["rmu-lighting-vision"]) delete updateData.flags["rmu-lighting-vision"].isVisageOverride;
        if (updateData["flags.rmu-lighting-vision"]) delete updateData["flags.rmu-lighting-vision"].isVisageOverride;
        if (updateData["flags.rmu-lighting-vision.isVisageOverride"]) delete updateData["flags.rmu-lighting-vision.isVisageOverride"];
        return;
    }

    // Determine the intended illumination tier and magical properties.
    let rawTier = rmuFlags.baseIllumination ?? currentFlags.baseIllumination ?? -1;
    let tier = Number.parseInt(rawTier, 10);

    let isMagical = rmuFlags.isMagical ?? currentFlags.isMagical ?? false;
    let isUtter = rmuFlags.isUtter ?? currentFlags.isUtter ?? false;
    const isConstant = rmuFlags.isConstant ?? currentFlags.isConstant ?? false;

    // Foundry handles Token light data and AmbientLight data in slightly different object structures.
    const currentLight = isToken ? document.light : document.config;
    const updatedLight = isToken ? updateData.light : updateData.config;

    // --- UX AUTO-SYNC: Constant strips Magical properties ---
    // A light cannot be an ambient environmental light and a magical point source simultaneously.
    if (isConstant && (isMagical || isUtter)) {
        isMagical = false;
        isUtter = false;

        // Push the correction to the update payload to scrub the database
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].isMagical = false;
        updateData.flags["rmu-lighting-vision"].isUtter = false;
    }

    // --- UX AUTO-SYNC: Utter implies Magical ---
    // If a user ticks the 'Utterdark/light' box but forgets to tick 'Magical',
    // we automatically enforce the magical property to prevent logic conflicts.
    if (isUtter && !isMagical) {
        isMagical = true;
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].isMagical = true;
    }

    // Check if the RMU engine should be actively managing this light
    const isRmuActive = !Number.isNaN(tier) && (tier !== -1 || isMagical || isUtter || isConstant);

    if (!isRmuActive) {
        // UX AUTO-SYNC: If the GM just disabled RMU settings (e.g., unchecked Environmental)
        // and set the tier to "None", return the radii to zero to turn the light off.
        const wasRmuActive = currentFlags.isConstant || currentFlags.isMagical || currentFlags.isUtter || (currentFlags.baseIllumination !== undefined && currentFlags.baseIllumination !== -1);

        if (wasRmuActive) {
            if (isToken) {
                updateData.light = updateData.light || {};
                updateData.light.bright = 0;
                updateData.light.dim = 0;
            } else {
                updateData.config = updateData.config || {};
                updateData.config.bright = 0;
                updateData.config.dim = 0;
            }
        }
        return;
    }

    // Read-only check: Identify if this is a darkness source
    const isDarknessSource = tier >= 6 || (updatedLight?.isDarkness ?? currentLight?.isDarkness ?? false) === true || (updatedLight?.luminosity ?? currentLight?.luminosity ?? 0) < 0;

    // --- THE BACKUP SYSTEM ---
    const existingBackup = currentFlags.originalRadii;
    // Do not generate a permanent backup if Visage is currently applying a temporary mask
    if (!existingBackup && !isVisageUpdate) {
        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].originalRadii = {
            bright: currentLight?.bright ?? 0,
            dim: currentLight?.dim ?? 0,
        };
    }

    // --- VISAGE BYPASS ---
    // If Visage is applying an absolute light effect, completely bypass LVRMU's math engine
    // and allow Visage's raw bright/dim values to pass to the database untouched.
    if (rmuFlags.isVisageOverride) return;

    let coreRadius = 0;

    // Both Magical and Constant lights rely on a manually typed radius,
    // so both must be protected from being overwritten during world sweeps.
    if (isMagical || isConstant) {
        // --- IMMUTABLE RADIUS LOGIC ---
        const dimChanged = updatedLight?.dim !== undefined && updatedLight.dim !== currentLight?.dim;
        const brightChanged = updatedLight?.bright !== undefined && updatedLight.bright !== currentLight?.bright;
        const userChangedRadius = !isSweep && (dimChanged || brightChanged);

        if (userChangedRadius) {
            coreRadius = Math.max(updatedLight?.dim ?? currentLight?.dim ?? 0, updatedLight?.bright ?? currentLight?.bright ?? 0);
        } else {
            // We continue using 'magicalRadius' as the database key to maintain
            // backwards compatibility with pre-existing magical lights.
            coreRadius = currentFlags.magicalRadius ?? Math.max(currentLight?.dim ?? 0, currentLight?.bright ?? 0);
        }

        updateData.flags = updateData.flags || {};
        updateData.flags["rmu-lighting-vision"] = updateData.flags["rmu-lighting-vision"] || {};
        updateData.flags["rmu-lighting-vision"].magicalRadius = coreRadius;
    }

    // --- THE UNIFIED CALCULATION ENGINE ---
    const renderData = calculateLightRenderingData(tier, isMagical, isUtter, isDarknessSource, coreRadius, isConstant);

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
