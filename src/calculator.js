import { RMU_LIGHT_LEVELS } from "./config.js";
import { getActorVisionCapabilities } from "./vision-parser.js";

/**
 * Measures the exact pixel distance from an origin point to the closest edge of a target's bounding box.
 * This perfectly syncs the math engine with Foundry's visual canvas shaders.
 */
function getDistanceToTargetEdge(origin, target, targetPoint) {
    if (!target || (target.width === undefined && !target.object)) {
        return Math.hypot(targetPoint.x - origin.x, targetPoint.y - origin.y);
    }

    let bounds;
    if (target.object?.bounds) {
        bounds = target.object.bounds;
    } else {
        const width = (target.width || 1) * canvas.grid.size;
        const height = (target.height || 1) * canvas.grid.size;
        bounds = { x: target.x, y: target.y, width: width, height: height };
    }

    // Find the closest point on the target's rectangular boundary to the origin
    const closestX = Math.max(bounds.x, Math.min(origin.x, bounds.x + bounds.width));
    const closestY = Math.max(bounds.y, Math.min(origin.y, bounds.y + bounds.height));

    return Math.hypot(closestX - origin.x, closestY - origin.y);
}

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
 * @param {Object|TokenDocument} target - The token being observed.
 * @param {Object} targetPoint - The exact {x, y} centre coordinates.
 * @returns {number} The lowest (brightest) light tier affecting the point.
 */
export function getBestIlluminationTier(target, targetPoint) {
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
        const isUtter = rmuFlags.isUtter ?? false;

        // Ensure mundane 'Pitch Black' (Tier 6) sources are correctly flagged as darkness boundaries
        const isDarknessSource = baseIllumination >= 6 || lightDoc.config?.isDarkness === true || (lightDoc.config?.luminosity ?? lightDoc.light?.luminosity) < 0;

        let lightCenter;
        let emitterRadius = 0; // Track the physical size of the light source
        if (lightDoc.documentName === "Token") {
            lightCenter = lightDoc.object?.center || {
                x: lightDoc.x + ((lightDoc.width || 1) * canvas.grid.size) / 2,
                y: lightDoc.y + ((lightDoc.height || 1) * canvas.grid.size) / 2,
            };
            // Extract Foundry's native externalRadius, or calculate it safely if the object isn't fully rendered
            emitterRadius = lightDoc.object?.externalRadius ?? (Math.max(lightDoc.width || 1, lightDoc.height || 1) * canvas.grid.size) / 2;
        } else {
            // Standard ambient lights have no physical presence, so their radius remains 0
            lightCenter = { x: lightDoc.x, y: lightDoc.y };
        }

        // Determine base constraints before doing ANY heavy lifting
        let maxRadius = rmuFlags.magicalRadius;
        if (maxRadius === undefined) {
            maxRadius = Math.max(lightDoc.config?.dim || 0, lightDoc.config?.bright || 0, lightDoc.light?.dim || 0, lightDoc.light?.bright || 0);
        }

        // Calculate radial distance to the target's edge
        const pixelDistance = getDistanceToTargetEdge(lightCenter, target, targetPoint);
        const gridDistance = canvas.scene?.grid?.distance ?? 5;
        const distance = Math.max(0, ((pixelDistance - emitterRadius) / canvas.grid.size) * gridDistance);

        // Initial Boundary Culling
        if (isDarknessSource && distance > maxRadius) continue;
        if (!isDarknessSource && distance > 3000) continue;

        // LAZY EVALUATION: Calculate theoretical light power BEFORE checking wall collisions
        let calculatedTier = 6;
        if (!isDarknessSource) {
            calculatedTier = getDegradedTier(distance, baseIllumination, isMagical, maxRadius);

            // Magical and Utter lights that degrade to Pitch Black lose their absolute priority.
            // If they reach Tier 6, they should not suppress local mundane lights.
            if ((isUtter || isMagical) && calculatedTier >= 6) continue;

            // If this light's theoretical best is weaker than what we already have, SKIP the expensive wall check!
            if (isUtter && bestUtterlightTier !== null && calculatedTier >= bestUtterlightTier) continue;
            if (isMagical && !isUtter && bestMagicalTier !== null && calculatedTier >= bestMagicalTier) continue;
            if (!isMagical && !isUtter && calculatedTier >= bestMundaneTier) continue;
        }

        // THE EXPENSIVE RAYCAST
        const blocksLight = CONFIG.Canvas.polygonBackends.light.testCollision(targetPoint, lightCenter, { type: "light", mode: "any" });
        if (blocksLight) continue;

        // Apply the verified tiers to our hierarchy buckets
        if (isDarknessSource) {
            if (isUtter) inUtterdark = true;
            else inMagicalDarkness = true;
            continue;
        }

        // HIERARCHY GUARDS
        if (isUtter) {
            if (calculatedTier < 6 && (bestUtterlightTier === null || calculatedTier < bestUtterlightTier)) {
                bestUtterlightTier = calculatedTier;
            }
        } else if (isMagical) {
            if (calculatedTier < 6 && (bestMagicalTier === null || calculatedTier < bestMagicalTier)) {
                bestMagicalTier = calculatedTier;
            }
        } else {
            if (calculatedTier < bestMundaneTier) {
                bestMundaneTier = calculatedTier;
            }
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
    if (inMagicalDarkness) return 6; // Pitch Black

    // 5. Normal Environment
    return bestMundaneTier;
}

/**
 * Calculates the exact numerical penalties based on tier and active vision modes.
 * @param {number} tier - The environmental light tier (0-6).
 * * @param {boolean} hasLesserNightvision - Whether the observer is using Lesser Nightvision.
 * @param {boolean} hasNightvision - Whether the observer is using Nightvision.
 * @param {boolean} hasDarkvision - Whether the observer is using Darkvision.
 * @returns {Object} An object containing { penaltyFull, penaltyHalf }.
 */
function calculatePenalties(tier, hasLesserNightvision, hasNightvision, hasDarkvision) {
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

    // Apply the standard or lesser Nighvision offset, ignoring Pitch Black
    if (hasNightvision && tier !== RMU_LIGHT_LEVELS.PITCH_BLACK) {
        penalty = Math.min(0, penalty + 40);
    } else if (hasLesserNightvision && tier !== RMU_LIGHT_LEVELS.PITCH_BLACK) {
        penalty = Math.min(0, penalty + 20); // Lesser Nightvision offset
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
    // Track the physical size of the observing token
    const sourceRadius = sourceDoc.object?.externalRadius ?? (Math.max(sourceDoc.width || 1, sourceDoc.height || 1) * canvas.grid.size) / 2;

    const targetPoint = target.object ? target.object.center : target.x !== undefined ? target : { x: target.x, y: target.y };

    // Pass targetPoint into the helper
    const pixelDistance = getDistanceToTargetEdge(sourceCenter, target, targetPoint);
    const gridDistance = canvas.scene?.grid?.distance ?? 5;

    // Subtract the observer's radius so Darkvision ranges project from the token edge
    const distanceToTarget = Math.max(0, ((pixelDistance - sourceRadius) / canvas.grid.size) * gridDistance);

    // 1. Extract vision capabilities
    const visionMode = sourceDoc.sight?.visionMode;
    const visionRange = sourceDoc.sight?.range || 0;
    const nativeVision = getActorVisionCapabilities(sourceDoc.actor);

    const hasLesserNightvision = nativeVision.hasLesserNightvision;
    const hasNightvision = visionMode === "nightvision" || nativeVision.hasNativeNightvision;
    const hasDarkvision = visionMode === "darkvision" || nativeVision.hasNativeDarkvision;
    const hasThermal = visionMode === "rmuThermal" || nativeVision.hasThermalVision;
    const hasDemonSight = visionMode === "rmuDemonSight" || nativeVision.hasDemonSight;

    let blocksSight = false;

    // 2. Test physical walls
    if (sourceDoc.object?.vision?.los) {
        blocksSight = !sourceDoc.object.vision.los.contains(targetPoint.x, targetPoint.y);
    } else {
        blocksSight = CONFIG.Canvas.polygonBackends.sight.testCollision(sourceCenter, targetPoint, {
            type: "sight",
            mode: "any",
        });
    }

    // 3. Darkness Edge Piercing Check
    if (!blocksSight) {
        // Grab every edge intersection on the light layer (which includes darkness boundaries)
        const lightCollisions = CONFIG.Canvas.polygonBackends.light.testCollision(sourceCenter, targetPoint, { type: "light", mode: "all" });

        if (lightCollisions && lightCollisions.length > 0) {
            // Determine the absolute maximum distance the observer can pierce through darkness
            let piercingRange = 0;
            if (hasDemonSight) piercingRange = nativeVision.demonSightRange || 100;
            else if (hasThermal) piercingRange = nativeVision.thermalRange || 50;
            else if (hasDarkvision) piercingRange = visionRange;
            // Note: Normal/Nightvision have 0 piercing range and will be blocked instantly at the edge

            for (const pt of lightCollisions) {
                const distToEdgePixel = Math.hypot(pt.x - sourceCenter.x, pt.y - sourceCenter.y);
                // Subtract the observer's radius here as well
                const distToEdgeGrid = Math.max(0, ((distToEdgePixel - sourceRadius) / canvas.grid.size) * gridDistance);

                // If the darkness edge is further away than their vision can pierce, sight is blocked!
                if (distToEdgeGrid > piercingRange + 0.1) {
                    blocksSight = true;
                    break;
                }
            }
        }
    }

    if (blocksSight) {
        return { hasLineOfSight: false, distance: distanceToTarget };
    }

    // Resolve what the effective math should be based on distance and hierarchy
    let effectiveDarkvision = false;
    let effectiveNightvision = hasNightvision;
    let activeSpecialVision = false;

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

    // Pass both the full target and the targetPoint
    const tier = getBestIlluminationTier(target, targetPoint);
    const { penaltyFull, penaltyHalf } = calculatePenalties(tier, hasLesserNightvision, effectiveNightvision, effectiveDarkvision);

    return {
        tier,
        hasLesserNightvision,
        hasNightvision: effectiveNightvision,
        hasDarkvision: effectiveDarkvision,
        activeSpecialVision,
        penaltyFull,
        penaltyHalf,
        distance: distanceToTarget,
        hasLineOfSight: true,
    };
}
