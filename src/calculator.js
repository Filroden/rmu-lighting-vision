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
    let effectiveBase = Number.parseInt(baseTier, 10);

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
 * ============================================================================
 * ENGINE HELPER FUNCTIONS (ILLUMINATION CALCULATION)
 * ============================================================================
 */

/**
 * Extracts the baseline ambient lighting of the entire scene from Foundry's environment.
 * @returns {number} The base illumination tier of the canvas.
 */
function _getGlobalAmbientTier() {
    if (!canvas?.scene) return 6; // Default to Pitch Black if no scene exists

    const isGlobalLightEnabled = canvas.scene.environment?.globalLight?.enabled ?? canvas.scene.globalLight ?? false;
    if (!isGlobalLightEnabled) return 6;

    const darkness = canvas.scene.environment?.darknessLevel ?? canvas.scene.darkness;
    if (darkness === 0) return 0;
    if (darkness <= 0.25) return 1;
    if (darkness <= 0.5) return 2;
    if (darkness <= 0.75) return 4;

    return 6;
}

/**
 * Parses a raw Foundry Document (AmbientLight or Token) into a clean, unified RMU data object.
 * @param {Document} lightDoc - The static or dynamic light source.
 * @returns {Object} A standardised object containing pre-calculated radii and flags.
 */
function _extractLightData(lightDoc) {
    const rmuFlags = lightDoc.flags?.["rmu-lighting-vision"] || {};
    const baseIllumination = Number.parseInt(rmuFlags.baseIllumination ?? 0, 10);

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

    const maxRadius = rmuFlags.magicalRadius ?? Math.max(lightDoc.config?.dim || 0, lightDoc.config?.bright || 0, lightDoc.light?.dim || 0, lightDoc.light?.bright || 0);
    const isDarknessSource = baseIllumination >= 6 || lightDoc.config?.isDarkness === true || (lightDoc.config?.luminosity ?? lightDoc.light?.luminosity) < 0;

    return {
        isValid: !Number.isNaN(baseIllumination) && baseIllumination !== -1,
        tier: baseIllumination,
        isMagical: rmuFlags.isMagical ?? false,
        isUtter: rmuFlags.isUtter ?? false,
        isConstant: rmuFlags.isConstant ?? false,
        isDarknessSource,
        center: lightCenter,
        emitterRadius,
        maxRadius,
    };
}

/**
 * Processes a single light source, running geometry culling and raycasts before
 * pushing it into the state buckets if it improves the scene's lighting.
 */
function _processLightSource(lightDoc, target, targetPoint, buckets) {
    const data = _extractLightData(lightDoc);
    if (!data.isValid) return;

    // Calculate physical grid distance from the light edge to the target edge
    const pixelDistance = getDistanceToTargetEdge(data.center, target, targetPoint);
    const gridDistance = canvas.scene?.grid?.distance ?? 5;
    const distance = Math.max(0, ((pixelDistance - data.emitterRadius) / canvas.grid.size) * gridDistance);

    // --- PERFORMANCE OPTIMISATION: Initial Boundary Culling ---
    if (data.isDarknessSource && distance > data.maxRadius) return;
    if (!data.isDarknessSource && !data.isConstant && distance > 3000) return;

    let calculatedTier = 6;

    // --- PERFORMANCE OPTIMISATION: Lazy Evaluation ---
    if (!data.isDarknessSource) {
        if (data.isConstant) {
            calculatedTier = distance <= data.maxRadius ? data.tier : 6;
        } else {
            calculatedTier = getDegradedTier(distance, data.tier, data.isMagical, data.maxRadius);
        }

        // Skip the raycast if this light is too weak to improve current buckets
        if ((data.isUtter || data.isMagical) && calculatedTier >= 6) return;
        if (data.isUtter && buckets.bestUtterlightTier !== null && calculatedTier >= buckets.bestUtterlightTier) return;
        if (data.isMagical && !data.isUtter && buckets.bestMagicalTier !== null && calculatedTier >= buckets.bestMagicalTier) return;
        if (!data.isMagical && !data.isUtter && calculatedTier >= buckets.bestMundaneTier) return;
    }

    // --- RAYCAST (Only fires if the light guarantees an improvement) ---
    const blocksLight = CONFIG.Canvas.polygonBackends.light.testCollision(targetPoint, data.center, { type: "light", mode: "any" });
    if (blocksLight) return;

    // --- ASSIGN TO BUCKETS ---
    if (data.isDarknessSource) {
        if (data.isUtter) buckets.inUtterdark = true;
        else buckets.inMagicalDarkness = true;
        return;
    }

    if (data.isUtter) {
        if (calculatedTier < 6 && (buckets.bestUtterlightTier === null || calculatedTier < buckets.bestUtterlightTier)) {
            buckets.bestUtterlightTier = calculatedTier;
        }
    } else if (data.isMagical) {
        if (calculatedTier < 6 && (buckets.bestMagicalTier === null || calculatedTier < buckets.bestMagicalTier)) {
            buckets.bestMagicalTier = calculatedTier;
        }
    } else {
        buckets.bestMundaneTier = calculatedTier;
    }
}

/**
 * Resolves the strict narrative order of operations for RMU absolute hierarchies.
 */
function _resolveHierarchyBuckets(buckets) {
    if (buckets.bestUtterlightTier !== null) return buckets.bestUtterlightTier;
    if (buckets.inUtterdark) return 6; // Pitch Black
    if (buckets.bestMagicalTier !== null) return buckets.bestMagicalTier;
    if (buckets.inMagicalDarkness) return 6; // Pitch Black
    return buckets.bestMundaneTier;
}

/**
 * ============================================================================
 * MASTER ILLUMINATION ENGINE
 * ============================================================================
 */

/**
 * Iterates over all light sources to find the best illumination for a specific point,
 * strictly enforcing the RMU Utter-tier and Magical hierarchies.
 * @param {Object|TokenDocument|null} target - The token being observed (can be null for Heatmaps).
 * @param {Object} targetPoint - The exact {x, y} centre coordinates to measure.
 * @returns {number} The lowest (brightest) light tier affecting the point.
 */
export function getBestIlluminationTier(target, targetPoint) {
    // 1. Initialise the tracking state with the scene's base ambient darkness
    const buckets = {
        inUtterdark: false,
        inMagicalDarkness: false,
        bestUtterlightTier: null,
        bestMagicalTier: null,
        bestMundaneTier: _getGlobalAmbientTier(),
    };

    // 2. Compile all active light sources
    const activeAmbientLights = canvas.scene.lights.filter((l) => !l.hidden);
    const activeTokenLights = canvas.scene.tokens.filter((t) => !t.hidden && (t.light?.dim > 0 || t.light?.bright > 0));
    const allLightDocs = [...activeAmbientLights, ...activeTokenLights];

    // 3. Process every light through the geometry and logic engine
    for (const lightDoc of allLightDocs) {
        _processLightSource(lightDoc, target, targetPoint, buckets);
    }

    // 4. Resolve the final state
    return _resolveHierarchyBuckets(buckets);
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
    let targetPoint;
    if (target.object) {
        targetPoint = target.object.center;
    } else if (target.x === undefined) {
        targetPoint = { x: target.x, y: target.y };
    } else {
        targetPoint = target;
    }

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
