import { RMU_LIGHT_LEVELS } from "./config.js";
import { getActorVisionCapabilities } from "./vision-parser.js";

/**
 * Calculates the degraded light tier based on physical distance.
 * @param {number} distance - The distance in feet from the light source.
 * @param {number} baseTier - The starting illumination tier (0 to 6).
 * @param {boolean} isMagical - Whether the light source is magical.
 * @param {number} maxRadius - The maximum illuminated radius of the source.
 * @returns {number} The final degraded illumination tier.
 */
function getDegradedTier(distance, baseTier, isMagical, maxRadius) {
    let effectiveDistance = distance;
    let effectiveBase = parseInt(baseTier, 10);

    if (isMagical) {
        // Inside the spell's radius, the light is perfect (diffuse/ambient)
        if (distance <= maxRadius) return effectiveBase;

        // Outside the radius, check the GM setting
        const magicDegrades = game.settings.get("rmu-lighting-vision", "magicalLightDegrades");

        if (!magicDegrades) {
            return 6; // Strict mode: Hard edge, pitch black immediately beyond the radius
        }

        // Designer's Mode: Drops 2 levels immediately outside the boundary
        effectiveBase = Math.min(baseTier + 2, 6);
        // Shift the distance calculation so degradation starts at the edge of the spell, not the center
        effectiveDistance = Math.max(0, distance - maxRadius);
    }

    const thresholds = [10, 30, 100, 300, 1000, 3000];
    let stepsDegraded = 0;

    for (const threshold of thresholds) {
        if (effectiveDistance > threshold) {
            stepsDegraded++;
        } else {
            break;
        }
    }

    return Math.min(effectiveBase + stepsDegraded, 6);
}

/**
 * Iterates over all light sources to find the best illumination for a specific point.
 * @param {Object} targetPoint - The {x, y} coordinates being illuminated.
 * @returns {number} The lowest (brightest) light tier affecting the point.
 */
function getBestIlluminationTier(targetPoint) {
    // 1. Establish the baseline ambient light of the room/map based on the GM's darkness slider
    let bestTier = 6;
    if (canvas.scene) {
        const darkness = canvas.scene.environment?.darknessLevel ?? canvas.scene.darkness;

        if (darkness === 0) bestTier = 0;
        else if (darkness <= 0.25) bestTier = 1;
        else if (darkness <= 0.5) bestTier = 2;
        else if (darkness <= 0.75) bestTier = 4;
        else bestTier = 6;
    }

    let inMagicalDarkness = false;

    // 2. Safely gather all active lights
    const activeAmbientLights = canvas.scene.lights.filter((l) => !l.hidden);
    const activeTokenLights = canvas.scene.tokens.filter((t) => !t.hidden && (t.light?.dim > 0 || t.light?.bright > 0));
    const allLightDocs = [...activeAmbientLights, ...activeTokenLights];

    for (const lightDoc of allLightDocs) {
        const rmuFlags = lightDoc.flags?.["rmu-lighting-vision"] || {};

        // 3. Parse the string and explicitly ignore tokens set to "-1" (None)
        const rawTier = rmuFlags.baseIllumination ?? 0;
        const baseIllumination = parseInt(rawTier, 10);
        if (isNaN(baseIllumination) || baseIllumination === -1) continue;

        const isMagical = rmuFlags.isMagical ?? false;
        const isDarknessSource = (lightDoc.config?.luminosity ?? lightDoc.light?.luminosity) < 0;

        let lightCenter;
        if (lightDoc.documentName === "Token") {
            lightCenter = lightDoc.object?.center || {
                x: lightDoc.x + ((lightDoc.width || 1) * canvas.grid.size) / 2,
                y: lightDoc.y + ((lightDoc.height || 1) * canvas.grid.size) / 2,
            };
        } else {
            lightCenter = { x: lightDoc.x, y: lightDoc.y };
        }

        const blocksLight = CONFIG.Canvas.polygonBackends.light.testCollision(targetPoint, lightCenter, { type: "light", mode: "any" });
        if (blocksLight) continue;

        const path = canvas.grid.measurePath([targetPoint, lightCenter]);
        const distance = path.distance;
        const maxRadius = Math.max(lightDoc.config?.dim || 0, lightDoc.config?.bright || 0, lightDoc.light?.dim || 0, lightDoc.light?.bright || 0);

        if (!isMagical && distance > maxRadius) continue;

        if (isDarknessSource) {
            inMagicalDarkness = true;
            continue;
        }

        const calculatedTier = getDegradedTier(distance, baseIllumination, isMagical, maxRadius);
        if (calculatedTier < bestTier) bestTier = calculatedTier;
    }

    if (inMagicalDarkness) {
        bestTier = Math.max(bestTier, 5); // RMU Extremely Dark
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
 * Public API method: Analyses the canvas to determine the lighting state.
 * @param {TokenDocument} sourceDoc - The token observing.
 * @param {Object|TokenDocument} target - The token OR {x, y} point being observed.
 */
export function determineLightingState(sourceDoc, target) {
    const sourceCenter = sourceDoc.object ? sourceDoc.object.center : { x: sourceDoc.x, y: sourceDoc.y };
    const targetPoint = target.object ? target.object.center : target.x !== undefined ? target : { x: target.x, y: target.y };

    const blocksSight = CONFIG.Canvas.polygonBackends.sight.testCollision(sourceCenter, targetPoint, { type: "sight", mode: "any" });
    const path = canvas.grid.measurePath([sourceCenter, targetPoint]);
    const distanceToTarget = path.distance;

    if (blocksSight) {
        return { hasLineOfSight: false, distance: distanceToTarget };
    }

    const visionMode = sourceDoc.sight?.visionMode;
    const visionRange = sourceDoc.sight?.range || 0;
    const nativeVision = getActorVisionCapabilities(sourceDoc.actor);

    // Extract all potential vision states
    const hasNightvision = visionMode === "nightvision" || nativeVision.hasNativeNightvision;
    const hasDarkvision = visionMode === "darkvision" || nativeVision.hasNativeDarkvision;
    const hasThermal = visionMode === "rmuThermal" || nativeVision.hasThermalVision;
    const hasDemonSight = visionMode === "rmuDemonSight" || nativeVision.hasDemonSight;

    // Resolve what the effective math should be based on distance and hierarchy
    let effectiveDarkvision = false;
    let effectiveNightvision = hasNightvision;
    let activeSpecialVision = false; // Flag to tell the chat card if Thermal/Demon is actively helping

    if (hasDemonSight) {
        if (distanceToTarget <= (nativeVision.demonSightRange || 100)) {
            effectiveDarkvision = true;
            activeSpecialVision = "demonSight";
        } else {
            effectiveNightvision = true; // Demon sight acts as nightvision beyond 100'
            activeSpecialVision = "demonSight";
        }
    } else if (hasThermal && distanceToTarget <= (nativeVision.thermalRange || 50)) {
        effectiveDarkvision = true;
        activeSpecialVision = "thermal";
    } else if (hasDarkvision && distanceToTarget <= visionRange) {
        effectiveDarkvision = true;
    }

    const tier = getBestIlluminationTier(targetPoint);
    const { penaltyFull, penaltyHalf } = calculatePenalties(tier, effectiveNightvision, effectiveDarkvision);

    return {
        tier,
        hasNightvision: effectiveNightvision,
        hasDarkvision: effectiveDarkvision,
        activeSpecialVision, // Passes the specific mode to the chat parser
        penaltyFull,
        penaltyHalf,
        distance: distanceToTarget,
        hasLineOfSight: true,
    };
}
