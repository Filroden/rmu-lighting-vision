import { RMU_LIGHT_LEVELS } from "./config.js";

/**
 * Calculates the exact RMU lighting tier based on distance from the source.
 * @param {number} distance - The grid distance in feet.
 * @param {number} baseIllumination - The starting tier of the light source (0-6).
 * @param {boolean} isMagical - Whether the light source is magical.
 * @returns {number} The degraded lighting tier (0-6).
 */
function getDegradedTier(distance, baseIllumination, isMagical) {
    // If the GM configured magical light not to degrade, return the base illumination up to its max radius.
    // We assume the maximum radius is handled by the VTT's token vision cut-off before this function is called.
    const magicDegrades = game.settings.get("rmu-lighting-vision", "magicalLightDegrades");
    if (isMagical && !magicDegrades) {
        return baseIllumination;
    }

    // Calculate degradation steps based on RMU distance brackets
    let degradationSteps = 0;
    if (distance > 100) {
        degradationSteps = 3;
    } else if (distance > 30) {
        degradationSteps = 2;
    } else if (distance > 10) {
        degradationSteps = 1;
    }

    // Add the steps to the base tier, capping it at Pitch Black (6)
    return Math.min(baseIllumination + degradationSteps, RMU_LIGHT_LEVELS.PITCH_BLACK);
}

/**
 * Iterates over all light sources to find the best illumination for a specific point.
 * @param {Object} targetPoint - The {x, y} coordinates being illuminated.
 * @returns {number} The lowest (brightest) light tier affecting the point.
 */
function getBestIlluminationTier(targetPoint) {
    let bestTier = RMU_LIGHT_LEVELS.PITCH_BLACK;
    let inMagicalDarkness = false;

    const allLightDocs = [...canvas.scene.lights, ...canvas.scene.tokens.filter((t) => t.light.active)];

    for (const lightDoc of allLightDocs) {
        const rmuFlags = lightDoc.flags?.["rmu-lighting-vision"] || {};
        const baseIllumination = rmuFlags.baseIllumination ?? RMU_LIGHT_LEVELS.BRIGHT;
        const isMagical = rmuFlags.isMagical ?? false;
        const isDarknessSource = (lightDoc.config?.luminosity ?? lightDoc.light?.luminosity) < 0;

        const lightCenter = lightDoc.object ? lightDoc.object.center : { x: lightDoc.x, y: lightDoc.y };

        // 1. LIGHT COLLISION: Does a wall block this light from reaching the target point?
        const blocksLight = CONFIG.Canvas.polygonBackends.light.testCollision(targetPoint, lightCenter, { type: "light", mode: "any" });
        if (blocksLight) continue; // Skip this light source entirely

        const path = canvas.grid.measurePath([targetPoint, lightCenter]);
        const distance = path.distance;

        const maxRadius = Math.max(lightDoc.config?.dim || 0, lightDoc.config?.bright || 0, lightDoc.light?.dim || 0, lightDoc.light?.bright || 0);
        if (distance > maxRadius) continue;

        if (isDarknessSource) {
            inMagicalDarkness = true;
            continue;
        }

        const calculatedTier = getDegradedTier(distance, baseIllumination, isMagical);
        if (calculatedTier < bestTier) bestTier = calculatedTier;
    }

    if (inMagicalDarkness) {
        bestTier = Math.max(bestTier, RMU_LIGHT_LEVELS.EXTREMELY_DARK);
    }

    return bestTier;
}

/**
 * Calculates the exact numerical penalties based on tier and active vision modes.
 * @param {number} tier - The environmental light tier (0-6).
 * @param {boolean} hasNightvision - Whether the observer is using Nightvision.
 * @param {boolean} hasDarkvision - Whether the observer is using Darkvision.
 * @returns {Object} An object containing { penaltyFull, penaltyHalf }.
 */
function calculatePenalties(tier, hasNightvision, hasDarkvision) {
    // Base RMU penalties mapped directly to the tier integers
    const basePenalties = {
        [RMU_LIGHT_LEVELS.BRIGHT]: 0,
        [RMU_LIGHT_LEVELS.UNEVEN]: -10,
        [RMU_LIGHT_LEVELS.DIM]: -20,
        [RMU_LIGHT_LEVELS.SHADOWY]: -30,
        [RMU_LIGHT_LEVELS.DARK]: -50,
        [RMU_LIGHT_LEVELS.EXTREMELY_DARK]: -70,
        [RMU_LIGHT_LEVELS.PITCH_BLACK]: -100,
    };

    let penalty = basePenalties[tier];

    // Darkvision completely negates all darkness penalties[cite: 38].
    if (hasDarkvision) {
        return { penaltyFull: 0, penaltyHalf: 0 };
    }

    // Nightvision offsets penalties by +40, but provides no benefit in Pitch Black/Utterdark[cite: 31, 32].
    if (hasNightvision && tier !== RMU_LIGHT_LEVELS.PITCH_BLACK) {
        penalty = Math.min(0, penalty + 40); // Penalty cannot become a positive bonus
    }

    return {
        penaltyFull: penalty,
        penaltyHalf: Math.ceil(penalty / 2), // Rounding toward zero for half penalties
    };
}

/**
 * Interrogates the RMU Actor document to see if they possess vision traits or active spells.
 * @param {Actor} actor - The actor document to check.
 * @returns {Object} { hasNativeNightvision, hasNativeDarkvision }
 */
function getActorVisionCapabilities(actor) {
    if (!actor) return { hasNativeNightvision: false, hasNativeDarkvision: false };

    // Checking the actor's items for talents, traits, or active spells granting vision.
    // The exact logic can be refined based on the RMU system's specific item types or flags.
    const hasNativeNightvision = actor.items.some((i) => i.name.toLowerCase() === "nightvision");
    const hasNativeDarkvision = actor.items.some((i) => i.name.toLowerCase() === "darkvision");

    return { hasNativeNightvision, hasNativeDarkvision };
}

/**
 * Public API method: Analyses the canvas to determine the lighting state.
 * @param {TokenDocument} sourceDoc - The token observing.
 * @param {Object|TokenDocument} target - The token OR {x, y} point being observed.
 */
export function determineLightingState(sourceDoc, target) {
    const sourceCenter = sourceDoc.object ? sourceDoc.object.center : { x: sourceDoc.x, y: sourceDoc.y };
    const targetPoint = target.object ? target.object.center : target.x !== undefined ? target : { x: target.x, y: target.y };

    // 2. SIGHT COLLISION: Does a wall block the observer from seeing the target point?
    const blocksSight = CONFIG.Canvas.polygonBackends.sight.testCollision(sourceCenter, targetPoint, { type: "sight", mode: "any" });

    const path = canvas.grid.measurePath([sourceCenter, targetPoint]);
    const distanceToTarget = path.distance;

    // If a wall is in the way, immediately abort calculation and return the failure state
    if (blocksSight) {
        return {
            hasLineOfSight: false,
            distance: distanceToTarget,
        };
    }

    const visionMode = sourceDoc.sight?.visionMode;
    const visionRange = sourceDoc.sight?.range || 0;
    const nativeVision = getActorVisionCapabilities(sourceDoc.actor);

    let hasNightvision = visionMode === "nightvision" || nativeVision.hasNativeNightvision;
    let hasDarkvision = visionMode === "darkvision" || nativeVision.hasNativeDarkvision;

    if (hasDarkvision && distanceToTarget > visionRange) {
        hasDarkvision = false;
    }

    const tier = getBestIlluminationTier(targetPoint);
    const { penaltyFull, penaltyHalf } = calculatePenalties(tier, hasNightvision, hasDarkvision);

    return {
        tier,
        hasNightvision,
        hasDarkvision,
        penaltyFull,
        penaltyHalf,
        distance: distanceToTarget,
        hasLineOfSight: true,
    };
}
