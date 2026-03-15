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
 * Initialises custom canvas vision modes for RMU characters.
 * Hooks directly into Foundry's rendering engine.
 */
export function registerVisionModes() {
    // Map to the modern V13 namespaces
    const VisionMode = foundry.canvas.perception.VisionMode;
    const ColorAdjustmentsSamplerShader = foundry.canvas.rendering.shaders.ColorAdjustmentsSamplerShader;
    const LIGHTING_LEVELS = CONST.LIGHTING_LEVELS;

    // Nightvision: Elevates dim areas visually, but relies on some ambient light existing.
    CONFIG.Canvas.visionModes.nightvision = new VisionMode({
        id: "nightvision",
        label: "rmu.vision.nightvision",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0.1, saturation: -0.5, brightness: 0.2 },
        },
        lighting: {
            levels: {
                // Mechanically, it reduces penalties. Visually, we brighten Dim to Bright for the player.
                [LIGHTING_LEVELS.DIM]: LIGHTING_LEVELS.BRIGHT,
            },
        },
        vision: {
            darkness: { adaptive: true },
            defaults: { attenuation: 0.1, contrast: 0, saturation: 0, brightness: 0 },
        },
    });

    // Darkvision: Allows seeing in complete darkness as if optimal.
    CONFIG.Canvas.visionModes.darkvision = new VisionMode({
        id: "darkvision",
        label: "rmu.vision.darkvision",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0, saturation: -1.0, brightness: 0 },
        },
        lighting: {
            background: { visibility: LIGHTING_LEVELS.BRIGHT },
            levels: {
                // Darkvision completely negates all darkness visually on the canvas
                [LIGHTING_LEVELS.DIM]: LIGHTING_LEVELS.BRIGHT,
                [LIGHTING_LEVELS.UNLIT]: LIGHTING_LEVELS.BRIGHT,
            },
        },
        vision: {
            darkness: { adaptive: false },
            defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
        },
    });
}
