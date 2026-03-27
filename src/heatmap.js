/**
 * ============================================================================
 * DIAGNOSTIC HEATMAP GENERATOR
 * ============================================================================
 * This script provides Game Masters with a visual, click-through overlay that
 * perfectly maps the strict mathematical boundaries of the RMU lighting engine
 * (Utterdark, Magical Darkness, and degraded illumination tiers).
 * * To prevent the VTT from crashing under the weight of 150,000+ geometric
 * calculations, this tool utilises 'Texture Baking'. It calculates the math
 * on an invisible HTML5 canvas, and then hands a single, flat PNG-like
 * image to the WebGL engine.
 * ============================================================================
 */

import { getBestIlluminationTier } from "./calculator.js";

export class RMULightHeatmap {
    static layer = null;
    static isVisible = false;

    /**
     * Toggles the heat map on and off. Strictly restricted to Game Masters.
     */
    static toggle() {
        // Authorisation check: Abort immediately if the user is a player or the canvas is unready
        if (!canvas?.ready || !game.user.isGM) return;

        if (this.isVisible) {
            this.clear();
            ui.notifications.info(game.i18n.localize("rmu.lighting.heatmap.disabled"));
        } else {
            // 1. Fire the generation notification immediately.
            ui.notifications.info(game.i18n.localize("rmu.lighting.heatmap.generating"));

            // 2. The Main Thread Yielding Trick
            // Because JavaScript is single-threaded, if we immediately plunge into the
            // mathematical loop, the browser will lock up and never actually draw the
            // notification box above to the screen.
            // We use a tiny 50ms timeout to yield control back to the browser just
            // long enough to paint the UI, before we lock the CPU to calculate the map.
            setTimeout(() => {
                this.render();
                ui.notifications.info(game.i18n.localize("rmu.lighting.heatmap.complete"));
            }, 50);
        }
    }

    /**
     * Destroys the PIXI graphics layer, purges it from memory, and removes the HTML legend.
     */
    static clear() {
        if (this.layer) {
            // Destroying children and textures ensures we don't cause WebGL memory leaks
            this.layer.destroy({ children: true, texture: true, baseTexture: true });
            this.layer = null;
        }

        // Remove the HTML legend overlay from the DOM
        const legend = document.getElementById("rmu-heatmap-legend");
        if (legend) legend.remove();

        this.isVisible = false;
    }

    /**
     * Injects a native HTML overlay to act as a fixed HUD legend.
     * We use a DOM element instead of drawing text onto the WebGL canvas so the legend
     * stays crisp, anchored to the UI, and never zooms or pans away when the GM moves the camera.
     */
    static buildLegend() {
        if (document.getElementById("rmu-heatmap-legend")) return;

        const legend = document.createElement("div");
        legend.id = "rmu-heatmap-legend";

        // Style it as a sleek, click-through HUD element
        Object.assign(legend.style, {
            position: "absolute",
            top: "15px",
            marginRight: "15px",
            backgroundColor: "var(--filroden-color-bg-darkest)",
            color: "var(--filroden-color-text-main-solid)",
            border: "var(--filroden-border-main)",
            borderRadius: "var(--filroden-radius-medium)",
            padding: "var(--filroden-space-m)",
            boxShadow: "var(--filroden-shadow-window)",
            zIndex: 100,
            fontFamily: "var(--filroden-font-family)",
            pointerEvents: "none", // Crucial: Allows the GM to interact with tokens underneath the legend
            whiteSpace: "nowrap", // Prevents the layout from breaking if the window gets narrow
        });

        // The exact colour codes used in the canvas generation
        const tiers = [
            { hex: "#FFFFFF", label: game.i18n.localize("rmu.light.tiers.bright") },
            { hex: "#D4D4D4", label: game.i18n.localize("rmu.light.tiers.uneven") },
            { hex: "#AAAAAA", label: game.i18n.localize("rmu.light.tiers.dim") },
            { hex: "#808080", label: game.i18n.localize("rmu.light.tiers.shadowy") },
            { hex: "#555555", label: game.i18n.localize("rmu.light.tiers.dark") },
            { hex: "#2A2A2A", label: game.i18n.localize("rmu.light.tiers.extremelyDark") },
            { hex: "#000000", label: game.i18n.localize("rmu.light.tiers.pitchBlack") },
        ];

        let html = `<h3 style="margin: 0 0 var(--filroden-space-s) 0; border-bottom: 1px solid var(--filroden-color-border); padding-bottom: var(--filroden-space-xs); font-size: var(--filroden-font-size-m); text-align: center; color: var(--filroden-color2-text-main-solid);">RMU Heatmap</h3>`;
        html += `<div style="display: flex; flex-direction: column; gap: var(--filroden-space-s);">`;

        for (const t of tiers) {
            html += `
            <div style="display: flex; align-items: center; gap: var(--filroden-space-m);">
                <div style="width: var(--filroden-font-size-m); height: var(--filroden-font-size-m); background-color: ${t.hex}; border: var(--filroden-border-main); border-radius: var(--filroden-radius-small);"></div>
                <span style="font-size: var(--filroden-font-size-s);">${t.label}</span>
            </div>`;
        }
        html += `</div>`;

        legend.innerHTML = html;

        // Target Foundry's native right-side UI wrapper.
        // This ensures the legend smoothly slides in and out alongside the chat sidebar.
        const uiRight = document.getElementById("ui-right");
        if (uiRight) {
            uiRight.appendChild(legend);
        } else {
            document.body.appendChild(legend); // Safe fallback if the UI architecture changes
        }
    }

    /**
     * Calculates and draws the heat map over the canvas.
     */
    static render() {
        if (this.layer) {
            this.layer.destroy({ children: true, texture: true, baseTexture: true });
            this.layer = null;
        }

        // --- RESOLUTION SCALING ---
        // 1.0 = 1 mathematical check per grid square (fastest, but blocky).
        // 0.25 = 16 mathematical checks per grid square (high fidelity, heavy processing).
        const RESOLUTION_SCALE = 0.25;

        const rect = canvas.dimensions.sceneRect;
        // Enforce a strict minimum chunk size of 10 pixels. This acts as a circuit breaker
        // to prevent accidental memory overloads if a map is scaled incorrectly.
        const stepSize = Math.max(10, canvas.grid.size * RESOLUTION_SCALE);

        // --- PERFORMANCE OPTIMISATION: HTML5 Canvas Baking ---
        // We create an invisible, native HTML5 `<canvas>` element in the background.
        // The native 2D context can stamp pixels magnitudes faster than WebGL can construct polygons.
        const htmlCanvas = document.createElement("canvas");
        htmlCanvas.width = rect.width;
        htmlCanvas.height = rect.height;
        const ctx = htmlCanvas.getContext("2d", { alpha: true });

        // We pre-bake the 0.65 opacity directly into the RGBA string.
        // This prevents the rendering context from having to constantly switch global state,
        // shaving precious milliseconds off the loop execution time.
        const colors = [
            "rgba(255, 255, 255, 0.65)", // Tier 0: Bright
            "rgba(212, 212, 212, 0.65)", // Tier 1: Uneven
            "rgba(170, 170, 170, 0.65)", // Tier 2: Dim
            "rgba(128, 128, 128, 0.65)", // Tier 3: Shadowy
            "rgba(85, 85, 85, 0.65)", // Tier 4: Dark
            "rgba(42, 42, 42, 0.65)", // Tier 5: Extremely Dark
            "rgba(0, 0, 0, 0.65)", // Tier 6: Pitch Black
        ];

        // Loop through the entire physical bounds of the map in chunks
        for (let x = rect.x; x < rect.right; x += stepSize) {
            for (let y = rect.y; y < rect.bottom; y += stepSize) {
                // Calculate from the absolute centre of the specific chunk
                const point = { x: x + stepSize / 2, y: y + stepSize / 2 };

                // Pass null as the target to ignore token-specific vision algorithms
                const tier = getBestIlluminationTier(null, point);

                // Draw the chunk directly onto the invisible HTML5 context
                ctx.fillStyle = colors[tier];
                ctx.fillRect(x - rect.x, y - rect.y, stepSize, stepSize);
            }
        }

        // Convert the finished HTML5 drawing into a single, flat PIXI Texture.
        // WebGL now only has to track 1 image, rather than 150,000 rectangles!
        const baseTexture = new PIXI.BaseTexture(htmlCanvas);
        const texture = new PIXI.Texture(baseTexture);
        this.layer = new PIXI.Sprite(texture);

        // Align the new texture perfectly over the map
        this.layer.x = rect.x;
        this.layer.y = rect.y;

        // Attach to the drawings layer. This natively slots it above the background image,
        // but beneath the tokens, ensuring tokens are never obscured by the heatmap.
        canvas.drawings.addChild(this.layer);

        // Trigger the HUD creation
        this.buildLegend();

        this.isVisible = true;
    }
}

/**
 * Initialises the keyboard listener for the module.
 */
export function initHeatmapListener() {
    window.addEventListener("keydown", (event) => {
        // Alt + L triggers the Heatmap
        if (event.altKey && event.code === "KeyL") {
            // Secondary authorisation check to prevent players from executing the hotkey
            if (!game.user.isGM) return;

            event.preventDefault(); // Prevents the browser from focusing the URL address bar
            RMULightHeatmap.toggle();
        }
    });

    // Automatically purge the heavy texture from memory if the GM changes scenes
    Hooks.on("canvasTearDown", () => {
        RMULightHeatmap.clear();
    });
}
