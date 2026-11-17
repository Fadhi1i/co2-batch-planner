"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const TESTS = window.BATCH_TESTS;
  const SUMMARIES = window.BATCH_SUMMARIES;
  const META = window.BATCH_TEST_METADATA;

  if (!TESTS || !SUMMARIES || !META) {
    const message = $("validation-message");

    if (message) {
      message.hidden = false;
      message.textContent =
        "The trial data could not be loaded. " +
        "Check that the updated data.js loads before app.js.";
    }

    return;
  }

  let currentPlan = null;
  let inputsDirty = false;
  let feedbackTimer = null;

  const FIELD_RULES = [
    {
      key: "cubes",
      id: "cube-count",
      label: "number of cubes",
      positive: true,
      integer: true
    },
    {
      key: "cubeMass",
      id: "cube-mass",
      label: "concrete mass per cube",
      positive: true
    },
    {
      key: "cementRatio",
      id: "cement-ratio",
      label: "cement proportion",
      positive: true
    },
    {
      key: "fineRatio",
      id: "fine-ratio",
      label: "fine aggregate proportion",
      nonNegative: true
    },
    {
      key: "coarseRatio",
      id: "coarse-ratio",
      label: "coarse aggregate proportion",
      nonNegative: true
    },
    {
      key: "wc",
      id: "water-cement-ratio",
      label: "water-to-cement ratio",
      positive: true
    },
    {
      key: "dose",
      id: "target-dose",
      label: "target CO₂ dose",
      nonNegative: true
    }
  ];

  /* =====================================================
     GENERAL HELPERS
  ===================================================== */

  function format(value, decimals = 2) {
    if (!Number.isFinite(value)) return "Not available";

    const absolute = Math.abs(value);

    if (
      absolute >= 1000000 ||
      (absolute > 0 && absolute < 10 ** -decimals)
    ) {
      return value.toExponential(2);
    }

    return value.toLocaleString("en-GB", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function rangeText(values, decimals = 2) {
    const numbers = values.filter(Number.isFinite);

    if (!numbers.length) return "Not available";

    const minimum = Math.min(...numbers);
    const maximum = Math.max(...numbers);

    return minimum === maximum
      ? format(minimum, decimals)
      : (
          `${format(minimum, decimals)} to ` +
          `${format(maximum, decimals)}`
        );
  }

  function motionBehaviour() {
    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
      ? "auto"
      : "smooth";
  }

  function clearCopyFeedback() {
    if (feedbackTimer !== null) {
      window.clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }

    $("copy-feedback").textContent = "";
  }

  function setPlanState(text, status) {
    $("plan-state").textContent = text;
    $("plan-state").dataset.state = status;

    $("floating-plan-status").textContent = text;
    $("calculate-bar").dataset.state = status;
  }

  function fieldElement(id) {
    return id === "pump-speed"
      ? $("speed-fieldset")
      : $(id);
  }

  function focusField(id) {
    const field = fieldElement(id);

    const focusTarget = id === "pump-speed"
      ? (
          document.querySelector(
            'input[name="pumpSpeed"]:checked'
          ) ??
          document.querySelector('input[name="pumpSpeed"]')
        )
      : field;

    focusTarget?.focus({ preventScroll: true });

    field?.scrollIntoView({
      behavior: motionBehaviour(),
      block: "center"
    });
  }

  function revealResults() {
    const heading = $("results-title");
    const bounds = heading.getBoundingClientRect();

    const headerBottom =
      document.querySelector(".site-header")
        ?.getBoundingClientRect().bottom ?? 0;

    const floatingHeight = $("calculate-bar").hidden
      ? 0
      : $("calculate-bar").getBoundingClientRect().height;

    const visible =
      bounds.top >= headerBottom + 12 &&
      bounds.bottom <=
        window.innerHeight - floatingHeight - 12;

    if (!visible) {
      heading.focus({ preventScroll: true });

      heading.scrollIntoView({
        behavior: motionBehaviour(),
        block: "center"
      });
    }
  }

  /* =====================================================
     VALIDATION
  ===================================================== */

  function clearValidation() {
    $("validation-message").hidden = true;
    $("validation-message").replaceChildren();

    for (const rule of FIELD_RULES) {
      $(rule.id).removeAttribute("aria-invalid");

      const error = $(`${rule.id}-error`);
      error.hidden = true;
      error.textContent = "";
    }

    $("speed-fieldset").removeAttribute("aria-invalid");
    $("pump-speed-error").hidden = true;
    $("pump-speed-error").textContent = "";
  }

  function readField(rule) {
    const input = $(rule.id);
    const text = input.value.trim();

    let value = null;
    let error = "";

    if (input.validity.badInput) {
      error = `Enter a valid number for ${rule.label}.`;
    } else if (text === "") {
      error = `Enter the ${rule.label}.`;
    } else {
      value = Number(text);

      if (!Number.isFinite(value)) {
        error = `Enter a finite number for ${rule.label}.`;
      } else if (
        rule.integer &&
        !Number.isInteger(value)
      ) {
        error = "Number of cubes must be a whole number.";
      } else if (rule.positive && value <= 0) {
        error = `${capitalise(rule.label)} must be greater than zero.`;
      } else if (rule.nonNegative && value < 0) {
        error = `${capitalise(rule.label)} cannot be negative.`;
      }
    }

    return {
      key: rule.key,
      id: rule.id,
      value,
      error
    };
  }

  function capitalise(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function readInputs() {
    const fields = FIELD_RULES.map(readField);

    const errors = fields
      .filter((field) => field.error)
      .map(({ id, error }) => ({ id, error }));

    const values = Object.fromEntries(
      fields.map((field) => [field.key, field.value])
    );

    const speedInput = document.querySelector(
      'input[name="pumpSpeed"]:checked'
    );

    const speed = speedInput
      ? Number(speedInput.value)
      : null;

    if (!META.speeds.includes(speed) || !SUMMARIES[speed]) {
      errors.push({
        id: "pump-speed",
        error: "Select a pump speed."
      });
    }

    return {
      values: { ...values, speed },
      errors
    };
  }

  function showErrors(errors) {
    const box = $("validation-message");

    const heading = document.createElement("strong");
    heading.textContent =
      "Complete these fields before calculating:";

    const list = document.createElement("ul");

    for (const item of errors) {
      const field = fieldElement(item.id);
      field?.setAttribute("aria-invalid", "true");

      const errorElement = $(`${item.id}-error`);

      if (errorElement) {
        errorElement.textContent = item.error;
        errorElement.hidden = false;
      }

      const listItem = document.createElement("li");
      const link = document.createElement("a");

      link.href = item.id === "pump-speed"
        ? "#speed-fieldset"
        : `#${item.id}`;

      link.textContent = item.error;

      link.addEventListener("click", (event) => {
        event.preventDefault();
        focusField(item.id);
      });

      listItem.append(link);
      list.append(listItem);
    }

    box.replaceChildren(heading, list);
    box.hidden = false;

    inputsDirty = true;

    $("results-panel").dataset.stale =
      String(Boolean(currentPlan));

    setPlanState("Check the highlighted inputs", "invalid");

    disablePreviousActions();
    clearCopyFeedback();

    focusField(errors[0].id);
  }

  /* =====================================================
     PENDING INPUT STATE
  ===================================================== */

  function disablePreviousActions() {
    $("copy-plan").disabled = true;

    document.querySelectorAll(
      'input[name="operatingCandidate"]'
    ).forEach((input) => {
      input.disabled = true;
    });
  }

  function markDirty() {
    inputsDirty = true;

    clearValidation();
    clearCopyFeedback();

    setPlanState(
      "Inputs changed - calculate to update",
      "dirty"
    );

    $("results-panel").dataset.stale =
      String(Boolean(currentPlan));

    disablePreviousActions();
  }

  /* =====================================================
     BATCH MATERIAL CALCULATION
  ===================================================== */

  function calculateBatch(input) {
    const totalMass = input.cubes * input.cubeMass;

    /*
     * For cement : fine : coarse = c : f : a,
     * water contributes c * water/cement ratio parts.
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

    const waterKg = cement * input.wc;

    const waterLitres =
      waterKg / META.waterDensityKgL;

    const co2Mass = cement * 1000 * input.dose / 100;

    const requiredUptake = co2Mass / waterLitres;

    return {
      totalMass,
      totalParts,
      massPerPart,
      cement,
      fine,
      coarse,
      waterKg,
      waterLitres,
      co2Mass,
      requiredUptake
    };
  }

  function batchIsValid(batch) {
    return (
      Object.values(batch).every(Number.isFinite) &&
      batch.totalMass > 0 &&
      batch.totalParts > 0 &&
      batch.massPerPart > 0 &&
      batch.cement > 0 &&
      batch.waterKg > 0 &&
      batch.waterLitres > 0 &&
      batch.fine >= 0 &&
      batch.coarse >= 0 &&
      batch.co2Mass >= 0 &&
      batch.requiredUptake >= 0
    );
  }

  /* =====================================================
     TEST-BASED OPERATING ESTIMATES
  ===================================================== */

  function estimateOperatingPoints(speed, target) {
    const points = SUMMARIES[speed];

    if (!points?.length) {
      return {
        type: "unavailable",
        candidates: [],
        points: [],
        reason: "No trial summaries are available for this speed."
      };
    }

    const minimum = Math.min(
      ...points.map((point) => point.uptake)
    );

    const maximum = Math.max(
      ...points.map((point) => point.uptake)
    );

    if (target === 0) {
      return {
        type: "zero",
        candidates: [],
        points: [],
        minimum,
        maximum
      };
    }

    /*
     * Numerical tolerance only handles floating-point noise.
     * It is not an operating or measurement tolerance.
     */
    const tolerance =
      Number.EPSILON *
      Math.max(1, Math.abs(target), Math.abs(maximum)) *
      64;

    if (
      target < minimum - tolerance ||
      target > maximum + tolerance
    ) {
      return {
        type: "outside",
        candidates: [],
        points,
        minimum,
        maximum
      };
    }

    const candidates = [];

    /*
     * Include every tested mean that matches the target.
     * Do not return early: another interval might also
     * cross that same concentration.
     */
    for (const point of points) {
      if (Math.abs(point.uptake - target) <= tolerance) {
        candidates.push({
          id: `tested-${point.flow}`,
          type: "tested",
          flow: point.flow,
          ph: point.outletPh,
          uptake: point.uptake,
          points: [point]
        });
      }
    }

    /*
     * Only adjacent flow settings are considered.
     * No sorting by uptake and no extrapolation.
     */
    for (let index = 0; index < points.length - 1; index++) {
      const lower = points[index];
      const upper = points[index + 1];

      const difference = upper.uptake - lower.uptake;

      if (Math.abs(difference) <= tolerance) {
        continue;
      }

      /*
       * Endpoints that match the target are already included
       * as tested candidates above.
       */
      if (
        Math.abs(target - lower.uptake) <= tolerance ||
        Math.abs(target - upper.uptake) <= tolerance
      ) {
        continue;
      }

      const fraction =
        (target - lower.uptake) / difference;

      if (fraction <= 0 || fraction >= 1) {
        continue;
      }

      candidates.push({
        id: `between-${lower.flow}-${upper.flow}`,
        type: "interpolated",

        flow:
          lower.flow +
          fraction * (upper.flow - lower.flow),

        ph:
          lower.outletPh +
          fraction * (upper.outletPh - lower.outletPh),

        uptake: target,
        points: [lower, upper]
      });
    }

    if (!candidates.length) {
      return {
        type: "unavailable",
        candidates: [],
        points,
        minimum,
        maximum,
        reason:
          "The supplied test means do not provide an " +
          "operating estimate for this target."
      };
    }

    /*
     * Display order follows flow setting.
     * This is not a ranking or recommendation.
     */
    candidates.sort((a, b) => a.flow - b.flow);

    return {
      type: "candidates",
      candidates,
      points,
      minimum,
      maximum
    };
  }

  /* =====================================================
     MAIN SUBMISSION
  ===================================================== */

  function submitPlan(event) {
    event.preventDefault();

    clearValidation();
    clearCopyFeedback();

    const { values, errors } = readInputs();

    if (errors.length) {
      showErrors(errors);
      return;
    }

    const batch = calculateBatch(values);

    if (!batchIsValid(batch)) {
      showErrors([
        {
          id: "cube-mass",
          error:
            "These quantities are too large or too small to " +
            "calculate reliably. Check the masses, proportions " +
            "and units."
        }
      ]);

      return;
    }

    const estimate = estimateOperatingPoints(
      values.speed,
      batch.requiredUptake
    );

    /*
     * A single estimate can be displayed directly.
     * Multiple estimates require an explicit user choice.
     */
    const selectedCandidate =
      estimate.type === "candidates" &&
      estimate.candidates.length === 1
        ? estimate.candidates[0]
        : null;

    currentPlan = {
      input: { ...values },
      batch,
      estimate,
      selectedCandidate
    };

    inputsDirty = false;

    $("results-panel").dataset.stale = "false";
    $("plan-placeholder").hidden = true;
    $("plan-results").hidden = false;

    renderMaterials();
    renderOperating();
    renderSupportingPoints();
    renderCalculations();
    renderPlanBasis();
    updateCopyAvailability();

    setPlanState("Results up to date", "current");

    revealResults();
  }

  /* =====================================================
     MATERIAL OUTPUTS
  ===================================================== */

  function renderMaterials() {
    const { input, batch } = currentPlan;

    $("total-mass-preview").textContent =
      `${format(batch.totalMass, 2)} kg`;

    $("batch-summary").textContent =
      `${input.cubes} cubes × ${format(input.cubeMass, 2)} kg ` +
      `= ${format(batch.totalMass, 2)} kg fresh materials`;

    $("cement-output").textContent =
      `${format(batch.cement, 3)} kg`;

    $("fine-output").textContent =
      `${format(batch.fine, 3)} kg`;

    $("coarse-output").textContent =
      `${format(batch.coarse, 3)} kg`;

    $("water-output").textContent =
      `${format(batch.waterLitres, 3)} L`;

    $("co2-mass-output").textContent =
      `${format(batch.co2Mass, 3)} g`;

    $("uptake-output").textContent =
      `${format(batch.requiredUptake, 4)} g/L`;
  }

  /* =====================================================
     OPERATING OUTPUTS
  ===================================================== */

  function setEstimateStatus(text, status) {
    $("estimate-status").textContent = text;
    $("estimate-status").dataset.status = status;
  }

  function renderOperating() {
    const {
      input,
      batch,
      estimate,
      selectedCandidate
    } = currentPlan;

    $("speed-output").textContent = `${input.speed} Hz`;
    $("flow-output").textContent = "Not assigned";
    $("ph-output").textContent = "Not assigned";

    $("operating-options").hidden = true;
    $("candidate-list").replaceChildren();

    $("operating-water-note").hidden = true;
    $("operating-water-note").textContent = "";

    if (estimate.type === "zero") {
      setEstimateStatus("No added CO₂ requested", "zero");

      $("flow-output").textContent = "0 L/min";

      $("operating-explanation").textContent =
        "The target dose is zero. No CO₂ addition is requested. " +
        "An untreated-water pH target is not inferred from " +
        "the carbonation trials.";

      return;
    }

    if (estimate.type === "outside") {
      setEstimateStatus("Outside tested range", "outside");

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
        "Material quantities are calculated, but no flow or pH " +
        "is extrapolated. You can select another speed and " +
        "calculate again to check its tested range.";

      return;
    }

    if (estimate.type === "unavailable") {
      setEstimateStatus("Estimate unavailable", "unavailable");

      $("operating-explanation").textContent =
        estimate.reason;

      return;
    }

    if (estimate.candidates.length > 1) {
      renderCandidateOptions();
    }

    if (!selectedCandidate) {
      setEstimateStatus("Choose an operating estimate", "multiple");

      $("operating-explanation").textContent =
        `${estimate.candidates.length} operating estimates ` +
        "correspond to this target because the mean uptake " +
        "does not increase consistently with gas setting. " +
        "Review and choose an alternative below. Display order " +
        "does not indicate which option is best.";

      return;
    }

    $("flow-output").textContent =
      `${format(selectedCandidate.flow, 2)} L/min`;

    $("ph-output").textContent =
      format(selectedCandidate.ph, 2);

    if (selectedCandidate.type === "tested") {
      setEstimateStatus("Tested setting mean", "tested");

      $("operating-explanation").textContent =
        "The required uptake matches a tested setting mean. " +
        "The displayed outlet pH is the descriptive average " +
        "of the handheld readings at that setting. " +
        "Individual trials varied.";
    } else {
      setEstimateStatus(
        "Estimated between tests",
        "interpolated"
      );

      const [lower, upper] = selectedCandidate.points;

      $("operating-explanation").textContent =
        `Flow and outlet pH are linearly interpolated between ` +
        `the ${lower.flow} and ${upper.flow} L/min test means ` +
        `at ${input.speed} Hz. This is a starting estimate, ` +
        "not a separately tested setting.";
    }

    if (estimate.candidates.length > 1) {
      $("operating-explanation").textContent +=
        " Other alternatives remain available below.";
    }

    renderWaterNote(selectedCandidate);
  }

  function renderCandidateOptions() {
    const { estimate, selectedCandidate } = currentPlan;

    $("operating-options").hidden = false;

    for (const candidate of estimate.candidates) {
      const label = document.createElement("label");
      label.className = "candidate-option";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "operatingCandidate";
      radio.value = candidate.id;
      radio.id = `candidate-${candidate.id}`;
      radio.checked =
        selectedCandidate?.id === candidate.id;
      radio.disabled = inputsDirty;

      const content = document.createElement("span");
      content.className = "candidate-content";

      const heading = document.createElement("strong");
      heading.textContent =
        `${format(candidate.flow, 2)} L/min CO₂ setting`;

      const detail = document.createElement("span");
      detail.className = "candidate-detail";
      detail.textContent =
        `Expected handheld outlet pH: ` +
        `${format(candidate.ph, 2)}.`;

      const basis = document.createElement("small");

      if (candidate.type === "tested") {
        basis.textContent =
          `Matches the ${candidate.points[0].flow} L/min ` +
          "tested setting mean.";
      } else {
        const [lower, upper] = candidate.points;

        basis.textContent =
          `Interpolated between ${lower.flow} and ` +
          `${upper.flow} L/min tested means.`;
      }

      const kind = document.createElement("span");
      kind.className = "candidate-kind";
      kind.textContent = candidate.type === "tested"
        ? "Tested mean"
        : "Between-setting estimate";

      content.append(heading, detail, basis, kind);
      label.append(radio, content);

      radio.addEventListener("change", () => {
        if (radio.checked) {
          chooseCandidate(candidate.id);
        }
      });

      $("candidate-list").append(label);
    }
  }

  function chooseCandidate(id) {
    if (!currentPlan || inputsDirty) return;

    const candidate = currentPlan.estimate.candidates.find(
      (item) => item.id === id
    );

    if (!candidate) return;

    currentPlan.selectedCandidate = candidate;

    clearCopyFeedback();

    renderOperating();
    renderSupportingPoints();
    renderPlanBasis();
    updateCopyAvailability();

    const replacement = document.getElementById(
      `candidate-${candidate.id}`
    );

    replacement?.focus({ preventScroll: true });
  }

  function renderWaterNote() {
  const note = $("operating-water-note");
  note.hidden = true;
  note.textContent = "";
}

  /* =====================================================
     SUPPORTING TRIAL DATA
  ===================================================== */

  function supportingPoints() {
    if (!currentPlan) return [];

    if (currentPlan.selectedCandidate) {
      return currentPlan.selectedCandidate.points;
    }

    if (currentPlan.estimate.type === "zero") {
      return [];
    }

    return SUMMARIES[currentPlan.input.speed];
  }

  function renderSupportingPoints() {
    const host = $("supporting-points");
    const { input, estimate, selectedCandidate } = currentPlan;

    if (estimate.type === "zero") {
      host.innerHTML = `
        <p>
          No carbonation operating estimate is assigned
          for a zero added-CO₂ target.
        </p>
      `;

      return;
    }

    const points = supportingPoints();

    if (!points.length) {
      host.innerHTML = `
        <p>No supporting test points are available.</p>
      `;

      return;
    }

    const uniqueRuns = new Map();

    for (const point of points) {
      for (const run of point.runs) {
        uniqueRuns.set(run.runId, run);
      }
    }

    const runs = [...uniqueRuns.values()];

    const rows = points.map((point) => {
      const waterText =
        `${format(point.waterKg, 2)} ` +
        `(${point.waterMassAssumed ? "assumed" : "weighed"})`;

      return `
        <tr>
          <td>${point.flow}</td>
          <td>${format(point.uptake, 4)}</td>
          <td>${format(point.outletPh, 2)}</td>
          <td>${escapeHTML(waterText)}</td>
          <td>${format(point.efficiency, 2)}</td>
          <td>${point.repeatCount}</td>
        </tr>
      `;
    }).join("");

    const caption = selectedCandidate
      ? "Test means supporting the selected operating estimate"
      : "Test means at the selected pump speed";

    const selectionNote =
      estimate.type === "candidates" && !selectedCandidate
        ? (
            "<p>Select an operating estimate above to narrow " +
            "this table to its supporting settings.</p>"
          )
        : "";

    const assumption = input.speed === 30
      ? `
        <p class="data-note" data-status="attention">
          Water mass is assumed at 8 kg for every 30 Hz trial.
          Dissolution efficiencies use that assumed volume.
          The uptake concentrations and handheld pH readings
          remain the supplied values.
        </p>
      `
      : "";

    host.innerHTML = `
      ${selectionNote}

      <div class="table-wrap">
        <table>
          <caption>${caption}</caption>

          <thead>
            <tr>
              <th scope="col">CO₂ setting (L/min)</th>
              <th scope="col">Added uptake (g/L)</th>
              <th scope="col">Outlet pH</th>
              <th scope="col">Trial water (kg)</th>
              <th scope="col">Efficiency (%)</th>
              <th scope="col">Trials</th>
            </tr>
          </thead>

          <tbody>${rows}</tbody>
        </table>
      </div>

      ${assumption}

      <p>
        Recorded handheld outlet pH across these trials:
        ${rangeText(runs.map((run) => run.outletPh), 2)}.
        This range is not a target tolerance or confidence interval.
      </p>

      <p>
        Inlet pH:
        ${rangeText(runs.map((run) => run.inletPh), 2)}.
        Inlet temperature:
        ${rangeText(runs.map((run) => run.inletTemp), 1)} °C.
        Outlet temperature:
        ${rangeText(runs.map((run) => run.outletTemp), 1)} °C.
      </p>

      <p>
        The estimate does not correct for changes in water
        chemistry, temperature, pressure or equipment configuration.
        Flowmeter settings identify test conditions.
      </p>
    `;
  }

  /* =====================================================
     VISIBLE CALCULATION STEPS
  ===================================================== */

  function renderCalculations() {
    const { input, batch } = currentPlan;

    $("calculation-steps").innerHTML = `
      <ol>
        <li>
          <strong>Total fresh-material mass:</strong>
          ${input.cubes} × ${format(input.cubeMass, 3)}
          = ${format(batch.totalMass, 3)} kg.
        </li>

        <li>
          <strong>Total mix parts, including water:</strong>
          ${format(input.cementRatio, 3)}
          + ${format(input.fineRatio, 3)}
          + ${format(input.coarseRatio, 3)}
          + (
            ${format(input.cementRatio, 3)}
            × ${format(input.wc, 3)}
          )
          = ${format(batch.totalParts, 4)}.
        </li>

        <li>
          <strong>Mass per part:</strong>
          ${format(batch.totalMass, 3)}
          ÷ ${format(batch.totalParts, 4)}
          = ${format(batch.massPerPart, 4)} kg.
        </li>

        <li>
          <strong>Cement:</strong>
          ${format(batch.massPerPart, 4)}
          × ${format(input.cementRatio, 3)}
          = ${format(batch.cement, 3)} kg.
        </li>

        <li>
          <strong>Fine aggregate:</strong>
          ${format(batch.massPerPart, 4)}
          × ${format(input.fineRatio, 3)}
          = ${format(batch.fine, 3)} kg.
        </li>

        <li>
          <strong>Coarse aggregate:</strong>
          ${format(batch.massPerPart, 4)}
          × ${format(input.coarseRatio, 3)}
          = ${format(batch.coarse, 3)} kg.
        </li>

        <li>
          <strong>Mixing water:</strong>
          ${format(batch.cement, 3)}
          × ${format(input.wc, 3)}
          = ${format(batch.waterKg, 3)} kg,
          approximately ${format(batch.waterLitres, 3)} L.
        </li>

        <li>
          <strong>Required added CO₂:</strong>
          ${format(batch.cement, 3)} kg
          × 1,000
          × ${format(input.dose, 5)}
          ÷ 100
          = ${format(batch.co2Mass, 3)} g.
        </li>

        <li>
          <strong>Required uptake in mixing water:</strong>
          ${format(batch.co2Mass, 3)} g
          ÷ ${format(batch.waterLitres, 3)} L
          = ${format(batch.requiredUptake, 4)} g/L.
        </li>
      </ol>

      <p>
        Displayed values are rounded. Calculations use
        the unrounded values internally.
      </p>
    `;
  }

  function renderPlanBasis() {
    const { input, batch, estimate, selectedCandidate } = currentPlan;

    const parts = [
      `Calculated for ${input.cubes} cubes of ` +
      `${format(input.cubeMass, 2)} kg each.`,

      `Mix by mass: ${input.cementRatio}:` +
      `${input.fineRatio}:${input.coarseRatio}.`,

      `Water/cement ratio: ${input.wc}.`,

      `Target added CO₂ dose: ${format(input.dose, 5)}%.`,

      `Selected pump speed: ${input.speed} Hz.`,

      `Required added uptake: ` +
      `${format(batch.requiredUptake, 4)} g/L.`
    ];

    if (selectedCandidate) {
      parts.push(
        selectedCandidate.type === "tested"
          ? "Operating basis: tested setting mean."
          : "Operating basis: interpolation between adjacent tested means."
      );
    } else if (estimate.type === "candidates") {
      parts.push("An operating estimate still needs to be selected.");
    } else if (estimate.type === "outside") {
      parts.push("No flow or pH estimate: target outside tested range.");
    }

    $("plan-basis").textContent = parts.join(" ");
  }

  /* =====================================================
     COPY THE CALCULATED SNAPSHOT
  ===================================================== */

  function updateCopyAvailability() {
    if (!currentPlan || inputsDirty) {
      $("copy-plan").disabled = true;
      return;
    }

    const needsChoice =
      currentPlan.estimate.type === "candidates" &&
      !currentPlan.selectedCandidate;

    $("copy-plan").disabled = needsChoice;

    if (needsChoice) {
      $("copy-feedback").textContent =
        "Choose an operating estimate before copying the plan.";
    }
  }

  function planText(plan) {
    const {
      input,
      batch,
      estimate,
      selectedCandidate
    } = plan;

    const lines = [
      "CO2 BATCH PLAN",
      "",
      `Batch: ${input.cubes} cubes × ${format(input.cubeMass, 3)} kg`,
      `Total fresh materials: ${format(batch.totalMass, 3)} kg`,
      `Mix by mass: ${input.cementRatio}:${input.fineRatio}:${input.coarseRatio}`,
      `Water/cement ratio: ${input.wc}`,
      "",
      `Cement: ${format(batch.cement, 3)} kg`,
      `Fine aggregate: ${format(batch.fine, 3)} kg`,
      `Coarse aggregate: ${format(batch.coarse, 3)} kg`,
      `Carbonated mixing water: ${format(batch.waterLitres, 3)} L`,
      "",
      `Target added CO2 dose: ${format(input.dose, 5)}% of cement mass`,
      `Required added CO2: ${format(batch.co2Mass, 3)} g`,
      `Required added uptake: ${format(batch.requiredUptake, 4)} g/L`,
      `Selected pump speed: ${input.speed} Hz`,
      ""
    ];

    if (selectedCandidate) {
      lines.push(
        `CO2 flowmeter setting: ${format(selectedCandidate.flow, 2)} L/min`,
        `Expected handheld outlet pH: ${format(selectedCandidate.ph, 2)}`,
        `Operating basis: ${
          selectedCandidate.type === "tested"
            ? "tested setting mean"
            : "interpolated between adjacent tested means"
        }`
      );

      if (selectedCandidate.type === "interpolated") {
        const [lower, upper] = selectedCandidate.points;

        lines.push(
          `Supporting settings: ${lower.flow} and ${upper.flow} L/min`
        );
      }

      if (estimate.candidates.length > 1) {
        lines.push(
          "Several operating estimates matched the target.",
          "The displayed estimate was selected by the user."
        );
      }

      if (input.speed === 30) {
        lines.push(
          "",
          "30 Hz trial water mass was assumed at 8 kg per collection.",
          "Trial dissolved masses and efficiencies depend on that assumption.",
          "The batch water quantity above comes from the entered mix design."
        );
      }

      lines.push(
        "",
        "Trial water collections do not provide a correction factor",
        "for this batch. Deliver the calculated mixing-water quantity."
      );
    } else if (estimate.type === "zero") {
      lines.push(
        "CO2 addition requested: none.",
        "CO2 flow: 0 L/min.",
        "No carbonation pH target assigned."
      );
    } else if (estimate.type === "outside") {
      lines.push(
        "Target is outside the selected speed's tested mean uptake range.",
        `Tested range: ${format(estimate.minimum, 4)} to ${format(estimate.maximum, 4)} g/L.`,
        "No flow or pH estimate assigned."
      );
    } else {
      lines.push(
        "No operating estimate assigned.",
        estimate.reason ?? ""
      );
    }

    lines.push(
      "",
      "ASSUMPTIONS",
      "All calculated mixing water is carbonated.",
      "The added CO2 concentration is retained until mixing.",
      "Water volume uses approximately 1 kg/L.",
      "No SCMs, admixtures, moisture/absorption corrections",
      "or handling losses are included.",
      "Expected pH applies to the tested water conditions.",
      "An interpolated setting is an estimate, not a separate trial.",
      "Delivered dissolved CO2 is not a measurement of mineralised CO2."
    );

    return lines.join("\n");
  }

  async function copyPlan() {
    if (
      !currentPlan ||
      inputsDirty ||
      $("copy-plan").disabled
    ) {
      return;
    }

    clearCopyFeedback();

    const planAtClick = currentPlan;
    const candidateAtClick = currentPlan.selectedCandidate?.id;
    const text = planText(planAtClick);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(text);

      if (
        currentPlan !== planAtClick ||
        inputsDirty ||
        currentPlan.selectedCandidate?.id !== candidateAtClick
      ) {
        return;
      }

      $("copy-feedback").textContent = "Batch plan copied.";

      feedbackTimer = window.setTimeout(() => {
        $("copy-feedback").textContent = "";
        feedbackTimer = null;
      }, 3500);
    } catch {
      if (
        currentPlan !== planAtClick ||
        inputsDirty ||
        currentPlan.selectedCandidate?.id !== candidateAtClick
      ) {
        return;
      }

      $("copy-feedback").textContent =
        "Clipboard access was unavailable. " +
        "You can select and copy the displayed plan manually.";
    }
  }

  /* =====================================================
     FLOATING CALCULATE BAR
  ===================================================== */

  function connectFloatingCalculator() {
    const workspace = $("planner-workspace");
    const bar = $("calculate-bar");

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          bar.hidden = !entries[0].isIntersecting;
        },
        {
          rootMargin: "-120px 0px -80px 0px",
          threshold: 0
        }
      );

      observer.observe(workspace);
      return;
    }

    const checkPosition = () => {
      const bounds = workspace.getBoundingClientRect();

      bar.hidden = !(
        bounds.bottom > 120 &&
        bounds.top < window.innerHeight - 80
      );
    };

    window.addEventListener("scroll", checkPosition, {
      passive: true
    });

    window.addEventListener("resize", checkPosition);
    checkPosition();
  }

  /* =====================================================
     EVENTS AND INITIAL STATE
  ===================================================== */

  $("planner-form").addEventListener("submit", submitPlan);

  /*
   * Input changes only mark the previous plan as outdated.
   * No material or operating calculation runs while typing.
   */
  $("planner-form").addEventListener("input", markDirty);
  $("planner-form").addEventListener("change", markDirty);

  $("planner-form").addEventListener("reset", () => {
    /*
     * Wait until the browser has restored the default inputs.
     * Resetting inputs does not calculate a new plan.
     */
    window.setTimeout(markDirty, 0);
  });

  $("copy-plan").addEventListener("click", copyPlan);

  connectFloatingCalculator();

  setPlanState("Ready to calculate", "ready");

  $("plan-placeholder").hidden = false;
  $("plan-results").hidden = true;
  $("copy-plan").disabled = true;
})();