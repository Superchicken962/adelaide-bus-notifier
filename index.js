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

// Store vehicle trip ids, so that info is not sent multiple times for the same trip.
const vehicleLastTrip = fs.existsSync(path.join(__dirname, "vehicles_data.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "vehicles_data.json"), "utf-8")) : {};

function checkVehicles() {
    request("https://gtfs.adelaidemetro.com.au/v1/realtime/vehicle_positions", {
        "method": "GET",
        "encoding": null
    }, async(err, response, body) => {
        if (err || response.statusCode !== 200) {
            console.error("Unable to reach Adelaide Metro API!");
            return;
        }

        // Read file once here, so it won't need to be read in every loop - potentially improving performance.
        const routesFile = readStaticFileContent("routes.txt");
        const tripsFile = readStaticFileContent("trips.txt");

        const matchingVehicles = [];

        const vehicles = ((await decodeProto(body)).entity).map(entity => entity.vehicle);
        vehicles.forEach(vehicle => {
            if (config.vehicles.includes(vehicle.vehicle.id)) matchingVehicles.push(vehicle);
        });

        // Send discord webhook notifications if trip id is different to last check.
        for (const vehicle of matchingVehicles) {
            // Skip vehicle if on same trip as last check.
            if (vehicleLastTrip[vehicle.vehicle.id] === vehicle.trip.tripId) continue;

            // Assign the new trip's id to vehicle.
            vehicleLastTrip[vehicle.vehicle.id] = vehicle.trip.tripId;

            const routeInfo = findInFile.routeInfoByRoute(vehicle.trip.routeId);
            const tripInfo = findInFile.tripInfoByTripId(vehicle.trip.tripId);

            console.log(routeInfo);
            console.log(tripInfo);

            console.log(routeInfo.route_color);

            // Send to Discord webhook.
            axios.post(config.webhooks.vehicleAlert, {
                "username": vehicle.vehicle.id,
                "embeds": [{
                    "title": `${routeInfo.route_short_name} - ${tripInfo.trip_headsign}`,
                    "color": Number(`0x${routeInfo.route_color}`), // Convert hex to int
                    "fields": [
                        {"name": routeInfo.route_long_name, "value": `[View info](https://apt.markgurney.dev/vehicle/${getVehicleType(vehicle.trip.routeId)}/${vehicle.vehicle.id})`}
                    ]
                }]
            });
        }

        console.log(vehicleLastTrip);

        // Save data to file, so it can be loaded if script is restarted - prevents resending same trip if already sent.
        fs.writeFileSync(path.join(__dirname, "vehicles_data.json"), JSON.stringify(vehicleLastTrip), "utf-8");
    });
}

setInterval(checkVehicles, 120000);
checkVehicles();
