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
    const thresholds = [10, 30, 100, 300, 1000, 3000];

    if (isMagical) {
        if (distance <= maxRadius) return effectiveBase;

        const magicDegrades = game.settings.get("rmu-lighting-vision", "magicalLightDegrades");
        if (!magicDegrades) return 6;

        effectiveBase = Math.min(baseTier + 2, 6);
        effectiveDistance = Math.max(0, distance - maxRadius);

        // Shift the array for diffused magical light
        const magicalThresholds = thresholds.slice(1);
        let stepsDegraded = 0;

        for (const threshold of magicalThresholds) {
            if (effectiveDistance > threshold) stepsDegraded++;
            else break;
        }

        return Math.min(effectiveBase + stepsDegraded, 6);
    }

    let stepsDegraded = 0;
    for (const threshold of thresholds) {
        if (effectiveDistance > threshold) stepsDegraded++;
        else break;
    }

    return Math.min(effectiveBase + stepsDegraded, 6);
}

/**
 * Iterates over all light sources to find the best illumination for a specific point,
 * strictly enforcing the RMU Utter-tier and Magical hierarchies.
 * @param {Object} targetPoint - The {x, y} coordinates being illuminated.
 * @returns {number} The lowest (brightest) light tier affecting the point.
 */
function getBestIlluminationTier(targetPoint) {
    let globalAmbientTier = 6;
    if (canvas.scene) {
        const isGlobalLightEnabled = canvas.scene.environment?.globalLight?.enabled ?? canvas.scene.globalLight ?? false;
        if (isGlobalLightEnabled) {
            const darkness = canvas.scene.environment?.darknessLevel ?? canvas.scene.darkness;
            if (darkness === 0) globalAmbientTier = 0;
            else if (darkness <= 0.25) globalAmbientTier = 1;
            else if (darkness <= 0.5) globalAmbientTier = 2;
            else if (darkness <= 0.75) globalAmbientTier = 4;
            else globalAmbientTier = 6;
        }
    }

    // Tracker Buckets for the Absolute Hierarchy
    let inUtterdark = false;
    let inMagicalDarkness = false;
    let bestUtterlightTier = null;
    let bestMagicalTier = null;
    let bestMundaneTier = globalAmbientTier;

    const activeAmbientLights = canvas.scene.lights.filter((l) => !l.hidden);
    const activeTokenLights = canvas.scene.tokens.filter((t) => !t.hidden && (t.light?.dim > 0 || t.light?.bright > 0));
    const allLightDocs = [...activeAmbientLights, ...activeTokenLights];

    for (const lightDoc of allLightDocs) {
        const rmuFlags = lightDoc.flags?.["rmu-lighting-vision"] || {};

        const rawTier = rmuFlags.baseIllumination ?? 0;
        const baseIllumination = parseInt(rawTier, 10);
        if (isNaN(baseIllumination) || baseIllumination === -1) continue;

        const isMagical = rmuFlags.isMagical ?? false;
        const isUtter = rmuFlags.isUtter ?? false; // Grab the new UI flag
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

        // Read the true core radius directly from the module flag if it exists
        let maxRadius = rmuFlags.magicalRadius;
        if (maxRadius === undefined) {
            maxRadius = Math.max(lightDoc.config?.dim || 0, lightDoc.config?.bright || 0, lightDoc.light?.dim || 0, lightDoc.light?.bright || 0);
        }

        if (!isMagical && distance > maxRadius) continue;

        // Categorize Darkness Sources
        if (isDarknessSource) {
            if (isUtter) inUtterdark = true;
            else inMagicalDarkness = true;
            continue;
        }

        const calculatedTier = getDegradedTier(distance, baseIllumination, isMagical, maxRadius);

        // Categorize Light Sources
        if (isUtter) {
            if (bestUtterlightTier === null || calculatedTier < bestUtterlightTier) bestUtterlightTier = calculatedTier;
        } else if (isMagical) {
            if (bestMagicalTier === null || calculatedTier < bestMagicalTier) bestMagicalTier = calculatedTier;
        } else {
            if (calculatedTier < bestMundaneTier) bestMundaneTier = calculatedTier;
        }
    }

    // =========================================================
    // THE ABSOLUTE HIERARCHY EVALUATION
    // =========================================================

    // 1. Utterlight suppresses all darkness (magical and mundane)
    if (bestUtterlightTier !== null) return bestUtterlightTier;

    // 2. Utterdark suppresses all non-Utter light
    if (inUtterdark) return 6; // Pitch Black

    // 3. Magical Light overcomes normal Magical Darkness
    if (bestMagicalTier !== null) return bestMagicalTier;

    // 4. Magical Darkness hides non-magical light
    if (inMagicalDarkness) return 5; // Extremely Dark

    // 5. Normal Environment
    return bestMundaneTier;
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
            effectiveNightvision = true;
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
