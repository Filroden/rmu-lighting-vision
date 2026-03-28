/**
 * ============================================================================
 * CORE VISION SOURCE OVERRIDES
 * ============================================================================
 * This script intercepts and patches Foundry VTT's foundational vision geometry
 * classes. It forces the WebGL engine to allow specific RMU vision modes
 * (like Darkvision or Demon Sight) to completely ignore and pierce through
 * the restrictive polygons created by Magical Darkness or Utterdark.
 * ============================================================================
 */

export function registerVisionSourceOverride() {
    // Cache the core Foundry class responsible for generating token sight polygons
    const BaseVisionSource = CONFIG.Canvas.visionSourceClass;

    /**
     * Define our custom subclass that injects RMU logic into the native rendering pipeline.
     */
    CONFIG.Canvas.visionSourceClass = class RMUPointVisionSource extends BaseVisionSource {
        /**
         * Helper method: Determines if the active vision mode is mechanically
         * capable of piercing magical darkness boundaries.
         * @returns {boolean} True if the mode can pierce darkness.
         */
        _isPiercingMode() {
            // These string IDs match the registrations in config.js
            const piercingModes = ["rmuDemonSight", "rmuThermal", "rmuThermalNight", "darkvision", "darkvisionNight"];
            return piercingModes.includes(this.visionMode?.id);
        }

        /**
         * OVERRIDE: Manipulates the sorting priority of the vision polygon.
         * By default, Foundry calculates darkness polygons *after* standard vision,
         * allowing darkness to visually swallow the player's sight.
         * @returns {number} The rendering priority integer.
         */
        get priority() {
            if (this._isPiercingMode()) {
                // Force piercing vision modes to be calculated absolutely last,
                // guaranteeing they are drawn *over the top* of any darkness layers.
                return Number.MAX_SAFE_INTEGER;
            }
            return super.priority;
        }

        /**
         * OVERRIDE: Intercepts the configuration object used to physically draw the polygon.
         * @returns {Object} The mutated polygon configuration.
         */
        _getPolygonConfiguration() {
            // Fetch the default geometry calculation from the core VTT
            const config = super._getPolygonConfiguration();

            if (this._isPiercingMode()) {
                // Foundry's native engine will often artificially shrink the 'config.radius'
                // to 0 if the token is standing inside a source of absolute darkness.
                // We extract the true, unhindered mechanical radius from the token data...
                const expectedRadius = this.data.radius || canvas.dimensions.maxR;

                // ...and forcefully inject it back into the polygon configuration if it was suppressed.
                if (config.radius < expectedRadius) {
                    config.radius = expectedRadius;
                }

                // Ensure the polygon builder respects our overridden rendering priority
                config.priority = this.priority;
            }

            return config;
        }
    };
}
