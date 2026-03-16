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

    // --- Nightvision ---
    CONFIG.Canvas.visionModes.nightvision = new VisionMode({
        id: "nightvision",
        label: "rmu.vision.nightvision",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0.15, saturation: -0.2, brightness: 0.1 },
        },
        lighting: {
            levels: {
                [LIGHTING_LEVELS.DIM]: LIGHTING_LEVELS.BRIGHT,
            },
        },
        vision: {
            darkness: { adaptive: true },
            defaults: { attenuation: 0.1, contrast: 0.15, saturation: -0.2, brightness: 0.1 },
        },
    });

    // --- Darkvision ---
    CONFIG.Canvas.visionModes.darkvision = new VisionMode({
        id: "darkvision",
        label: "rmu.vision.darkvision",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0.25, saturation: -0.4, brightness: 0.2 },
        },
        lighting: {
            levels: {
                [LIGHTING_LEVELS.DIM]: LIGHTING_LEVELS.BRIGHT,
                [LIGHTING_LEVELS.UNLIT]: LIGHTING_LEVELS.BRIGHT,
            },
        },
        vision: {
            darkness: { adaptive: true },
            defaults: { attenuation: 0, contrast: 0.25, saturation: -0.4, brightness: 0.2 },
        },
    });

    // --- Thermal Vision ---
    // High contrast, saturated orange/yellow heat-map effect
    CONFIG.Canvas.visionModes.rmuThermal = new VisionMode({
        id: "rmuThermal",
        label: "rmu.vision.thermal",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0.4, saturation: 1.2, brightness: 0.1, tint: [1.0, 0.4, 0.0] }, // Bright Orange
        },
        lighting: {
            background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED },
            levels: {
                [CONST.LIGHTING_LEVELS.DIM]: CONST.LIGHTING_LEVELS.BRIGHT,
                [CONST.LIGHTING_LEVELS.UNLIT]: CONST.LIGHTING_LEVELS.BRIGHT, // completely pierces darkness
            },
        },
        vision: {
            darkness: { adaptive: true },
            defaults: { attenuation: 0, contrast: 0.4, saturation: 1.2, brightness: 0.1, tint: [1.0, 0.4, 0.0] },
        },
    });

    // --- Demon Sight ---
    // Oppressive, high-contrast blood red effect
    CONFIG.Canvas.visionModes.rmuDemonSight = new VisionMode({
        id: "rmuDemonSight",
        label: "rmu.vision.demonSight",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0.5, saturation: 0.8, brightness: 0.1, tint: [0.7, 0.0, 0.1] }, // Deep Crimson
        },
        lighting: {
            background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED },
            levels: {
                [CONST.LIGHTING_LEVELS.DIM]: CONST.LIGHTING_LEVELS.BRIGHT,
                [CONST.LIGHTING_LEVELS.UNLIT]: CONST.LIGHTING_LEVELS.BRIGHT, // completely pierces darkness
            },
        },
        vision: {
            darkness: { adaptive: true },
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
