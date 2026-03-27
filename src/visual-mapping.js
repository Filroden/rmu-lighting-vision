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
