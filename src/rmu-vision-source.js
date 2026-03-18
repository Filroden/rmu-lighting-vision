export function registerVisionSourceOverride() {
    // =========================================================================
    // 1. THE GEOMETRY OVERRIDE (Successfully pierces darkness polygons)
    // =========================================================================
    const BaseVisionSource = CONFIG.Canvas.visionSourceClass;

    CONFIG.Canvas.visionSourceClass = class RMUPointVisionSource extends BaseVisionSource {
        _isPiercingMode() {
            const piercingModes = ["rmuDemonSight", "rmuThermal", "rmuThermalNight", "darkvision", "darkvisionNight"];
            return piercingModes.includes(this.visionMode?.id);
        }

        get priority() {
            if (this._isPiercingMode()) return Number.MAX_SAFE_INTEGER;
            return super.priority;
        }

        _getPolygonConfiguration() {
            const config = super._getPolygonConfiguration();

            if (this._isPiercingMode()) {
                const expectedRadius = this.data.radius || canvas.dimensions.maxR;
                if (config.radius < expectedRadius) {
                    config.radius = expectedRadius;
                }
                config.priority = this.priority;
            }

            return config;
        }
    };
}
