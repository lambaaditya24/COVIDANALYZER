let original_data = []; // don't change this; original copy of the data
let working_data = [];
let map_data = [];
let arr_county_names;
let counties_total_pos;
let color_scale;
let selected_counties = [];
let faded_color = "#C2C9CE";
let zoom;

// global for hotspot
var hotspot_svg;
var hotspot_margin;
var gauge_values;
var k = 3;
var num_cases = "4357"; //number of cases over time period
var temp_percent = "46%"; //rate of cases in time period
var relevancy = 0.3; //
var size = 390; //height of svg container for scaling, width is size*0.6
var width_size = 635;//size * 0.7; //width is automatically 650
var hotspot_counties = []; //array of ["county", pos (0 to k-1), value]
var counties_nmf;
var dates_nmf;
var county_list = [];
var set_dates = new Set();
var case_sums = [];
var hotspot_clicked = -1;

// extension global variables
var innerwidth;
var innerheight;
var dates = new Set();
var vaccine_data = [];
var counties = new Set();
var attribute;
var div;
var covid_events = [];

document.getElementById("hotspot-select").addEventListener("input", (event) => {
    updateHotspots();
});

// Called when HMTL loads page
document.addEventListener("DOMContentLoaded", async () => {
    [original_data, map_data] = await Promise.all([
        d3.csv("data/new_york_covid_data.csv"),
        d3.json("data/ny-geojson.json")
    ]);

    original_data = original_data.map((d) => ({
        Date: new Date(d["Date"]),
        County: d["County"],
        "Deaths by County of Residence": +d["Deaths by County of Residence"],
        "New Positives": +d["New Positives"],
        "Patients Currently Hospitalized": +d["Patients Currently Hospitalized"],
        "Patients Newly Admitted": +d["Patients Newly Admitted"],
        "Place of Fatality": +d["Place of Fatality"],
    }));

    // Copy of original data
    working_data = [...original_data];

    // Creating a div for the tooltip that is
    // on top of the existing "body" layer (the top-most layer above svg.)
    // Ref: https://bl.ocks.org/d3noob/97e51c5be17291f79a27705cef827da2
    map_tooltip = d3
        .select("#div-map-view")
        .append("div")
        .attr("class", "map_tooltip")
        .style("opacity", 0);

    // Get the predefined svg element
    map_svg = d3.select("#svg_map");
    map_view_zoom_pan();

    // hotspot chart
    hotspot_svg = d3.select("#svg_hotspot"); //select from HTML
	//console.log("height: ", document.getElementById("div-hotspot").offsetHeight , "width: ",document.getElementById("div-hotspot").offsetWidth);
	hotspot_margin = { top: 150, bottom: 50, left: 150, right: 70 }; //for visibility of chart

    // extension chart
    extension_svg = d3.select("#svg_extension"); //select.html

    const width = +extension_svg.style("width").replace("px", "");
    const height = +extension_svg.style("height").replace("px", "");
    extension_margin = { top: 20, bottom: 40, left: 30, right: 40 }; //for visibility of chart
    innerwidth = width - extension_margin.left - extension_margin.right;
    innerheight = height - extension_margin.top - extension_margin.bottom;

    //tooltip
    div = d3
        .select("#div-extension")
        .append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("text-align", "center")
        .style("width", "150px")
        .style("height", "120px")
        .style("padding", "2px")
        .style("font", "14px")
        .style("background", "white")
        .style("border", "2px solid black")
        .style("border-radius", "5px");

    drawRadialView();
    drawTimeFilterView();
    drawTypeFilterView();
    updateHotspots();
    drawCumulativeTemporalMonth();
    drawCumulativeTemporalDay();
    drawGlobalTemporal();
    updateExtensionChart();
    drawRankingMonth();
});

// Determines a county's total covid count over timeframe
function total_covid_count(countyname) {
    let total_counts = 0;
    let new_pos = 0;
    let place_of_fatality = 0;
    let deaths_by_county_residence = 0;
    let patients_hospitalized = 0;
    let patients_newly_admitted = 0;

    for (let i = 0; i < original_data.length; i++) {
        let current_county = original_data[i]["County"];
        // console.log("Current County:", current_county, "Passed County:", countyname);

        if (current_county == countyname) {
            if (!isNaN(original_data[i]["New Positives"])) {
                total_counts = total_counts + original_data[i]["New Positives"];
                new_pos = new_pos + original_data[i]["New Positives"];
            }

            if (!isNaN(original_data[i]["Place of Fatality"])) {
                total_counts = total_counts + original_data[i]["Place of Fatality"];
                place_of_fatality = place_of_fatality + original_data[i]["Place of Fatality"];
            }

            if (!isNaN(original_data[i]["Deaths by County of Residence"])) {
                total_counts = total_counts + original_data[i]["Deaths by County of Residence"];
                deaths_by_county_residence =
                    deaths_by_county_residence + original_data[i]["Deaths by County of Residence"];
            }

            if (!isNaN(original_data[i]["Patients Currently Hospitalized"])) {
                total_counts = total_counts + original_data[i]["Patients Currently Hospitalized"];
                patients_hospitalized =
                    patients_hospitalized + original_data[i]["Patients Currently Hospitalized"];
            }

            if (!isNaN(original_data[i]["Patients Newly Admitted"])) {
                total_counts = total_counts + original_data[i]["Patients Newly Admitted"];
                patients_newly_admitted =
                    patients_newly_admitted + original_data[i]["Patients Newly Admitted"];
            }
        }
    }

    let covid_types = {
        County: countyname,
        "Total Covid Counts": total_counts,
        "Place of Fatality": place_of_fatality,
        "Deaths by County of Residence": deaths_by_county_residence,
        "Patients Currently Hospitalized": patients_hospitalized,
        "Patients Newly Admitted": patients_newly_admitted,
    };

    return covid_types;
}

// Compares the total counts for all counties and returns the max
function find_max_covid_count(counties_total_pos) {
    let max_count = d3.max(counties_total_pos, (d) => d["Total Covid Counts"]);
    console.log("Max Cases: ", max_count);
    return max_count;
}

// Calculate the total covid counts in each county
function calc_counties_total_counts() {
    let counties_total_counts = [];

    // Find all unique county names in the dataset
    // Source: https://stackoverflow.com/questions/15125920/how-to-get-distinct-values-from-an-array-of-objects-in-javascript
    arr_county_names = [...new Set(original_data.map((item) => item["County"]))];

    console.log("List of counties: ", arr_county_names);
    console.log("Count: ", arr_county_names.length);

    for (let i = 0; i < arr_county_names.length; i++) {
        let current_county = arr_county_names[i];
        let counts_arr = total_covid_count(current_county);
        counties_total_counts.push(counts_arr);
    }

    return counties_total_counts;
}

function map_view_reset() {
    map_view_zoom_pan();
    working_data = [...original_data];
    update();
}

// Map View (default view): Zoom/Pan
// Implementation resources: https://bl.ocks.org/d3noob/e549dc220052ac8214b9db6ce47d2a61
//                          https://github.com/asu-cse494-f2022/lectures/blob/main/06%20-%20Maps%20and%20Layouts/maps.html
function map_view_zoom_pan() {
    console.log("hit");
    // Clear selected counties array
    selected_counties.length = 0;

    // Clear the chart for redrawing
    map_svg.selectAll("g").remove();

    // Min and max
    counties_total_pos = calc_counties_total_counts(); // Returns arry of counties + positive counts
    let max_pos_count = find_max_covid_count(counties_total_pos); // Returns 1 number

    // Chloropleth color scale
    // Resource: https://observablehq.com/@d3/working-with-color
    //           https://github.com/d3/d3-scale-chromatic/blob/main/README.md
    color_scale = d3
        .scaleSequential(d3.interpolateRgbBasis(["white", "#FFEFB7", "#FFAA63", "#763318"]))
        .domain([0, max_pos_count]);

    const margin = { top: 0, bottom: 0, right: 0, left: 0 };
    const width = +map_svg.style("width").replace("px", "");
    const height = +map_svg.style("height").replace("px", "");
    const inner_width = width - margin.left - margin.right;
    const inner_height = height - margin.top - margin.bottom;

    // Append g element onto svg
    const g = map_svg.append("g").attr("transform", "translate(" + "0" + "," + "0" + ")");

    // --------------------------------------------------------------------------------------------------------------- //
    // --------------------------------------------------- MAP ------------------------------------------------------- //
    // --------------------------------------------------------------------------------------------------------------- //

    // Map projection
    let projection = d3
        .geoMercator()
        .scale(350)
        .center(d3.geoCentroid(map_data))
        .fitSize([inner_width - 50, inner_height - 50], map_data)
        .translate([inner_width / 2, inner_height / 2]);

    // Geopath - path from GeoJSON file
    const geoPath = d3.geoPath().projection(projection);

    // Add path shapes to the g element on the svg
    map_chart = g
        .selectAll(".county_shapes")
        .data(map_data.features)
        .join((enter) => {
            enter
                .append("path")
                .classed("county_shapes", true)
                .attr("id", function (d) {
                    return "county_" + d.properties.county;
                }) // each county has an associated number
                .attr("vector-effect", "non-scaling-stroke")
                .attr("stroke", "black")
                .attr("fill", (d) => {
                    // Get the country's total positive case number
                    county_count_tuple = counties_total_pos.filter(
                        (b) => b.County == d.properties.name
                    );
                    let total_pos = county_count_tuple[0]["Total Covid Counts"];
                    if (isNaN(total_pos)) return "white";
                    return color_scale(total_pos);
                })
                .attr("d", geoPath)

                .on("mouseover", function (d, i) {
                    d3.select(this).transition().duration(50);

                    let selected_county = i.properties.name;

                    // Highlighting the county if selected
                    d3.select(this)
                        .transition()
                        .duration("50")
                        .attr("stroke-width", "3")
                        .attr("stroke", "black");

                    // Make the tooltip appear
                    map_tooltip.transition().duration(200).style("opacity", 1);

                    // Find county info in the array of county counts
                    let county_info = counties_total_pos.find(
                        (b) => b["County"] === selected_county
                    );
                    let county_pos_count = county_info["Total Covid Counts"];

                    // Update the tooltip text
                    tooltip_text =
                        selected_county +
                        " County" +
                        "<br/>" +
                        "Total Covid Counts: " +
                        county_pos_count.toLocaleString('en-US');
                    // + "Total Covid Counts: " + county_pos_count + "<br/>"
                    // + "Place of Fatality: " + county_info["Place of Fatality"] + "<br/>"
                    // + "Deaths by County of Residence: " + county_info["Deaths by County of Residence"] + "<br/>"
                    // + "Patients Currently Hospitalized: " + county_info["Patients Currently Hospitalized"] + "<br/>"
                    // + "Patients Newly Admitted: " + county_info["Patients Newly Admitted"];

                    map_tooltip
                        .html(tooltip_text)
                        .style("left", event.pageX + 15 + "px")
                        .style("top", event.pageY - 50 + "px");
                })

                .on("mousemove", function (d, i) {
                    d3.select(this).transition().duration(50);

                    // Highlighting the county if selected
                    d3.select(this)
                        .transition()
                        .duration("50")
                        .attr("stroke-width", "3")
                        .attr("stroke", "black");

                    let selected_county = i.properties.name;

                    // Find county info in the array of county counts
                    let county_info = counties_total_pos.find(
                        (b) => b["County"] === selected_county
                    );
                    let county_pos_count = county_info["Total Covid Counts"];

                    tooltip_text =
                        selected_county +
                        " County" +
                        "<br/>" +
                        "Total Covid Counts: " +
                        county_pos_count.toLocaleString('en-US');
                    // + "Total Covid Counts: " + county_pos_count + "<br/>"
                    // + "Place of Fatality: " + county_info["Place of Fatality"] + "<br/>"
                    // + "Deaths by County of Residence: " + county_info["Deaths by County of Residence"] + "<br/>"
                    // + "Patients Currently Hospitalized: " + county_info["Patients Currently Hospitalized"] + "<br/>"
                    // + "Patients Newly Admitted: " + county_info["Patients Newly Admitted"];

                    map_tooltip
                        .html(tooltip_text)
                        .style("left", event.pageX + 15 + "px")
                        .style("top", event.pageY - 50 + "px");
                })

                .on("mouseout", function (d, i) {
                    d3.select(this).transition().duration(50);

                    d3.select(this)
                        .transition()
                        .duration("50")
                        .attr("stroke-width", function (d) {
                            if (
                                selected_counties.length > 0 &&
                                i.properties.name != selected_counties[0]
                            )
                                return 1;
                            else if (selected_counties.length == 0) return 1;
                            else return 4;
                        })
                        .attr("stroke", function (d) {
                            if (
                                selected_counties.length > 0 &&
                                i.properties.name != selected_counties[0]
                            )
                                return faded_color;
                            else return "black";
                        });

                    // Make the tooltip disappear
                    map_tooltip.transition().duration(50).style("opacity", 0);
                })

                .on("click", function (event, d) {
                    console.log("Selected County: ", d.properties.name);
                    console.log(event);
                    console.log(d);

                    let selected_county = d.properties.name;

                    // Set everything on the map to a lower opacity, then set the
                    // currently selected county to regular opactiy.
                    d3.selectAll(".county_shapes")
                        .attr("fill-opacity", 0.1)
                        .attr("stroke", faded_color)
                        .attr("stroke-width", 1);

                    let county_id = d.properties.county;
                    let county_path_id = "#county_" + county_id;

                    // Find the path with the county's id
                    let county_map_path = d3.select(county_path_id);

                    // Emphasize the county selection
                    county_map_path
                        .attr("fill-opacity", 1)
                        .attr("stroke", "black")
                        .attr("stroke-width", "4");

                    // Clear selected counties arr before pushing new county to it
                    selected_counties.length = 0;
                    selected_counties.push(selected_county);

                    console.log("Selected Counties: ", selected_counties);

                    var new_working_data = [];
                    //for(var i = 0; i < working_data.length; i++)
                    for(var i = 0; i < original_data.length; i++)
                    {
                        //console.log(working_data);
                        for(var j = 0; j < selected_counties.length; j++)
                        {
                            //console.log("hi");
                            //if(working_data[i].Date.getTime() === selected_times[j].getTime())
                            if(original_data[i].County === selected_counties[j])
                            {
                                //console.log("global changed");
                                //new_working_data.push(working_data[i]);
                                new_working_data.push(original_data[i]);
                            }
                        }
                    }

                    console.log(new_working_data);
                    working_data = [...new_working_data];
                    console.log(working_data);

                    update();
                });
        });

    // Creating zooming + panning features
    zoom = d3
        .zoom()
        .scaleExtent([0.6, 10])
        .on("zoom", function (event) {
            map_svg.selectAll(".county_shapes").attr("transform", event.transform);
        });
    map_svg.call(zoom);

    // Snap zoom back to default zoom scale and transform
    // https://github.com/d3/d3-zoom#zoom_transform
    map_svg.call(zoom.transform, d3.zoomIdentity);

    // --------------------------------------------------------------------------------------------------------------- //
    // ---------------------------------------------------- LEGEND --------------------------------------------------- //
    // --------------------------------------------------------------------------------------------------------------- //
    // Based on resource: https://observablehq.com/@tmcw/d3-scalesequential-continuous-color-legend-example

    let axis_tick_width = 10;

    let axis_scale = d3
        .scaleLinear()
        .domain(color_scale.domain())
        // This changes the height of the legend
        .range([200, 0]);

    axisRight = (g) =>
        g
            .attr("class", "y-axis")
            .attr("height", 45)
            .attr("stroke-width", "1.5px")
            .attr("transform", `translate(${width - 65}, ${height - 380})`)
            .call(
                d3
                    .axisRight(axis_scale)
                    .ticks(width / 100)
                    // Length of tick mark (+ or - changes direction of tick marks)
                    .tickSize(axis_tick_width)
            );

    let defs;
    map_svg.select("defs").remove();
    defs = map_svg.append("defs");

    // Resource: https://www.visualcinnamon.com/2016/05/smooth-color-legend-d3-svg-gradient/
    let linear_gradient = defs.append("linearGradient").attr("id", "linear-gradient");

    linear_gradient
        .selectAll("stop")
        .data(
            color_scale
                .ticks()
                .map((t, i, n) => ({ offset: `${(100 * i) / n.length}%`, color: color_scale(t) }))
        )
        .enter()
        .append("stop")
        .attr("offset", (d) => d.offset)
        .attr("stop-color", (d) => d.color);

    map_svg
        .append("g")
        .attr("transform", `translate(${width - 77}, ${height - 180})`)
        .append("rect")
        .attr("transform", "translate(" + "0" + "," + "0" + ")")
        .attr("width", 200)
        .attr("height", 12)
        .attr("transform", "rotate(-90)")
        .style("fill", "url(#linear-gradient)");

    map_svg.append("g").call(axisRight);

    // Axis label
    map_svg
        .append("g")
        .attr("transform", `translate(${width - 80}, 110)`)
        .append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .text("Number of COVID Activities")
        .style("font-size", "13px");
}

// Map View: Brush (select multiple counties with a polygon/rectangle)
// Implementation resources: https://bl.ocks.org/d3noob/e549dc220052ac8214b9db6ce47d2a61
//                           https://github.com/asu-cse494-f2022/lectures/blob/main/06%20-%20Maps%20and%20Layouts/maps.html
function map_view_brush() {
    // Clear selected counties array
    selected_counties.length = 0;

    // Clear the map for redrawing
    map_svg.selectAll("g").remove();

    // Remove the zoom feature
    map_svg.on(".zoom", null);

    // Min and max
    counties_total_pos = calc_counties_total_counts(); // Returns arry of counties + positive counts
    let max_pos_count = find_max_covid_count(counties_total_pos); // Returns 1 number

    // Chloropleth color scale
    // Resource: https://observablehq.com/@d3/working-with-color
    //           https://github.com/d3/d3-scale-chromatic/blob/main/README.md
    color_scale = d3
        .scaleSequential(d3.interpolateRgbBasis(["white", "#FFEFB7", "#FFAA63", "#763318"]))
        .domain([0, max_pos_count]);

    const margin = { top: 0, bottom: 0, right: 0, left: 0 };
    const width = +map_svg.style("width").replace("px", "");
    const height = +map_svg.style("height").replace("px", "");
    const inner_width = width - margin.left - margin.right;
    const inner_height = height - margin.top - margin.bottom;

    // Append g element onto svg
    const g = map_svg.append("g").attr("transform", "translate(" + "0" + "," + "0" + ")");

    // --------------------------------------------------------------------------------------------------------------- //
    // --------------------------------------------------- MAP ------------------------------------------------------- //
    // --------------------------------------------------------------------------------------------------------------- //
    // Map projection
    let projection = d3
        .geoMercator()
        .scale(350)
        .center(d3.geoCentroid(map_data))
        .fitSize([inner_width - 50, inner_height - 50], map_data)
        .translate([inner_width / 2, inner_height / 2]);

    // Geopath - path from GeoJSON file
    const geoPath = d3.geoPath().projection(projection);

    // Add path shapes to the g element on the svg
    map_chart = g
        .selectAll(".county_shapes")
        .data(map_data.features)
        .join((enter) => {
            enter
                .append("path")
                .classed("county_shapes", true)
                // https://stackoverflow.com/questions/23833956/d3-how-to-add-id-from-geojson-to-path
                .attr("id", function (d) {
                    return "county_" + d.properties.county;
                }) // each county has an associated number
                .attr("vector-effect", "non-scaling-stroke")
                .attr("stroke", "black")
                .attr("fill", (d) => {
                    // Get the country's total positive case number
                    county_count_tuple = counties_total_pos.filter(
                        (b) => b.County == d.properties.name
                    );
                    let total_pos = county_count_tuple[0]["Total Covid Counts"];
                    if (isNaN(total_pos)) return "white";
                    return color_scale(total_pos);
                })
                .attr("d", geoPath)

                .on("mouseover", function (d, i) {
                    d3.select(this).transition().duration(50);

                    let selected_county = i.properties.name;

                    // Highlighting the county if selected
                    d3.select(this)
                        .transition()
                        .duration("50")
                        .attr("stroke-width", "3")
                        .attr("stroke", "black");

                    // Make the tooltip appear
                    map_tooltip.transition().duration(200).style("opacity", 1);

                    // Find county info in the array of county counts
                    let county_info = counties_total_pos.find(
                        (b) => b["County"] === selected_county
                    );
                    let county_pos_count = county_info["Total Covid Counts"];

                    // Update the tooltip text
                    tooltip_text =
                        selected_county +
                        " County" +
                        "<br/>" +
                        "Total Covid Counts: " +
                        county_pos_count;
                    // + "Total Covid Counts: " + county_pos_count + "<br/>"
                    // + "Place of Fatality: " + county_info["Place of Fatality"] + "<br/>"
                    // + "Deaths by County of Residence: " + county_info["Deaths by County of Residence"] + "<br/>"
                    // + "Patients Currently Hospitalized: " + county_info["Patients Currently Hospitalized"] + "<br/>"
                    // + "Patients Newly Admitted: " + county_info["Patients Newly Admitted"];

                    map_tooltip
                        .html(tooltip_text)
                        .style("left", event.pageX + 15 + "px")
                        .style("top", event.pageY - 50 + "px");
                })

                .on("mousemove", function (d, i) {
                    d3.select(this).transition().duration(50);

                    //Highlighting the county if selected
                    d3.select(this)
                        .transition()
                        .duration("50")
                        .attr("stroke-width", "3")
                        .attr("stroke", "black");

                    let selected_county = i.properties.name;

                    // Find county info in the array of county counts
                    let county_info = counties_total_pos.find(
                        (b) => b["County"] === selected_county
                    );
                    let county_pos_count = county_info["Total Covid Counts"];

                    tooltip_text =
                        selected_county +
                        " County" +
                        "<br/>" +
                        "Total Covid Counts: " +
                        county_pos_count;
                    // + "Total Covid Counts: " + county_pos_count + "<br/>"
                    // + "Place of Fatality: " + county_info["Place of Fatality"] + "<br/>"
                    // + "Deaths by County of Residence: " + county_info["Deaths by County of Residence"] + "<br/>"
                    // + "Patients Currently Hospitalized: " + county_info["Patients Currently Hospitalized"] + "<br/>"
                    // + "Patients Newly Admitted: " + county_info["Patients Newly Admitted"];

                    map_tooltip
                        .html(tooltip_text)
                        .style("left", event.pageX + 15 + "px")
                        .style("top", event.pageY - 50 + "px");
                })

                .on("mouseout", function (d, i) {
                    d3.select(this).transition().duration(50);

                    // Highlighting the county if selected
                    d3.select(this)
                        .transition()
                        .duration("50")
                        .attr("stroke-width", "1")
                        .attr("stroke", "black");

                    // Make the tooltip disappear
                    map_tooltip.transition().duration(50).style("opacity", 0);
                });
        });

    // --------------------------------------------------------------------------------------------------------------- //
    // ---------------------------------------------------- LEGEND --------------------------------------------------- //
    // --------------------------------------------------------------------------------------------------------------- //
    // Based on resource: https://observablehq.com/@tmcw/d3-scalesequential-continuous-color-legend-example

    let axis_tick_width = 10;

    let axis_scale = d3
        .scaleLinear()
        .domain(color_scale.domain())
        // This changes the height of the legend
        .range([200, 0]);

    axisRight = (g) =>
        g
            .attr("class", "y-axis")
            .attr("height", 45)
            .attr("stroke-width", "1.5px")
            .attr("transform", `translate(${width - 65}, ${height - 380})`)
            .call(
                d3
                    .axisRight(axis_scale)
                    .ticks(width / 100)
                    // Length of tick mark (+ or - changes direction of tick marks)
                    .tickSize(axis_tick_width)
            );

    let defs;
    map_svg.select("defs").remove();
    defs = map_svg.append("defs");

    // Resource: https://www.visualcinnamon.com/2016/05/smooth-color-legend-d3-svg-gradient/
    let linear_gradient = defs.append("linearGradient").attr("id", "linear-gradient");

    linear_gradient
        .selectAll("stop")
        .data(
            color_scale
                .ticks()
                .map((t, i, n) => ({ offset: `${(100 * i) / n.length}%`, color: color_scale(t) }))
        )
        .enter()
        .append("stop")
        .attr("offset", (d) => d.offset)
        .attr("stop-color", (d) => d.color);

    map_svg
        .append("g")
        .attr("transform", `translate(${width - 77}, ${height - 180})`)
        .append("rect")
        .attr("transform", "translate(" + "0" + "," + "0" + ")")
        .attr("width", 200)
        .attr("height", 12)
        .attr("transform", "rotate(-90)")
        .style("fill", "url(#linear-gradient)");

    map_svg.append("g").call(axisRight);

    // Axis label
    map_svg
        .append("g")
        .attr("transform", `translate(${width - 80}, 110)`)
        .append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .text("Number of COVID Activities")
        .style("font-size", "13px");

    // --------------------------------------------------------------------------------------------------------------- //
    // -------------------------------------------- BRUSHING FOR SELECTION ------------------------------------------- //
    // --------------------------------------------------------------------------------------------------------------- //
    // Resource: https://observablehq.com/@naughton/d3-zoom-pan-brush
    // http://bl.ocks.org/peterk87/8441728
    // https://bl.ocks.org/cmgiven/abca90f6ba5f0a14c54d1eb952f8949c

    map_svg
        .append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("pointer-events", "all")
        .style("fill", "none");

    var brush = d3
        .brush()
        .extent([
            [0, 0],
            [width, height],
        ])
        //.on("start brush end", function (e) {
            .on("end", function (e) {
            // When brushing occurs, the brush event obj is returned as an "e"
            var selection = e.selection;
            console.log("Brush Selection: ", selection);

            var x0 = selection[0][0];
            var y0 = selection[0][1];
            var x1 = selection[1][0];
            var y1 = selection[1][1];

            console.log("SELECTED RECT", "[", x0, ",", x1, "] [", y0, ",", y1, "]");

            brush_selected_counties(x0, y0, x1, y1);
        });

    map_svg.append("g").attr("class", "brush").call(brush);
}

// Determines which counties were selected in the brushed rectangle and returns an array of them.
// Input: Brush extent coordinates (top left corner, bottom right corner)
function brush_selected_counties(x0, y0, x1, y1) {
    // Reset the map so none are selected (less opacity)
    d3.selectAll(".county_shapes").attr("fill-opacity", 0.1).attr("stroke", faded_color);

    // Clear selected counties array
    selected_counties.length = 0;

    const margin = { top: 0, bottom: 0, right: 0, left: 0 };
    const width = +map_svg.style("width").replace("px", "");
    const height = +map_svg.style("height").replace("px", "");
    const inner_width = width - margin.left - margin.right;
    const inner_height = height - margin.top - margin.bottom;

    // Map projection
    let projection = d3
        .geoMercator()
        .scale(350)
        .center(d3.geoCentroid(map_data))
        .fitSize([inner_width - 50, inner_height - 50], map_data)
        .translate([inner_width / 2, inner_height / 2]);

    const geoPath = d3.geoPath().projection(projection);

    // Check each county
    for (let i = 0; i < arr_county_names.length; i++) {
        let current_county = arr_county_names[i];

        let current_map_county_data;

        for (let j = 0; j < map_data.features.length; j++) {
            current_map_county_data = map_data.features[j];
            if (current_map_county_data.properties.name == current_county) break;
        }
        // console.log("County", current_map_county_data)
        // console.log("County Properties: ", current_map_county_data.properties)
        // console.log("County Id: ", current_map_county_data.properties.county)

        let county_id = current_map_county_data.properties.county;

        // Calculates rectangle around the county
        let county_boundingbox = geoPath.bounds(current_map_county_data);

        let cx0 = county_boundingbox[0][0];
        let cy0 = county_boundingbox[0][1];
        let cx1 = county_boundingbox[1][0];
        let cy1 = county_boundingbox[1][1];

        // County bounding box is inside the brush extent, so highlight it and add to the selected county array
        if (
            cx0 >= x0 &&
            cx0 <= x1 &&
            cx1 <= x1 &&
            cx1 >= x0 &&
            cy0 >= y0 &&
            cy0 <= y1 &&
            cy1 <= y1 &&
            cy1 >= y0
        ) {
            console.log("Found county's map data", current_map_county_data);

            // Check brush rect and county bounding box values
            console.log("Selected Brush Rect", "[", x0, ",", x1, "] [", y0, ",", y1, "]");
            console.log( "((" + current_county + "))", "County Bounding Box", "[", cx0, ",", cy0, "] [", cx1, ",", cy1, "]");

            let county_path_id = "#county_" + county_id;
            console.log("County Path Id", county_path_id);

            // Find the path with the county's id
            let county_map_path = d3.select(county_path_id);

            console.log("Selected County Map Path", county_map_path);

            // Emphasize the county selection
            county_map_path.attr("fill-opacity", 1).attr("stroke", "black");

            selected_counties.push(current_county);

            console.log(".");
        }
    }

    // Doesn't actually do anything right now.
    // For handling weird bug where Suffolk and Westchester counties
    // are not all the way filled in when selected by the brush.
    if (selected_counties.includes("Suffolk")) {
        let suffolk_path_id = "#county_103";
        console.log("County Path Id", suffolk_path_id);

        // Find the path with the county's id
        let suffolk_map_path = d3.select(suffolk_path_id);
        suffolk_map_path.attr("opacity", 1);
    }

    console.log("Selected counties", selected_counties);
    console.log("............... BRUSH CHECK END ....................");


    var new_working_data = [];
    //for(var i = 0; i < working_data.length; i++)
    for(var i = 0; i < original_data.length; i++)
    {
        //console.log(working_data);
        for(var j = 0; j < selected_counties.length; j++)
        {
            //console.log("hi");
            //if(working_data[i].Date.getTime() === selected_times[j].getTime())
            if(original_data[i].County === selected_counties[j])
            {
                //console.log("global changed");
                //new_working_data.push(working_data[i]);
                new_working_data.push(original_data[i]);
            }
        }
    }

    console.log(new_working_data);
    working_data = [...new_working_data];
    console.log(working_data);

    update();
}



function updateMapView(working_dataset) {

    // Reset map view
    map_view_zoom_pan();

    // Get the specific county from working_data
    if (working_dataset.length > 0) {

        // Find hotspot counties (not handling multiple hotspots at a time)
        // let hotspot_county_names = [...new Set(working_dataset.map((item) => item["County"]))];
        // console.log("Hotspot Counties: ", hotspot_county_names);

        // Clear selected counties array
        selected_counties.length = 0;

        // Set everything on the map to a lower opacity, then set the
        // currently selected county to regular opactiy.
        d3.selectAll(".county_shapes")
            .attr("fill-opacity", 0.1)
            .attr("stroke", faded_color)
            .attr("stroke-width", 1);

        // Highlight hotspot county
        let hotspot_county = working_dataset[0]["County"];
        console.log("Hotspot County: ", hotspot_county);

        let current_map_county_data;

        for (let j = 0; j < map_data.features.length; j++) {
            current_map_county_data = map_data.features[j];
            if (current_map_county_data.properties.name == hotspot_county) break;
        }

        let county_id = current_map_county_data.properties.county;

        let county_path_id = "#county_" + county_id;
        console.log("County Path Id", county_path_id);

        // Find the path with the county's id
        let county_map_path = d3.select(county_path_id);

        console.log("Selected County Map Path", county_map_path);

        // Emphasize the county selection
        county_map_path.attr("fill-opacity", 1)
            .attr("stroke", "black")
            .attr("stroke-width", "3");

        selected_counties.push(hotspot_county);

    }
}





// -----------------------------------------------------------------------------
// RANKING VIEW ----------------------------------------------------------------
// -----------------------------------------------------------------------------
function drawRankingMonth() {
    var div = d3.select("#div-ranking-type-view");
    var width = +div.style("width").replace("px", "");
    var height = +div.style("height").replace("px", "");

    var svg = d3.select("#svg_ranking").attr("width", width).attr("height", height);

	d3.selectAll("#svg_ranking > *").remove();

    var margin = { top: 20, bottom: 25, right: 20, left: 150 };
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    var unique_dates = [];
    const unique_dates_set = new Set();
    for (const entry of working_data) {
        const dateString = entry.Date.toDateString();
        if (!unique_dates_set.has(dateString)) {
            unique_dates.push(entry.Date)
        }
        unique_dates_set.add(dateString);
    }

    unique_dates.sort((a, b) => a.getTime() - b.getTime());

    var domainTime = d3.extent(unique_dates);

    // SUM new positives across every county for each date
    // Some dates are missing, and some dates are missing new positives data

    var total_sum = [];
    var data_positives = [];
    var data_deaths = [];
    var data_hospitalized = [];
    var data_admitted = [];
    var data_fatality = [];

    for (date of unique_dates) {
        let sum_positives = 0;
        let sum_deaths = 0;
        let sum_hospitalized = 0;
        let sum_admitted = 0;
        let sum_fatality = 0;

        // sum of each group
        working_data.forEach((x) => {
            if (x["Date"].getTime() === date.getTime()) {
                if (x["New Positives"] >= 0) {
                    sum_positives = sum_positives + x["New Positives"];
                }

                if (x["Deaths by County of Residence"] >= 0) {
                    sum_deaths = sum_deaths + x["Deaths by County of Residence"];
                }

                if (x["Patients Currently Hospitalized"] >= 0) {
                    sum_hospitalized = sum_hospitalized + x["Patients Currently Hospitalized"];
                }

                if (x["Patients Newly Admitted"] >= 0) {
                    sum_admitted = sum_admitted + x["Patients Newly Admitted"];
                }

                if (x["Place of Fatality"] >= 0) {
                    sum_fatality = sum_fatality + x["Place of Fatality"];
                }
            }
        });

        let total = sum_positives + sum_deaths + sum_hospitalized + sum_admitted + sum_fatality;
        total_sum.push({ Date: date, Value: total });

        data_positives.push({
            Date: date,
            Value: sum_positives,
            Percentage: total ? sum_positives / total : 0
        });
        data_deaths.push({
            Date: date,
            Value: sum_deaths,
            Percentage: total ? sum_deaths / total : 0
        });
        data_hospitalized.push({
            Date: date,
            Value: sum_hospitalized,
            Percentage: total ? sum_hospitalized / total : 0
        });
        data_admitted.push({
            Date: date,
            Value: sum_admitted,
            Percentage: total ? sum_admitted / total : 0
        });
        data_fatality.push({
            Date: date,
            Value: sum_fatality,
            Percentage: total ? sum_fatality / total : 0
        });
    }

    var color = d3.scaleOrdinal(d3.schemePastel1);

    const xScale = d3.scaleTime().domain(domainTime).range([0, innerWidth]);

    const yScale = d3.scaleLinear().domain([0.0, 1.0]).range([innerHeight, 0]);

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    const yAxis = d3.axisLeft(yScale);
    g.append("g").call(yAxis).style("fill", "white").selectAll("text").style("fill", "white");

    const xAxis = d3.axisBottom(xScale);
    g.append("g").call(xAxis).attr("transform", `translate(0,${innerHeight})`);


    let text_x = -innerHeight * 4 + 210

    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "start")
        .attr("y", "13px")
        .attr("x", text_x)
        .attr("text-anchor", "end")
        .style("stroke", color(1))
        .style("font-size", "10px")
        .text("New Positives");

    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "start")
        .attr("y", "22px")
        .attr("x", text_x)
        .attr("text-anchor", "end")
        .style("stroke", color(2))
        .style("font-size", "10px")
        .text("Deaths by County Residence");

    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "start")
        .attr("y", "32px")
        .attr("x", text_x)
        .attr("text-anchor", "end")
        .style("stroke", color(3))
        .style("font-size", "10px")
        .text("Currently Hospitalized");

    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "start")
        .attr("y", "42px")
        .attr("x", text_x)
        .attr("text-anchor", "end")
        .style("stroke", color(4))
        .style("font-size", "10px")
        .text("Newly Admitted");

    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "start")
        .attr("y", "52px")
        .attr("x", text_x)
        .attr("text-anchor", "end")
        .style("stroke", color(5))
        .style("font-size", "10px")
        .text("Place of Fatality");

    // Not shown in the original paper
    // g.append("text")
    //     .attr("class", "axis-label")
    //     .attr("text-anchor", "middle")
    //     .attr("x", innerWidth / 2)
    //     .attr("y", innerHeight + 30)
    //     .style("font-size", "10px")
    //     .text("Date");

    const singleLine = d3
        .line()
        .x((d) => xScale(d.Date))
        .y((d) => yScale(d.Percentage))
        .curve(d3.curveMonotoneX);

    const line_positives = g
        .append("path")
        .datum(data_positives)
        .attr("class", "line_positives")
        .style("fill", "none")
        .style("stroke", color(1))
        .style("stroke-width", function (d) {
            return d.Value + 3;
        })
        .attr("d", singleLine);

    const line_deaths = g
        .append("path")
        .datum(data_deaths)
        .attr("class", "line_deaths")
        .style("fill", "none")
        .style("stroke", color(2))
        .style("stroke-width", function (d) {
            return d.Value + 3;
        })
        .attr("d", singleLine);

    const line_hospitalized = g
        .append("path")
        .datum(data_hospitalized)
        .attr("class", "line_hospitalized")
        .style("fill", "none")
        .style("stroke", color(3))
        .style("stroke-width", function (d) {
            return d.Value + 3;
        })
        .attr("d", singleLine);

    const line_admitted = g
        .append("path")
        .datum(data_admitted)
        .attr("class", "line_admitted")
        .style("fill", "none")
        .style("stroke", color(4))
        .style("stroke-width", function (d) {
            return d.Value + 3;
        })
        .attr("d", singleLine);

    const line_fatality = g
        .append("path")
        .datum(data_fatality)
        .attr("class", "line_fatality")
        .style("fill", "none")
        .style("stroke", color(5))
        .style("stroke-width", function (d) {
            return d.Value + 3;
        })
        .attr("d", singleLine);
}

// -----------------------------------------------------------------------------
// TEMPORALS -------------------------------------------------------------------
// -----------------------------------------------------------------------------
function drawCumulativeTemporalMonth() {
    //clear
    //svg.select("g").remove();
    d3.selectAll("#svg_cumulative_temporal_month > *").remove();

    var svg = d3.select("#svg_cumulative_temporal_month");
    var width = +svg.style("width").replace("px", "");
    var height = +svg.style("height").replace("px", "");

    var margin = { top: 20, bottom: 40, right: 20, left: 80 };
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    //SUM new positives for each month
    var month_data = [
        { month: "Jan", value_working: 0, value_original: 0 },
        { month: "Feb", value_working: 0, value_original: 0 },
        { month: "Mar", value_working: 0, value_original: 0 },
        { month: "Apr", value_working: 0, value_original: 0 },
        { month: "May", value_working: 0, value_original: 0 },
        { month: "Jun", value_working: 0, value_original: 0 },
        { month: "Jul", value_working: 0, value_original: 0 },
        { month: "Aug", value_working: 0, value_original: 0 },
        { month: "Sep", value_working: 0, value_original: 0 },
        { month: "Oct", value_working: 0, value_original: 0 },
        { month: "Nov", value_working: 0, value_original: 0 },
        { month: "Dec", value_working: 0, value_original: 0 }
    ];

    for (entry of original_data) {
        //0 = Jan up until 11 = Dec
        const current_month = entry.Date.getMonth();
        if (entry["New Positives"] >= 0) {
            month_data[current_month].value_original = month_data[current_month].value_original + entry["New Positives"];
        }
        if (entry["Deaths by County of Residence"] >= 0) {
            month_data[current_month].value_original =
                month_data[current_month].value_original + entry["Deaths by County of Residence"];
        }
        if (entry["Patients Currently Hospitalized"] >= 0) {
            month_data[current_month].value_original =
                month_data[current_month].value_original + entry["Patients Currently Hospitalized"];
        }
        if (entry["Patients Newly Admitted"] >= 0) {
            month_data[current_month].value_original =
                month_data[current_month].value_original + entry["Patients Newly Admitted"];
        }
        if (entry["Place of Fatality"] >= 0) {
            month_data[current_month].value_original = month_data[current_month].value_original + entry["Place of Fatality"];
        }
    }

    for (entry of working_data) {
        //0 = Jan up until 11 = Dec
        const current_month = entry.Date.getMonth();
        if (entry["New Positives"] >= 0) {
            month_data[current_month].value_working = month_data[current_month].value_working + entry["New Positives"];
        }
        if (entry["Deaths by County of Residence"] >= 0) {
            month_data[current_month].value_working =
                month_data[current_month].value_working + entry["Deaths by County of Residence"];
        }
        if (entry["Patients Currently Hospitalized"] >= 0) {
            month_data[current_month].value_working =
                month_data[current_month].value_working + entry["Patients Currently Hospitalized"];
        }
        if (entry["Patients Newly Admitted"] >= 0) {
            month_data[current_month].value_working =
                month_data[current_month].value_working + entry["Patients Newly Admitted"];
        }
        if (entry["Place of Fatality"] >= 0) {
            month_data[current_month].value_working = month_data[current_month].value_working + entry["Place of Fatality"];
        }
    }

    console.log(month_data);

    //if no filtered data to stack on bar, show only original, else showed stacked original and working
    //if(original_data.length != working_data.length)
    //above if statement was used to test if stacked bar chart working with same dataset
    if(original_data.length === working_data.length) {
        console.log("Stacked Barchart: Original Data = Working Data");

        var labels = Object.keys(month_data[0]);
        console.log(labels);

        var subgroups = labels.slice(1, 3);
        console.log(subgroups);

        var groups = d3.map(month_data, function(d){ return(d.month); })
        console.log(groups);

        const xScale = d3
            .scaleBand()
            .domain(groups)
            .range([0, innerWidth])
            .padding(0.1);

        const yScale = d3
            .scaleLinear()
            .domain([
                0,
                d3.max(month_data, function (d) {
                    return d["value_original"];
                }),
            ])
            .range([innerHeight, 0]);

        const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        const yAxis = d3.axisLeft(yScale);
        g.append("g").call(yAxis);

        const xAxis = d3.axisBottom(xScale);
        g.append("g").call(xAxis).attr("transform", `translate(0,${innerHeight})`)
            .selectAll("text")
            .attr('transform', 'rotate(-45)')
            .attr("dx", "-17px")
            .attr("dy", "3px");


        /*
        g.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("y", "-60px")
            .attr("x", -innerHeight / 2)
            .attr("text-anchor", "middle")
            .text("New Positives");

        g.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 35)
            .text("Month");
        */

        // var color = "#0000FF";
        var color = "#daedea";
        var line_color = "#69bfb2";

        const barchart = g
            .selectAll("rect")
            .data(month_data)
            .enter()
            .append("rect")
            .attr("x", (d) => xScale(d.month))
            .attr("y", (d) => yScale(d.value_original))
            .attr("height", function (d) {
                return innerHeight - yScale(d.value_original);
            })
            .attr("width", xScale.bandwidth())
            .attr("fill", color)
            .attr("stroke", line_color)
            .attr("stroke-width", "1px");
    } else {
        var labels = Object.keys(month_data[0]);
        console.log(labels);

        var subgroups = labels.slice(1, 3);
        console.log(subgroups);

        var groups = d3.map(month_data, function(d){ return(d.month); })
        console.log(groups);

        const xScale = d3
            .scaleBand()
            .domain(groups)
            .range([0, innerWidth])
            .padding(0.1);

        const yScale = d3
            .scaleLinear()
            .domain([
                0,
                d3.max(month_data, function (d) {
                    //return d["value_original"];
                    return d["value_original"] + d["value_working"];
                }),
            ])
            .range([innerHeight, 0]);

        //var color = "#0000FF";

        //var color = d3.scaleOrdinal(subgroups, d3.schemePastel1)
            //.domain(subgroups)
            //.range(['#e41a1c','#377eb8']);

        var stackedData = d3.stack()
            .keys(subgroups)
            (month_data)


        const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        const yAxis = d3.axisLeft(yScale)
            .ticks(5);
        g.append("g").call(yAxis);

        const xAxis = d3.axisBottom(xScale);

        g.append("g").call(xAxis).attr("transform", `translate(0,${innerHeight})`)
            .selectAll("text")
            .attr('transform', 'rotate(-45)')
            .attr("dx", "-17px")
            .attr("dy", "3px");

        /*
        g.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("y", "-60px")
            .attr("x", -innerHeight / 2)
            .attr("text-anchor", "middle")
            .text("New Positives");

        g.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 35)
            .text("Month");
        */


        var color_original = "#daedea";
        var color_working = '#377eb8';
        var line_color = "#69bfb2";

        const barchart = g.append("g")
                        //.selectAll('rect')
                        .selectAll('g')
                        .data(stackedData)
                        .enter()
                        //.append('rect')
                        .append('g')
                        //.attr('fill', function(d) { color(d); })
                        .selectAll('rect')
                        .data(function(d) {return d; })
                        .enter().append('rect')
                        //.attr("x", (d) => xScale(d.data.month))
                        .attr("x", function (d) { return xScale(d.data.month); } )
                        //.attr("y", (d) => yScale(d.value_original))
                        //.attr("y", (d) => yScale(d[1]))
                        .attr("y", function (d) { return yScale(d[1]); } )
                        .attr("height", function (d) {
                            //return innerHeight - yScale(d.value_original);
                            //console.log(d);
                            //return innerHeight - yScale(d[0]) - yScale(d[1]);
                            return yScale(d[0]) - yScale(d[1]);
                        })
                        .attr("width", xScale.bandwidth())
                        .attr('fill', function(d) {
                            if(d[0])
                            {
                                //return '#0000FF';
                                //return '#377eb8';
                                //return color_working;
                                return color_original;
                            }
                            else
                            {
                                //return '#377eb8';
                                //return '#0000FF';
                                //return color_original;
                                return color_working;
                            }
                        })
                        /*
                        .attr('fill', function (d) {
                            var letters = '0123456789ABCDEF'.split('');
    var color = '#';
    for (var i = 0; i < 6; i++ ) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
                        })
                        */
                        //.attr("stroke", "black")
                        .attr("stroke", line_color)
                        .attr("stroke-width", "1px");

        /*
    const barchart = g
        .selectAll("rect")
        .data(month_data)
        .enter()
        .append("rect")
        .attr("x", (d) => xScale(d.month))
        .attr("y", (d) => yScale(d.value_original))
        .attr("height", function (d) {
            return innerHeight - yScale(d.value_original);
        })
        .attr("width", xScale.bandwidth())
        .attr("fill", color)
        .attr("stroke", "black")
        .attr("stroke-width", "1px");
        */
    }
}

function drawCumulativeTemporalDay() {
    //clear
    //svg.select("g").remove();
    d3.selectAll("#svg_cumulative_temporal_day > *").remove();

    var svg = d3.select("#svg_cumulative_temporal_day");
    var width = +svg.style("width").replace("px", "");
    var height = +svg.style("height").replace("px", "");

    var margin = { top: 20, bottom: 40, right: 20, left: 80 };
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    //SUM new positives for each day
    var day_data = [
        { day: "Mon", value_working: 0, value_original: 0 },
        { day: "Tue", value_working: 0, value_original: 0 },
        { day: "Wed", value_working: 0, value_original: 0 },
        { day: "Thu", value_working: 0, value_original: 0 },
        { day: "Fri", value_working: 0, value_original: 0 },
        { day: "Sat", value_working: 0, value_original: 0 },
        { day: "Sun", value_working: 0, value_original: 0 }
    ];

    for (entry of original_data) {
        // 0 = Sun up until 6 = Mon
        // subtract a day (within 0 - 6 range)
        const current_day = (entry.Date.getDay() + 6) % 7;
        if (entry["New Positives"] >= 0) {
            day_data[current_day].value_original = day_data[current_day].value_original + entry["New Positives"];
        }
        if (entry["Deaths by County of Residence"] >= 0) {
            day_data[current_day].value_original =
                day_data[current_day].value_original + entry["Deaths by County of Residence"];
        }
        if (entry["Patients Currently Hospitalized"] >= 0) {
            day_data[current_day].value_original =
                day_data[current_day].value_original + entry["Patients Currently Hospitalized"];
        }
        if (entry["Place of Fatality"] >= 0) {
            day_data[current_day].value_original = day_data[current_day].value_original + entry["Place of Fatality"];
        }
        if (entry["Patients Newly Admitted"] >= 0) {
            day_data[current_day].value_original = day_data[current_day].value_original + entry["Patients Newly Admitted"];
        }
    }

    //Working data as well
    for (entry of working_data) {
        // 0 = Sun up until 6 = Mon
        // subtract a day (within 0 - 6 range)
        const current_day = (entry.Date.getDay() + 6) % 7;
        if (entry["New Positives"] >= 0) {
            day_data[current_day].value_working = day_data[current_day].value_working + entry["New Positives"];
        }
        if (entry["Deaths by County of Residence"] >= 0) {
            day_data[current_day].value_working =
                day_data[current_day].value_working + entry["Deaths by County of Residence"];
        }
        if (entry["Patients Currently Hospitalized"] >= 0) {
            day_data[current_day].value_working =
                day_data[current_day].value_working + entry["Patients Currently Hospitalized"];
        }
        if (entry["Place of Fatality"] >= 0) {
            day_data[current_day].value_working = day_data[current_day].value_working + entry["Place of Fatality"];
        }
        if (entry["Patients Newly Admitted"] >= 0) {
            day_data[current_day].value_working = day_data[current_day].value_working + entry["Patients Newly Admitted"];
        }
    }

    console.log(day_data);

    //if(original_data.length != working_data.length)
    if (original_data.length === working_data.length) {
        const xScale = d3
            .scaleBand()
            .domain(
                day_data.map(function (d) {
                    return d.day;
                })
            )
            .range([0, innerWidth])
            .padding(0.1);

        const yScale = d3
            .scaleLinear()
            .domain([
                0,
                d3.max(day_data, function (d) {
                    return d["value_original"];
                }),
            ])
            .range([innerHeight, 0]);

        const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        const yAxis = d3.axisLeft(yScale)
            .ticks(5);
        g.append("g").call(yAxis);

        const xAxis = d3.axisBottom(xScale);
        g.append("g").call(xAxis).attr("transform", `translate(0,${innerHeight})`)
            .selectAll("text")
            .attr('transform', 'rotate(-45)')
            .attr("dx", "-17px")
            .attr("dy", "3px");;

        /*
        g.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("y", "-60px")
            .attr("x", -innerHeight / 2)
            .attr("text-anchor", "middle")
            .text("New Positives");

        g.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 35)
            .text("Day");
        */

        // var color = "#0000FF";
        var color = "#daedea";
        var line_color = "#69bfb2";

        const barchart = g
            .selectAll("rect")
            .data(day_data)
            .enter()
            .append("rect")
            .attr("x", (d) => xScale(d.day))
            .attr("y", (d) => yScale(d.value_original))
            .attr("height", function (d) {
                return innerHeight - yScale(d.value_original);
            })
            .attr("width", xScale.bandwidth())
            .attr("fill", color)
            .attr("stroke", line_color)
            .attr("stroke-width", "1px");
    }
    else
    {
        var labels = Object.keys(day_data[0]);
        console.log(labels);

        var subgroups = labels.slice(1, 3);
        console.log(subgroups);

        var groups = d3.map(day_data, function(d){ return(d.day); })
        console.log(groups);

        const xScale = d3
        .scaleBand()
        .domain(groups)
        .range([0, innerWidth])
        .padding(0.1);

        const yScale = d3
            .scaleLinear()
            .domain([
                0,
                d3.max(day_data, function (d) {
                    return d["value_original"] + d["value_working"];
                }),
            ])
            .range([innerHeight, 0]);

        const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        const yAxis = d3.axisLeft(yScale)
            .ticks(5);
        g.append("g").call(yAxis);

        const xAxis = d3.axisBottom(xScale);
        g.append("g").call(xAxis).attr("transform", `translate(0,${innerHeight})`)
            .selectAll("text")
            .attr('transform', 'rotate(-45)')
            .attr("dx", "-17px")
            .attr("dy", "3px");

        /*
        g.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("y", "-60px")
            .attr("x", -innerHeight / 2)
            .attr("text-anchor", "middle")
            .text("New Positives");

        g.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 35)
            .text("Day");
        */

        //var color = "#0000FF";

        /*
        const barchart = g
            .selectAll("rect")
            .data(day_data)
            .enter()
            .append("rect")
            .attr("x", (d) => xScale(d.day))
            .attr("y", (d) => yScale(d.value_original))
            .attr("height", function (d) {
                return innerHeight - yScale(d.value_original);
            })
            .attr("width", xScale.bandwidth())
            .attr("fill", color)
            .attr("stroke", "black")
            .attr("stroke-width", "1px");
        */

        var stackedData = d3.stack()
        .keys(subgroups)
        (day_data);

        var color_original = "#daedea";
        var color_working = '#377eb8';
        var line_color = "#69bfb2";


        const barchart = g.append("g")
                        //.selectAll('rect')
                        .selectAll('g')
                        .data(stackedData)
                        .enter()
                        //.append('rect')
                        .append('g')
                        //.attr('fill', function(d) { color(d); })
                        .selectAll('rect')
                        .data(function(d) {return d; })
                        .enter().append('rect')
                        //.attr("x", (d) => xScale(d.data.month))
                        .attr("x", function (d) { return xScale(d.data.day); } )
                        //.attr("y", (d) => yScale(d.value_original))
                        //.attr("y", (d) => yScale(d[1]))
                        .attr("y", function (d) { return yScale(d[1]); } )
                        .attr("height", function (d) {
                            //return innerHeight - yScale(d.value_original);
                            //console.log(d);
                            //return innerHeight - yScale(d[0]) - yScale(d[1]);
                            return yScale(d[0]) - yScale(d[1]);
                        })
                        .attr("width", xScale.bandwidth())
                        .attr('fill', function(d) {
                            if(d[0])
                            {
                                //return '#0000FF';
                                //return '#377eb8';
                                //return color_working;
                                return color_original;
                            }
                            else
                            {
                                //return '#377eb8';
                                //return '#0000FF';
                                //return color_original;
                                return color_working;
                            }
                        })
                        /*
                        .attr('fill', function (d) {
                            var letters = '0123456789ABCDEF'.split('');
                            var color = '#';
                            for (var i = 0; i < 6; i++ ) {
                                color += letters[Math.floor(Math.random() * 16)];
                            }
                            return color;
                        })
                        */
                        //.attr("stroke", "black")
                        .attr("stroke", line_color)
                        .attr("stroke-width", "1px");
    }
}

function drawGlobalTemporal() {
    var svg = d3.select("#svg_global_temporal");
    var width = +svg.style("width").replace("px", "");
    var height = +svg.style("height").replace("px", "");

    var margin = { top: 20, bottom: 40, right: 20, left: 80 };
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin["top"] - margin.bottom;

    //Find unique dates in dataset, then find out min and max from that

    var unique_dates = [];
    const unique_dates_set = new Set();
    for (const entry of working_data) {
        const dateString = entry.Date.toDateString();
        if (!unique_dates_set.has(dateString)) {
            unique_dates.push(entry.Date)
        }
        unique_dates_set.add(dateString);
    }

    unique_dates.sort((a, b) => a.getTime() - b.getTime());

    var domainTime = d3.extent(unique_dates);

    // SUM new positives across every county for each date
    //Some dates are missing, and some dates are missing new positives data

    var global_data = [];

    for (var i = 0; i < unique_dates.length; i++) {
        var sum = 0;

        working_data.forEach((x) => {
            if (x["Date"].getTime() === unique_dates[i].getTime()) {
                if (x["New Positives"] >= 0) {
                    sum = sum + x["New Positives"];
                }
                if (x["Place of Fatality"] >= 0) {
                    sum = sum + x["Place of Fatality"];
                }
                if (x["Deaths by County of Residence"] >= 0) {
                    sum = sum + x["Deaths by County of Residence"];
                }
                if (x["Patients Currently Hospitalized"] >= 0) {
                    sum = sum + x["Patients Currently Hospitalized"];
                }
                if (x["Patients Newly Admitted"] >= 0) {
                    sum = sum + x["Patients Newly Admitted"];
                }
            }
        });

        //obj = { Date: new Date(unique_dates[i].valueOf()), Value: sum };
        obj = { Date: new Date(unique_dates[i]), Value: sum };
        //console.log(obj);
        global_data.push(obj);
    }

    //console.log(global_data);

    const xScale = d3.scaleTime().domain(domainTime).range([0, innerWidth]);

    const yScale = d3
        .scaleLinear()
        .domain([
            d3.min(global_data, function (d) {
                return d["Value"];
            }),
            d3.max(global_data, function (d) {
                return d["Value"];
            }),
        ])
        .range([innerHeight, 0]);

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    const yAxis = d3.axisLeft(yScale)
        .ticks(5);
    g.append("g").call(yAxis);

    const xAxis = d3.axisBottom(xScale);
    g.append("g").call(xAxis).attr("transform", `translate(0,${innerHeight})`);
    /*
    g.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", "-60px")
        .attr("x", -innerHeight / 2)
        .attr("text-anchor", "middle")
        .text("New Positives");

    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 30)
        .text("Date");
    */

    const singleLine = d3
        .line()
        .x((d) => xScale(d.Date))
        .y((d) => yScale(d.Value))
        .curve(d3.curveMonotoneX);

    // var color = "#0000FF";
    // var color = "#daedea";
    var color = "#69bfb2";

    const lines = g
        .append("path")
        //.datum(ny_data)
        .datum(global_data)
        .attr("class", "line")
        .style("fill", "none")
        .style("stroke", color)
        .style("stroke-width", "1")
        .attr("d", singleLine);

    //BRUSHING
    g.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("pointer-events", "all")
        .style("fill", "none");

    var brush = d3
        .brush()
        //var brush = d3.brushX()
        .extent([
            [0, 0],
            [width, height],
        ])
        //.on('start brush end', function (e) {
        .on('end', function (e) {
        //.on("start end", function (e) {
            var selection = e.selection;

            var x0 = selection[0][0];
            var y0 = selection[0][1];
            var x1 = selection[1][0];
            var y1 = selection[1][1];

            //brush_selected_times(x0, y0, x1, y1);
            brush_selected_times(x0, y0, x1, y1, unique_dates, xScale);
            //brush_selected_times(x0, x1, unique_dates);
            console.log(selection);
        });

    g.append("g").attr("class", "brush").call(brush);
}

function brush_selected_times(x0, y0, x1, y1, unique_dates, xScale) {
    //function brush_selected_times(x0, x1, unique_dates)
    var selected_times = [];

    for (var i = 0; i < unique_dates.length; i++) {
        var current_date = unique_dates[i];

        if (xScale(unique_dates[i]) >= x0 && xScale(unique_dates[i]) <= x1) {
            //console.log(x0);
            //console.log(x1);
            //console.log(i)
            selected_times.push(unique_dates[i]);
        }
    }
    //console.log(unique_dates[x0]);
    //console.log(unique_dates[x1]);
    //console.log(unique_dates);
    console.log(selected_times);
    //console.log(xScale.range());

    //working_data = working_data.filter((b) => (b.Date == d.properties.name)
    var new_working_data = [];
    //for(var i = 0; i < working_data.length; i++)
    for(var i = 0; i < original_data.length; i++)
    {
        //console.log(working_data);
        for(var j = 0; j < selected_times.length; j++)
        {
            //console.log("hi");
            //if(working_data[i].Date.getTime() === selected_times[j].getTime())
            if(original_data[i].Date.getTime() === selected_times[j].getTime())
            {
                //console.log("global changed");
                //new_working_data.push(working_data[i]);
                new_working_data.push(original_data[i]);
            }
        }
    }

    console.log(new_working_data);
    working_data = [...new_working_data];
    console.log(working_data);

    update();
}

// -----------------------------------------------------------------------------
// HOTSPOT CHARTS --------------------------------------------------------------
// -----------------------------------------------------------------------------
function updateHotspots() {
    //clear previous charts
    d3.selectAll("#svg_hotspot > *").remove();

	size = document.getElementById("div-hotspot").offsetHeight - 2;
	width_size = document.getElementById("div-hotspot").offsetWidth - 2;

    //get number of hotspots
    k = document.getElementById("hotspot-select").value;
    width_size = width_size/ k;
    json_W = "data/rank" + k + "W.json";
    json_H = "data/rank" + k + "H.json";

    /*
        /use this section to get hotspot counties and set gauge values
        */
    //get time period to use here for filter widget/main

    //get NMF hotspots
    Promise.all([d3.json(json_W), d3.json(json_H)]).then(
        function (data) {
            counties_nmf = data[0]; //array of arrays for each county
            dates_nmf = data[1]; //arrays of arrays for each date 3/27/2020 to 10/13/2022
            //console.log("nmf: ", counties_nmf);
            //use dates to filter
            //use counties to color

			//use working data so that calculations match filter on reload
			cov_data = [...working_data];

            //clean county data
            cov_data.forEach((d) => {
                d["Date"] = new Date(d["Date"]);
                if (isNaN(d["Deaths by County of Residence"])) {
                    d["Deaths by County of Residence"] = 0;
                } else {
                    d["Deaths by County of Residence"] = +d["Deaths by County of Residence"];
                }
                if (isNaN(d["New Positives"])) {
                    d["New Positives"] = 0;
                } else {
                    d["New Positives"] = +d["New Positives"];
                }
                if (isNaN(d["Patients Currently Hospitalized"])) {
                    d["Patients Currently Hospitalized"] = 0;
                } else {
                    d["Patients Currently Hospitalized"] = +d["Patients Currently Hospitalized"];
                }
                if (isNaN(d["Patients Newly Admitted"])) {
                    d["Patients Newly Admitted"] = 0;
                } else {
                    d["Patients Newly Admitted"] = +d["Patients Newly Admitted"];
                }
                if (isNaN(d["Place of Fatality"])) {
                    d["Place of Fatality"] = 0;
                } else {
                    d["Place of Fatality"] = +d["Place of Fatality"];
                }
            });

            //console.log("cov: ", cov_data);

            county_list = [];
            //get list of counties
            for (i = 0; i < 62; i++) {
                county_list.push(cov_data[i]["County"]);
            }
            county_list.splice(50, 0, "St.Lawrence"); //add because two spellings in nmf data
            //console.log("counties: ", county_list);

            //get hotspot counties - highest values for each in W
            max = 0;
			hotspots_got = ""; //already chosen as a hotspot
			hotspot_counties = [];
            for (i = 0; i < k; i++) {
                max = 0;
                var county = 0;
                for (j = 0; j < counties_nmf.length; j++) {
                    if (counties_nmf[j][i] > max && !hotspots_got.includes(county_list[j])) {
                        max = counties_nmf[j][i];
                        county = j;
						hotspots_got += county_list[j];
                    }
                }
                //arr = [j="county", i=pos (0 to k-1), max=value]
                arr = [county_list[county], i, max];
                //console.log("arr: ", arr);
                hotspot_counties.push(arr);
            }

            //append for each hotspot to summary_vals, number should match k
            //num_cases = sum all types, use total of time period as the value
            //temp_percent = percent of days in time period that 3/5 are not 0 (trying to find a meaningful value since no few counties have a day with have all 5 zeros)
            //relevancy = bilinear_interpolation(rate_of_cases, frequency_of_cases)
            var summary_vals = [];
            for (j = 0; j < k; j++) {
                //[num_cases, temp_percent, relevancy]
                summary_vals.push([0, 0, 0]);
            }

            //assign values for num_cases, temp_percent, and relevancy
            days = 0;
            day = cov_data[0]["Date"];
            total_cases = 0;
			for (i=0; i < county_list.length; i++){case_sums.push(0);} //start each county cases number with 0
            for (m = 0; m < cov_data.length; m++) {
                //all data
                tot =
                    cov_data[m]["Deaths by County of Residence"] +
                    cov_data[m]["New Positives"] +
                    cov_data[m]["Patients Currently Hospitalized"] +
                    cov_data[m]["Patients Newly Admitted"] +
                    cov_data[m]["Place of Fatality"];
                total_cases += tot;
				//add to sums array in the index of county_list
				case_sums[county_list.indexOf(cov_data[m]["County"])] += cov_data[m]["New Positives"];
                for (i = 0; i < k; i++) {
                    //hotspots
                    if (cov_data[m]["County"] == hotspot_counties[i][0]) {
                        //is hotspot county
                        //num_cases
                        cases_data =
                            cov_data[m]["Deaths by County of Residence"] +
                            cov_data[m]["New Positives"] +
                            cov_data[m]["Patients Currently Hospitalized"] +
                            cov_data[m]["Patients Newly Admitted"] +
                            cov_data[m]["Place of Fatality"]; //all covid data
                        summary_vals[i][0] += cases_data; //add to num_cases of hotspot

                        //temp_percent
                        deaths = 0;
                        new_pos = 0;
                        hospital = 0;
                        admitted = 0;
                        fatality = 0;
                        if (cov_data[m]["Deaths by County of Residence"] > 0) {
                            deaths = 1;
                        }
                        if (cov_data[m]["New Positives"] > 0) {
                            new_pos = 1;
                        }
                        if (cov_data[m]["Patients Currently Hospitalized"] > 0) {
                            hospital = 1;
                        }
                        if (cov_data[m]["Patients Newly Admitted"] > 0) {
                            admitted = 1;
                        }
                        if (cov_data[m]["Place of Fatality"] > 0) {
                            fatality = 1;
                        }
                        if (deaths + new_pos + hospital + admitted + fatality > 2) {
                            summary_vals[i][1] += 1; //keep number of 3/5 days
                        }
                        //alternate calculation	- use one metric
                        //if (cov_data[m]["New Positives"] > 0) {summary_vals[i][1] += 1;}
                        if (i == 0) {
                            days += 1;
                        }
                    }
                }
            }
            //console.log("Days: ", days);
			//console.log("case sums: ", case_sums);

            //relevancy = bilinear_interpolation(rate_of_cases, frequency_of_cases);
            //rate_of_cases = num_cases/total_cases
            //frequency_of_cases = days_with_cases/number of time slices
            for (i = 0; i < k; i++) {
                //relevancy
                rate_of_cases = summary_vals[i][0] / total_cases;
                frequency_of_cases = summary_vals[i][1] / days;
                relevancy = bilinear_interpolation(rate_of_cases, frequency_of_cases);
                summary_vals[i][2] = relevancy;
                //temp_percent to String
                tem = Math.floor((summary_vals[i][1] / days) * 100);
                summary_vals[i][1] = tem.toString() + "%";
            }
            console.log("hotspots calculated: ", hotspot_counties, " + ", summary_vals);

            //call createHotspotView() for number of hotspots (k=3 do it 3 times)
            //so dynamically create svgs
            var left = 0;
            for (let i = 0; i < k; i++) {
                createHotspotView(summary_vals[i], left, hotspot_counties[i], i);
                left = left + width_size;
            }
        }
    );
}

/*
parameters:
 - summary_vals [num_cases, temp_percent, relevancy] set gauge
 - shift (translation left for svgs)
 - hotspots for the choropleth colors
 - itter for which we are on (iteration of k) for coloring
*/
function createHotspotView(summary_vals, shift, hotspots, itter) {
    console.log("creating hotspot view...");
    //contains a legend, choropleth map, and gauge
    //number of views is number of hotspots

    //var left = 0;

    var mSvg = hotspot_svg
        .append("svg")
        .attr("width", width_size)
        .attr("height", size)
        .attr("transform", "translate(" + shift + ", " + 0 + ")");

    rects = mSvg.selectAll(".back_rect")
		.data([[1]])
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
		.attr("class", "back_rect")
        .attr("height", size)
        .attr("width", width_size)
        .style("stroke", "black")
        .style("fill", "white")
        .style("stroke-width", 3)
		.attr("z-index", "200 !important");

	rects.on("click", function (event, d){
				console.log("clicked rect!", event, d);
				if (hotspot_clicked == itter){ //toggle off
					d3.select(this).style("fill", "white");
					hotspot_clicked = -1;
					working_data = [...original_data];
                    map_view_zoom_pan();
					update();
				}
				else if (hotspot_clicked != itter){ //toggle on
					d3.select(this).style("fill", "#daedea");
					hotspot_clicked = itter;
					let wd = [];
					for (i=0; i < working_data.length; i ++){
						//console.log("work: ", working_data[i]["County"], " hots: ", hotspot_counties[itter][0]);
						if (working_data[i]["County"] === hotspot_counties[itter][0]){
							wd.push(working_data[i]);
						}
					}
					//console.log("working update: ", wd);
					working_data = wd;// if this is causing problems use [...wd];
                    updateMapView(working_data);
					update();
				}

			});


    /* LEGEND */

    legend_height = size * 0.4; //change to change size of whole legend
    legend_width = legend_height / 4;

    //add svg for axis scaling
    var innerSvg = mSvg
        .append("svg")
        .attr("width", legend_width + 10)
        .attr("height", legend_height)
        .attr("transform", "translate(" + 1 + ", " + 5 + ")");

    //gradient block
    var legend = innerSvg.append("g").attr("class", "legend");

    var gradient = legend
        .append("defs")
        .append("linearGradient")
        .attr("id", "gradient")
        .attr("x1", "0%")
        .attr("x2", "0%")
        .attr("y1", "0%")
        .attr("y2", "100%");
    gradient.append("stop").attr("offset", "0%").style("stop-color", "#2F0600");
    // gradient.append("stop").attr("offset", "50%").style("stop-color", "#FD6E08");
    gradient.append("stop").attr("offset", "50%").style("stop-color", "#FFAA63");

    gradient.append("stop").attr("offset", "100%").style("stop-color", "#FFFFD5");

    var legend_rect = legend
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", legend_width / 6)
        .attr("height", legend_height - 20)
        .style("fill", "url(#gradient)")
        .attr("transform", "translate(" + 1 + ", " + 5 + ")");

    //legend axis
    var legend_scale = d3
        .scaleLinear()
        .range([0, legend_height - 22])
        .domain([hotspots[2], 0]); //maybe use number of cases instead?
    var legend_axis = d3.axisRight(legend_scale);
    var leg = innerSvg
        .append("g")
        .attr("transform", "translate(" + (legend_width / 5 + 1) + ", " + 6 + ")")
        .call(legend_axis); //need to scale axis size

    leg.selectAll("text").style("font-size", "7px");

    /* CHOROPLETH */

    //choropleth map of the state
    //setup svg
    var choro_height = size / 1.7; //sets all proportion of choropleth map
    var choro_width = (width_size * 7) / 8; //choro_height;

    var choroSvg = mSvg
        .append("svg")
        .attr("width", choro_width)
        .attr("height", choro_height)
        .attr("transform", "translate(" + size / (k/1.7) / 4 + ", " + 0 + ")");

    //choro color gradient
    var choro_color = d3
        .scaleLinear()
        // .range(["#FFFFD5", "#FD6E08", "#2F0600"])
        .range(["#FFFFD5", "#FFAA63", "#2F0600"])
        .domain([0, hotspots[2] / 2, hotspots[2]]) //change threshholds for NNMF
        .interpolate(d3.interpolateHcl);

    //draw choropleth map
    d3.json("data/NY-counties-geojson.json").then(function (ny) {
        //console.log(ny.features);
        //console.log(ny.features[0].properties.name); //how to query for county names
        var projection = d3.geoMercator().fitSize([choro_width - 20, choro_height - 10], ny);

        var path = d3.geoPath().projection(projection);

        for (i = 0; i < ny.features.length; i++) {
            choroSvg
                .selectAll("path")
                .data(ny.features)
                //.join('path')
                .enter()
                .append("path")
                .attr("d", path)
                .attr("transform", "translate(10,0)")
                .attr("fill", function (d) {
                    return choro_color(counties_nmf[county_list.indexOf(d.properties.name)][itter]);
                })
                .attr("stroke", "black");
        }
    });

    /* GAUGE */

    //gauge
    //create a donut chart
    var gauge;
    //var donut = d3.pie();
    min_angle = -140;
    max_angle = 140;
    range = max_angle - min_angle;
    r = size / (k*1.8); //scale the whole gauge by changing the divider
    pointer_length = r * 1.5;
    ring_thickness = r / 3.3;
    num_cases = summary_vals[0];
    temp_percent = summary_vals[1];
    relevancy = summary_vals[2];

    //scale has percentages used, 0-100%
    scale = d3.scaleLinear().range([0, 1]).domain([0, 100]);

    ticks = scale.ticks(4); //5 major ticks, sets number of colored sections
    // change the size of each color section here
    low = [0.28];
    medium = [0.27];
    high = [0.25]; //scale input to be a portion of 80%
    none = [1 - low[0] - medium[0] - high[0]]; // none is always 20%
    tick_data = [high, none, low, medium]; //for testing, these values add up to 1
    //console.log("data: ", tick_data);
    mticks = [(1 - Math.floor(none[0] * 100 - 1) / 100) / 5]; //size of each major tick arc
    none = [Math.floor(none[0] * 100 - 1) / 100];
    major_ticks = [mticks, none, mticks, mticks, mticks]; //5 major ticks
    none = [(Math.floor(none[0] * 100) + 2.7) / 100];
    miticks = [(1 - none) / 21];
    minor_ticks = [
        miticks,
        none,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
        miticks,
    ];

    //console.log("minor ticks: ", minor_ticks);

    //set color scale
    //["#FFFFD5", "#FD6E08", "#2F0600"] //correct order
    var color = d3
        .scaleOrdinal()
        .domain([0, 2])
        // .range(["#FFFFD5", "#FD6E08", "#2F0600", "#FFFFFF"]);
        .range(["#FFFFD5", "#FFAA63", "#2F0600", "#FFFFFF"]);

    arc = d3
        .arc()
        .innerRadius(r - ring_thickness)
        .outerRadius(r);

    arc_border = d3
        .arc()
        .innerRadius(r + r / 20)
        .outerRadius(r + r / 5);

    arc_border_border = d3
        .arc()
        .innerRadius(r + r / 5)
        .outerRadius(r + (r / 5 + 1));

    const arc_val = d3
        .pie()
        .sort(null)
        .value(function (d) {
            return d[0];
        });

    var arcs = mSvg
        .append("g")
        .attr("class", "arc")
        .attr(
            "transform",
            "translate(" + (width_size-k) / 2 + ", " + (hotspot_margin.top + (size * 2) / 7) + ")"
        );

    var location = [];

    a_arcs = arcs
        .selectAll("path")
        .data(arc_val(tick_data))
        .enter()
        .append("path")
        .attr("fill", function (d) {
            return color(d);
        })
        .attr("d", arc)
        .attr("transform", "rotate(" + (3000 * Math.PI) / 180 + ")") //get the arcs in the right orientation;
        .filter(function (d) {
            //console.log(arc.startAngle()(d)%2, " and min: ", min_angle*Math.PI / 180); //check arc start angle
            //location.push(arc.centroid(d))//add to location
        });

    var location_mi = [];
    //draw minor tick marks
    //draw invisible arcs
    arcs.selectAll(".miticks_path")
        .data(arc_val(minor_ticks))
        .enter()
        .append("path")
        .attr("class", "miticks_path")
        .attr("stroke", "black")
        .attr("stroke-width", 0)
        .attr("fill", "none")
        .attr("d", arc)
        .filter(function (d) {
            //console.log(arc.startAngle()(d)%2, " and min: ", min_angle*Math.PI / 180); //check arc start angle
            location_mi.push(d.startAngle); //add to location
        });

    //console.log(location_mi);

    //draw minor ticks
    for (i = 0; i < 21; i++) {
        arcs.append("line")
            .attr("class", "gauge_lines")
            .attr("stroke", "gray")
            .attr("stroke-width", 1.5)
            .attr("x1", function (d) {
                return Math.sin(location_mi[i] - Math.PI / 2) * (r - r / 6.5);
            })
            .attr("y1", function (d) {
                return Math.cos(location_mi[i] - Math.PI / 2) * (r - r / 6.5);
            })
            .attr("x2", function (d) {
                return Math.sin(location_mi[i] - Math.PI / 2) * r;
            })
            .attr("y2", function (d) {
                return Math.cos(location_mi[i] - Math.PI / 2) * r;
            })
            .attr("transform", "rotate(" + (-2270 * Math.PI) / 180 + ")");
    }

    //draw major tick marks
    //draw invisible arcs
    arcs.selectAll(".ticks_path")
        .data(arc_val(major_ticks))
        .enter()
        .append("path")
        .attr("class", "ticks_path")
        .attr("stroke", "black")
        .attr("stroke-width", 0)
        .attr("fill", "none")
        .attr("d", arc)
        .filter(function (d) {
            //console.log(arc.startAngle()(d)%2, " and min: ", min_angle*Math.PI / 180); //check arc start angle
            location.push(d.startAngle); //add to location
        });

    //console.log(location);

    //draw major ticks
    for (i = 0; i < 5; i++) {
        arcs.append("line")
            .attr("class", "gauge_lines")
            .attr("stroke", "black")
            .attr("stroke-width", 3)
            .attr("x1", function (d) {
                return Math.sin(location[i] - Math.PI / 2) * (r - r / 4);
            })
            .attr("y1", function (d) {
                return Math.cos(location[i] - Math.PI / 2) * (r - r / 4);
            })
            .attr("x2", function (d) {
                return Math.sin(location[i] - Math.PI / 2) * r;
            })
            .attr("y2", function (d) {
                return Math.cos(location[i] - Math.PI / 2) * r;
            })
            .attr("transform", "rotate(" + (1000 * Math.PI) / 180 + ")");
    }

    //draw border of gauge
    //color: #D3D3D3
    arcs.selectAll(".border_path")
        .data(arc_val(tick_data))
        .attr("class", "border_path")
        .enter()
        .append("path")
        .attr("fill", "#D3D3D3")
        .attr("d", arc_border);
    arcs.selectAll(".borders")
        .data(arc_val(tick_data))
        .attr("class", "borders")
        .enter()
        .append("path")
        .attr("fill", "#000000")
        .attr("d", arc_border_border);

    //append 0 and 100 text to gauge
    arcs.append("text")
        .attr("font-size", r / 10)
        .attr("transform", "translate(" + -(r / 2.5) + "," + r / 1.8 + ")")
        .text("0");

    arcs.append("text")
        .attr("font-size", r / 10)
        .attr("transform", "translate(" + r / 3.9 + "," + r / 1.8 + ")")
        .text("100");

    //text at top, indicates number of cases in hotspot
    arcs.append("text")
        .attr("class", "top_text")
        .attr("text-anchor", "middle")
        .attr("font-size", r / 5)
        .attr("transform", "translate(" + 0 + "," + -(r / 2.5) + ")")
        .text(num_cases);

    //text at bottom, indicates the temporal percentage of cases
    arcs.append("text")
        .attr("class", "bottom_text")
        .attr("text-anchor", "middle")
        .attr("font-size", r / 5)
        .attr("transform", "translate(" + r / 15 + "," + r / 1.3 + ")")
        .text(temp_percent);

    //add pointer
    var pointer_data = [
        [r / 20, 0],
        [0, -pointer_length],
        [-(r / 20), 0],
        [0, r / 2.8],
        [r / 20, 0],
    ]; //make pointer features
    var pointer_line = d3.line().curve(d3.curveBasis);
    var pg = arcs.append("g").data([pointer_data]).attr("class", "pointer");

    pg.append("path")
        .attr("d", pointer_line)
        .attr("fill", "#D84022")
        .attr("stroke", "#BC2412")
        .attr("transform", "rotate(" + (relevancy - 0.5) * range + ")");
    pg.append("circle")
        .attr("r", r / 10)
        .attr("fill", "#1754E3")
        .attr("stroke", "#313E70");
}

function bilinear_interpolation(x, y) {
    f_0_0 = 0;
    f_0_1 = 0.5;
    f_1_0 = 0.7;
    f_1_1 = 1;
    x_1 = 0;
    x_2 = 1;
    y_1 = 0;
    y_2 = 1;
    p_1 = (((x_2 - x) * (y_2 - y)) / ((x_2 - x_1) * (y_2 - y_1))) * f_0_0;
    p_2 = (((x - x_1) * (y_2 - y)) / ((x_2 - x_1) * (y_2 - y_1))) * f_1_0;
    p_3 = (((x_2 - x) * (y - y_1)) / ((x_2 - x_1) * (y_2 - y_1))) * f_0_1;
    p_4 = (((x - x_1) * (y - y_1)) / ((x_2 - x_1) * (y_2 - y_1))) * f_1_1;
    p = p_1 + p_2 + p_3 + p_4;
    return p;
}

// -----------------------------------------------------------------------------
// EXTENSION VIEW --------------------------------------------------------------
// -----------------------------------------------------------------------------
async function updateExtensionChart() {
    //clear previous charts
    d3.selectAll("#svg_extension > *").remove();

    //pull in data for vaccines, etc.
    const vaccination_data = await d3.csv("data/vaccinations.csv");
    console.log("loaded vaccinations file");

    //get data in format
    row_data = vaccination_data.map(function (d) {
        return {
            county: d.County,
            first_dose: +d.FirstDose,
            series_complete: +d.SeriesComplete,
            date: d.Reportasof,
            //date: new Date(d.Reportasof.split("/")[2], d.Reportasof.split("/")[0] - 1, d.Reportasof.split("/")[1])
        };
    });

    //filter out any dates/locations/etc. we don't want here
    //use working data as the reference to only include the dates from filter
    let cov_dat = [...working_data];
    //use working data so that calculations match filter on reload
    //cases shown will be all covid activity
    case_sums = [];
    for (i=0; i < county_list.length; i++){case_sums.push(0);} //start each county cases number with 0
    for (m = 0; m < cov_dat.length; m++) {
        //case_sums[county_list.indexOf(cov_dat[m]["County"])] = cov_dat[m]["New Positives"];
        case_sums[county_list.indexOf(cov_dat[m]["County"])] +=
                    cov_dat[m]["Deaths by County of Residence"] +
                    cov_dat[m]["New Positives"] +
                    cov_dat[m]["Patients Currently Hospitalized"] +
                    cov_dat[m]["Patients Newly Admitted"] +
                    cov_dat[m]["Place of Fatality"];
    }

    //clean county data
    cov_dat.forEach((d) => {
        d["Date"] = new Date(d["Date"]);
        if (isNaN(d["Deaths by County of Residence"])) {
            d["Deaths by County of Residence"] = 0;
        } else {
            d["Deaths by County of Residence"] = +d["Deaths by County of Residence"];
        }
        if (isNaN(d["New Positives"])) {
            d["New Positives"] = 0;
        } else {
            d["New Positives"] = +d["New Positives"];
        }
        if (isNaN(d["Patients Currently Hospitalized"])) {
            d["Patients Currently Hospitalized"] = 0;
        } else {
            d["Patients Currently Hospitalized"] = +d["Patients Currently Hospitalized"];
        }
        if (isNaN(d["Patients Newly Admitted"])) {
            d["Patients Newly Admitted"] = 0;
        } else {
            d["Patients Newly Admitted"] = +d["Patients Newly Admitted"];
        }
        if (isNaN(d["Place of Fatality"])) {
            d["Place of Fatality"] = 0;
        } else {
            d["Place of Fatality"] = +d["Place of Fatality"];
        }
    });


    //vaccine data
    vaccine_data = [];
    dates = new Set();
    let max_date = d3.max(cov_dat, function (d) {
        return d["Date"];
    })
    //console.log("max: ", max_date);
    //make a set of dates
    set_length = -1;
    for (i = 0; i < row_data.length; i++) {
        date_formated = new Date(
                row_data[i].date.split("/")[2],
                row_data[i].date.split("/")[0] - 1,
                row_data[i].date.split("/")[1]
            );
        if (date_formated <= max_date){ //include vaccinations before/including the last date
            //console.log("less than: ", date_formated, " <= ", max_date);
            dates.add(row_data[i].date);
        }
        counties.add(row_data[i].county);
        if (set_length < dates.size) {
            //add new date to final array
            vaccine_data.push({ date: row_data[i].date, values: [] });
        }
        set_length = dates.size;
    }

    //add row values to each date
    for (i = 0; i < row_data.length; i++) {
        for (j = 0; j < vaccine_data.length; j++) {
            if (vaccine_data[j].date == row_data[i].date) {
                vals = {
                    first_dose: row_data[i].first_dose,
                    series_complete: row_data[i].series_complete,
                    cases: case_sums[county_list.indexOf(row_data[i].county)],
                };
                vaccine_data[j].values.push({
                    county: row_data[i].county,
                    values: vals,
                });
            }
        }
    }

    //make dates in date format
    vaccine_data = vaccine_data.map(function (d) {
        return {
            date: new Date(
                d.date.split("/")[2],
                d.date.split("/")[0] - 1,
                d.date.split("/")[1]
            ),
            values: d.values,
        };
    });

    //draw initial chart
    createLineChart();
}

/*
The chart has counties on x-axis and number of vaccinations on y-axis
The chart either shows a time slice or total
*/
function createLineChart() {
    console.log("creating extension line chart...");
    //contains a line chart

    //clear line chart
    //d3.selectAll("#extensionsvg > *").remove();

    /*
    /work with any filters here
    */
    //Ex: take only the latest data time slice to show (total)
    vaccine_data = vaccine_data[vaccine_data.length - 1];
    //console.log("filtered data: ", vaccine_data);

    //x axis is county
    x_scale = d3.scaleBand().domain(counties).range([0, innerwidth]);

    //y axis is number vaccinated, use first dose as max
    //console.log("vaccine data values: ", vaccine_data.values);
    y_scale = d3
        .scaleLinear()
        .domain([
            0,
            d3.max(vaccine_data.values, function (d) {
				return Math.max(d.values.first_dose, d.values.cases);
            }),
        ])
        .range([innerheight, 0]);

    g = extension_svg
        .append("g")
        .attr("transform", "translate(" + extension_margin.left + "," + extension_margin.top + ")");

    //create x axis
    const x_axis = d3.axisBottom(x_scale);
    g.append("g")
        .call(x_axis)
        .attr("transform", "translate(" + extension_margin.left + "," + innerheight + ")");
    //add x axis label
    g.append("text")
        .attr("class", "xaxis-label")
        .text("County")
        .attr("x", innerwidth / 2 + extension_margin.left)
        .attr("y", innerheight + extension_margin.top + 10)
        .style('font-size', '14px');

    //create y axis
    const y_axis = d3.axisLeft(y_scale).tickFormat(function (d) {
		greaterThanThousand = d3.max(vaccine_data.values, function (d) {
				return Math.max(d.values.first_dose, d.values.cases);
            });
		if (greaterThanThousand > 999) {
			return d / 1000 + "K";
		}
		else {
			return d;
		}
    });
    g.append("g")
        .call(y_axis)
        .attr("transform", "translate(" + extension_margin.left + ")");
    //add y axis label
    g.append("text")
        .attr("class", "yaxis-label")
        .text("Number")
        .attr("transform", "rotate(-90)")
        .style('font-size', '14px')
        .attr("x", -innerheight + extension_margin.left + extension_margin.right)
        .attr("y", -extension_margin.top + 6);

    //separate x and y axis ticks
    var ticks = d3.selectAll(".tick text");

    //set classes so x axis ticks only show on hover
    ticks.attr("class", function (d, i) {
        //console.log("ticks: ", d, " and ", i)
        if (Number.isInteger(d)) {
            return "yax";
        } else {
            return "xax";
        }
    });

    //styles for x axis
    g.selectAll(".xax")
        .style("fill", "none")
        .style("pointer-events", "all")
        .on("mouseover", function (d) {
            d3.select(this).style("fill", "#000");
        })
        .on("mouseout", function (d) {
            d3.select(this).style("fill", "none");
        });

    //set color scale
    //["#FFFFD5", "#FD6E08", "#2F0600"] //correct order
    var color = d3
        .scaleOrdinal()
        .domain([0, 2])
        // .range(["#FFFFD5", "#FD6E08", "#2F0600", "#FFFFFF"]);
        .range(["#FFFFD5", "#FFAA63", "#2F0600", "#FFFFFF"]);

    //draw lines
    let lines = d3
        .line()
        .x(function (d) {
            return x_scale(d.county);
        })
        .y(function (d) {
            return y_scale(d.values[attribute]);
        });

    //graph dots and lines
    //first dose
    attribute = "first_dose";
    g.selectAll(".first_circles")
        .data(vaccine_data.values)
        .enter()
        .append("circle")
        .attr("class", "first_circles")
        // .style("fill", "#FD6E08")
        .style("fill", "#FFAA63")
        .attr("cx", function (d) {
            return x_scale(d.county);
        })
        .attr("cy", function (d) {
            return y_scale(d.values[attribute]);
        })
        .attr("r", 3)
        .attr("transform", "translate(" + (extension_margin.left + 5) + "," + 0 + ")");

    //first dose line
    extension_svg
        .append("path")
        .data([vaccine_data.values])
        .attr("class", "first_lines")
        // .style("stroke", "#FD6E08")
        .style("stroke", "#FFAA63")
        .style("fill", "none")
        .attr("d", function (d) {
            return lines(d);
        })
        .attr(
            "transform",
            "translate(" + (extension_margin.left + 35) + "," + extension_margin.top + ")"
        );

    //series complete
    attribute = "series_complete";
    g.selectAll(".complete_circles")
        .data(vaccine_data.values)
        .enter()
        .append("circle")
        .attr("class", "complete_circles")
        .style("fill", "#2F0600")
        .attr("cx", function (d) {
            return x_scale(d.county);
        })
        .attr("cy", function (d) {
            return y_scale(d.values[attribute]);
        })
        .attr("r", 3)
        .attr("transform", "translate(" + (extension_margin.left + 7) + "," + 0 + ")"); //turn 7 into 5 for no offset

    //first dose line
    extension_svg
        .append("path")
        .data([vaccine_data.values])
        .attr("class", "complete_lines")
        .style("stroke", "#2F0600")
        .style("fill", "none")
        .attr("d", function (d) {
            return lines(d);
        })
        .attr(
            "transform",
            "translate(" + (extension_margin.left + 37) + "," + extension_margin.top + ")"
        );

	//covid cases
    attribute = "cases";
    g.selectAll(".case_circles")
        .data(vaccine_data.values)
        .enter()
        .append("circle")
        .attr("class", "case_circles")
        .style("fill", "#69bfb2")
        .attr("cx", function (d) {
            return x_scale(d.county);
        })
        .attr("cy", function (d) {
            return y_scale(d.values[attribute]);
        })
        .attr("r", 3)
        .attr("transform", "translate(" + (extension_margin.left + 6) + "," + 0 + ")"); //turn 7 into 5 for no offset

    //covid cases line
    extension_svg
        .append("path")
        .data([vaccine_data.values])
        .attr("class", "complete_lines")
        .style("stroke", "#69bfb2")
        .style("fill", "none")
        .attr("d", function (d) {
            return lines(d);
        })
        .attr(
            "transform",
            "translate(" + (extension_margin.left + 36) + "," + extension_margin.top + ")"
        );

    //legend
    g.selectAll(".first_legend_rect")
        .data([[1]])
        .enter()
        .append("rect")
        .attr("class", "first_legend_rect")
        .attr("x", innerwidth - 100)
        .attr("y", 0)
        .attr("width", 10)
        .attr("height", 10)
        // .attr("fill", "#FD6E08");
        .attr("fill", "#FFAA63");

    g.selectAll(".first_legend_text")
        .data([[1]])
        .enter()
        .append("text")
        .attr("class", "first_legend_text")
        .attr("x", innerwidth - 85)
        .attr("y", 10)
        .text("first dose")
        // .attr("stroke", "#FD6E08");
        .attr("stroke", "#FFAA63");

    g.selectAll(".complete_legend_rect")
        .data([[1]])
        .enter()
        .append("rect")
        .attr("class", "complete_legend_rect")
        .attr("x", innerwidth - 100)
        .attr("y", 20)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#2F0600");

    g.selectAll(".complete_legend_text")
        .data([[1]])
        .enter()
        .append("text")
        .attr("class", "complete_legend_text")
        .attr("x", innerwidth - 85)
        .attr("y", 30)
        .text("series complete")
        .attr("stroke", "#2F0600");

	g.selectAll(".case_legend_rect")
        .data([[1]])
        .enter()
        .append("rect")
        .attr("class", "case_legend_rect")
        .attr("x", innerwidth - 100)
        .attr("y", 40)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#69bfb2");

    g.selectAll(".case_legend_text")
        .data([[1]])
        .enter()
        .append("text")
        .attr("class", "case_legend_text")
        .attr("x", innerwidth - 85)
        .attr("y", 50)
        .text("Cases")
        .attr("stroke", "#69bfb2");

    //add tooltip
    g.selectAll(".first_circles")
        .on("mouseover", function (d, i) {
            //console.log("d: ", d, " i: ", i);
			case_count = case_sums[county_list.indexOf(i.county)];
            div.style("opacity", 1);
            div.html(
                "County:  " +
                    i.county +
                    "<br/>" +
                    "Cases: " + case_count.toLocaleString('en-US') +
                    "<br/>" +
                    "First Dose: " +
                    i.values.first_dose.toLocaleString('en-US') +
                    "<br/>" +
                    "Fully Vaccinated: " +
                    i.values.series_complete.toLocaleString('en-US') +
                    "<br/>"
            )
                .style("left", d.pageX + 10 + "px")
                .style("top", d.pageY - 50 + "px");
        })
        .on("mousemove", function (d, i) {
            //console.log("d: ", d, " i: ", i);
			case_count = case_sums[county_list.indexOf(i.county)];
            div.transition().delay(200).style("opacity", 1);
            div.html(
                "County:  " +
                    i.county +
                    "<br/>" +
                    "Cases: " + case_count.toLocaleString('en-US') +
                    "<br/>" +
                    "First Dose: " +
                    i.values.first_dose.toLocaleString('en-US') +
                    "<br/>" +
                    "Fully Vaccinated: " +
                    i.values.series_complete.toLocaleString('en-US') +
                    "<br/>"
            )
                .style("left", d.pageX + 10 + "px")
                .style("top", d.pageY - 50 + "px");
        })
        .on("mouseout", function (d, i) {
            div.transition().delay(200).style("opacity", 0);
        });

    g.selectAll(".complete_circles")
        .on("mouseover", function (d, i) {
            //console.log("d: ", d, " i: ", i);
			case_count = case_sums[county_list.indexOf(i.county)];
            div.style("opacity", 1);
            div.html(
                "County:  " +
                    i.county +
                    "<br/>" +
                    "Cases: " + case_count.toLocaleString('en-US') +
                    "<br/>" +
                    "First Dose: " +
                    i.values.first_dose.toLocaleString('en-US') +
                    "<br/>" +
                    "Fully Vaccinated: " +
                    i.values.series_complete.toLocaleString('en-US') +
                    "<br/>"
            )
                .style("left", d.pageX + 10 + "px")
                .style("top", d.pageY - 50 + "px");
        })
        .on("mousemove", function (d, i) {
            //console.log("d: ", d, " i: ", i);
			case_count = case_sums[county_list.indexOf(i.county)];
            div.transition().delay(200).style("opacity", 1);
            div.html(
                "County:  " +
                    i.county +
                    "<br/>" +
                    "Cases: " + case_count.toLocaleString('en-US') +
                    "<br/>" +
                    "First Dose: " +
                    i.values.first_dose.toLocaleString('en-US') +
                    "<br/>" +
                    "Fully Vaccinated: " +
                    i.values.series_complete.toLocaleString('en-US') +
                    "<br/>"
            )
                .style("left", d.pageX + 10 + "px")
                .style("top", d.pageY - 50 + "px");
        })
        .on("mouseout", function (d, i) {
            div.transition().delay(200).style("opacity", 0);
        });

    g.selectAll(".case_circles")
        .on("mouseover", function (d, i) {
            //console.log("d: ", d, " i: ", i);
			case_count = case_sums[county_list.indexOf(i.county)];
            div.style("opacity", 1);
            div.html(
                "County:  " +
                    i.county +
                    "<br/>" +
                    "Cases: " + case_count.toLocaleString('en-US') +
                    "<br/>" +
                    "First Dose: " +
                    i.values.first_dose.toLocaleString('en-US') +
                    "<br/>" +
                    "Fully Vaccinated: " +
                    i.values.series_complete.toLocaleString('en-US') +
                    "<br/>"
            )
                .style("left", d.pageX + 10 + "px")
                .style("top", d.pageY - 50 + "px");
        })
        .on("mousemove", function (d, i) {
            //console.log("d: ", d, " i: ", i);
			case_count = case_sums[county_list.indexOf(i.county)];
            div.transition().delay(200).style("opacity", 1);
            div.html(
                "County:  " +
                    i.county + "<br/>" +
                    "Cases: " + case_count.toLocaleString('en-US') +
                    "<br/>" +
                    "First Dose: " +
                    i.values.first_dose.toLocaleString('en-US') +
                    "<br/>" +
                    "Fully Vaccinated: " +
                    i.values.series_complete.toLocaleString('en-US') +
                    "<br/>"
            )
                .style("left", d.pageX + 10 + "px")
                .style("top", d.pageY - 50 + "px");
        })
        .on("mouseout", function (d, i) {
            div.transition().delay(200).style("opacity", 0);
        });
}

// ---------------------------------------------------------------------------
// FILTER VIEW ---------------------------------------------------------------
// ---------------------------------------------------------------------------
const timeFilterState = {
    2020: true,
    2021: true,
    2022: true,
}
const typeFilterState = {
    "Deaths by County of Residence": true,
    "New Positives": true,
    "Patients Currently Hospitalized": true,
    "Patients Newly Admitted": true,
    "Place of Fatality": true,
}
function syncWorkingDataWithState() {
    working_data = structuredClone(original_data)
        .filter((entry) => timeFilterState[entry.Date.getFullYear()]);

    working_data.forEach((entry) => {
        for (const [type, visible] of Object.entries(typeFilterState)) {
            if (!visible) {
                entry[type] = 0;
            }
        }
    })
}

const filterViewMargins = { top: 10, bottom: 20, right: 10, left: 10 };
const filterViewAxisHeight = 40
const filterViewRectColor = "#99c5d3"
const filterViewBarOpacity = 0.75
const filterViewUnselectedOpacity = 0.25
function drawTimeFilterView() {
    const svg = d3.select("#svg_filter_time");
    let width = +svg.style("width").replace("px", "");
    let height = +svg.style("height").replace("px", "");
    let innerWidth = width - filterViewMargins.left - filterViewMargins.right;
    let innerHeight = height - filterViewMargins.top - filterViewMargins.bottom;

    const timeGroups = d3.group(original_data, (d) => d.Date.getFullYear())

    const container = svg.append('g')
        .attr("transform", `translate(${filterViewMargins.left}, ${filterViewMargins.top})`);

    const max = Math.max(...Array.from(timeGroups.values(), val => val.length));
    const xScale = d3.scaleLinear()
        .domain([0, max])
        .range([0, innerWidth])
    const xAxis = d3.axisBottom(xScale)
        .ticks(4)

    const yScale = d3.scaleBand()
        .domain(timeGroups.keys())
        .range([0, innerHeight - filterViewAxisHeight])
        .padding(0.25)

    // axis
    container.append('g')
        .attr("class", "xAxis")
        .attr('transform', `translate(0, ${innerHeight - filterViewAxisHeight})`)
        .call(xAxis)
        .selectAll("text")
        .attr('transform', 'rotate(-45)')
        .attr("dx", "-26px")
        .attr("dy", "2px");

    // gridlines: https://stackoverflow.com/questions/40766379/d3-adding-grid-to-simple-line-chart
    container.selectAll("g.xAxis g.tick")
        .append("line")
        .attr("x1", 0)
        .attr("y1", -innerHeight)
        .attr("x2", 0)
        .attr("y2", 0)
        .attr("stroke", "lightgray");

    // bars
    container.selectAll(".filteritem")
        .data(timeGroups.entries())
        .join((enter) => {
            const g = enter.append('g')
                .attr('class', 'filteritem')
                .style('cursor', 'pointer')

            g.append('rect')
                .style("fill", filterViewRectColor)
                .style("opacity", filterViewBarOpacity)
                .attr("x", 0)
                .attr("y", ([key, val]) => yScale(key))
                .attr("width", ([key, val]) => xScale(val.length))
                .attr("height", yScale.bandwidth())
                .on('click', function (event, d) {
                    const selectedType = d[0];
                    const newState = !timeFilterState[selectedType];
                    timeFilterState[selectedType] = newState;

                    d3.select(this).transition().style("opacity",
                        newState ? filterViewBarOpacity : filterViewUnselectedOpacity
                    )

                    syncWorkingDataWithState();
                    update();
                })

            g.append('text')
                .attr("x", 4)
                .attr("y", ([key, val]) => yScale(key) + (yScale.bandwidth() / 2))
                .attr("font-size", "16px")
                .attr("dominant-baseline", "middle")
                .style("pointer-events", "none")
                .text(([key, val]) => key);

            return g;
        });
}

function drawTypeFilterView() {
    // type filter
    const svg = d3.select("#svg_filter_type");
    width = +svg.style("width").replace("px", "");
    height = +svg.style("height").replace("px", "");
    innerWidth = width - filterViewMargins.left - filterViewMargins.right;
    innerHeight = height - filterViewMargins.top - filterViewMargins.bottom;

    let typeCounts = new Map();
    for (type of Object.keys(typeFilterState)) {
        typeCounts.set(type, d3.sum(original_data, d => d[type]))
    }
    typeCounts = new Map([...typeCounts.entries()].sort((a, b) => b[1] - a[1]));

    const container = svg.append('g')
        .attr("transform", `translate(${filterViewMargins.left}, ${filterViewMargins.top})`);

    const max = Math.max(...typeCounts.values());
    const xScale = d3.scaleLinear()
        .domain([0, max])
        .range([0, innerWidth])
    const xAxis = d3.axisBottom(xScale)
        .ticks(4)

    const yScale = d3.scaleBand()
        .domain(typeCounts.keys())
        .range([0, innerHeight - filterViewAxisHeight])
        .padding(0.25)

    // axis
    container.append('g')
        .attr("class", "xAxis")
        .attr('transform', `translate(0, ${innerHeight - filterViewAxisHeight})`)
        .call(xAxis)
        .selectAll("text")
        .attr('transform', 'rotate(-45)')
        .attr("dx", "-26px")
        .attr("dy", "2px");

    // gridlines: https://stackoverflow.com/questions/40766379/d3-adding-grid-to-simple-line-chart
    container.selectAll("g.xAxis g.tick")
        .append("line")
        .attr("x1", 0)
        .attr("y1", -innerHeight)
        .attr("x2", 0)
        .attr("y2", 0)
        .attr("stroke", "lightgray");

    // bars
    container.selectAll(".filteritem")
        .data(typeCounts.entries())
        .join((enter) => {
            const g = enter.append('g')
                .attr('class', 'filteritem')
                .style('cursor', 'pointer')

            g.append('rect')
                .style("fill", filterViewRectColor)
                .style("opacity", filterViewBarOpacity)
                .attr("x", 0)
                .attr("y", ([key, val]) => yScale(key))
                .attr("width", ([key, val]) => xScale(val))
                .attr("height", yScale.bandwidth())
                .on('click', function (event, d) {
                    const selectedType = d[0];
                    const newState = !typeFilterState[selectedType];
                    typeFilterState[selectedType] = newState;

                    d3.select(this).transition().style("opacity",
                        newState ? filterViewBarOpacity : filterViewUnselectedOpacity
                    )

                    syncWorkingDataWithState();
                    update();
                })

            g.append('text')
                .attr("x", 4)
                .attr("y", ([key, val]) => yScale(key) + (yScale.bandwidth() / 2))
                .attr("font-size", "10px")
                .attr("dominant-baseline", "middle")
                .style("pointer-events", "none")
                .text(([key, val]) => key);

            return g;
        })
}

// ---------------------------------------------------------------------------
// RADIAL VIEW ---------------------------------------------------------------
// ---------------------------------------------------------------------------
function drawRadialView() {
    //remove
    d3.selectAll("#my_dataviz1 > *").remove();
    d3.selectAll("#my_dataviz2 > *").remove();
    d3.selectAll("#my_dataviz3 > *").remove();
    d3.selectAll("#my_dataviz4 > *").remove();
    d3.selectAll("#my_dataviz5 > *").remove();


    const radial_margin = { top: 0, right: 0, bottom: 0, left: 10 },
    radial_width = 210 - radial_margin.left - radial_margin.right,
    radial_height = 210 - radial_margin.top - radial_margin.bottom,
    innerRadius = 70,
    outerRadius = 105; //Math.min(width, radial_height) / 2;

    var number_of_positives = [];
    var num_deaths = [];
    var num_hospital = [];
    var num_fatality = [];
    var num_admitted = [];

    for (let i = 0; i < 36; i++) {
      number_of_positives.push({ month: i, value: 0 });
      num_deaths.push({ month: i, value: 0 });
      num_hospital.push({ month: i, value: 0 });
      num_fatality.push({ month: i, value: 0 });
      num_admitted.push({ month: i, value: 0 });
      if (i == 11) {
        number_of_positives.push(
          { month: "a", value: 0 },
          { month: "b", value: 0 },
          { month: "c", value: 0 }
        );
        num_deaths.push(
          { month: "a", value: 0 },
          { month: "b", value: 0 },
          { month: "c", value: 0 }
        );
        num_hospital.push(
          { month: "a", value: 0 },
          { month: "b", value: 0 },
          { month: "c", value: 0 }
        );
        num_fatality.push(
          { month: "a", value: 0 },
          { month: "b", value: 0 },
          { month: "c", value: 0 }
        );
        num_admitted.push(
          { month: "a", value: 0 },
          { month: "b", value: 0 },
          { month: "c", value: 0 }
        );
      }
      if (i == 23) {
        number_of_positives.push(
          { month: "d", value: 0 },
          { month: "e", value: 0 },
          { month: "f", value: 0 }
        );
        num_deaths.push(
          { month: "d", value: 0 },
          { month: "e", value: 0 },
          { month: "f", value: 0 }
        );
        num_hospital.push(
          { month: "d", value: 0 },
          { month: "e", value: 0 },
          { month: "f", value: 0 }
        );
        num_fatality.push(
          { month: "d", value: 0 },
          { month: "e", value: 0 },
          { month: "f", value: 0 }
        );
        num_admitted.push(
          { month: "d", value: 0 },
          { month: "e", value: 0 },
          { month: "f", value: 0 }
        );
      }
    }
    console.log(number_of_positives);
    let covidData = [...working_data]; //only call to covid dataset
    covidData.forEach((value) => {
      let year = value["Date"].getFullYear();
      let month = value["Date"].getMonth();
      if (year == 2020) {
        if (!isNaN(value["New Positives"])) {
          number_of_positives[month].value =
            number_of_positives[month].value + 0.1 * value["New Positives"];
        }
        if (!isNaN(value["Deaths by County of Residence"])) {
          num_deaths[month].value =
            num_deaths[month].value + value["Deaths by County of Residence"];
        }
        if (!isNaN(value["Patients Currently Hospitalized"])) {
          num_hospital[month].value =
            num_hospital[month].value + value["Patients Currently Hospitalized"];
        }
        if (!isNaN(value["Place of Fatality"])) {
          num_fatality[month].value =
            num_fatality[month].value + value["Place of Fatality"];
        }
        if (!isNaN(value["Patients Newly Admitted"])) {
          num_admitted[month].value =
            num_admitted[month].value + value["Patients Newly Admitted"];
        }
      }
      if (year == 2021) {
        if (!isNaN(value["New Positives"])) {
          number_of_positives[month + 15].value =
            number_of_positives[month + 15].value + 0.1 * value["New Positives"];
        }
        if (!isNaN(value["Deaths by County of Residence"])) {
          num_deaths[month + 15].value =
            num_deaths[month + 15].value + value["Deaths by County of Residence"];
        }
        if (!isNaN(value["Patients Currently Hospitalized"])) {
          num_hospital[month + 15].value =
            num_hospital[month + 15].value +
            value["Patients Currently Hospitalized"];
        }
        if (!isNaN(value["Place of Fatality"])) {
          num_fatality[month + 15].value =
            num_fatality[month + 15].value + value["Place of Fatality"];
        }
        if (!isNaN(value["Patients Newly Admitted"])) {
          num_admitted[month + 15].value =
            num_admitted[month + 15].value + value["Patients Newly Admitted"];
        }
      }
      if (year == 2022) {
        if (!isNaN(value["New Positives"])) {
          number_of_positives[month + 31].value =
            number_of_positives[month + 31].value + 0.1 * value["New Positives"];
        }
        if (!isNaN(value["Deaths by County of Residence"])) {
          num_deaths[month + 31].value =
            num_deaths[month + 31].value + value["Deaths by County of Residence"];
        }
        if (!isNaN(value["Patients Currently Hospitalized"])) {
          num_hospital[month + 31].value =
            num_hospital[month + 31].value +
            value["Patients Currently Hospitalized"];
        }
        if (!isNaN(value["Place of Fatality"])) {
          num_fatality[month + 31].value =
            num_fatality[month + 31].value + value["Place of Fatality"];
        }
        if (!isNaN(value["Patients Newly Admitted"])) {
          num_admitted[month + 31].value =
            num_admitted[month + 31].value + value["Patients Newly Admitted"];
        }
      }
    });

    console.log(number_of_positives);

    //   console.log(num_deaths);
    //   console.log(num_hospital);
    //   console.log(num_fatality);
    //   console.log(num_admitted);

    const svg1 = d3
      .select("#my_dataviz1")
      .data(number_of_positives)
      .append("svg")
      .attr("width", radial_width + radial_margin.left + radial_margin.right)
      .attr("height", radial_height + radial_margin.top + radial_margin.bottom)
      .append("g")
      .attr(
        "transform",
        `translate(${radial_width / 2 + radial_margin.left}, ${radial_height / 2 + radial_margin.top})`
      );

    const x = d3
      .scaleBand()
      .range([0, 2 * Math.PI])
      .align(0)
      .domain(number_of_positives.map((d) => d.month));
    const y = d3
      .scaleRadial()
      .range([innerRadius / 2, outerRadius / 2])
      .domain([0, 7000]);

    svg1
      .append("g")
      .selectAll("path")
      .data(number_of_positives)
      .join("path")
      .attr("fill", "rgb(251, 180, 174)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y(0.2 * d["value"]))
          .startAngle((d) => x(d.month))
          .endAngle((d) => x(d.month) + x.bandwidth())
          .padAngle(0.01)
          .padRadius(innerRadius / 2)
      );


      //set up for donuts
      const arc_val = d3.pie().sort(null).value(function(d) {return d[0]});

      years = 3; //NEEDS TO CHANGE FOR FILTERING
      donut_vals = [];
      for (i=0; i < years; i++){
          donut_vals.push([1/years]);
      }

      //add donut
      yr = 0; //sets start and end angle
      svg1
      .append("g")
      .selectAll(".donut_path")
      .data(arc_val(donut_vals))
      .attr("class", "donut_path")
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "rgb(251, 180, 174)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y(0.2*d3.max(number_of_positives, (d) => d["value"])))
          .startAngle((d) => x(yr))
          .endAngle(function (d) {
              val = 0;
              if (yr == 0) {val = x("a") + x.bandwidth(); yr = 12;}
              else if (yr == 12) {val = x("e"); yr = 24;}
              else {val = x(34); yr = 34;}
              return val;})
          .padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //choropleth map
      var choro_height = innerRadius; //sets all proportion of choropleth map
      var choro_width = innerRadius;//choro_height;

      var choroSvg1 = svg1.append("svg")
                          .attr("width", choro_width)
                          .attr("height", choro_height)
                          .attr("transform", "translate(" + -28 + ", " + -30 + ")");
      //draw choropleth map
          d3.json("data/NY-counties-geojson.json")
           .then(function(ny){
                  //console.log(ny.features);
                  //console.log(ny.features[0].properties.name); //how to query for county names
                  var projection = d3.geoMercator()
                                  .fitSize([choro_width -20, choro_height -10], ny);

                  var path = d3.geoPath()
                                  .projection(projection);

                  for (i=0; i < ny.features.length;i++){
                  choroSvg1.selectAll("path")
                          .data(ny.features)
                          //.join('path')
                          .enter()
                          .append("path")
                          .attr("d", path)
                          .attr("opacity", function (d) {op = d.properties.name.length/14; if (op >1) {op = 1;} return op;}) //reandom example of using opacity for some value
                          .attr("fill", "rgb(251, 180, 174)")
                          .attr("stroke", "black");
                  }

          });

    svg1
      .append("g")
      .selectAll("g")
      .data(number_of_positives)
      .join("g")
      .attr("text-anchor", function (d) {
        return (x(d.month) + x.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "end"
          : "start";
      })
      .attr("transform", function (d) {
        return (
          "rotate(" +
          (((x(d.month) + x.bandwidth() / 2) * 180) / Math.PI - 90) +
          ")" +
          "translate(" +
          (y(d["value"]) + 10) +
          ",0)"
        );
      })
      // .append("text")
      // .text(function (d) {
      //   return d.month;
      // })
      .attr("transform", function (d) {
        return (x(d.month) + x.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "rotate(180)"
          : "rotate(0)";
      })
      .style("font-size", "11px")
      .attr("alignment-baseline", "middle");

    svg1
      .append("text")
      .attr("x", 0)
      .attr("y", 100)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      // .style("text-decoration", "underline")
      .text("New Positives")
      .attr("fill", "rgb(251, 180, 174)");

      svg1
      .append("text")
      .attr("x", 23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2020");
    // .attr("fill", "rgb(251, 180, 174)")

    svg1
      .append("text")
      .attr("x", 0)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2021");
    // .attr("fill", "rgb(251, 180, 174)")

    svg1
      .append("text")
      .attr("x", -23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2022");
    // .attr("fill", "rgb(251, 180, 174)")

    // second viz
    //
    //
    //
    //
    //

    const svg2 = d3
      .select("#my_dataviz2")
      .data(num_deaths)
      .append("svg")
      .attr("width",radial_width + radial_margin.left + radial_margin.right)
      .attr("height", radial_height + radial_margin.top + radial_margin.bottom)
      .append("g")
      .attr(
        "transform",
        `translate(${radial_width / 2 + radial_margin.left}, ${radial_height / 2 + radial_margin.top})`
      );

    const x2 = d3
      .scaleBand()
      .range([0, 2 * Math.PI])
      .align(0)
      .domain(num_deaths.map((d) => d.month));
    const y2 = d3
      .scaleRadial()
      .range([innerRadius / 2, outerRadius / 2])
      .domain([0, 7000]);

    svg2
      .append("g")
      .selectAll("path")
      .data(num_deaths)
      .join("path")
      .attr("fill", "rgb(179, 205, 227)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y2(0.08 * d["value"]))
          .startAngle((d) => x2(d.month))
          .endAngle((d) => x2(d.month) + x2.bandwidth())
          .padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

    svg2
      .append("g")
      .selectAll("g")
      .data(num_deaths)
      .join("g")
      .attr("text-anchor", function (d) {
        return (x2(d.month) + x2.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "end"
          : "start";
      })
      .attr("transform", function (d) {
        return (
          "rotate(" +
          (((x(d.month) + x.bandwidth() / 2) * 180) / Math.PI - 90) +
          ")" +
          "translate(" +
          (y2(d["value"]) + 10) +
          ",0)"
        );
      })
      // .append("text")
      // .text(function (d) {
      //   return d.month;
      // })
      .attr("transform", function (d) {
        return (x2(d.month) + x2.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "rotate(180)"
          : "rotate(0)";
      })
      .style("font-size", "11px")
      .attr("alignment-baseline", "middle");


      //add donut
      yr = 0; //sets start and end angle
      svg2
      .append("g")
      .selectAll(".donut_path")
      .data(arc_val(donut_vals))
      .attr("class", "donut_path")
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "rgb(179, 205, 227)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y2(0.08*d3.max(num_deaths, (d) => d["value"])))//outerRadius / 2)
          .startAngle(function (d) { return x2(yr)})
          .endAngle(function (d) {
              val = 0;
              if (yr == 0) {val = x2("a") + x2.bandwidth(); yr = 12;}
              else if (yr == 12) {val = x2("e"); yr = 24;}
              else {val = x2(34); yr = 34;}
              return val;})
          .padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //choropleth map
      var choroSvg2 = svg2.append("svg")
                          .attr("width", choro_width)
                          .attr("height", choro_height)
                          .attr("transform", "translate(" + -28 + ", " + -30 + ")");
      //draw choropleth map
          d3.json("data/NY-counties-geojson.json")
           .then(function(ny){
                  //console.log(ny.features);
                  //console.log(ny.features[0].properties.name); //how to query for county names
                  var projection = d3.geoMercator()
                                  .fitSize([choro_width -20, choro_height -10], ny);

                  var path = d3.geoPath()
                                  .projection(projection);

                  for (i=0; i < ny.features.length;i++){
                  choroSvg2.selectAll("path")
                          .data(ny.features)
                          //.join('path')
                          .enter()
                          .append("path")
                          .attr("d", path)
                          .attr("opacity", function (d) {op = d.properties.name.length/14; if (op >1) {op = 1;} return op;}) //reandom example of using opacity for some value
                          .attr("fill", "rgb(179, 205, 227)")
                          .attr("stroke", "black");
                  }

          });


    svg2
      .append("text")
      .attr("x", 0)
      .attr("y", 100)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      // .style("text-decoration", "underline")
      .text("Deaths by County of Residence")
      .attr("fill", "rgb(179, 205, 227)");

      svg2
      .append("text")
      .attr("x", 23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2020");
    // .attr("fill", "rgb(251, 180, 174)")

    svg2
      .append("text")
      .attr("x", 0)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2021");
    // .attr("fill", "rgb(251, 180, 174)")

    svg2
      .append("text")
      .attr("x", -23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2022");
    // .attr("fill", "rgb(251, 180, 174)")


    // Thrid viz
    //
    //
    //

    //
    //

    const svg3 = d3
      .select("#my_dataviz3")
      .data(num_hospital)
      .append("svg")
      .attr("width",radial_width + radial_margin.left + radial_margin.right)
      .attr("height", radial_height + radial_margin.top + radial_margin.bottom)
      .append("g")
      .attr(
        "transform",
        `translate(${radial_width / 2 + radial_margin.left}, ${radial_height / 2 + radial_margin.top})`
      );

    const x3 = d3
      .scaleBand()
      .range([0, 2 * Math.PI])
      .align(0)
      .domain(num_hospital.map((d) => d.month));
    const y3 = d3
      .scaleRadial()
      .range([innerRadius / 2, outerRadius / 2])
      .domain([0, 7000]);

    svg3
      .append("g")
      .selectAll("path")
      .data(num_hospital)
      .join("path")
      .attr("fill", "rgb(204, 235, 197)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y3(0.065 * d["value"]))
          .startAngle((d) => x3(d.month))
          .endAngle((d) => x3(d.month) + x3.bandwidth())
          .padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //add donut
      yr = 0; //sets start and end angle
      svg3
      .append("g")
      .selectAll(".donut_path")
      .data(arc_val(donut_vals))
      .attr("class", "donut_path")
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "rgb(204, 235, 197)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y3(0.065*d3.max(num_hospital, (d) => d["value"])))
          .startAngle((d) => x3(yr))
          .endAngle(function (d) {
              val = 0;
              if (yr == 0) {val = x3("a") + x3.bandwidth(); yr = 12;}
              else if (yr == 12) {val = x3("e"); yr = 24;}
              else {val = x3(34); yr = 34;}
              return val;}).padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //choropleth map
      var choroSvg3 = svg3.append("svg")
                          .attr("width", choro_width)
                          .attr("height", choro_height)
                          .attr("transform", "translate(" + -28 + ", " + -30 + ")");
      //draw choropleth map
          d3.json("data/NY-counties-geojson.json")
           .then(function(ny){
                  //console.log(ny.features);
                  //console.log(ny.features[0].properties.name); //how to query for county names
                  var projection = d3.geoMercator()
                                  .fitSize([choro_width -20, choro_height -10], ny);

                  var path = d3.geoPath()
                                  .projection(projection);

                  for (i=0; i < ny.features.length;i++){
                  choroSvg3.selectAll("path")
                          .data(ny.features)
                          //.join('path')
                          .enter()
                          .append("path")
                          .attr("d", path)
                          .attr("opacity", function (d) {op = d.properties.name.length/14; if (op >1) {op = 1;} return op;}) //reandom example of using opacity for some value
                          .attr("fill", "rgb(204, 235, 197)")
                          .attr("stroke", "black");
                  }

          });

    svg3
      .append("g")
      .selectAll("g")
      .data(num_hospital)
      .join("g")
      .attr("text-anchor", function (d) {
        return (x3(d.month) + x3.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "end"
          : "start";
      })
      .attr("transform", function (d) {
        return (
          "rotate(" +
          (((x3(d.month) + x3.bandwidth() / 2) * 180) / Math.PI - 90) +
          ")" +
          "translate(" +
          (y3(d["value"]) + 10) +
          ",0)"
        );
      })
      // .append("text")
      // .text(function (d) {
      //   return d.month;
      // })
      .attr("transform", function (d) {
        return (x3(d.month) + x3.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "rotate(180)"
          : "rotate(0)";
      })
      .style("font-size", "11px")
      .attr("alignment-baseline", "middle");

    svg3
      .append("text")
      .attr("x", 0)
      .attr("y", 100)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      // .style("text-decoration", "underline")
      .text("Patients Currently Hospitalized")
      .attr("fill", "rgb(204, 235, 197)");

      svg3
      .append("text")
      .attr("x", 23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2020");
    // .attr("fill", "rgb(251, 180, 174)")

    svg3
      .append("text")
      .attr("x", 0)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2021");
    // .attr("fill", "rgb(251, 180, 174)")

    svg3
      .append("text")
      .attr("x", -23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2022");
    // .attr("fill", "rgb(251, 180, 174)")

    // fourth viz
    //
    //
    //
    //
    //

    const svg4 = d3
      .select("#my_dataviz4")
      .data(num_fatality)
      .append("svg")
      .attr("width",radial_width + radial_margin.left + radial_margin.right)
      .attr("height", radial_height + radial_margin.top + radial_margin.bottom)
      .append("g")
      .attr(
        "transform",
        `translate(${radial_width / 2 + radial_margin.left}, ${radial_height / 2 + radial_margin.top})`
      );

    const x4 = d3
      .scaleBand()
      .range([0, 2 * Math.PI])
      .align(0)
      .domain(num_fatality.map((d) => d.month));
    const y4 = d3
      .scaleRadial()
      .range([innerRadius / 2, outerRadius / 2])
      .domain([0, 7000]);

    svg4
      .append("g")
      .selectAll("path")
      .data(num_fatality)
      .join("path")
      .attr("fill", "rgb(254, 217, 166)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y4(0.1 * d["value"]))
          .startAngle((d) => x4(d.month))
          .endAngle((d) => x4(d.month) + x4.bandwidth())
          .padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //add donut
      yr = 0; //sets start and end angle
      svg4
      .append("g")
      .selectAll(".donut_path")
      .data(arc_val(donut_vals))
      .attr("class", "donut_path")
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "rgb(254, 217, 166)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y4(0.1*d3.max(num_fatality, (d) => d["value"])))
          .startAngle((d) => x4(yr))
          .endAngle(function (d) {
              val = 0;
              if (yr == 0) {val = x4("a") + x4.bandwidth(); yr = 12;}
              else if (yr == 12) {val = x4("e"); yr = 24;}
              else {val = x4(34); yr = 34;}
              return val;}).padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //choropleth map
      var choroSvg4 = svg4.append("svg")
                          .attr("width", choro_width)
                          .attr("height", choro_height)
                          .attr("transform", "translate(" + -28 + ", " + -30 + ")");
      //draw choropleth map
          d3.json("data/NY-counties-geojson.json")
           .then(function(ny){
                  //console.log(ny.features);
                  //console.log(ny.features[0].properties.name); //how to query for county names
                  var projection = d3.geoMercator()
                                  .fitSize([choro_width -20, choro_height -10], ny);

                  var path = d3.geoPath()
                                  .projection(projection);

                  for (i=0; i < ny.features.length;i++){
                  choroSvg4.selectAll("path")
                          .data(ny.features)
                          //.join('path')
                          .enter()
                          .append("path")
                          .attr("d", path)
                          .attr("opacity", function (d) {op = d.properties.name.length/14; if (op >1) {op = 1;} return op;}) //reandom example of using opacity for some value
                          .attr("fill", "rgb(254, 217, 166)")
                          .attr("stroke", "black");
                  }

          });

    svg4
      .append("g")
      .selectAll("g")
      .data(num_fatality)
      .join("g")
      .attr("text-anchor", function (d) {
        return (x4(d.month) + x4.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "end"
          : "start";
      })
      .attr("transform", function (d) {
        return (
          "rotate(" +
          (((x4(d.month) + x4.bandwidth() / 2) * 180) / Math.PI - 90) +
          ")" +
          "translate(" +
          (y4(d["value"]) + 10) +
          ",0)"
        );
      })
      // .append("text")
      // .text(function (d) {
      //   return d.month;
      // })
      .attr("transform", function (d) {
        return (x4(d.month) + x4.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "rotate(180)"
          : "rotate(0)";
      })
      .style("font-size", "11px")
      .attr("alignment-baseline", "middle");

    svg4
      .append("text")
      .attr("x", 0)
      .attr("y", 100)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      // .style("text-decoration", "underline")
      .text("Place of Fatality")
      .attr("fill", "rgb(254, 217, 166)");

      svg4
      .append("text")
      .attr("x", 23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2020");
    // .attr("fill", "rgb(251, 180, 174)")

    svg4
      .append("text")
      .attr("x", 0)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2021");
    // .attr("fill", "rgb(251, 180, 174)")

    svg4
      .append("text")
      .attr("x", -23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2022");
    // .attr("fill", "rgb(251, 180, 174)")

    //fifth viz
    //
    //
    //
    //
    //
    //
    const svg5 = d3
      .select("#my_dataviz5")
      .data(num_admitted)
      .append("svg")
      .attr("width",radial_width + radial_margin.left + radial_margin.right)
      .attr("height", radial_height + radial_margin.top + radial_margin.bottom)
      .append("g")
      .attr(
        "transform",
        `translate(${radial_width / 2 + radial_margin.left}, ${radial_height / 2 + radial_margin.top})`
      );

    const x5 = d3
      .scaleBand()
      .range([0, 2 * Math.PI])
      .align(0)
      .domain(num_admitted.map((d) => d.month));
    const y5 = d3
      .scaleRadial()
      .range([innerRadius / 2, outerRadius / 2])
      .domain([0, 7000]);

    svg5
      .append("g")
      .selectAll("path")
      .data(num_admitted)
      .join("path")
      .attr("fill", "rgb(222, 203, 228)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y(0.8 * d["value"]))
          .startAngle((d) => x(d.month))
          .endAngle((d) => x(d.month) + x.bandwidth())
          .padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //add donut
      yr = 0; //sets start and end angle
      svg5
      .append("g")
      .selectAll(".donut_path")
      .data(arc_val(donut_vals))
      .attr("class", "donut_path")
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "rgb(222, 203, 228)")
      .attr(
        "d",
        d3
          .arc()
          .innerRadius(innerRadius / 2)
          .outerRadius((d) => y5(0.8*d3.max(num_admitted, (d) => d["value"])))
          .startAngle((d) => x5(yr))
          .endAngle(function (d) {
              val = 0;
              if (yr == 0) {val = x5("a") + x.bandwidth(); yr = 12;}
              else if (yr == 12) {val = x5("e"); yr = 24;}
              else {val = x5(34); yr = 34;}
              return val;}).padAngle(0.01)
          .padRadius(innerRadius / 2)
      );

      //choropleth map
      var choroSvg5 = svg5.append("svg")
                          .attr("width", choro_width)
                          .attr("height", choro_height)
                          .attr("transform", "translate(" + -28 + ", " + -30 + ")");
      //draw choropleth map
          d3.json("data/NY-counties-geojson.json")
           .then(function(ny){
                  //console.log(ny.features);
                  //console.log(ny.features[0].properties.name); //how to query for county names
                  var projection = d3.geoMercator()
                                  .fitSize([choro_width -20, choro_height -10], ny);

                  var path = d3.geoPath()
                                  .projection(projection);

                  for (i=0; i < ny.features.length;i++){
                  choroSvg5.selectAll("path")
                          .data(ny.features)
                          //.join('path')
                          .enter()
                          .append("path")
                          .attr("d", path)
                          .attr("opacity", function (d) {op = d.properties.name.length/14; if (op >1) {op = 1;} return op;}) //reandom example of using opacity for some value
                          .attr("fill", "rgb(222, 203, 228)")
                          .attr("stroke", "black");
                  }

          });

    svg5
      .append("g")
      .selectAll("g")
      .data(num_admitted)
      .join("g")
      .attr("text-anchor", function (d) {
        return (x5(d.month) + x.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "end"
          : "start";
      })
      .attr("transform", function (d) {
        return (
          "rotate(" +
          (((x5(d.month) + x5.bandwidth() / 2) * 180) / Math.PI - 90) +
          ")" +
          "translate(" +
          (y5(d["value"]) + 10) +
          ",0)"
        );
      })
      // .append("text")
      // .text(function (d) {
      //   return d.month;
      // })
      .attr("transform", function (d) {
        return (x5(d.month) + x5.bandwidth() / 2 + Math.PI) % (2 * Math.PI) <
          Math.PI
          ? "rotate(180)"
          : "rotate(0)";
      })
      .style("font-size", "11px")
      .attr("alignment-baseline", "middle");

    svg5
      .append("text")
      .attr("x", 0)
      .attr("y", 100)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      // .style("text-decoration", "underline")
      .text("Patients Newly Admitted")
      .attr("fill", "rgb(222, 203, 228)");

      svg5
      .append("text")
      .attr("x", 23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2020");
    // .attr("fill", "rgb(251, 180, 174)")

    svg5
      .append("text")
      .attr("x", 0)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2021");
    // .attr("fill", "rgb(251, 180, 174)")

    svg5
      .append("text")
      .attr("x", -23)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "7px")
      .text("2022");
  }

function update() {
    drawCumulativeTemporalMonth();
    drawCumulativeTemporalDay();
    drawRankingMonth();
    drawRadialView();
	updateExtensionChart();
}
