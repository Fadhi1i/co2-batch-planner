"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const TESTS = window.BATCH_TESTS;

  let currentPlan = null;
  let feedbackTimer;

  const format = (value, decimals = 2) =>
    Number(value).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });

  const average = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  function range(values) {
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  function rangeText(values, decimals = 2) {
    const limits = range(values);

    if (limits.min === limits.max) {
      return format(limits.min, decimals);
    }

    return (
      `${format(limits.min, decimals)} to ` +
      `${format(limits.max, decimals)}`
    );
  }

  /*
    Summarize each tested flow setting.

    Mean pH is a descriptive average of the recorded pH readings.
    It is not a calculation of the pH of physically mixed samples.
  */
  function summarizeSpeed(speed) {
    const groups = new Map();

    for (const run of TESTS[speed]) {
      if (!groups.has(run.flow)) {
        groups.set(run.flow, []);
      }

      groups.get(run.flow).push(run);
    }

    return [...groups.entries()]
      .map(([flow, runs]) => ({
        flow,
        uptake: average(runs.map((run) => run.uptake)),
        outletPh: average(runs.map((run) => run.outletPh)),
        runs
      }))
      .sort((a, b) => a.flow - b.flow);
  }

  const SUMMARIES = Object.fromEntries(
    Object.keys(TESTS).map((speed) => [
      speed,
      summarizeSpeed(speed)
    ])
  );

  function readInput(id, label, options = {}) {
    const input = $(id);
    const value = input.value.trim() === ""
      ? NaN
      : Number(input.value);

    let error = "";

    if (!Number.isFinite(value)) {
      error = `Enter a valid value for ${label}.`;
    } else if (options.integer && !Number.isInteger(value)) {
      error = `${label} must be a whole number.`;
    } else if (options.positive && value <= 0) {
      error = `${label} must be greater than zero.`;
    } else if (options.nonNegative && value < 0) {
      error = `${label} cannot be negative.`;
    }

    input.setAttribute("aria-invalid", String(Boolean(error)));

    return { value, error };
  }

  function getInputs() {
    const fields = {
      cubes: readInput("cube-count", "number of cubes", {
        integer: true,
        positive: true
      }),

      cubeMass: readInput("cube-mass", "concrete mass per cube", {
        positive: true
      }),

      cementRatio: readInput("cement-ratio", "cement proportion", {
        positive: true
      }),

      fineRatio: readInput("fine-ratio", "fine aggregate proportion", {
        nonNegative: true
      }),

      coarseRatio: readInput(
        "coarse-ratio",
        "coarse aggregate proportion",
        { nonNegative: true }
      ),

      wc: readInput("water-cement-ratio", "water-to-cement ratio", {
        positive: true
      }),

      dose: readInput("target-dose", "target CO₂ dose", {
        nonNegative: true
      })
    };

    const errors = Object.values(fields)
      .map((field) => field.error)
      .filter(Boolean);

    const speedInput = document.querySelector(
      'input[name="pumpSpeed"]:checked'
    );

    const speed = speedInput ? Number(speedInput.value) : null;

    if (!SUMMARIES[speed]) {
      errors.push("Select a pump speed.");
    }

    return {
      values: {
        ...Object.fromEntries(
          Object.entries(fields).map(([key, field]) => [
            key,
            field.value
          ])
        ),
        speed
      },
      errors
    };
  }

  function calculateBatch(input) {
    const totalMass = input.cubes * input.cubeMass;

    /*
      For cement : fine : coarse = c : f : a,
      water contributes c × w/c parts.
    */
    const totalParts =
      input.cementRatio +
      input.fineRatio +
      input.coarseRatio +
      input.cementRatio * input.wc;

    const massPerPart = totalMass / totalParts;

    const cement = massPerPart * input.cementRatio;
    const fine = massPerPart * input.fineRatio;
    const coarse = massPerPart * input.coarseRatio;
    const water = cement * input.wc;

    // Cement is in kg. Target dose is entered as a percentage.
    const co2Mass = cement * 1000 * input.dose / 100;

    // Water volume assumes 1 kg/L.
    const requiredUptake = co2Mass / water;

    return {
      totalMass,
      totalParts,
      massPerPart,
      cement,
      fine,
      coarse,
      water,
      co2Mass,
      requiredUptake
    };
  }

  function estimateOperatingPoint(speed, target) {
    const points = SUMMARIES[speed];
    const minimum = Math.min(...points.map((point) => point.uptake));
    const maximum = Math.max(...points.map((point) => point.uptake));

    if (target === 0) {
      return {
        type: "zero",
        points: []
      };
    }

    if (target < minimum || target > maximum) {
      return {
        type: "outside",
        minimum,
        maximum,
        points: [points[0], points[points.length - 1]]
      };
    }

    const exact = points.find(
      (point) => Math.abs(point.uptake - target) < 1e-10
    );

    if (exact) {
      return {
        type: "tested",
        flow: exact.flow,
        ph: exact.outletPh,
        points: [exact]
      };
    }

    /*
      Interpolate only between neighboring flow settings
      whose mean uptake brackets the requested target.
    */
    const candidates = [];

    for (let index = 0; index < points.length - 1; index++) {
      const lower = points[index];
      const upper = points[index + 1];

      const difference = upper.uptake - lower.uptake;

      if (difference === 0) continue;

      const fraction = (target - lower.uptake) / difference;

      if (fraction > 0 && fraction < 1) {
        candidates.push({
          type: "interpolated",

          flow:
            lower.flow +
            fraction * (upper.flow - lower.flow),

          ph:
            lower.outletPh +
            fraction * (upper.outletPh - lower.outletPh),

          points: [lower, upper]
        });
      }
    }

    if (candidates.length !== 1) {
      return {
        type: "unavailable",
        points,
        reason:
          "The test trend does not give one unambiguous " +
          "operating estimate for this target."
      };
    }

    return candidates[0];
  }

  function showErrors(errors) {
    const box = $("validation-message");
    const heading = document.createElement("strong");
    const list = document.createElement("ul");

    heading.textContent = "Check these inputs:";

    for (const error of errors) {
      const item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    }

    box.replaceChildren(heading, list);
    box.hidden = false;

    $("plan-results").hidden = true;
    $("total-mass-preview").textContent = "—";

    currentPlan = null;
  }

  function setStatus(text, status) {
    $("estimate-status").textContent = text;
    $("estimate-status").dataset.status = status;
  }

  function renderMaterials(input, batch) {
    $("total-mass-preview").textContent =
      `${format(batch.totalMass)} kg`;

    $("batch-summary").textContent =
      `${input.cubes} cubes × ${format(input.cubeMass)} kg`;

    $("cement-output").textContent =
      `${format(batch.cement)} kg`;

    $("fine-output").textContent =
      `${format(batch.fine)} kg`;

    $("coarse-output").textContent =
      `${format(batch.coarse)} kg`;

    $("water-output").textContent =
      `${format(batch.water)} L`;

    $("co2-mass-output").textContent =
      `${format(batch.co2Mass, 3)} g`;

    $("uptake-output").textContent =
      `${format(batch.requiredUptake, 4)} g/L`;
  }

  function renderOperating(input, batch, estimate) {
    $("speed-output").textContent = `${input.speed} Hz`;
    $("flow-output").textContent = "—";
    $("ph-output").textContent = "—";

    if (estimate.type === "zero") {
      setStatus("No added CO₂ requested", "zero");

      $("flow-output").textContent = "0 L/min";

      $("operating-explanation").textContent =
        "The target dose is zero, so no CO₂ addition is required. " +
        "An untreated-water pH target is not inferred from " +
        "the carbonation tests.";

      return;
    }

    if (estimate.type === "outside") {
      setStatus("Outside tested range", "outside");

      const direction =
        batch.requiredUptake < estimate.minimum
          ? "below"
          : "above";

      $("operating-explanation").textContent =
        `The required ${format(batch.requiredUptake, 4)} g/L ` +
        `is ${direction} the tested mean uptake range at ` +
        `${input.speed} Hz: ` +
        `${format(estimate.minimum, 4)} to ` +
        `${format(estimate.maximum, 4)} g/L. ` +
        "No flow or pH is extrapolated. Select another speed " +
        "to check its tested range.";

      return;
    }

    if (estimate.type === "unavailable") {
      setStatus("Estimate unavailable", "unavailable");

      $("operating-explanation").textContent = estimate.reason;

      return;
    }

    $("flow-output").textContent =
      `${format(estimate.flow, 1)} L/min`;

    $("ph-output").textContent =
      format(estimate.ph, 2);

    if (estimate.type === "tested") {
      setStatus("Tested setting mean", "tested");

      $("operating-explanation").textContent =
        "The required uptake matches a tested mean. " +
        "The displayed pH is the mean handheld outlet reading " +
        "at that flow setting; individual runs varied.";
    } else {
      setStatus("Estimated between tests", "interpolated");

      const [lower, upper] = estimate.points;

      $("operating-explanation").textContent =
        `Estimated between the ${lower.flow} and ` +
        `${upper.flow} L/min tests at ${input.speed} Hz. ` +
        "Flow and outlet pH are linearly interpolated between " +
        "the two test means. This is a starting operating " +
        "estimate, not a separately tested setting.";
    }
  }

  function renderSupportingPoints(estimate) {
    const host = $("supporting-points");

    if (estimate.type === "zero") {
      host.innerHTML = `
        <p>No carbonation test points are needed for a zero dose.</p>
      `;

      return;
    }

    const rows = estimate.points.map((point) => `
      <tr>
        <td>${point.flow}</td>
        <td>${format(point.uptake, 4)}</td>
        <td>${format(point.outletPh, 2)}</td>
        <td>${point.runs.length}</td>
      </tr>
    `).join("");

    const runs = estimate.points.flatMap((point) => point.runs);

    host.innerHTML = `
      <div class="table-wrap">
        <table>
          <caption>
            Mean values at the supporting flow settings
          </caption>

          <thead>
            <tr>
              <th scope="col">CO₂ (L/min)</th>
              <th scope="col">Uptake (g/L)</th>
              <th scope="col">Outlet pH</th>
              <th scope="col">Runs</th>
            </tr>
          </thead>

          <tbody>${rows}</tbody>
        </table>
      </div>

      <p>
        Recorded outlet pH across these runs:
        ${rangeText(runs.map((run) => run.outletPh))}.
        This span is not a target tolerance or confidence interval.
      </p>

      <p>
        Inlet pH:
        ${rangeText(runs.map((run) => run.inletPh))}.
        Inlet temperature:
        ${rangeText(runs.map((run) => run.inletTemp), 1)} °C.
        Outlet temperature:
        ${rangeText(runs.map((run) => run.outletTemp), 1)} °C.
      </p>

      <p>
        The estimate does not correct for differences in water
        chemistry or temperature. Use the handheld outlet reading
        for comparison with these tests.
      </p>
    `;
  }

  function renderCalculations(input, batch) {
    $("calculation-steps").innerHTML = `
      <ol>
        <li>
          <strong>Total batch mass:</strong>
          ${input.cubes} × ${format(input.cubeMass)}
          = ${format(batch.totalMass)} kg.
        </li>

        <li>
          <strong>Total mix parts, including water:</strong>
          ${input.cementRatio} + ${input.fineRatio}
          + ${input.coarseRatio}
          + (${input.cementRatio} × ${input.wc})
          = ${format(batch.totalParts, 4)}.
        </li>

        <li>
          <strong>Cement:</strong>
          ${format(batch.totalMass)} ÷
          ${format(batch.totalParts, 4)} ×
          ${input.cementRatio}
          = ${format(batch.cement, 3)} kg.
          Aggregate masses use their respective proportions.
        </li>

        <li>
          <strong>Mixing water:</strong>
          ${format(batch.cement, 3)} × ${input.wc}
          = ${format(batch.water, 3)} kg,
          approximately ${format(batch.water, 3)} L.
        </li>

        <li>
          <strong>Required added CO₂:</strong>
          ${format(batch.cement, 3)} × 1000 ×
          ${input.dose} ÷ 100
          = ${format(batch.co2Mass, 3)} g.
        </li>

        <li>
          <strong>Required uptake:</strong>
          ${format(batch.co2Mass, 3)} ÷
          ${format(batch.water, 3)}
          = ${format(batch.requiredUptake, 4)} g/L.
        </li>
      </ol>

      <p>
        Calculations use full precision internally.
        Displayed material quantities are rounded.
      </p>
    `;
  }

  function update() {
    window.clearTimeout(feedbackTimer);
    $("copy-feedback").textContent = "";

    const { values: input, errors } = getInputs();

    if (errors.length) {
      showErrors(errors);
      return;
    }

    const batch = calculateBatch(input);

    const invalidCalculation =
      !Object.values(batch).every(Number.isFinite) ||
      batch.cement <= 0 ||
      batch.water <= 0 ||
      batch.totalMass <= 0;

    if (invalidCalculation) {
      showErrors([
        "These quantities cannot be calculated. " +
        "Check the batch size and mix proportions."
      ]);

      return;
    }

    const estimate = estimateOperatingPoint(
      input.speed,
      batch.requiredUptake
    );

    $("validation-message").hidden = true;
    $("plan-results").hidden = false;

    renderMaterials(input, batch);
    renderOperating(input, batch, estimate);
    renderSupportingPoints(estimate);
    renderCalculations(input, batch);

    currentPlan = { input, batch, estimate };
  }

  function planText(plan) {
    const { input, batch, estimate } = plan;

    const lines = [
      "CO₂ BATCH PLAN",
      "",
      `Batch: ${input.cubes} cubes × ${format(input.cubeMass)} kg`,
      `Total fresh concrete: ${format(batch.totalMass)} kg`,
      `Mix by mass: ${input.cementRatio}:${input.fineRatio}:${input.coarseRatio}`,
      `Water/cement ratio: ${input.wc}`,
      "",
      `Cement: ${format(batch.cement)} kg`,
      `Fine aggregate: ${format(batch.fine)} kg`,
      `Coarse aggregate: ${format(batch.coarse)} kg`,
      `Carbonated mixing water: ${format(batch.water)} L`,
      "",
      `Target added CO₂ dose: ${input.dose}% of cement mass`,
      `Required added CO₂: ${format(batch.co2Mass, 3)} g`,
      `Required uptake: ${format(batch.requiredUptake, 4)} g/L`,
      `Selected pump speed: ${input.speed} Hz`
    ];

    if (
      estimate.type === "tested" ||
      estimate.type === "interpolated"
    ) {
      lines.push(
        `CO₂ flow setting: ${format(estimate.flow, 1)} L/min`,
        `Expected handheld outlet pH: ${format(estimate.ph, 2)}`,
        `Basis: ${
          estimate.type === "tested"
            ? "tested setting mean"
            : "interpolated between tested means"
        }`
      );
    } else if (estimate.type === "zero") {
      lines.push(
        "CO₂ flow: 0 L/min",
        "No added CO₂ requested; no pH target assigned."
      );
    } else if (estimate.type === "outside") {
      lines.push(
        "Target is outside the tested mean uptake range.",
        "No flow or pH estimate assigned."
      );
    } else {
      lines.push("No unambiguous operating estimate available.");
    }

    lines.push(
      "",
      "Assumes all mixing water is carbonated and its added CO₂",
      "concentration is retained until mixing.",
      "No SCM, admixture or aggregate moisture adjustments included.",
      "Expected pH applies to the tested water conditions.",
      "Delivered added CO₂ is not a measurement of mineralized CO₂."
    );

    return lines.join("\n");
  }

  async function copyPlan() {
    if (!currentPlan) return;

    const planAtClick = currentPlan;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(planText(planAtClick));

      if (currentPlan !== planAtClick) return;

      $("copy-feedback").textContent = "Batch plan copied.";

      feedbackTimer = window.setTimeout(() => {
        $("copy-feedback").textContent = "";
      }, 3500);
    } catch {
      if (currentPlan !== planAtClick) return;

      $("copy-feedback").textContent =
        "Clipboard access was unavailable. " +
        "You can select and copy the displayed results manually.";
    }
  }

  $("planner-form").addEventListener("submit", (event) => {
    event.preventDefault();
  });

  $("planner-form").addEventListener("input", update);
  $("planner-form").addEventListener("change", update);

  $("planner-form").addEventListener("reset", () => {
    // Wait for the browser to restore the default input values.
    window.setTimeout(update, 0);
  });

  $("copy-plan").addEventListener("click", copyPlan);

  update();
})();