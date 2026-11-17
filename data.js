"use strict";

(() => {
  /*
   * CO2 BATCH PLANNER: EXPERIMENTAL DATA
   *
   * Sources:
   * 20 Hz: supplied individual trial table.
   * 30 Hz: supplied individual trial table.
   * 40 Hz: corrected individual trial table.
   * 50 Hz: original 50HZ.xlsx workbook.
   *
   * All CO2 concentrations are expressed as CO2 equivalent.
   *
   * Added uptake excludes carbon already present in
   * untreated water.
   *
   * The planner uses added uptake to calculate the
   * additional dissolved CO2 delivered through mixing water.
   *
   * WATER MASS:
   * 20, 40 and 50 Hz: independently weighed collections.
   * 30 Hz: assumed at 8 kg per collection, as agreed.
   *
   * The 30 Hz assumption affects dissolved mass and
   * dissolution efficiency. It does not alter the
   * supplied PHREEQC uptake concentration.
   *
   * No collection duration is inferred.
   * No pressure reference is assumed.
   */

  const SPEEDS = [20, 30, 40, 50];
  const FLOW_SETTINGS = [5, 10, 15, 17, 20, 25];
  const WATER_DENSITY_KG_L = 1;

  /*
   * Row order:
   *
   *  0: CO2 flowmeter setting, L/min
   *  1: PHREEQC added uptake, g/L
   *  2: Handheld outlet pH
   *  3: Handheld inlet pH
   *  4: Inlet temperature, degrees C
   *  5: Outlet temperature, degrees C
   *  6: Total dissolved carbon as CO2 equivalent, g/L
   *  7: Water setpoint, kg
   *  8: Water mass used in calculations, kg
   *  9: CO2 cylinder mass loss, g
   * 10: Point 1 water flowmeter indication, L/min
   * 11: Point 2 water flowmeter indication, L/min
   * 12: Recorded pressure, bar
   *
   * Column 8 is assumed at 8 kg for 30 Hz.
   * At the other speeds, it is independently weighed.
   */

  const RAW_BATCH_TESTS = {
    20: [
      [
        5, 0.037212514, 6.57, 8.83, 23, 23.9,
        0.107239995, 10, 10.53, 8, 17.6, 14.8, 1.1
      ],
      [
        5, 0.043851567, 6.59, 8.83, 23, 24.2,
        0.113879048, 10, 10.61, 6, 17.95, 14.95, 1.1
      ],
      [
        10, 0.175211978, 5.96, 8.83, 23, 24.3,
        0.245239459, 10, 10.01, 14, 17.1, 15, 1.2
      ],
      [
        10, 0.175895784, 5.95, 8.4, 24.5, 24.6,
        0.248546775, 10, 10.08, 14, 16.95, 14.9, 1.2
      ],
      [
        10, 0.172816778, 5.96, 8.4, 24.5, 24.2,
        0.245467768, 10, 10.29, 14, 16.9, 14.85, 1.2
      ],
      [
        15, 0.284929833, 5.74, 8.36, 23.9, 24.5,
        0.357819015, 10, 9.18, 24, 15.8, 14.7, 1.2
      ],
      [
        15, 0.298340572, 5.72, 8.36, 23.9, 24.5,
        0.371229754, 10, 9.93, 24, 15.6, 14.7, 1.2
      ],
      [
        15, 0.277370162, 5.75, 8.36, 23.9, 24.8,
        0.350259344, 10, 9.15, 22, 15.65, 14.75, 1.2
      ],
      [
        17, 0.277600436, 5.75, 8.33, 24.1, 24.7,
        0.350618289, 10, 8.84, 30, 14.8, 14, 1.3
      ],
      [
        17, 0.264776494, 5.77, 8.33, 24.1, 24.8,
        0.337794347, 10, 8.65, 28, 14.8, 14.25, 1.3
      ],
      [
        17, 0.277241492, 5.75, 8.33, 24.1, 24.8,
        0.350259344, 10, 8.67, 28, 14.75, 14.6, 1.3
      ],
      [
        20, 0.333857238, 5.67, 8.36, 24.2, 24.7,
        0.406725384, 10, 8.26, 36, 13.5, 15, 1.2
      ],
      [
        20, 0.310393289, 5.7, 8.36, 24.2, 25,
        0.383261435, 10, 8.18, 36, 13.35, 14.5, 1.2
      ],
      [
        20, 0.310791306, 5.7, 8.36, 24.2, 24.9,
        0.383659453, 10, 7.9, 38, 13.35, 14.25, 1.2
      ],
      [
        25, 0.296509199, 5.72, 8.29, 24.5, 24.9,
        0.36968739, 10, 7.81, 46, 12.9, 14.5, 1.2
      ],
      [
        25, 0.283900049, 5.74, 8.29, 24.5, 24.7,
        0.357078239, 10, 7.68, 46, 12.75, 14, 1.2
      ],
      [
        25, 0.276750815, 5.75, 8.29, 24.9, 24.9,
        0.34990242, 10, 7.65, 46, 12.75, 14.5, 1.2
      ]
    ],

    /*
     * 30 Hz: water mass is assumed at 8 kg.
     */

    30: [
      [
        5, 0.073130129, 6.33, 8.56, 25.2, 26.4,
        0.14485355, 8, 8, 8, 18.65, 22.56, 2.6
      ],
      [
        5, 0.076490503, 6.31, 8.56, 25.2, 26.4,
        0.148213924, 8, 8, 4, 18.8, 23.3, 2.6
      ],
      [
        5, 0.074665351, 6.31, 8.2, 25.2, 26.4,
        0.148213924, 8, 8, 4, 23.55, 18.8, 2.6
      ],
      [
        10, 0.14255227, 6.03, 8.23, 27.2, 26.4,
        0.215833072, 8, 8, 8, 22.4, 18.75, 2.8
      ],
      [
        10, 0.129922012, 6.07, 8.21, 27, 26.4,
        0.20330975, 8, 8, 8, 22.5, 18.7, 2.6
      ],
      [
        15, 0.204499895, 5.87, 8.18, 27, 26.9,
        0.278028028, 8, 8, 12, 21.95, 18.65, 2.6
      ],
      [
        15, 0.213145583, 5.85, 8.18, 27, 27.3,
        0.286673716, 8, 8, 12, 22.75, 18.35, 2.6
      ],
      [
        17, 0.288943049, 5.72, 8.17, 27.6, 26.9,
        0.362480161, 8, 8, 18, 23.1, 20.9, 2.4
      ],
      [
        17, 0.263445734, 5.76, 8.16, 27.6, 26.9,
        0.337029908, 8, 8, 16, 23.1, 18.6, 2.2
      ],
      [
        20, 0.32278522, 5.67, 8.11, 26.9, 27.2,
        0.396648595, 8, 8, 22, 22.3, 19.55, 2.2
      ],
      [
        20, 0.287574901, 5.72, 8.11, 26.4, 26.4,
        0.361468626, 8, 8, 22, 22.3, 19, 2.3
      ],
      [
        25, 0.331165207, 5.66, 8.12, 27.3, 27,
        0.404956761, 8, 8, 28, 20.85, 18.4, 2.3
      ],
      [
        25, 0.338901999, 5.65, 8.12, 27.4, 27,
        0.412687418, 8, 8, 28, 21.3, 19.9, 2.3
      ]
    ],

    /*
     * 40 Hz: corrected table supplied by the user.
     */

    40: [
      [
        5, 0.024307012, 6.8, 8.2, 24.1, 25.7,
        0.097924081, 10, 12.44, 2, 30, 24, 4.6
      ],
      [
        5, 0.026421029, 6.75, 8.04, 23.4, 25.9,
        0.100828779, 10, 12.44, 2, 30, 24.2, 4.6
      ],
      [
        10, 0.092171051, 6.22, 8.05, 24.9, 25.5,
        0.166441641, 10, 11.5, 8, 30, 23.5, 4.6
      ],
      [
        10, 0.078244976, 6.29, 8.05, 24.9, 25.6,
        0.152515566, 10, 11.69, 8, 30, 23.5, 4.6
      ],
      [
        15, 0.16748924, 5.96, 7.86, 24.4, 25.4,
        0.242810724, 10, 12.63, 14, 28.8, 23, 4.4
      ],
      [
        15, 0.189122617, 5.91, 7.86, 24.4, 25,
        0.264444102, 10, 11.79, 16, 28.8, 22.85, 4.4
      ],
      [
        17, 0.289397086, 5.72, 7.77, 25, 26.1,
        0.365264642, 10, 11.75, 20, 28, 22.9, 4.4
      ],
      [
        17, 0.276594734, 5.74, 7.77, 25, 26,
        0.35246229, 10, 11.04, 18, 27.95, 22.6, 4.2
      ],
      [
        20, 0.338568126, 5.65, 7.63, 25.3, 26.3,
        0.41552317, 10, 11.53, 26, 27.3, 22.5, 4.3
      ],
      [
        20, 0.362621415, 5.62, 7.63, 25.3, 26.4,
        0.439576459, 10, 11.68, 28, 26.3, 22.2, 4.3
      ],
      [
        25, 0.379377512, 5.6, 7.85, 27.3, 26.9,
        0.454582926, 10, 11.01, 34, 26.3, 23.2, 3.2
      ],
      [
        25, 0.425957039, 5.55, 7.85, 27.3, 26.9,
        0.501162453, 10, 10.74, 34, 25.6, 22.95, 3.2
      ]
    ],

    50: [
      [
        5, 0.02187416481282, 6.9, 8.66, 24.4, 25.2,
        0.09303648043797, 10, 10.79, 4, 29.35, 24.5, 4.4
      ],
      [
        5, 0.02179455995781, 6.9, 8.66, 24.4, 25.5,
        0.09295687558296, 10, 10.59, 4, 29.3, 25, 4.2
      ],
      [
        10, 0.06664486499008, 6.37, 8.38, 24.4, 25.4,
        0.1394018109416, 10, 10.71, 10, 29.25, 23.7, 4.4
      ],
      [
        10, 0.06689133135317, 6.37, 8.47, 24.9, 25.7,
        0.139150424622, 10, 10.39, 10, 29.25, 24.6, 4.6
      ],
      [
        10, 0.07140499179112, 6.34, 8.47, 24.9, 25.9,
        0.14366408506, 10, 10.19, 10, 29.5, 24.65, 4.6
      ],
      [
        15, 0.1253067456636, 6.09, 8.37, 24.9, 26,
        0.198076650102, 10, 10.5, 14, 29.5, 24.3, 4.4
      ],
      [
        15, 0.1306193086792, 6.07, 8.41, 25.4, 26.5,
        0.203152757481, 10, 10.58, 14, 29.1, 24.5, 4.6
      ],
      [
        15, 0.1487695050195, 6.06, 8.41, 25.4, 27.1,
        0.221302953821, 10, 10.11, 14, 29.25, 24, 4.8
      ],
      [
        17, 0.1639958935986, 5.97, 8.41, 25.4, 26.6,
        0.2365293424, 10, 10.34, 16, 29.55, 24.1, 4.8
      ],
      [
        17, 0.1838943223127, 5.92, 8.41, 25.4, 26.6,
        0.256427771114, 10, 10.34, 14, 29.4, 23.9, 4.8
      ],
      [
        17, 0.1718862171828, 5.95, 8.41, 25.4, 26.5,
        0.244419665985, 10, 10.54, 14, 29.65, 24.05, 4.6
      ],
      [
        20, 0.2589485944798, 5.77, 8.25, 25.4, 26.5,
        0.332253487211, 10, 10.63, 20, 29.5, 24.3, 4.6
      ],
      [
        20, 0.2605229608175, 5.77, 8.25, 25.4, 26,
        0.333827853549, 10, 10.68, 20, 29, 24, 4.8
      ],
      [
        20, 0.2770418429034, 5.74, 8.14, 26.7, 26.5,
        0.35077597607, 10, 10.37, 20, 29.15, 24.3, 4.8
      ],
      [
        25, 0.267567233829, 5.75, 8.14, 26.7, 27.5,
        0.341301366996, 10, 10.26, 24, 29.4, 23.8, 5
      ],
      [
        25, 0.322171994129, 5.67, 8.21, 27.4, 27.5,
        0.395533866678, 10, 10.26, 26, 27.8, 23.7, 4.8
      ],
      [
        25, 0.3076607941458, 5.69, 8.21, 27.4, 27.5,
        0.381022666695, 10, 9.68, 24, 29.1, 24.45, 4.4
      ]
    ]
  };

  function average(values) {
    if (!values.length) return undefined;

    return values.reduce((sum, value) => sum + value, 0) /
      values.length;
  }

  function sampleSD(values) {
    if (values.length < 2) return undefined;

    const mean = average(values);

    return Math.sqrt(
      values.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0
      ) /
      (values.length - 1)
    );
  }

  function makeRecord(speed, row, index) {
    const [
      flow,
      uptake,
      outletPh,
      inletPh,
      inletTemp,
      outletTemp,
      totalCo2,
      waterSetpoint,
      waterKg,
      co2Grams,
      waterFlow1,
      waterFlow2,
      pressure
    ] = row;

    const waterMassAssumed = speed === 30;

    const waterLitres = waterKg / WATER_DENSITY_KG_L;
    const uptakeGrams = uptake * waterLitres;
    const totalCo2Grams = totalCo2 * waterLitres;

    const efficiency = co2Grams > 0
      ? uptakeGrams / co2Grams * 100
      : undefined;

    const record = {
      runId: `${speed}Hz-${String(index + 1).padStart(2, "0")}`,

      speed,
      flow,

      uptake,
      totalCo2,

      outletPh,
      inletPh,
      inletTemp,
      outletTemp,

      waterSetpoint,
      waterKg,
      waterLitres,

      waterMassAssumed,
      waterMassBasis: waterMassAssumed ? "assumed" : "weighed",

      measuredWaterKg: waterMassAssumed ? null : waterKg,

      co2Grams,
      uptakeGrams,
      totalCo2Grams,
      efficiency,

      waterFlow1,
      waterFlow2,
      pressure
    };

    /*
     * An assumed water mass cannot verify delivery accuracy.
     */
    if (!waterMassAssumed && waterSetpoint > 0) {
      record.waterDeviationPercent =
        (waterKg - waterSetpoint) / waterSetpoint * 100;
    }

    return record;
  }

  function makeSummary(speed, flow, runs) {
    const waterMassAssumed = runs.some(
      (run) => run.waterMassAssumed
    );

    const summary = {
      speed,
      flow,
      runs,
      repeatCount: runs.length,

      waterMassAssumed,
      waterMassBasis: waterMassAssumed ? "assumed" : "weighed"
    };

    const fields = [
      "uptake",
      "totalCo2",
      "outletPh",
      "inletPh",
      "inletTemp",
      "outletTemp",
      "waterSetpoint",
      "waterKg",
      "waterLitres",
      "measuredWaterKg",
      "co2Grams",
      "uptakeGrams",
      "totalCo2Grams",
      "efficiency",
      "waterFlow1",
      "waterFlow2",
      "pressure"
    ];

    for (const field of fields) {
      const values = runs.map((run) => run[field]);

      if (values.every(Number.isFinite)) {
        summary[field] = average(values);
      }
    }

    if (waterMassAssumed) {
      summary.measuredWaterKg = null;
    }

    const spreadFields = [
      "uptake",
      "outletPh",
      "efficiency"
    ];

    for (const field of spreadFields) {
      const values = runs.map((run) => run[field]);

      summary[`${field}Min`] = Math.min(...values);
      summary[`${field}Max`] = Math.max(...values);
      summary[`${field}SD`] = sampleSD(values);
    }

    if (
      !waterMassAssumed &&
      Number.isFinite(summary.waterKg) &&
      summary.waterSetpoint > 0
    ) {
      summary.waterDeviationPercent =
        (
          (summary.waterKg - summary.waterSetpoint) /
          summary.waterSetpoint
        ) * 100;
    }

    return summary;
  }

  const tests = {};
  const summaries = {};

  for (const speed of SPEEDS) {
    const records = RAW_BATCH_TESTS[speed].map(
      (row, index) => makeRecord(speed, row, index)
    );

    tests[speed] = records;

    summaries[speed] = FLOW_SETTINGS.map((flow) =>
      makeSummary(
        speed,
        flow,
        records.filter((run) => run.flow === flow)
      )
    );
  }

  /*
   * Interfaces used by app.js:
   *
   * window.BATCH_TESTS:
   *   Individual trial records grouped by pump speed.
   *
   * window.BATCH_SUMMARIES:
   *   Setting means, ranges and supporting runs.
   */

  window.BATCH_TESTS = tests;
  window.BATCH_SUMMARIES = summaries;

  window.BATCH_TEST_METADATA = {
    configuration: "Two parallel Venturi-static mixer branches",

    speeds: SPEEDS,
    flowSettings: FLOW_SETTINGS,

    totalTrials: Object.values(tests)
      .reduce((total, records) => total + records.length, 0),

    waterDensityKgL: WATER_DENSITY_KG_L,

    doseBasis:
      "Additional dissolved CO2 mass relative to cement mass",

    phBasis:
      "Mean handheld outlet pH at the supporting test settings",

    uptakeBasis:
      "PHREEQC-derived added CO2 above the untreated-water baseline",

    totalCo2Basis:
      "Total dissolved inorganic carbon expressed as CO2 equivalent",

    averagingBasis:
      "Arithmetic means of individual trials at each flow setting",

    phAveragingNote:
      "Mean pH is a descriptive average of recorded readings, " +
      "not the calculated pH of physically mixed samples.",

    interpolationPolicy:
      "Use adjacent tested flow-setting means only. " +
      "Do not extrapolate beyond the tested uptake range. " +
      "If several intervals bracket the target, show the " +
      "alternatives rather than silently selecting one.",

    waterMassBasis: {
      20: "Independently weighed collected water",

      30:
        "Assumed 8 kg per collection. Water delivery accuracy " +
        "was not independently verified.",

      40: "Independently weighed collected water",

      50: "Independently weighed collected water"
    },

    sources: {
      20: "17 trials from the supplied 20 Hz table",

      30:
        "13 trials from the supplied 30 Hz table; " +
        "8 kg water mass assumed per collection",

      40: "12 trials from the corrected supplied 40 Hz table",

      50: "17 trials from the original 50HZ.xlsx workbook"
    },

    units: {
      speed: "Hz",
      flow: "L/min",
      uptake: "g/L as CO2 equivalent",
      totalCo2: "g/L as CO2 equivalent",
      waterKg: "kg; check waterMassBasis",
      measuredWaterKg: "kg weighed",
      waterLitres: "L, using 1 kg/L",
      waterSetpoint: "kg",
      co2Grams: "g",
      uptakeGrams: "g as CO2 equivalent",
      totalCo2Grams: "g as CO2 equivalent",
      efficiency: "%",
      temperature: "degrees C",
      pressure: "bar; reference not confirmed",
      waterFlow1: "L/min indicated",
      waterFlow2: "L/min indicated"
    },

    notes: [
      "The dataset contains individual trials for all four speeds.",

      "All setting means are calculated from those individual trials.",

      "CO2 flow values represent flowmeter settings.",

      "Handheld pH is kept separate from system pH.",

      "30 Hz water mass is assumed at 8 kg per collection.",

      "30 Hz dissolved masses and efficiencies depend on that assumption.",

      "30 Hz assumed water mass does not verify delivery accuracy.",

      "Point 1 and Point 2 readings remain separate and as recorded.",

      "The planner does not correct uptake for changed water chemistry or temperature.",

      "Interpolated settings are estimates, not separately tested operating points.",

      "Several flow intervals may correspond to the same uptake target.",

      "Recorded water shortfalls must not be converted into automatic mix-water adjustments.",

      "Actual batch water must still meet the intended mix design.",

      "The concentration is assumed to be retained until mixing.",

      "Delivered dissolved CO2 is separate from CO2 mineralised in concrete.",

      "Collection duration and delivery rates per minute are not inferred."
    ]
  };
})();