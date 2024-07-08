const { default: axios } = require("axios");
const puppeteer = require("puppeteer");
const config = require("./config.json");
const path = require("node:path");
const fs = require("node:fs");
const { checkForStaticFilesUpdate, findInFile, readStaticFileContent } = require("./static_files");
const protos = require("google-proto-files");
const request = require("request");

// Perform daily static file checks - won't matter if process is set to terminate before then.
setInterval(checkForStaticFilesUpdate, 86400000);
checkForStaticFilesUpdate();

// Use Adelaide Metro protobuffer definition.
async function decodeProto(buffer) {
    return new Promise(async(resolve, reject) => {
        const root = await protos.load("./proto/adelaidemetro.proto");
        const service = root.lookup("transit_realtime");
        const decode = service.FeedMessage.decode(buffer);
        resolve(decode);
    });
}

/**
 * Returns the type of vehicle based on a route.
 * @param { String } route - Route id
 */
function getVehicleType(route) {
    // By default, the type is bus and if the route is found in either array, the type is replaced.
    let type = "bus";
    
    const trains = [
        "BEL","FLNDRS","GAW","GAWC","GLAN","GRNG","NOAR","OSBORN","OUTHA","SALIS","SEAFRD"
    ];
    const trams = [
        "ADLOOP","WOMAD","GLNELG","FESTVL","BTANIC"
    ];

    // No need for else, as there is no matching values in both arrays.
    if (trains.includes(route)) type = "train";
    if (trams.includes(route)) type = "tram";

    return type;
}

/**
 * Scrapes apt.markgurney.dev and gets screenshot of vehicle page.
 * @param { String } id - Vehicle id
 * @param { String } type - Vehicle type (bus, train, tram)
 */
function getVehiclesPageScreenshot(id, type) {
    return new Promise(async(resolve) => {

    });
}

// Store vehicle trip ids, so that info is not sent multiple times for the same trip.
const vehicleLastTrip = fs.existsSync(path.join(__dirname, "vehicles_data.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "vehicles_data.json"), "utf-8")) : {};

function checkVehicles() {
    console.log("Checking vehicles for matches..."); 
    request("https://gtfs.adelaidemetro.com.au/v1/realtime/vehicle_positions", {
        "method": "GET",
        "encoding": null
    }, async(err, response, body) => {
        if (err || response.statusCode !== 200) {
            console.error("Unable to reach Adelaide Metro API!");

            // Try again soon.
            setTimeout(checkVehicles, (config.recheckIntervalSeconds*1000));
            return;
        }

        const matchingVehicles = [];
        // Parse config each time so vehicles can be updated without restarting script.
        const vehiclesToCheckFor = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf-8")).vehicles;

        const vehicles = ((await decodeProto(body)).entity).map(entity => entity.vehicle);
        vehicles.forEach(vehicle => {
            if (vehiclesToCheckFor.includes(vehicle.vehicle.id)) matchingVehicles.push(vehicle);
        });

        if (vehicles.length === 0) {
            console.warn("No live vehicles! Checking again shortly.");

            // Try again soon.
            setTimeout(checkVehicles, (config.recheckIntervalSeconds*1000));
            return;
        }

        if (matchingVehicles.length === 0) {
            console.log("No matching vehicles found, Checking again shortly.");

            // Try again soon.
            setTimeout(checkVehicles, (config.recheckIntervalSeconds*1000));
            return;
        }

        // Read file once here, so it won't need to be read in every loop - potentially improving performance.
        const routesFile = readStaticFileContent("routes.txt");
        const tripsFile = readStaticFileContent("trips.txt");

        // Launch browser to be navigated in for loop.
        const browser = await puppeteer.launch({
            "headless": "new",
            "defaultViewport": null
        });

        const page = await browser.newPage();

        let vehiclesChanged = 0;

        // Send discord webhook notifications if trip id is different to last check.
        for (const vehicle of matchingVehicles) {
            console.log(`Checking vehicle ${vehicle.vehicle.id}`);

            // Skip vehicle if on same trip as last check.
            if (vehicleLastTrip[vehicle.vehicle.id] === vehicle.trip.tripId) continue;

            // Assign the new trip's id to vehicle.
            vehicleLastTrip[vehicle.vehicle.id] = vehicle.trip.tripId;

            const routeInfo = findInFile.routeInfoByRoute(vehicle.trip.routeId, routesFile);
            const tripInfo = findInFile.tripInfoByTripId(vehicle.trip.tripId, tripsFile);
    
            const url = `https://apt.markgurney.dev/vehicle/${getVehicleType(vehicle.trip.routeId)}/${vehicle.vehicle.id}`;
            await page.goto(url, {
                "waitUntil": "networkidle2",
                "timeout": 30000
            });

            // This element should be present on the page when the data is loaded.
            await page.waitForSelector("br.s[data-is-ready]");

            // If the screenshots folder does not exist, make it.
            if (!fs.existsSync("vehicle_screenshots/")) {
                fs.mkdirSync("vehicle_screenshots/");
            }

            // Screenshot page, and save as vehicle id.
            const imageFileName = `${vehicle.vehicle.id}.png`;
            await page.screenshot({"path": "vehicle_screenshots/"+imageFileName});

            // Use formData to send image to webhook with multipart header.
            // https://stackoverflow.com/questions/60629800/nodejs-handle-and-send-multipart-request
            const form = new FormData();

            // Add file to form data.
            form.append("files[0]", new Blob([fs.readFileSync(path.join(__dirname, "vehicle_screenshots/"+imageFileName))]), imageFileName);

            const webhookData = {
                "username": vehicle.vehicle.id,
                "embeds": [{
                    "title": `${routeInfo.route_short_name} - ${tripInfo.trip_headsign}`,
                    "color": Number(`0x${routeInfo.route_color}`), // Convert hex to int
                    "fields": [
                        {"name": routeInfo.route_long_name, "value": `[View info](https://apt.markgurney.dev/vehicle/${getVehicleType(vehicle.trip.routeId)}/${vehicle.vehicle.id})`}
                    ],
                    "image": {
                        "url": `attachment://${imageFileName}`
                    },
                    "timestamp": new Date(vehicle.timestamp.low*1000).toISOString()
                }]
            };

            // If a discord id is provided, and pinging on vehicle is enabled, then add the user mention to the webhook content.
            if (config.discordId && config.pingOnVehicle) webhookData.content = `<@!${config.discordId}>`;

            // Add webhook json to form data.
            form.append("payload_json", JSON.stringify(webhookData));

            // Finally send the form data to webhook.
            axios.post(config.webhooks.vehicleAlert, form, {
                "headers": {"Content-Type": `multipart/form-data; boundary=${form._boundary}`}
            });

            vehiclesChanged++;
        }

        // Close page & browser since we're done with them now.
        await page.close();
        await browser.close();

        // Save data to file, so it can be loaded if script is restarted - prevents resending same trip if already sent.
        fs.writeFileSync(path.join(__dirname, "vehicles_data.json"), JSON.stringify(vehicleLastTrip), "utf-8");

        console.clear();
        console.log(`Update complete - found ${matchingVehicles.length} vehicle(s). Updated ${vehiclesChanged}.`);
        console.log(`Updating again in ${config.recheckIntervalSeconds} seconds.`);

        // Call function again after recheck interval seconds has passed.
        setTimeout(checkVehicles, (config.recheckIntervalSeconds*1000));
    });
}

checkVehicles();
