/**
 * Parses an RMU actor's talents to determine their innate vision capabilities.
 * @param {Actor} actor - The Foundry Actor document.
 * @returns {Object} An object detailing vision flags, ranges, and detection modes.
 */
export function getActorVisionCapabilities(actor) {
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

    const talents = actor.system?._talents || actor.items?.filter((i) => i.type === "talent") || [];
    const level = actor.system?.experience?.level || 1;

    for (const talent of talents) {
        const talentName = talent.system?.talentName || talent.name || "";
        const tier = talent.system?.tier || 1;

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
                capabilities.detectionModes.push({ id: "seeInvisibility", enabled: true, range: 50 });
                break;
            case "Sight, Demon":
                capabilities.hasDemonSight = true;
                capabilities.demonSightRange = 100;
                capabilities.hasThermalVision = true;
                capabilities.thermalRange = 50;
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
                capabilities.detectionModes.push({ id: "rmuLifeSense", enabled: true, range: tier * 5 });
                break;
            case "Presence Sense":
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

    const mergedModes = {};
    for (const mode of capabilities.detectionModes) {
        if (!mergedModes[mode.id] || mode.range > mergedModes[mode.id].range) {
            mergedModes[mode.id] = mode;
        }
    }
    capabilities.detectionModes = Object.values(mergedModes);

    return capabilities;
}
