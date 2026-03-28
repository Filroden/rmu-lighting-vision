/**
 * ============================================================================
 * VISION & DETECTION CONFIGURATION
 * ============================================================================
 * This script is responsible for bridging the RMU narrative rules with
 * Foundry VTT's core WebGL rendering engine. It defines the lighting constants,
 * constructs the visual shaders for canvas rendering, and builds the detection
 * algorithms that highlight hidden tokens.
 * ============================================================================
 */

/**
 * Core constants representing the 7 lighting tiers defined in Table 15-7.
 * Using numeric integer values here is critical; it allows the mathematical engine
 * in calculator.js to easily degrade light by simply adding 1 for each distance step.
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
 * Initialises custom canvas vision modes for RMU characters and patches the core vision.
 * This injects our custom shaders and UI mappings directly into the VTT's rendering pipeline.
 */
export function registerVisionModes() {
    // Cache the core Foundry classes required for rendering
    const VisionMode = foundry.canvas.perception.VisionMode;
    const ColorAdjustmentsSamplerShader = foundry.canvas.rendering.shaders.ColorAdjustmentsSamplerShader;
    const LIGHTING_LEVELS = CONST.LIGHTING_LEVELS;

    /**
     * Translates the user's custom mapping (from Tab 2 of the Configuration Panel)
     * into the native lighting constants that Foundry's WebGL engine understands.
     * @param {Object} visionData - The user-defined string mappings (e.g., { bright: "dim" })
     * @returns {Object} A formatted levels object for the VisionMode class.
     */
    function buildLevels(visionData) {
        const levels = {};
        const stringToNative = {
            bright: LIGHTING_LEVELS.BRIGHT,
            dim: LIGHTING_LEVELS.DIM,
            off: LIGHTING_LEVELS.UNLIT,
        };

        // If a mapping is somehow missing, we safely default back to standard physical lighting.
        levels[LIGHTING_LEVELS.BRIGHT] = stringToNative[visionData?.bright || "bright"];
        levels[LIGHTING_LEVELS.DIM] = stringToNative[visionData?.dim || "dim"];
        levels[LIGHTING_LEVELS.UNLIT] = stringToNative[visionData?.off || "off"];

        return levels;
    }

    // Retrieve the active configuration from the database
    const customMap = game.settings.get("rmu-lighting-vision", "customMapping") || {};

    // Ensure safe fallbacks exist in case this is a fresh boot or the database was corrupted
    const visionMap = customMap.vision || {
        basic: { bright: "bright", dim: "off", off: "off" },
        nightvision: { bright: "bright", dim: "dim", off: "dim" },
    };

    const basicLevels = buildLevels(visionMap.basic);
    const nightvisionLevels = buildLevels(visionMap.nightvision);

    // ========================================================================
    // VISION MODE REGISTRATIONS
    // ========================================================================

    // 1. Patch Foundry's Default 'Basic' Vision
    // We completely overwrite the core basic vision mode so that the WebGL engine
    // is forced to use our custom user-defined mapping levels instead of Foundry's defaults.
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

    // 2. Standard Nightvision Mode
    // Increases the perceived brightness levels based on the nightvisionLevels mapping,
    // but applies no colour tint to the canvas.
    CONFIG.Canvas.visionModes.nightvision = new VisionMode({
        id: "nightvision",
        label: "rmu.vision.nightvision",
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0, saturation: 0, brightness: 0 } },
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: nightvisionLevels },
        vision: { darkness: { adaptive: true }, defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 } },
    });

    // 3. Darkvision Modes
    // We define a base configuration object here because Darkvision has two variants:
    // standalone Darkvision, and Darkvision stacked with Nightvision (which requires different lighting levels).
    const darkvisionConfig = {
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0, saturation: 0, brightness: 0 } },
        vision: {
            darkness: { adaptive: false }, // Disables Foundry's native 'darkness penalty' dimming
            illuminates: true, // Forces the vision area to render in full colour
            preferred: true,
            defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
        },
    };

    CONFIG.Canvas.visionModes.darkvision = new VisionMode({
        id: "darkvision",
        label: "rmu.vision.darkvision",
        // deepClone prevents the two modes from mutating the same shared configuration object in memory
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

    // 4. Thermal Modes
    // Thermal vision uses the ColorAdjustmentsSamplerShader to mathematically multiply
    // the canvas pixels by a specific hexadecimal colour to create a heat-map aesthetic.
    const thermalConfig = {
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0.2, saturation: 1.0, brightness: 0.1 } },
        vision: {
            darkness: { adaptive: false },
            illuminates: true,
            preferred: true,
            // 0xffb366 is a washed amber. We keep the tint soft so it doesn't obliterate the underlying map art.
            defaults: { color: 0xffb366, attenuation: 0, contrast: 0.2, saturation: 1.0, brightness: 0.1 },
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

    // 5. Demon Sight
    CONFIG.Canvas.visionModes.rmuDemonSight = new VisionMode({
        id: "rmuDemonSight",
        label: "rmu.vision.demonSight",
        canvas: { shader: ColorAdjustmentsSamplerShader, uniforms: { contrast: 0.2, saturation: 0.8, brightness: 0.1 } },
        lighting: { background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }, levels: nightvisionLevels },
        vision: {
            darkness: { adaptive: false },
            illuminates: true,
            preferred: true,
            // 0xff99aa is a soft crimson.
            defaults: { color: 0xff99aa, attenuation: 0, contrast: 0.2, saturation: 0.8, brightness: 0.1 },
        },
    });
}

/**
 * ============================================================================
 * DETECTION MODE REGISTRATIONS
 * ============================================================================
 * Detection modes do not change the colour of the map. Instead, they act as a radar,
 * drawing coloured outlines around hidden or obscured tokens that meet specific criteria.
 */
export function registerDetectionModes() {
    // We inherit from Foundry's core "senseAll" mode.
    // This allows the radar to naturally pierce physical walls and pitch-black darkness.
    const SenseAllMode = CONFIG.Canvas.detectionModes.senseAll.constructor;

    // We point directly to the V13+ rendering filters namespace to clear old deprecation warnings.
    const RMUOutlineFilter = foundry.canvas.rendering.filters.OutlineOverlayFilter;

    // --- Life Sense ---
    class DetectionModeLifeSense extends SenseAllMode {
        /**
         * Defines the visual style of the radar outline.
         * @returns {PIXI.Filter} The WebGL outline filter.
         */
        static getDetectionFilter() {
            // Arrays are formatted as [Red, Green, Blue, Alpha] using normalised floats (0.0 to 1.0).
            this._detectionFilter ??= RMUOutlineFilter.create({
                outlineColor: [0.0, 1.0, 1.0, 1.0], // Cyan
            });
            return this._detectionFilter;
        }

        /** * The core logical test to determine if the radar highlights the token.
         * @override
         */
        _canDetect(visionSource, target) {
            // First, run the core spatial and range checks from the parent class
            const canDetect = super._canDetect(visionSource, target);
            if (!canDetect) return false;

            const actor = target?.document?.actor;
            if (!actor) return false;

            // Search the target's actor document for specific exclusionary talents.
            // This safely checks both the formal RMU system architecture and basic token items.
            const talents = actor.system?._talents || actor.items?.filter((i) => i.type === "talent") || [];

            const isLifeless = talents.some((t) => {
                const name = t.system?.talentName || t.name || "";
                return name === "Lifeless";
            });

            // The target is only highlighted if they do NOT possess the 'Lifeless' talent
            return !isLifeless;
        }
    }

    // Register the custom class into the VTT's active configuration
    CONFIG.Canvas.detectionModes.rmuLifeSense = new DetectionModeLifeSense({
        id: "rmuLifeSense",
        label: "rmu.detection.lifeSense",
        walls: false, // Ensures the detection ignores physical Line of Sight blocking
    });

    // --- Presence Sense ---
    class DetectionModePresenceSense extends SenseAllMode {
        static getDetectionFilter() {
            this._detectionFilter ??= RMUOutlineFilter.create({
                outlineColor: [1.0, 0.0, 0.0, 1.0], // Red/Magenta
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

            // The target is only highlighted if they are sapient (neither Animalistic nor Mindless)
            return !isMindless;
        }
    }

    CONFIG.Canvas.detectionModes.rmuPresenceSense = new DetectionModePresenceSense({
        id: "rmuPresenceSense",
        label: "rmu.detection.presenceSense",
        walls: false,
    });
}
