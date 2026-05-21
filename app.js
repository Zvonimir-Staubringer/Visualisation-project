(function () {
  const dataset = window.POPULATION_DATA;
  const topology = window.CROATIA_COUNTIES_TOPOLOGY;
  const d3 = window.d3;

  if (!dataset || !topology || !d3) {
    throw new Error("Podaci ili D3 nisu učitani.");
  }

  const metricMeta = {
    population: {
      label: "Stanovništvo",
      valueLabel: "stanovnika",
      years: dataset.years.population,
      palette: ["#f4ebc7", "#eeb562", "#d1604d", "#8c1c13"],
      formatter: (value) => formatNumber(value),
    },
    naturalChange: {
      label: "Prirodna kretanja",
      valueLabel: "prirodni prirast",
      years: dataset.years.naturalChange,
      palette: ["#a63d40", "#f6f1e9", "#1f7a8c"],
      formatter: (value) => formatSignedNumber(value),
    },
    migrationBalance: {
      label: "Saldo migracije",
      valueLabel: "saldo migracije",
      years: dataset.years.migrationBalance,
      palette: ["#8d3b72", "#f8f3ef", "#0b8f8c"],
      formatter: (value) => formatSignedNumber(value),
    },
  };

  const topoIdToCountyId = {
    BB: "bjelovarsko-bilogorska",
    SP: "brodsko-posavska",
    DN: "dubrovacko-neretvanska",
    GZ: "grad-zagreb",
    IS: "istarska",
    KA: "karlovacka",
    KK: "koprivnicko-krizevacka",
    KZ: "krapinsko-zagorska",
    LS: "licko-senjska",
    ME: "medimurska",
    OB: "osjecko-baranjska",
    PS: "pozesko-slavonska",
    PG: "primorsko-goranska",
    SM: "sisacko-moslavacka",
    SD: "splitsko-dalmatinska",
    VA: "varazdinska",
    VP: "viroviticko-podravska",
    VS: "vukovarsko-srijemska",
    ZD: "zadarska",
    ZG: "zagrebacka",
    SB: "sibensko-kninska",
  };

  const ageColors = {
    children: "#d1604d",
    youth: "#f4a261",
    middleAge: "#2a9d8f",
    elderly: "#355070",
  };

  const comparisonColors = d3.scaleOrdinal(
    ["#126e82", "#d1604d", "#7b5ea7", "#2c6e49", "#b56576"]
  );

  const mapFeatures = topologyToFeatureCollection(topology, "croatia").features;
  const featureByCountyId = new Map(
    mapFeatures
      .map((feature) => [topoIdToCountyId[feature.properties.id], feature])
      .filter(([countyId]) => Boolean(countyId))
  );

  const counties = dataset.counties
    .map((county) => ({
      ...county,
      feature: featureByCountyId.get(county.id),
      shortCode: findShortCode(county.id),
    }))
    .filter((county) => county.feature);

  const countyById = new Map(counties.map((county) => [county.id, county]));
  const croatiaFeatureCollection = {
    type: "FeatureCollection",
    features: counties.map((county) => county.feature),
  };

  const mapBounds = { width: 1060, height: 940 };
  const projection = d3
    .geoMercator()
    .fitExtent(
      [
        [36, 30],
        [mapBounds.width - 36, mapBounds.height - 30],
      ],
      croatiaFeatureCollection
    );
  const geoPath = d3.geoPath(projection);

  const state = {
    metric: "population",
    year: metricMeta.population.years.at(-1),
    sortMode: "value-desc",
    selectedIds: [],
    focusId: null,
    isPlaying: false,
    timer: null,
  };

  const elements = {
    yearValue: document.getElementById("yearValue"),
    yearRange: document.getElementById("yearRange"),
    sortSelect: document.getElementById("sortSelect"),
    playPauseButton: document.getElementById("playPauseButton"),
    resetSelectionButton: document.getElementById("resetSelectionButton"),
    legendLabel: document.getElementById("legendLabel"),
    toolbarNote: document.getElementById("toolbarNote"),
    selectedCounties: document.getElementById("selectedCounties"),
    selectionCount: document.getElementById("selectionCount"),
    detailsPanel: document.getElementById("detailsPanel"),
    detailsTitle: document.getElementById("detailsTitle"),
    detailsSubtitle: document.getElementById("detailsSubtitle"),
    pieChartNote: document.getElementById("pieChartNote"),
    pieLegend: document.getElementById("pieLegend"),
    summaryCards: document.getElementById("summaryCards"),
    heroBadges: document.getElementById("heroBadges"),
    tooltip: document.getElementById("tooltip"),
  };

  const svg = {
    map: d3.select("#mapSvg"),
    legend: d3.select("#legendSvg"),
    line: d3.select("#lineChartSvg"),
    pie: d3.select("#pieChartSvg"),
    bar: d3.select("#barChartSvg"),
  };

  const mapRoot = svg.map.append("g");
  const mapBackdrop = mapRoot.append("g").attr("class", "map-backdrop");
  const countiesLayer = mapRoot.append("g").attr("class", "counties-layer");
  const labelsLayer = mapRoot.append("g").attr("class", "labels-layer");

  const lineRoot = svg.line.append("g").attr("transform", "translate(70, 30)");
  const pieRoot = svg.pie.append("g").attr("transform", "translate(165, 164)");
  const barRoot = svg.bar.append("g").attr("transform", "translate(160, 40)");

  document.querySelectorAll(".metric-tab").forEach((button) => {
    button.addEventListener("click", () => {
      setMetric(button.dataset.metric);
    });
  });

  elements.yearRange.addEventListener("input", (event) => {
    state.year = Number(event.target.value);
    stopAnimation();
    render();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.sortMode = event.target.value;
    renderBarChart();
  });

  elements.playPauseButton.addEventListener("click", () => {
    if (state.isPlaying) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });

  elements.resetSelectionButton.addEventListener("click", () => {
    state.selectedIds = [];
    state.focusId = null;
    render();
  });

  render();

  function render() {
    syncControls();
    renderHeroBadges();
    renderLegend();
    renderMap();
    renderSelectionChips();
    renderDetails();
    renderLineChart();
    renderPieChart();
    renderBarChart();
  }

  function syncControls() {
    const years = metricMeta[state.metric].years;
    if (!years.includes(state.year)) {
      state.year = years.at(-1);
    }

    document.querySelectorAll(".metric-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.metric === state.metric);
    });

    elements.yearRange.min = String(years[0]);
    elements.yearRange.max = String(years.at(-1));
    elements.yearRange.value = String(state.year);
    elements.yearValue.textContent = String(state.year);
    elements.selectionCount.textContent = `${state.selectedIds.length} / 3`;
    elements.legendLabel.textContent = `${metricMeta[state.metric].label} u ${state.year}.`;
    elements.playPauseButton.textContent = state.isPlaying ? "Zaustavi animaciju" : "Pokreni animaciju";
  }

  function renderHeroBadges() {
    const currentCounties = counties.filter((county) => getMetricValue(county, state.metric, state.year) !== null);
    const activeMetricValues = currentCounties.map((county) => getMetricValue(county, state.metric, state.year));
    const topCounty = d3.greatest(currentCounties, (county) => getMetricValue(county, state.metric, state.year));
    const totalPopulation = d3.sum(
      counties,
      (county) => getMetricValue(county, "population", metricMeta.population.years.at(-1)) || 0
    );

    const badgeData = [
      {
        value: `${counties.length}`,
        label: "županija u povezanom prikazu",
      },
      {
        value: formatNumber(totalPopulation),
        label: `procijenjeno stanovništvo u ${metricMeta.population.years.at(-1)}.`,
      },
      {
        value: topCounty ? topCounty.name : "—",
        label: `najviša vrijednost za ${metricMeta[state.metric].label.toLowerCase()} u ${state.year}.`,
      },
      {
        value: formatCompact(d3.extent(activeMetricValues)),
        label: "raspon trenutne metrike na karti",
      },
    ];

    const badges = d3
      .select(elements.heroBadges)
      .selectAll(".hero-badge")
      .data(badgeData, (d) => d.label);

    const badgeEnter = badges
      .enter()
      .append("div")
      .attr("class", "hero-badge");

    badgeEnter.append("strong");
    badgeEnter.append("span");

    badges.merge(badgeEnter).select("strong").text((d) => d.value);
    badges.merge(badgeEnter).select("span").text((d) => d.label);
    badges.exit().remove();
  }

  function renderLegend() {
    const legendWidth = 320;
    const legendHeight = 16;
    const legendX = 40;
    const legendY = 18;
    const values = counties
      .map((county) => getMetricValue(county, state.metric, state.year))
      .filter((value) => value !== null);

    const [minValue, maxValue] = d3.extent(values);
    const colorScale = buildColorScale(values);

    svg.legend.selectAll("*").remove();

    const defs = svg.legend.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "legendGradient")
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    d3.range(0, 1.01, 0.1).forEach((stop) => {
      const value = minValue + (maxValue - minValue || 1) * stop;
      gradient
        .append("stop")
        .attr("offset", `${stop * 100}%`)
        .attr("stop-color", colorScale(value));
    });

    svg.legend
      .append("rect")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("rx", 8)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", "url(#legendGradient)");

    const tickData =
      state.metric === "population"
        ? [minValue, (minValue + maxValue) / 2, maxValue]
        : [minValue, 0, maxValue];

    svg.legend
      .append("g")
      .attr("transform", `translate(${legendX}, ${legendY + legendHeight + 18})`)
      .selectAll("text")
      .data(tickData)
      .join("text")
      .attr("class", "legend-tick")
      .attr("x", (_, index) => (index === 0 ? 0 : index === 1 ? legendWidth / 2 : legendWidth))
      .attr("text-anchor", (_, index) => (index === 0 ? "start" : index === 1 ? "middle" : "end"))
      .text((d) => metricMeta[state.metric].formatter(Math.round(d)));
  }

  function renderMap() {
    renderMapBackdrop();

    const values = counties
      .map((county) => getMetricValue(county, state.metric, state.year))
      .filter((value) => value !== null);
    const colorScale = buildColorScale(values);

    const countyGroups = countiesLayer.selectAll(".county-group").data(counties, (county) => county.id);

    const countyEnter = countyGroups
      .enter()
      .append("g")
      .attr("class", "county-group")
      .on("mouseenter", function (event, county) {
        d3.select(this).classed("is-hovered", true);
        showTooltip(event, county);
      })
      .on("mousemove", function (event, county) {
        showTooltip(event, county);
      })
      .on("mouseleave", function () {
        d3.select(this).classed("is-hovered", false);
        hideTooltip();
      })
      .on("click", function (_, county) {
        toggleCountySelection(county.id);
      });

    countyEnter.append("path").attr("class", "county-shape");

    const countyMerge = countyGroups.merge(countyEnter);

    countyMerge
      .classed("is-selected", (county) => state.selectedIds.includes(county.id))
      .classed("is-focus", (county) => county.id === state.focusId);

    countyMerge
      .select(".county-shape")
      .attr("d", (county) => geoPath(county.feature))
      .transition()
      .duration(650)
      .ease(d3.easeCubicOut)
      .attr("fill", (county) => colorScale(getMetricValue(county, state.metric, state.year)));

    countyGroups.exit().remove();

    const labelData = counties.map((county) => {
      const [x, y] = geoPath.centroid(county.feature);
      return {
        county,
        x,
        y,
      };
    });

    const labels = labelsLayer.selectAll(".county-label-group").data(labelData, (d) => d.county.id);
    const labelsEnter = labels.enter().append("g").attr("class", "county-label-group");
    labelsEnter.append("text").attr("class", "county-label");
    labelsEnter.append("text").attr("class", "county-value");

    labels
      .merge(labelsEnter)
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
      .select(".county-label")
      .text((d) => d.county.shortCode)
      .attr("y", -4);

    labels
      .merge(labelsEnter)
      .select(".county-value")
      .text((d) => formatTileValue(getMetricValue(d.county, state.metric, state.year)))
      .attr("y", 16);

    labels.exit().remove();

    elements.toolbarNote.textContent =
      state.selectedIds.length > 1
        ? `Usporedba aktivna za ${state.selectedIds.length} županije.`
        : "Klik na županiju otvara detalje ispod karte.";
  }

  function renderMapBackdrop() {
    const backdropData = [croatiaFeatureCollection];
    const backdrop = mapBackdrop.selectAll(".map-country").data(backdropData);

    backdrop
      .join("path")
      .attr("class", "map-country")
      .attr("d", geoPath)
      .attr("fill", "rgba(255,255,255,0.38)")
      .attr("stroke", "rgba(36, 51, 48, 0.12)")
      .attr("stroke-width", 1.5);
  }

  function renderSelectionChips() {
    const chipData = state.selectedIds.map((id) => countyById.get(id)).filter(Boolean);
    const container = d3.select(elements.selectedCounties);

    container.selectAll(".selected-chip.empty").remove();

    const chips = container.selectAll(".selected-chip.real").data(chipData, (county) => county.id);
    const chipsEnter = chips.enter().append("div").attr("class", "selected-chip real");
    chipsEnter.append("span");
    chipsEnter
      .append("button")
      .attr("type", "button")
      .attr("aria-label", "Makni županiju iz usporedbe")
      .text("×")
      .on("click", (_, county) => removeSelection(county.id));

    chips.merge(chipsEnter).select("span").text((county) => county.name);
    chips.exit().remove();

    if (chipData.length === 0) {
      container
        .append("div")
        .attr("class", "selected-chip empty")
        .text("Nijedna županija još nije odabrana.");
    }
  }

  function renderDetails() {
    const activeCounty = getActiveCounty();
    const hasSelection = state.selectedIds.length > 0;
    elements.detailsPanel.classList.toggle("is-hidden", !hasSelection);

    if (!activeCounty) {
      return;
    }

    elements.detailsTitle.textContent =
      state.selectedIds.length > 1
        ? `${activeCounty.name} je fokus, a grafovi uspoređuju ${state.selectedIds.length} županije`
        : `${activeCounty.name} u fokusu`;

    elements.detailsSubtitle.textContent = `${metricMeta[state.metric].label} za ${state.year}. uz povezani pregled stanovništva, dobnih skupina i rangiranja županija.`;

    const summaryData = [
      {
        label: "Stanovništvo",
        value: metricMeta.population.formatter(
          getMetricValue(activeCounty, "population", clampYear("population", state.year))
        ),
      },
      {
        label: "Prirodna kretanja",
        value: metricMeta.naturalChange.formatter(
          getMetricValue(activeCounty, "naturalChange", clampYear("naturalChange", state.year))
        ),
      },
      {
        label: "Saldo migracije",
        value: metricMeta.migrationBalance.formatter(
          getMetricValue(activeCounty, "migrationBalance", clampYear("migrationBalance", state.year))
        ),
      },
    ];

    const cards = d3.select(elements.summaryCards).selectAll(".summary-card").data(summaryData, (d) => d.label);
    const cardsEnter = cards.enter().append("div").attr("class", "summary-card");
    cardsEnter.append("span");
    cardsEnter.append("strong");

    cards.merge(cardsEnter).select("span").text((d) => d.label);
    cards.merge(cardsEnter).select("strong").text((d) => d.value);
    cards.exit().remove();
  }

  function renderLineChart() {
    lineRoot.selectAll("*").remove();

    if (state.selectedIds.length === 0) {
      drawEmptyState(lineRoot, 300, 160, "Linijski graf čeka odabir županije.");
      return;
    }

    const selectedCounties = state.selectedIds.map((id) => countyById.get(id)).filter(Boolean);
    const years = metricMeta.population.years;
    const series = selectedCounties.map((county) => ({
      county,
      values: years.map((year) => ({
        year,
        value: getMetricValue(county, "population", year),
      })),
    }));

    const width = 640;
    const height = 300;
    const allValues = series.flatMap((entry) => entry.values.map((value) => value.value));

    const x = d3.scaleLinear().domain(d3.extent(years)).range([0, width]);
    const y = d3.scaleLinear().domain(d3.extent(allValues)).nice().range([height, 0]);
    const line = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    lineRoot
      .append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(() => ""))
      .call((group) => group.select(".domain").remove());

    lineRoot
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8));

    lineRoot
      .append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).ticks(5).tickFormat((value) => formatShortNumber(value)));

    const seriesGroup = lineRoot.append("g");

    seriesGroup
      .selectAll(".line-path")
      .data(series, (d) => d.county.id)
      .join("path")
      .attr("class", "line-path")
      .attr("stroke", (d) => comparisonColors(d.county.id))
      .attr("d", (d) => line(d.values))
      .attr("stroke-dasharray", function () {
        return this.getTotalLength();
      })
      .attr("stroke-dashoffset", function () {
        return this.getTotalLength();
      })
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    const currentLineYear = clampYear("population", state.year);
    seriesGroup
      .selectAll(".line-point")
      .data(
        series.map((entry) => ({
          county: entry.county,
          year: currentLineYear,
          value: getMetricValue(entry.county, "population", currentLineYear),
        })),
        (d) => d.county.id
      )
      .join("circle")
      .attr("class", "line-point")
      .attr("fill", (d) => comparisonColors(d.county.id))
      .attr("r", 0)
      .attr("cx", (d) => x(d.year))
      .attr("cy", (d) => y(d.value))
      .transition()
      .duration(650)
      .attr("r", 6);

    seriesGroup
      .selectAll(".line-end-label")
      .data(series, (d) => d.county.id)
      .join("text")
      .attr("class", "line-end-label")
      .attr("fill", (d) => comparisonColors(d.county.id))
      .attr("x", width + 8)
      .attr("y", (d) => y(d.values.at(-1).value) + 4)
      .text((d) => d.county.name);
  }

  function renderPieChart() {
    pieRoot.selectAll("*").remove();
    const activeCounty = getActiveCounty();

    if (!activeCounty) {
      drawEmptyState(pieRoot, 0, 0, "Pie chart čeka fokusnu županiju.");
      d3.select(elements.pieLegend).selectAll("*").remove();
      return;
    }

    const ageYear = state.year >= dataset.years.ageComposition[0] ? clampYear("ageComposition", state.year) : null;
    if (!ageYear) {
      drawEmptyState(pieRoot, 0, 0, "Dobna struktura dostupna je od 2012.");
      elements.pieChartNote.textContent = "Za godine prije 2012. u tablici ne postoje dobne skupine po županijama.";
      d3.select(elements.pieLegend).selectAll("*").remove();
      return;
    }

    elements.pieChartNote.textContent = `Prikaz dobnih skupina za ${activeCounty.name} u ${ageYear}.`;

    const ageComposition = activeCounty.ageComposition[String(ageYear)];
    const pieData = Object.entries(ageComposition).map(([key, value]) => ({
      key,
      label: dataset.ageBuckets[key],
      value,
      color: ageColors[key],
    }));

    const radius = 112;
    const pie = d3.pie().sort(null).value((d) => d.value);
    const arc = d3.arc().innerRadius(46).outerRadius(radius);
    pieRoot
      .selectAll(".pie-slice")
      .data(pie(pieData), (d) => d.data.key)
      .join("path")
      .attr("class", "pie-slice")
      .attr("fill", (d) => d.data.color)
      .each(function (d) {
        this._current = d;
      })
      .on("mouseenter", function () {
        d3.select(this).classed("is-hovered", true);
      })
      .on("mouseleave", function () {
        d3.select(this).classed("is-hovered", false);
      })
      .transition()
      .duration(700)
      .attrTween("d", function (d) {
        const interpolate = d3.interpolate(this._current || d, d);
        this._current = interpolate(1);
        return function (t) {
          const current = interpolate(t);
          return arc(current);
        };
      });

    const total = d3.sum(pieData, (d) => d.value);
    pieRoot
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", -4)
      .attr("font-size", 15)
      .attr("font-weight", 700)
      .text(ageYear);

    pieRoot
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 18)
      .attr("fill", "#6a7873")
      .attr("font-size", 13)
      .text(formatNumber(total));

    const legendItems = d3.select(elements.pieLegend).selectAll(".pie-legend-item").data(pieData, (d) => d.key);
    const legendEnter = legendItems.enter().append("div").attr("class", "pie-legend-item");
    legendEnter.append("span").attr("class", "swatch");
    legendEnter.append("div");

    legendItems.merge(legendEnter).select(".swatch").style("background", (d) => d.color);
    legendItems
      .merge(legendEnter)
      .select("div")
      .html((d) => `<strong>${d.label}</strong><br>${formatPercent(d.value / total)}`);
    legendItems.exit().remove();
  }

  function renderBarChart() {
    barRoot.selectAll("*").remove();

    const values = counties
      .map((county) => ({
        county,
        value: getMetricValue(county, state.metric, state.year),
      }))
      .filter((entry) => entry.value !== null);

    const sortedValues = [...values].sort((left, right) => sortEntries(left, right, state.sortMode));
    const width = 560;
    const height = 600;
    const y = d3
      .scaleBand()
      .domain(sortedValues.map((entry) => entry.county.id))
      .range([0, height])
      .padding(0.22);

    const minValue = d3.min(sortedValues, (entry) => entry.value);
    const maxValue = d3.max(sortedValues, (entry) => entry.value);
    const x = d3
      .scaleLinear()
      .domain([Math.min(0, minValue), Math.max(0, maxValue)])
      .nice()
      .range([0, width]);

    const colorScale = buildColorScale(sortedValues.map((entry) => entry.value));

    barRoot
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(-height).tickFormat(() => ""))
      .call((group) => group.select(".domain").remove());

    barRoot.append("g").attr("class", "axis").call(d3.axisLeft(y).tickFormat((id) => countyById.get(id).name));

    barRoot
      .append("g")
      .attr("class", "axis")
      .call(d3.axisTop(x).ticks(6).tickFormat((value) => formatShortNumber(value)));

    barRoot
      .append("line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "rgba(36, 51, 48, 0.2)");

    barRoot
      .selectAll(".bar")
      .data(sortedValues, (d) => d.county.id)
      .join("rect")
      .attr("class", (d) => `bar${state.selectedIds.includes(d.county.id) ? " is-selected" : ""}`)
      .attr("x", x(0))
      .attr("y", (d) => y(d.county.id))
      .attr("width", 0)
      .attr("height", y.bandwidth())
      .attr("rx", 9)
      .attr("fill", (d) => colorScale(d.value))
      .on("mouseenter", (event, d) => showTooltip(event, d.county))
      .on("mousemove", (event, d) => showTooltip(event, d.county))
      .on("mouseleave", hideTooltip)
      .on("click", (_, d) => toggleCountySelection(d.county.id))
      .transition()
      .duration(700)
      .ease(d3.easeCubicOut)
      .attr("x", (d) => Math.min(x(0), x(d.value)))
      .attr("width", (d) => Math.abs(x(d.value) - x(0)));

    barRoot
      .selectAll(".bar-value")
      .data(sortedValues, (d) => d.county.id)
      .join("text")
      .attr("class", "bar-value")
      .attr("x", (d) => (d.value >= 0 ? x(d.value) + 6 : x(d.value) - 6))
      .attr("text-anchor", (d) => (d.value >= 0 ? "start" : "end"))
      .attr("y", (d) => y(d.county.id) + y.bandwidth() / 2 + 4)
      .text((d) => metricMeta[state.metric].formatter(d.value));
  }

  function setMetric(metricKey) {
    state.metric = metricKey;
    state.year = clampYear(metricKey, state.year);
    stopAnimation();
    render();
  }

  function clampYear(metricKey, year) {
    const years = dataset.years[metricKey];
    const numericYear = Number(year);
    if (years.includes(numericYear)) {
      return numericYear;
    }
    if (numericYear < years[0]) {
      return years[0];
    }
    return years.at(-1);
  }

  function toggleCountySelection(countyId) {
    const alreadySelected = state.selectedIds.includes(countyId);

    if (alreadySelected) {
      state.selectedIds = state.selectedIds.filter((id) => id !== countyId);
      state.focusId = state.focusId === countyId ? state.selectedIds.at(-1) || null : state.focusId;
    } else {
      state.selectedIds = [...state.selectedIds, countyId].slice(-3);
      state.focusId = countyId;
    }

    render();
  }

  function removeSelection(countyId) {
    state.selectedIds = state.selectedIds.filter((id) => id !== countyId);
    if (state.focusId === countyId) {
      state.focusId = state.selectedIds.at(-1) || null;
    }
    render();
  }

  function getActiveCounty() {
    const focusId = state.focusId || state.selectedIds.at(-1);
    return focusId ? countyById.get(focusId) : null;
  }

  function getMetricValue(county, metricKey, year) {
    const series = county.metrics?.[metricKey];
    if (series) {
      return Object.prototype.hasOwnProperty.call(series, String(year)) ? series[String(year)] : null;
    }
    if (metricKey === "ageComposition") {
      return county.ageComposition[String(year)] || null;
    }
    return null;
  }

  function buildColorScale(values) {
    if (state.metric === "population") {
      const [minValue, maxValue] = d3.extent(values);
      return d3
        .scaleSequential()
        .domain([minValue, maxValue === minValue ? minValue + 1 : maxValue])
        .interpolator(d3.interpolateRgbBasis(metricMeta.population.palette));
    }

    const maxAbs = d3.max(values, (value) => Math.abs(value)) || 1;
    return d3
      .scaleDiverging()
      .domain([-maxAbs, 0, maxAbs])
      .interpolator(d3.interpolateRgbBasis(metricMeta[state.metric].palette));
  }

  function showTooltip(event, county) {
    const value = getMetricValue(county, state.metric, state.year);
    elements.tooltip.innerHTML = `<strong>${county.name}</strong>${metricMeta[state.metric].label}: ${metricMeta[state.metric].formatter(value)}<br>Godina: ${state.year}`;
    elements.tooltip.style.left = `${event.clientX}px`;
    elements.tooltip.style.top = `${event.clientY - 12}px`;
    elements.tooltip.style.opacity = "1";
  }

  function hideTooltip() {
    elements.tooltip.style.opacity = "0";
  }

  function drawEmptyState(selection, x, y, label) {
    selection
      .append("text")
      .attr("class", "empty-chart-text")
      .attr("text-anchor", "middle")
      .attr("x", x)
      .attr("y", y)
      .text(label);
  }

  function sortEntries(left, right, mode) {
    if (mode === "name-asc") {
      return d3.ascending(left.county.name, right.county.name);
    }
    if (mode === "value-asc") {
      return d3.ascending(left.value, right.value);
    }
    return d3.descending(left.value, right.value);
  }

  function startAnimation() {
    const years = metricMeta[state.metric].years;
    stopAnimation();
    state.isPlaying = true;
    elements.playPauseButton.textContent = "Zaustavi animaciju";

    state.timer = window.setInterval(() => {
      const currentIndex = years.indexOf(state.year);
      state.year = years[(currentIndex + 1) % years.length];
      render();
    }, 1400);
  }

  function stopAnimation() {
    state.isPlaying = false;
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    elements.playPauseButton.textContent = "Pokreni animaciju";
  }

  function formatNumber(value) {
    if (value === null || value === undefined) return "—";
    return new Intl.NumberFormat("hr-HR").format(value);
  }

  function formatSignedNumber(value) {
    if (value === null || value === undefined) return "—";
    return new Intl.NumberFormat("hr-HR", { signDisplay: "always" }).format(value);
  }

  function formatShortNumber(value) {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)} M`;
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)} k`;
    }
    return String(value);
  }

  function formatTileValue(value) {
    if (value === null || value === undefined) return "—";
    if (state.metric === "population") {
      return formatShortNumber(value);
    }
    return value > 0 ? `+${formatShortNumber(value)}` : formatShortNumber(value);
  }

  function formatPercent(value) {
    return new Intl.NumberFormat("hr-HR", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  function formatCompact(extent) {
    if (!extent || extent[0] == null || extent[1] == null) {
      return "—";
    }
    return `${metricMeta[state.metric].formatter(Math.round(extent[0]))} do ${metricMeta[state.metric].formatter(Math.round(extent[1]))}`;
  }

  function findShortCode(countyId) {
    const match = Object.entries(topoIdToCountyId).find(([, value]) => value === countyId);
    return match ? match[0] : countyId.slice(0, 2).toUpperCase();
  }

  function topologyToFeatureCollection(sourceTopology, objectName) {
    const object = sourceTopology.objects[objectName];
    return {
      type: "FeatureCollection",
      features: object.geometries.map((geometry) => ({
        type: "Feature",
        properties: geometry.properties || {},
        geometry: {
          type: geometry.type,
          coordinates: geometryToCoordinates(sourceTopology, geometry),
        },
      })),
    };
  }

  function geometryToCoordinates(sourceTopology, geometry) {
    if (geometry.type === "Polygon") {
      return geometry.arcs.map((ring) => ringCoordinates(sourceTopology, ring));
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.arcs.map((polygon) =>
        polygon.map((ring) => ringCoordinates(sourceTopology, ring))
      );
    }
    throw new Error(`Nepodržan tip geometrije: ${geometry.type}`);
  }

  function ringCoordinates(sourceTopology, ringArcs) {
    const coordinates = [];
    ringArcs.forEach((arcIndex, index) => {
      const points = arcCoordinates(sourceTopology, arcIndex);
      coordinates.push(...(index === 0 ? points : points.slice(1)));
    });
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      coordinates.push([...first]);
    }
    return coordinates;
  }

  function arcCoordinates(sourceTopology, arcIndex) {
    const arc = sourceTopology.arcs[arcIndex < 0 ? ~arcIndex : arcIndex];
    let x = 0;
    let y = 0;
    const points = arc.map((point) => {
      x += point[0];
      y += point[1];
      return [
        x * sourceTopology.transform.scale[0] + sourceTopology.transform.translate[0],
        y * sourceTopology.transform.scale[1] + sourceTopology.transform.translate[1],
      ];
    });
    return arcIndex < 0 ? points.reverse() : points;
  }
})();
