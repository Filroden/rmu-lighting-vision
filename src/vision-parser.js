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
        detectionModes: {},
    };

    if (!actor) return capabilities;

    // --- DUAL-PATHWAY TALENT SEARCH ---
    // We check both `system._talents` (the formal RMU system schema) and `actor.items`
    // (the standard Foundry fallback). This ensures the parser remains robust even if
    // the underlying RMU system data architecture changes in a future update.
    const talents = actor.system?._talents || actor.items?.filter((i) => i.type === "talent") || [];

    // Extract the actor's level for talents whose ranges scale by level
    const level = actor.system?.experience?.level || 1;

    // --- DETECTION MODE DEDUPLICATION & DICTIONARY BUILDER ---
    // V14 strictly expects detection modes to be a Record object keyed by the mode ID.
    // This helper ensures we safely build that object and only keep the highest range
    // if a character has multiple talents granting the same sense.
    const addDetectionMode = (id, range) => {
        if (!capabilities.detectionModes[id] || range > capabilities.detectionModes[id].range) {
            capabilities.detectionModes[id] = { enabled: true, range: range };
        }
    };

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
                addDetectionMode("seeInvisibility", 50);
                break;
            case "Sight, Demon":
                capabilities.hasDemonSight = true;
                capabilities.demonSightRange = 100;
                // Demon Sight inherently includes the benefits of Thermal Vision
                capabilities.hasThermalVision = true;
                capabilities.thermalRange = 50;
                // It also grants scaling See Invisibility (5' per level) on top of the base 50' from Thermal
                addDetectionMode("seeInvisibility", Math.max(50, level * 5));
                break;
            case "Invisibility Sense":
                addDetectionMode("seeInvisibility", level * 5);
                break;
            case "Tremorsense":
                addDetectionMode("feelTremor", 50);
                break;
            case "Life Sense":
                // Maps to the custom Detection Filter created in config.js
                addDetectionMode("rmuLifeSense", tier * 5);
                break;
            case "Presence Sense":
                // Maps to the custom Detection Filter created in config.js
                addDetectionMode("rmuPresenceSense", level * 5);
                break;
            case "Air Movement Detection":
                addDetectionMode("seeInvisibility", tier);
                break;
            case "Electrolocation, Passive":
                addDetectionMode("seeInvisibility", level);
                break;
        }
    }

    return capabilities;
}
