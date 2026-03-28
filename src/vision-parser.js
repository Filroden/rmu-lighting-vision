/**
 * ============================================================================
 * ACTOR VISION & TALENT PARSER
 * ============================================================================
 * This script acts as a bridge between the RMU system's data architecture
 * and the module's WebGL rendering engine. It scrapes an actor's character
 * sheet for specific narrative talents and converts them into explicit
 * mechanical capabilities (like Darkvision ranges and Detection Mode arrays).
 * ============================================================================
 */

/**
 * Parses an RMU actor's talents to determine their innate vision capabilities.
 * @param {Actor} actor - The Foundry Actor document being evaluated.
 * @returns {Object} A comprehensive object detailing vision flags, ranges, and detection modes.
 */
export function getActorVisionCapabilities(actor) {
    // Initialise the default fallback state for a mundane actor
    const capabilities = {
        hasLesserNightvision: false,
        hasNativeNightvision: false,
        hasNativeDarkvision: false,
        darkvisionRange: 0,
        hasThermalVision: false,
        thermalRange: 0,
        hasDemonSight: false,
        demonSightRange: 0,
        detectionModes: [],
    };

    if (!actor) return capabilities;

    // --- DUAL-PATHWAY TALENT SEARCH ---
    // We check both `system._talents` (the formal RMU system schema) and `actor.items`
    // (the standard Foundry fallback). This ensures the parser remains robust even if
    // the underlying RMU system data architecture changes in a future update.
    const talents = actor.system?._talents || actor.items?.filter((i) => i.type === "talent") || [];

    // Extract the actor's level for talents whose ranges scale by level
    const level = actor.system?.experience?.level || 1;

    for (const talent of talents) {
        // Extract the talent name, falling back to the base item name if needed
        const talentName = talent.system?.talentName || talent.name || "";

        // Extract the tier for talents whose ranges scale by tier
        const tier = talent.system?.tier || 1;

        // Map the narrative talent names directly to their mechanical WebGL equivalents
        switch (talentName) {
            case "Lesser Nightvision":
                capabilities.hasLesserNightvision = true;
                break;
            case "Nightvision":
                capabilities.hasNativeNightvision = true;
                break;
            case "Darkvision":
                capabilities.hasNativeDarkvision = true;
                capabilities.darkvisionRange = tier * 10;
                break;
            case "Thermal Vision":
                capabilities.hasThermalVision = true;
                capabilities.thermalRange = 50;
                // Thermal natively grants See Invisibility out to 50'
                capabilities.detectionModes.push({ id: "seeInvisibility", enabled: true, range: 50 });
                break;
            case "Sight, Demon":
                capabilities.hasDemonSight = true;
                capabilities.demonSightRange = 100;
                // Demon Sight inherently includes the benefits of Thermal Vision
                capabilities.hasThermalVision = true;
                capabilities.thermalRange = 50;
                // It also grants scaling See Invisibility (5' per level) on top of the base 50' from Thermal
                capabilities.detectionModes.push({ id: "seeInvisibility", enabled: true, range: level * 5 });
                capabilities.detectionModes.push({ id: "seeInvisibility", enabled: true, range: 50 });
                break;
            case "Invisibility Sense":
                capabilities.detectionModes.push({ id: "seeInvisibility", enabled: true, range: level * 5 });
                break;
            case "Tremorsense":
                capabilities.detectionModes.push({ id: "feelTremor", enabled: true, range: 50 });
                break;
            case "Life Sense":
                // Maps to the custom Detection Filter created in config.js
                capabilities.detectionModes.push({ id: "rmuLifeSense", enabled: true, range: tier * 5 });
                break;
            case "Presence Sense":
                // Maps to the custom Detection Filter created in config.js
                capabilities.detectionModes.push({ id: "rmuPresenceSense", enabled: true, range: level * 5 });
                break;
            case "Air Movement Detection":
                capabilities.detectionModes.push({ id: "seeInvisibility", enabled: true, range: tier });
                break;
            case "Electrolocation, Passive":
                capabilities.detectionModes.push({ id: "seeInvisibility", enabled: true, range: level });
                break;
        }
    }

    // --- DETECTION MODE DEDUPLICATION ---
    // If a character has multiple talents that grant the same detection mode
    // (e.g., Demon Sight and Invisibility Sense both grant 'seeInvisibility'),
    // pushing all of them to the WebGL engine causes redundant rendering layers.
    // This loop merges duplicates, ensuring only the version with the highest range survives.
    const mergedModes = {};
    for (const mode of capabilities.detectionModes) {
        if (!mergedModes[mode.id] || mode.range > mergedModes[mode.id].range) {
            mergedModes[mode.id] = mode;
        }
    }

    // Convert the deduplicated object map back into a flat array for Foundry to ingest
    capabilities.detectionModes = Object.values(mergedModes);

    return capabilities;
}
