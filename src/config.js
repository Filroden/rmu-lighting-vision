/**
 * Core constants representing the 7 lighting tiers defined in Table 15-7.
 * Using numeric values allows for easy mathematical degradation (e.g., adding 1 for each distance step).
 */
export const RMU_LIGHT_LEVELS = {
    BRIGHT: 0, // No shadows
    UNEVEN: 1, // Light shadows
    DIM: 2, // Medium shadows
    SHADOWY: 3, // Heavy shadows
    DARK: 4, // Dark
    EXTREMELY_DARK: 5, // Extremely dark
    PITCH_BLACK: 6, // Pitch black
};

/**
 * Initialises custom canvas vision modes for RMU characters and patches core vision.
 */
export function registerVisionModes() {
    const VisionMode = foundry.canvas.perception.VisionMode;
    const ColorAdjustmentsSamplerShader = foundry.canvas.rendering.shaders.ColorAdjustmentsSamplerShader;
    const LIGHTING_LEVELS = CONST.LIGHTING_LEVELS;

    // --- Read from the custom JSON mapping instead of the deleted 'visionStrictness' setting ---
    function buildLevels(visionData) {
        const levels = {};
        const stringToNative = {
            bright: LIGHTING_LEVELS.BRIGHT,
            dim: LIGHTING_LEVELS.DIM,
            off: LIGHTING_LEVELS.UNLIT,
        };

        // Directly map the new clean vision object from your Tab 2 UI to the engine
        levels[LIGHTING_LEVELS.BRIGHT] = stringToNative[visionData?.bright || "bright"];
        levels[LIGHTING_LEVELS.DIM] = stringToNative[visionData?.dim || "dim"];
        levels[LIGHTING_LEVELS.UNLIT] = stringToNative[visionData?.off || "off"];

        return levels;
    }

    const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};
    // Ensure safe fallbacks exist in case of a new boot or corrupted database
    const visionMap = customMap.vision || {
        basic: { bright: "bright", dim: "off", off: "off" },
        nightvision: { bright: "bright", dim: "dim", off: "dim" },
    };

    const basicLevels = buildLevels(visionMap.basic);
    const nightvisionLevels = buildLevels(visionMap.nightvision);

    // 2. Patch Foundry's Default Vision
    // Re-instantiate the vision mode completely so WebGL is forced to use our levels
    CONFIG.Canvas.visionModes.basic = new VisionMode({
        id: "basic",
        label: "VISION.ModeBasicVision",
        lighting: {
            background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED },
            illumination: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED },
            levels: basicLevels,
        },
        vision: { defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 } },
    });

    // 3. Nightvision Mode
    CONFIG.Canvas.visionModes.nightvision = new VisionMode({
        id: "nightvision",
        label: "rmu.vision.nightvision",
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0, saturation: 0, brightness: 0 } },
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: nightvisionLevels },
        vision: { darkness: { adaptive: true }, defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 } },
    });

    // 4. Darkvision Modes
    const darkvisionConfig = {
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0, saturation: 0, brightness: 0 } },
        vision: {
            darkness: { adaptive: false },
            illuminates: true,
            preferred: true,
            defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
        },
    };

    CONFIG.Canvas.visionModes.darkvision = new VisionMode({
        id: "darkvision",
        label: "rmu.vision.darkvision",
        canvas: foundry.utils.deepClone(darkvisionConfig.canvas),
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: basicLevels },
        vision: foundry.utils.deepClone(darkvisionConfig.vision),
    });

    CONFIG.Canvas.visionModes.darkvisionNight = new VisionMode({
        id: "darkvisionNight",
        label: "rmu.vision.darkvisionNight",
        canvas: foundry.utils.deepClone(darkvisionConfig.canvas),
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: nightvisionLevels },
        vision: foundry.utils.deepClone(darkvisionConfig.vision),
    });

    // 5. Thermal Modes
    const thermalConfig = {
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0.4, saturation: 1.2, brightness: 0.1, tint: [1.0, 0.4, 0.0] } },
        vision: {
            darkness: { adaptive: false },
            illuminates: true,
            preferred: true,
            defaults: { attenuation: 0, contrast: 0.4, saturation: 1.2, brightness: 0.1, tint: [1.0, 0.4, 0.0] },
        },
    };

    CONFIG.Canvas.visionModes.rmuThermal = new VisionMode({
        id: "rmuThermal",
        label: "rmu.vision.thermal",
        canvas: foundry.utils.deepClone(thermalConfig.canvas),
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: basicLevels },
        vision: foundry.utils.deepClone(thermalConfig.vision),
    });

    CONFIG.Canvas.visionModes.rmuThermalNight = new VisionMode({
        id: "rmuThermalNight",
        label: "rmu.vision.thermalNight",
        canvas: foundry.utils.deepClone(thermalConfig.canvas),
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: nightvisionLevels },
        vision: foundry.utils.deepClone(thermalConfig.vision),
    });

    // 6. Demon Sight
    CONFIG.Canvas.visionModes.rmuDemonSight = new VisionMode({
        id: "rmuDemonSight",
        label: "rmu.vision.demonSight",
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0.5, saturation: 0.8, brightness: 0.1, tint: [0.7, 0.0, 0.1] } },
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: nightvisionLevels },
        vision: {
            darkness: { adaptive: false },
            illuminates: true,
            preferred: true,
            defaults: { attenuation: 0, contrast: 0.5, saturation: 0.8, brightness: 0.1, tint: [0.7, 0.0, 0.1] },
        },
    });
}

/**
 * Registers custom RMU detection modes to the Foundry VTT canvas.
 */
export function registerDetectionModes() {
    // Inherit from Foundry's core "senseAll" mode to bypass darkness checks
    const SenseAllMode = CONFIG.Canvas.detectionModes.senseAll.constructor;

    // Point to the new V13+ rendering filters namespace to clear the deprecation warning
    const RMUOutlineFilter = foundry.canvas.rendering.filters.OutlineOverlayFilter;

    // --- Life Sense ---
    class DetectionModeLifeSense extends SenseAllMode {
        static getDetectionFilter() {
            this._detectionFilter ??= RMUOutlineFilter.create({
                outlineColor: [0.0, 1.0, 1.0, 1.0], // Cyan
            });
            return this._detectionFilter;
        }

        /** @override */
        _canDetect(visionSource, target) {
            const canDetect = super._canDetect(visionSource, target);
            if (!canDetect) return false;

            const actor = target?.document?.actor;
            if (!actor) return false;

            const talents = actor.system?._talents || actor.items?.filter((i) => i.type === "talent") || [];
            const isLifeless = talents.some((t) => {
                const name = t.system?.talentName || t.name || "";
                return name === "Lifeless";
            });

            return !isLifeless;
        }
    }

    CONFIG.Canvas.detectionModes.rmuLifeSense = new DetectionModeLifeSense({
        id: "rmuLifeSense",
        label: "rmu.detection.lifeSense",
        walls: false,
    });

    // --- Presence Sense ---
    class DetectionModePresenceSense extends SenseAllMode {
        static getDetectionFilter() {
            this._detectionFilter ??= RMUOutlineFilter.create({
                outlineColor: [1.0, 0.0, 0.0, 1.0], // Magenta
            });
            return this._detectionFilter;
        }

        /** @override */
        _canDetect(visionSource, target) {
            const canDetect = super._canDetect(visionSource, target);
            if (!canDetect) return false;

            const actor = target?.document?.actor;
            if (!actor) return false;

            const talents = actor.system?._talents || actor.items?.filter((i) => i.type === "talent") || [];
            const isMindless = talents.some((t) => {
                const name = t.system?.talentName || t.name || "";
                return name === "Animalistic" || name === "Mindless";
            });

            return !isMindless;
        }
    }

    CONFIG.Canvas.detectionModes.rmuPresenceSense = new DetectionModePresenceSense({
        id: "rmuPresenceSense",
        label: "rmu.detection.presenceSense",
        walls: false,
    });
}
