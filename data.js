"use strict";

/*
  Column order in each row:

  1. CO₂ flowmeter setting (L/min)
  2. Added CO₂ uptake (g/L), derived using PHREEQC
  3. Handheld outlet pH
  4. Handheld inlet pH
  5. Inlet temperature (°C)
  6. Outlet temperature (°C)

  These are individual test readings, not averaged points.
  System pH readings are not used for the handheld pH target.

  CO₂ flow values represent flowmeter settings.
  Pressure values are omitted here because the pressure
  reference and measurement location are not specified
  in these pasted tables.
*/

const RAW_BATCH_TESTS = {
  30: [
    [5,  0.073130129, 6.33, 8.56, 25.2, 26.4],
    [5,  0.076490503, 6.31, 8.56, 25.2, 26.4],
    [5,  0.074665351, 6.31, 8.20, 25.2, 26.4],

    [10, 0.142552270, 6.03, 8.23, 27.2, 26.4],
    [10, 0.129922012, 6.07, 8.21, 27.0, 26.4],

    [15, 0.204499895, 5.87, 8.18, 27.0, 26.9],
    [15, 0.213145583, 5.85, 8.18, 27.0, 27.3],

    [17, 0.288943049, 5.72, 8.17, 27.6, 26.9],
    [17, 0.263445734, 5.76, 8.16, 27.6, 26.9],

    [20, 0.322785220, 5.67, 8.11, 26.9, 27.2],
    [20, 0.287574901, 5.72, 8.11, 26.4, 26.4],

    [25, 0.331165207, 5.66, 8.12, 27.3, 27.0],
    [25, 0.338901999, 5.65, 8.12, 27.4, 27.0]
  ],

  40: [
    [5,  0.024307012, 6.80, 8.20, 24.1, 25.7],
    [5,  0.026421029, 6.75, 8.04, 23.4, 25.9],

    [10, 0.092171051, 6.22, 8.05, 24.9, 25.5],
    [10, 0.078244976, 6.29, 8.05, 24.9, 25.6],

    [15, 0.167489240, 5.96, 7.86, 24.4, 25.4],
    [15, 0.189122617, 5.91, 7.86, 24.4, 25.0],

    [17, 0.289397086, 5.72, 7.77, 25.0, 26.1],
    [17, 0.276594734, 5.74, 7.77, 25.0, 26.0],

    [20, 0.338568126, 5.65, 7.63, 25.3, 26.3],
    [20, 0.362621415, 5.62, 7.63, 25.3, 26.4],

    [25, 0.379377512, 5.60, 7.85, 27.3, 26.9],
    [25, 0.425957039, 5.55, 7.85, 27.3, 26.9]
  ],

  50: [
    [5,  0.021874165, 6.90, 8.66, 24.4, 25.2],
    [5,  0.021794560, 6.90, 8.66, 24.4, 25.5],

    [10, 0.066644865, 6.37, 8.38, 24.4, 25.4],
    [10, 0.066891331, 6.37, 8.47, 24.9, 25.7],
    [10, 0.071404992, 6.34, 8.47, 24.9, 25.9],

    [15, 0.125306746, 6.09, 8.37, 24.9, 26.0],
    [15, 0.130619309, 6.07, 8.41, 25.4, 26.5],
    [15, 0.148769505, 6.06, 8.41, 25.4, 27.1],

    [17, 0.163995894, 5.97, 8.41, 25.4, 26.6],
    [17, 0.183894322, 5.92, 8.41, 25.4, 26.6],
    [17, 0.171886217, 5.95, 8.41, 25.4, 26.5],

    [20, 0.258948594, 5.77, 8.25, 25.4, 26.5],
    [20, 0.260522961, 5.77, 8.25, 25.4, 26.0],
    [20, 0.277041843, 5.74, 8.14, 26.7, 26.5],

    [25, 0.267567234, 5.75, 8.14, 26.7, 27.5],
    [25, 0.322171994, 5.67, 8.21, 27.4, 27.5],
    [25, 0.307660794, 5.69, 8.21, 27.4, 27.5]
  ]
};

/*
  Convert each row into a named record.

  Example:
  window.BATCH_TESTS[30][0].outletPh
*/

window.BATCH_TESTS = Object.fromEntries(
  Object.entries(RAW_BATCH_TESTS).map(([speed, rows]) => {
    const records = rows.map((row, index) => {
      const [
        flow,
        uptake,
        outletPh,
        inletPh,
        inletTemp,
        outletTemp
      ] = row;

      return {
        runId: `${speed}Hz-${String(index + 1).padStart(2, "0")}`,
        speed: Number(speed),
        flow,
        uptake,
        outletPh,
        inletPh,
        inletTemp,
        outletTemp
      };
    });

    return [speed, records];
  })
);

window.BATCH_TEST_METADATA = {
  configuration: "Two parallel Venturi–static mixer branches",

  speeds: [30, 40, 50],

  flowSettings: [5, 10, 15, 17, 20, 25],

  doseBasis: "Added CO₂ mass relative to cement mass",

  phBasis: "Handheld outlet pH",

  uptakeBasis: "PHREEQC-derived added CO₂ concentration",

  source: "User-supplied individual optimization readings",

  units: {
    speed: "Hz",
    flow: "L/min",
    uptake: "g/L",
    temperature: "°C"
  }
};