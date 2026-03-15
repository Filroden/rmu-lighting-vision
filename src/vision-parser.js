/**
 * Parses an RMU actor's talents, spells, and active effects
 * to determine their innate vision capabilities.
 * @param {Actor} actor - The Foundry Actor document.
 * @returns {Object} An object detailing vision flags and calculated ranges.
 */
export function getActorVisionCapabilities(actor) {
    const capabilities = {
        hasNativeNightvision: false,
        hasNativeDarkvision: false,
        darkvisionRange: 0,
        hasInvisibilitySense: false,
        invisibilitySenseRange: 0,
    };

    if (!actor) return capabilities;

    // --- 1. PARSE TALENTS ---
    // RMU stores talents in system._talents. Fallback to actor.items for safety.
    const talents = actor.system?._talents || actor.items?.filter((i) => i.type === "talent") || [];

    for (const talent of talents) {
        const talentName = talent.system?.talentName || talent.name || "";
        const tier = talent.system?.tier || 1;

        switch (talentName) {
            case "Nightvision":
                capabilities.hasNativeNightvision = true;
                break;

            case "Darkvision":
                capabilities.hasNativeDarkvision = true;
                // RMU Core Law: Darkvision grants 10' per tier
                capabilities.darkvisionRange = tier * 10;
                break;

            case "Invisibility Sense":
                capabilities.hasInvisibilitySense = true;
                // RMU Creature Law: Invisibility sense grants 5' per tier
                capabilities.invisibilitySenseRange = tier * 5;
                break;
        }
    }

    // --- 2. PARSE ACTIVE EFFECTS & SPELLS ---
    // (Future expansion: Check actor.effects for temporary vision buffs here)

    return capabilities;
}
