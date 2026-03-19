function getDynamicTiers() {
    const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};
    const mapping = customMap.canvas || { 0: "bright", 1: "bright", 2: "dim", 3: "dim", 4: "dim", 5: "off", 6: "off" };

    const tiers = { brightTiers: [], dimTiers: [], unlitTiers: [] };

    for (let i = 0; i <= 6; i++) {
        if (mapping[i] === "bright") tiers.brightTiers.push(i);
        else if (mapping[i] === "dim") tiers.dimTiers.push(i);
        else tiers.unlitTiers.push(i);
    }
    return tiers;
}

export function getRadiiForTier(baseTier) {
    if (baseTier === -1 || baseTier === undefined) return { bright: 0, dim: 0 };

    const dynamicTiers = getDynamicTiers();
    const DISTANCE_THRESHOLDS = [10, 30, 100, 300, 1000, 3000];
    let bright = 0;
    let dim = 0;

    for (let i = 0; i < DISTANCE_THRESHOLDS.length; i++) {
        const currentTier = Math.min(baseTier + i, 6);
        const distance = DISTANCE_THRESHOLDS[i];

        if (dynamicTiers.brightTiers.includes(currentTier)) {
            bright = distance;
            dim = distance;
        } else if (dynamicTiers.dimTiers.includes(currentTier)) {
            dim = distance;
        }
    }

    return { bright, dim };
}

export function getLightMapping() {
    const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};
    return customMap.canvas || { 0: "bright", 1: "bright", 2: "dim", 3: "dim", 4: "dim", 5: "off", 6: "off" };
}

export function getMagicalExtension(auraStartTier) {
    const dynamicTiers = getDynamicTiers();
    const DISTANCE_THRESHOLDS = [10, 30, 100, 300, 1000, 3000];
    let maxExtension = 0;
    let thresholdIndex = 1;

    for (let tier = auraStartTier; tier <= 6; tier++) {
        if (dynamicTiers.unlitTiers.includes(tier)) break;

        if (dynamicTiers.dimTiers.includes(tier) || dynamicTiers.brightTiers.includes(tier)) {
            maxExtension = DISTANCE_THRESHOLDS[thresholdIndex];
            thresholdIndex++;
        }
    }
    return maxExtension;
}
