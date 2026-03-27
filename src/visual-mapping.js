/**
 * ============================================================================
 * VISUAL MAPPING & RADII GENERATOR
 * ============================================================================
 * This script acts as the geometric translator for the module. It takes the
 * GM's custom visual preferences (from Tab 1 of the Configuration Panel) and
 * calculates the exact physical distances (in feet) that Foundry must draw
 * its Bright and Dim WebGL light polygons.
 * ============================================================================
 */

/**
 * Extracts the GM's custom visual mapping from the database and categorises
 * the 7 RMU lighting tiers into actionable WebGL rendering buckets.
 * @returns {Object} An object containing arrays of tiers mapped to bright, dim, and unlit states.
 */
function getDynamicTiers() {
    const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};

    // Fallback to the default "Gritty" mapping if the database is unconfigured
    const mapping = customMap.canvas || { 0: "bright", 1: "bright", 2: "dim", 3: "dim", 4: "dim", 5: "off", 6: "off" };

    const tiers = { brightTiers: [], dimTiers: [], unlitTiers: [] };

    // Sort the 7 integer tiers into their respective rendering arrays
    for (let i = 0; i <= 6; i++) {
        if (mapping[i] === "bright") tiers.brightTiers.push(i);
        else if (mapping[i] === "dim") tiers.dimTiers.push(i);
        else tiers.unlitTiers.push(i);
    }

    return tiers;
}

/**
 * Calculates the exact geometric radii required to render a mundane light source.
 * It simulates light degrading over distance and checks those degraded tiers against
 * the GM's visual mapping to find the physical cutoff points for Bright and Dim light.
 * * @param {number} baseTier - The illumination tier at the epicentre of the light (0-6).
 * @returns {Object} An object containing the { bright, dim } radii in feet.
 */
export function getRadiiForTier(baseTier) {
    // Abort if the token is completely unlit (-1 is our custom flag for 'No Light')
    if (baseTier === -1 || baseTier === undefined) return { bright: 0, dim: 0 };

    const dynamicTiers = getDynamicTiers();

    // The strict physical degradation thresholds defined by RMU Core Law
    const DISTANCE_THRESHOLDS = [10, 30, 100, 300, 1000, 3000];

    let bright = 0;
    let dim = 0;

    // Iterate through the distance steps, artificially degrading the light by 1 tier
    // at each boundary, and checking if it should still be drawn on the canvas.
    for (let i = 0; i < DISTANCE_THRESHOLDS.length; i++) {
        // Cap the degradation at Tier 6 (Pitch Black)
        const currentTier = Math.min(baseTier + i, 6);
        const distance = DISTANCE_THRESHOLDS[i];

        if (dynamicTiers.brightTiers.includes(currentTier)) {
            // If this degraded tier is still considered 'Bright' by the GM,
            // extend both the bright and dim WebGL polygons out to this distance.
            bright = distance;
            dim = distance;
        } else if (dynamicTiers.dimTiers.includes(currentTier)) {
            // If the light has degraded into 'Dim' territory, only extend the dim polygon.
            dim = distance;
        }
        // If it falls into the 'unlitTiers', the loops effectively stops extending the radii.
    }

    return { bright, dim };
}

/**
 * A lightweight getter to fetch the raw canvas mapping object.
 * Used primarily by the migration scripts to bypass full radii calculation.
 * @returns {Object} The current canvas mapping dictionary.
 */
export function getLightMapping() {
    const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};
    return customMap.canvas || { 0: "bright", 1: "bright", 2: "dim", 3: "dim", 4: "dim", 5: "off", 6: "off" };
}

/**
 * Calculates how far diffused Magical Light bleeds past its core radius boundary.
 * Unlike mundane light, magical light drops 2 tiers immediately upon exiting its
 * defined radius, and then resumes normal degradation.
 * * @param {number} auraStartTier - The degraded tier exactly outside the magical boundary.
 * @returns {number} The maximum additional distance (in feet) the dim light extends.
 */
export function getMagicalExtension(auraStartTier) {
    const dynamicTiers = getDynamicTiers();
    const DISTANCE_THRESHOLDS = [10, 30, 100, 300, 1000, 3000];

    let maxExtension = 0;

    // We start checking at index 1 (30 feet) because the core radius of the magic
    // already inherently covers the first 'step' of illumination.
    let thresholdIndex = 1;

    for (let tier = auraStartTier; tier <= 6; tier++) {
        // The moment the diffused magic degrades into a tier the GM considers "Unlit",
        // the light stops bleeding outward.
        if (dynamicTiers.unlitTiers.includes(tier)) break;

        // As long as the magic is still visible (Bright or Dim), extend the bleed radius.
        if (dynamicTiers.dimTiers.includes(tier) || dynamicTiers.brightTiers.includes(tier)) {
            maxExtension = DISTANCE_THRESHOLDS[thresholdIndex];
            thresholdIndex++;
        }
    }

    return maxExtension;
}

/**
 * Centralised calculation engine that takes raw narrative flags and
 * outputs the exact geometric radii and WebGL priorities for the canvas.
 * This prevents DRY violations between real-time syncing and bulk migrations.
 * * @param {number} tier - The RMU illumination tier (0-6, or -1 for unlit).
 * @param {boolean} isMagical - Whether the source is magical.
 * @param {boolean} isUtter - Whether the source is Utterlight/Utterdark.
 * @param {boolean} isDarknessSource - Whether this source emits darkness.
 * @param {number} coreRadius - The baseline radius for magical scaling (0 for mundane).
 * @returns {Object} An object containing { bright, dim, priority }.
 */
export function calculateLightRenderingData(tier, isMagical, isUtter, isDarknessSource, coreRadius) {
    let targetBright = 0;
    let targetDim = 0;
    let targetPriority = 0;

    // 1. Determine WebGL Rendering Priority
    // By default, Foundry draws light sources based on elevation or creation order.
    // To enforce the RMU absolute hierarchy, we manipulate the WebGL z-index priority.
    // Utterdark (15) > Magical Darkness (5) | Utterlight (20) > Magical Light (10) > Mundane (0).
    if (isMagical) {
        if (isDarknessSource) targetPriority = isUtter ? 15 : 5;
        else targetPriority = isUtter ? 20 : 10;
    }

    // 2. Calculate Baseline Geometry
    if (!isMagical && tier !== -1) {
        // Mundane light strictly follows the predefined physical distances from Table 15-7.
        const generatedRadii = getRadiiForTier(tier);
        targetBright = generatedRadii.bright;
        targetDim = generatedRadii.dim;
    } else if (isMagical) {
        targetBright = coreRadius;

        // Determine if magical light spills beyond its core radius (based on GM settings).
        if (isDarknessSource || !game.settings.get("rmu-lighting-vision", "magicalLightDegrades")) {
            targetDim = coreRadius;
        } else {
            // Step the light down 2 tiers at the boundary, and calculate how far it extends.
            const safeTier = tier === -1 ? 0 : tier;
            const boundaryTier = Math.min(safeTier + 2, 6);
            targetDim = coreRadius + getMagicalExtension(boundaryTier);
        }
    }

    // 3. The Visual Mapping Crusher
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

    return {
        bright: targetBright,
        dim: Math.max(targetBright, targetDim), // Safety wrapper to prevent WebGL inverted radius errors
        priority: targetPriority,
    };
}
