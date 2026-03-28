import { RMU_LIGHT_LEVELS } from "./config.js";
import { getActorVisionCapabilities } from "./vision-parser.js";

/**
 * ============================================================================
 * CORE MATHEMATICS & GEOMETRY PHILOSOPHY
 * ============================================================================
 * Foundry VTT traditionally measures distance from the absolute centre point of
 * one token to the absolute centre point of another. For large creatures (e.g., Dragons),
 * this creates a mathematical failure where a torch bearer standing right next to the
 * creature might calculate as being 30 feet away because the Dragon's centre is so deep.
 * * To fix this, all RMU lighting mathematics measure from the origin point to the
 * CLOSEST EDGE of the target's bounding box.
 * ============================================================================
 */

/**
 * Measures the exact pixel distance from an origin point to the closest edge of a target's bounding box.
 * This perfectly syncs the mathematical engine with Foundry's visual canvas shaders.
 * * @param {Object} origin - The {x, y} pixel coordinates of the light source or observing token.
 * @param {Object|TokenDocument|null} target - The physical token being observed (if any).
 * @param {Object} targetPoint - The exact {x, y} pixel coordinates of the target.
 * @returns {number} The Euclidean distance in pixels.
 */
function getDistanceToTargetEdge(origin, target, targetPoint) {
    // If there is no physical token (e.g., measuring empty floor space for the Heatmap),
    // measure the raw distance directly to the mathematical coordinate.
    if (!target || (target.width === undefined && !target.object)) {
        return Math.hypot(targetPoint.x - origin.x, targetPoint.y - origin.y);
    }

    let bounds;
    // Extract the precise bounding box of the rendered token object.
    if (target.object?.bounds) {
        bounds = target.object.bounds;
    } else {
        // Fallback calculation if the token is not currently rendered on the canvas.
        const width = (target.width || 1) * canvas.grid.size;
        const height = (target.height || 1) * canvas.grid.size;
        bounds = { x: target.x, y: target.y, width: width, height: height };
    }

    // Clamp the origin's coordinates to the nearest physical boundary of the target box.
    const closestX = Math.max(bounds.x, Math.min(origin.x, bounds.x + bounds.width));
    const closestY = Math.max(bounds.y, Math.min(origin.y, bounds.y + bounds.height));

    // Return the hypotenuse (the straight-line distance) between the origin and the clamped edge.
    return Math.hypot(closestX - origin.x, closestY - origin.y);
}

/**
 * Calculates the degraded light tier based on physical distance thresholds.
 * * @param {number} distance - The physical distance in feet from the light source.
 * @param {number} baseTier - The starting illumination tier (0 to 6) at the epicentre.
 * @param {boolean} isMagical - Whether the light source is magical.
 * @param {number} maxRadius - The maximum illuminated radius of the source before natural degradation begins.
 * @returns {number} The final degraded illumination tier (capped at 6: Pitch Black).
 */
function getDegradedTier(distance, baseTier, isMagical, maxRadius) {
    let effectiveDistance = distance;
    let effectiveBase = parseInt(baseTier, 10);

    // The strict distance boundaries defined by RMU Core Law
    const thresholds = [10, 30, 100, 300, 1000, 3000];

    // Magical light requires a completely different degradation pathway based on GM settings
    if (isMagical) {
        // If within the primary radius, magical light does not degrade at all
        if (distance <= maxRadius) return effectiveBase;

        // If the GM has configured magical light to act as a strict spotlight, it drops
        // instantly to Pitch Black the moment it crosses the boundary radius.
        const magicDegrades = game.settings.get("rmu-lighting-vision", "magicalLightDegrades");
        if (!magicDegrades) return 6;

        // Otherwise, magical light suffers an immediate 2-tier penalty upon exiting the radius,
        // and then begins degrading normally from that new baseline.
        effectiveBase = Math.min(baseTier + 2, 6);
        effectiveDistance = Math.max(0, distance - maxRadius);

        // Shift the threshold array down by 1 to represent the diffused state
        const magicalThresholds = thresholds.slice(1);
        let stepsDegraded = 0;

        for (const threshold of magicalThresholds) {
            if (effectiveDistance > threshold) stepsDegraded++;
            else break;
        }

        return Math.min(effectiveBase + stepsDegraded, 6);
    }

    // Standard mundane light degradation loop
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
 * * @param {Object|TokenDocument|null} target - The token being observed (can be null for Heatmaps).
 * @param {Object} targetPoint - The exact {x, y} centre coordinates to measure.
 * @returns {number} The lowest (brightest) light tier affecting the point.
 */
export function getBestIlluminationTier(target, targetPoint) {
    // Step 1: Establish the baseline ambient lighting of the entire scene
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

    // Step 2: Initialise the Tracker Buckets for the Absolute Hierarchy
    let inUtterdark = false;
    let inMagicalDarkness = false;
    let bestUtterlightTier = null;
    let bestMagicalTier = null;
    let bestMundaneTier = globalAmbientTier;

    // Compile all active light sources (both static ambient lights and dynamic token auras)
    const activeAmbientLights = canvas.scene.lights.filter((l) => !l.hidden);
    const activeTokenLights = canvas.scene.tokens.filter((t) => !t.hidden && (t.light?.dim > 0 || t.light?.bright > 0));
    const allLightDocs = [...activeAmbientLights, ...activeTokenLights];

    // Step 3: Iterate through every light source on the map
    for (const lightDoc of allLightDocs) {
        const rmuFlags = lightDoc.flags?.["rmu-lighting-vision"] || {};

        const rawTier = rmuFlags.baseIllumination ?? 0;
        const baseIllumination = parseInt(rawTier, 10);
        if (isNaN(baseIllumination) || baseIllumination === -1) continue;

        const isMagical = rmuFlags.isMagical ?? false;
        const isUtter = rmuFlags.isUtter ?? false;

        // Ensure mundane 'Pitch Black' (Tier 6) sources are correctly flagged as darkness boundaries
        const isDarknessSource = baseIllumination >= 6 || lightDoc.config?.isDarkness === true || (lightDoc.config?.luminosity ?? lightDoc.light?.luminosity) < 0;

        // Determine the epicentre and physical size of the light source
        let lightCenter;
        let emitterRadius = 0;
        if (lightDoc.documentName === "Token") {
            lightCenter = lightDoc.object?.center || {
                x: lightDoc.x + ((lightDoc.width || 1) * canvas.grid.size) / 2,
                y: lightDoc.y + ((lightDoc.height || 1) * canvas.grid.size) / 2,
            };
            emitterRadius = lightDoc.object?.externalRadius ?? (Math.max(lightDoc.width || 1, lightDoc.height || 1) * canvas.grid.size) / 2;
        } else {
            lightCenter = { x: lightDoc.x, y: lightDoc.y };
        }

        let maxRadius = rmuFlags.magicalRadius;
        if (maxRadius === undefined) {
            maxRadius = Math.max(lightDoc.config?.dim || 0, lightDoc.config?.bright || 0, lightDoc.light?.dim || 0, lightDoc.light?.bright || 0);
        }

        // Calculate physical grid distance from the light edge to the target edge
        const pixelDistance = getDistanceToTargetEdge(lightCenter, target, targetPoint);
        const gridDistance = canvas.scene?.grid?.distance ?? 5;
        const distance = Math.max(0, ((pixelDistance - emitterRadius) / canvas.grid.size) * gridDistance);

        // --- PERFORMANCE OPTIMISATION: Initial Boundary Culling ---
        // Exclude lights that mathematically cannot reach the target point.
        if (isDarknessSource && distance > maxRadius) continue;
        if (!isDarknessSource && distance > 3000) continue; // Hard RMU degradation limit

        // --- PERFORMANCE OPTIMISATION: Lazy Evaluation ---
        // We calculate the theoretical power of the light BEFORE checking for physical wall collisions.
        // Firing a WebGL raycast against wall geometry is the most expensive operation in this module.
        // If the theoretical power is already weaker than what we have in our buckets, we skip the raycast entirely.
        let calculatedTier = 6;
        if (!isDarknessSource) {
            calculatedTier = getDegradedTier(distance, baseIllumination, isMagical, maxRadius);

            // Defensive Guard: Magical/Utter lights that degrade to Pitch Black lose their absolute priority.
            // They should not suppress the glow of a local mundane torch.
            if ((isUtter || isMagical) && calculatedTier >= 6) continue;

            // Skip the raycast if this light cannot improve our current best tier
            if (isUtter && bestUtterlightTier !== null && calculatedTier >= bestUtterlightTier) continue;
            if (isMagical && !isUtter && bestMagicalTier !== null && calculatedTier >= bestMagicalTier) continue;
            if (!isMagical && !isUtter && calculatedTier >= bestMundaneTier) continue;
        }

        // Step 4: The Raycast (Only fires if the light is guaranteed to improve the scene)
        const blocksLight = CONFIG.Canvas.polygonBackends.light.testCollision(targetPoint, lightCenter, { type: "light", mode: "any" });
        if (blocksLight) continue;

        // Step 5: Assign the verified, unblocked light to the correct Hierarchy Bucket
        if (isDarknessSource) {
            if (isUtter) inUtterdark = true;
            else inMagicalDarkness = true;
            continue;
        }

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
    // This resolves the strict narrative order of operations for RMU magic logic.

    // 1. Utterlight is supreme. It suppresses all darkness (both magical and mundane).
    if (bestUtterlightTier !== null) return bestUtterlightTier;

    // 2. Utterdark is absolute. It suppresses all non-Utter light.
    if (inUtterdark) return 6; // Pitch Black

    // 3. Magical Light overcomes normal Magical Darkness.
    if (bestMagicalTier !== null) return bestMagicalTier;

    // 4. Magical Darkness swallows all non-magical (mundane) light.
    if (inMagicalDarkness) return 6; // Pitch Black

    // 5. Normal Environment (Mundane light vs Mundane shadows).
    return bestMundaneTier;
}

/**
 * Translates the final illumination tier into the exact mechanical numerical penalties.
 * * @param {number} tier - The environmental light tier (0-6).
 * @param {boolean} hasLesserNightvision - Whether the observer is using Lesser Nightvision.
 * @param {boolean} hasNightvision - Whether the observer is using standard Nightvision.
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

    // Darkvision natively pierces all shadows perfectly.
    if (hasDarkvision) {
        return { penaltyFull: 0, penaltyHalf: 0 };
    }

    // Apply the standard or lesser Nightvision offset.
    // Note: Pitch Black (-100) is absolute blindness for mundane vision and cannot be offset.
    if (hasNightvision && tier !== RMU_LIGHT_LEVELS.PITCH_BLACK) {
        penalty = Math.min(0, penalty + 40);
    } else if (hasLesserNightvision && tier !== RMU_LIGHT_LEVELS.PITCH_BLACK) {
        penalty = Math.min(0, penalty + 20);
    }

    return {
        penaltyFull: penalty,
        // Half penalties map to the "Sight Helpful" mechanical rules in RMU, rounded towards zero.
        penaltyHalf: Math.ceil(penalty / 2),
    };
}

/**
 * ============================================================================
 * PUBLIC API ENGINE
 * ============================================================================
 * Analyses the canvas to determine the comprehensive lighting state between two points,
 * accounting for physical walls, magical darkness boundaries, and vision talents.
 * * @param {TokenDocument} sourceDoc - The token observing the scene.
 * @param {Object|TokenDocument} target - The token OR {x, y} coordinate being observed.
 * @returns {Object} The final state object including tier, line of sight, and penalties.
 */
export function determineLightingState(sourceDoc, target) {
    const sourceCenter = sourceDoc.object ? sourceDoc.object.center : { x: sourceDoc.x, y: sourceDoc.y };

    // Extract the physical radius of the observing token
    const sourceRadius = sourceDoc.object?.externalRadius ?? (Math.max(sourceDoc.width || 1, sourceDoc.height || 1) * canvas.grid.size) / 2;
    const targetPoint = target.object ? target.object.center : target.x !== undefined ? target : { x: target.x, y: target.y };

    const pixelDistance = getDistanceToTargetEdge(sourceCenter, target, targetPoint);
    const gridDistance = canvas.scene?.grid?.distance ?? 5;

    // Subtract the observer's radius so that Darkvision ranges project accurately from the token's edge
    const distanceToTarget = Math.max(0, ((pixelDistance - sourceRadius) / canvas.grid.size) * gridDistance);

    // Step 1: Extract and aggregate the observer's vision capabilities
    const visionMode = sourceDoc.sight?.visionMode;
    const visionRange = sourceDoc.sight?.range || 0;
    const nativeVision = getActorVisionCapabilities(sourceDoc.actor);

    const hasLesserNightvision = nativeVision.hasLesserNightvision;
    const hasNightvision = visionMode === "nightvision" || nativeVision.hasNativeNightvision;
    const hasDarkvision = visionMode === "darkvision" || nativeVision.hasNativeDarkvision;
    const hasThermal = visionMode === "rmuThermal" || nativeVision.hasThermalVision;
    const hasDemonSight = visionMode === "rmuDemonSight" || nativeVision.hasDemonSight;

    let blocksSight = false;

    // Step 2: Test Physical Walls
    // We leverage Foundry's native sight polygon if it is already cached, otherwise we manually raycast.
    if (sourceDoc.object?.vision?.los) {
        blocksSight = !sourceDoc.object.vision.los.contains(targetPoint.x, targetPoint.y);
    } else {
        blocksSight = CONFIG.Canvas.polygonBackends.sight.testCollision(sourceCenter, targetPoint, {
            type: "sight",
            mode: "any",
        });
    }

    // Step 3: Darkness Edge Piercing Check
    // If there are no physical walls blocking the view, we must check if magical darkness blocks it.
    if (!blocksSight) {
        // Grab every edge intersection on the light layer (which maps darkness boundaries)
        const lightCollisions = CONFIG.Canvas.polygonBackends.light.testCollision(sourceCenter, targetPoint, { type: "light", mode: "all" });

        if (lightCollisions && lightCollisions.length > 0) {
            // Determine the absolute maximum distance the observer can pierce through magical darkness
            let piercingRange = 0;
            if (hasDemonSight) piercingRange = nativeVision.demonSightRange || 100;
            else if (hasThermal) piercingRange = nativeVision.thermalRange || 50;
            else if (hasDarkvision) piercingRange = visionRange;
            // Note: Standard Vision and Nightvision have 0 piercing range. They are blocked instantly at the darkness edge.

            for (const pt of lightCollisions) {
                const distToEdgePixel = Math.hypot(pt.x - sourceCenter.x, pt.y - sourceCenter.y);
                const distToEdgeGrid = Math.max(0, ((distToEdgePixel - sourceRadius) / canvas.grid.size) * gridDistance);

                // If the darkness edge is further away than their vision can piece, Line of Sight is broken.
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

    // Step 4: Resolve dynamic vision downgrades
    // Example: Demon sight acts as Darkvision for 100ft, but downgrades to Nightvision beyond that limit.
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

    // Step 5: Final Evaluation
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
