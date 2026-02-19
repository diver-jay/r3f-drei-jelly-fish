# Jellyfish Simulation (R3F + Particulate)

This project is a modern migration of the legacy [particulate-medusae](https://github.com/milcktoast/particulate-medusae) simulation to **React Three Fiber (R3F)** and **Drei**. It features a procedurally generated jellyfish bell (bulb) that pulsates using dynamic distance constraints.

## Migration Context

This repository is a declarative port of the original Grunt/Bower-based "Medusae" project. The core physics logic from the original `Medusae.js` has been refactored into the `Jellyfish.jsx` component, utilizing R3F hooks for the animation loop and direct buffer attribute manipulation for performance.

## Project Overview

*   **Main Objective:** To simulate the organic, fluid movement of a jellyfish using a particle-constraint system.
*   **Key Technology:**
    *   **React 19 & Three.js:** The foundation for the 3D rendering.
    *   **@react-three/fiber & @react-three/drei:** React-friendly wrappers and helpers for Three.js.
    *   **particulate:** A low-level particle physics library used to manage vertices and constraints (distance, axis, point).
    *   **Vite:** High-speed development and build tool.
    *   **r3f-perf:** Used for real-time performance monitoring.

## Building and Running

| Command | Action |
| :--- | :--- |
| `npm install` | Install dependencies. |
| `npm run dev` | Start the local development server (Vite). |
| `npm run build` | Build the project for production. |
| `npm run preview` | Preview the production build locally. |

## Architecture & Key Files

*   **`src/App.jsx`**: The root component that sets up the R3F `Canvas` and camera.
*   **`src/Experience.jsx`**: Configures the 3D scene environment, including lighting, `OrbitControls`, and performance monitoring.
*   **`src/Jellyfish.jsx`**: The core component.
    *   **Physics Setup:** Uses `particulate` to create a `ParticleSystem`.
    *   **Structure:** Builds the "core" (spine) and "bulb" (bell) using concentric rings (ribs) of particles.
    *   **Animation:** The `updateRibs` function modifies the distance constraints of the ribs every frame within `useFrame`, creating the pulsation effect.
*   **`src/shaders/` & `src/glsl/`**: Contains infrastructure for custom GLSL shaders (`GelShaderMaterial`). This is set up for advanced rendering but currently defaults to `meshNormalMaterial` for debugging.

## Development Conventions

*   **Physics-to-Buffer Integration:** The `Jellyfish` component uses `useMemo` to create a `BufferGeometry` that directly references the `particulate` system's `positions` array. This allows for efficient updates without re-allocating memory.
*   **Scaling:** The jellyfish is built at a large internal scale (~60 units) and scaled down to `0.05` in the R3F scene for easier integration with standard scene units.
*   **Performance:** `r3f-perf` is visible in the top-left corner by default during development to monitor frame rates and draw calls.

## TODOs / Future Work
- [ ] Integrate `GelShaderMaterial` into the `Jellyfish` component for a more realistic organic look.
- [ ] Implement tentacles using the existing `PIN_TAIL` and `PIN_TENTACLE` anchors.
- [ ] Add interactive physics (e.g., jellyfish reacting to mouse movements or collisions).
