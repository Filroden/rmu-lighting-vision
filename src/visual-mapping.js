/**
 * Central configuration matrix for translating RMU mechanical tiers into VTT visual states.
 * Adjust these arrays to test different community rulings.
 */
export const VISUAL_TIERS = {
    // RMU Tiers that render as fully lit
    brightTiers: [0, 1, 2],
    // RMU Tiers that render as shadowy/dim
    dimTiers: [3, 4],
    // RMU Tiers that are swallowed by fog of war
    unlitTiers: [5, 6],
};

const DISTANCE_THRESHOLDS = [10, 30, 100, 300, 1000, 3000];

/**
 * Dynamically calculates the Foundry VTT bright and dim radii for a given starting tier
 * by cross-referencing the distance thresholds against the tier matrix.
 * @param {number} baseTier - The starting RMU illumination tier.
 * @returns {Object} An object containing { bright, dim } distances.
 */
export function getRadiiForTier(baseTier) {
    if (baseTier === -1 || baseTier === undefined) return { bright: 0, dim: 0 };

    let bright = 0;
    let dim = 0;

    for (let i = 0; i < DISTANCE_THRESHOLDS.length; i++) {
        const currentTier = Math.min(baseTier + i, 6);
        const distance = DISTANCE_THRESHOLDS[i];

        if (VISUAL_TIERS.brightTiers.includes(currentTier)) {
            bright = distance;
            dim = distance; // Foundry requires dim to be at least equal to bright
        } else if (VISUAL_TIERS.dimTiers.includes(currentTier)) {
            dim = distance;
        }
    }

    return { bright, dim };
}
