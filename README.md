# R3F Jellyfish Simulation

This project is a modern migration of the [particulate-medusae](https://github.com/milcktoast/particulate-medusae) simulation to **React Three Fiber (R3F)** and **Drei**.

## Migration Overview

This repository represents a complete port and modernization of the original `particulate-medusae` project. Key changes include:

*   **Platform:** Migrated from a legacy Grunt/Bower/Three.js (r72) stack to **Vite** and **React 19**.
*   **Architecture:** Rebuilt using a declarative **React Three Fiber** component structure.
*   **Physics:** Updated the [particulate](https://github.com/milcktoast/particulate) physics implementation to work seamlessly with R3F's `useFrame` and `BufferGeometry` attributes.
*   **Modern Tooling:** Integrated `leva` for controls and `r3f-perf` for monitoring.

## Tech Stack

*   **React 19**
*   **Three.js**
*   **@react-three/fiber** & **@react-three/drei**
*   **particulate** (Particle physics engine)
*   **Vite**

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Project Structure

*   `src/Jellyfish.jsx`: Core physics simulation and jellyfish geometry generation.
*   `src/Experience.jsx`: Scene setup including lights, controls, and environment.
*   `src/App.jsx`: Canvas entry point.
*   `src/shaders/`: Custom GLSL shader materials (port of the original jellyfish shaders).

## Original Credits
The original `particulate-medusae` was created by [Ash Weeks](https://milcktoast.com). This migration aims to preserve the organic movement and aesthetic of the original simulation while leveraging modern web technologies.
