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

    // --- Basic Vision ---
    if (CONFIG.Canvas.visionModes.basic) {
        CONFIG.Canvas.visionModes.basic.lighting.levels[LIGHTING_LEVELS.DIM] = LIGHTING_LEVELS.UNLIT;
    }

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
}
